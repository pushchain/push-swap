const { ethers } = require('hardhat');
const config = require('./config');
const fs = require('fs');
const path = require('path');

async function performSwap(options = {}) {
    console.log('🔄 PERFORM SWAP');
    console.log('='.repeat(50));

    try {
        // Load addresses from JSON file
        const addressesPath = path.join(__dirname, '..', '..', 'test-addresses.json');
        if (!fs.existsSync(addressesPath)) {
            throw new Error('test-addresses.json not found. Please run deploy-pools first.');
        }

        const addressesData = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));
        const signer = config.getSigner();
        const swapRouter = config.getContract('swapRouter');
        const wpush = config.getContract('wpush');

        let poolAddress, tokenInAddress, tokenOutAddress, tokenInSymbol, tokenOutSymbol;

        // Determine swap parameters
        if (options.poolAddress) {
            // Use provided pool address
            poolAddress = options.poolAddress;
            console.log(`🎯 Using provided pool address: ${poolAddress}`);

            // Get pool info
            const pool = new ethers.Contract(poolAddress, config.ABIS.pool, signer);
            const token0 = await pool.token0();
            const token1 = await pool.token1();

            // Determine which token to swap
            if (options.tokenIn && options.tokenOut) {
                tokenInAddress = options.tokenIn;
                tokenOutAddress = options.tokenOut;
            } else {
                // Default: swap token0 for token1
                tokenInAddress = token0;
                tokenOutAddress = token1;
            }

        } else if (options.tokenIn && options.tokenOut) {
            // Find pool by token addresses
            const factory = config.getContract('factory');
            const [sortedToken0, sortedToken1] = config.sortTokens(options.tokenIn, options.tokenOut);
            poolAddress = await factory.getPool(sortedToken0, sortedToken1, 3000);

            if (poolAddress === ethers.constants.AddressZero) {
                throw new Error('Pool not found for the specified tokens. Please create the pool first.');
            }

            tokenInAddress = options.tokenIn;
            tokenOutAddress = options.tokenOut;
            console.log(`🎯 Found pool: ${poolAddress}`);

        } else {
            // Use default pools from JSON
            console.log('📋 Available pools:');
            Object.entries(addressesData.pools).forEach(([name, pool], index) => {
                console.log(`${index + 1}. ${name}: ${pool.address}`);
            });

            // For now, use the first pool (you can modify this logic)
            const firstPool = Object.values(addressesData.pools)[0];
            poolAddress = firstPool.address;
            tokenInAddress = firstPool.token0;
            tokenOutAddress = firstPool.token1;

            console.log(`🎯 Using default pool: ${firstPool.name}`);
        }

        // Get token contracts and symbols
        const tokenInContract = tokenInAddress === config.CONTRACTS.wpush ? wpush :
            new ethers.Contract(tokenInAddress, config.ABIS.erc20, signer);
        const tokenOutContract = tokenOutAddress === config.CONTRACTS.wpush ? wpush :
            new ethers.Contract(tokenOutAddress, config.ABIS.erc20, signer);

        tokenInSymbol = tokenInAddress === config.CONTRACTS.wpush ? 'WPUSH' : await tokenInContract.symbol();
        tokenOutSymbol = tokenOutAddress === config.CONTRACTS.wpush ? 'WPUSH' : await tokenOutContract.symbol();

        console.log(`\n📋 Swap Configuration:`);
        console.log(`├─ Pool Address: ${poolAddress}`);
        console.log(`├─ Token In: ${tokenInSymbol} (${tokenInAddress})`);
        console.log(`├─ Token Out: ${tokenOutSymbol} (${tokenOutAddress})`);
        console.log(`└─ Fee: 0.3%`);

        // Check balances
        const balanceIn = await tokenInContract.balanceOf(signer.address);
        const balanceOut = await tokenOutContract.balanceOf(signer.address);

        console.log(`\n💰 Current Balances:`);
        console.log(`├─ ${tokenInSymbol}: ${config.formatToken(balanceIn)}`);
        console.log(`└─ ${tokenOutSymbol}: ${config.formatToken(balanceOut)}`);

        // Determine swap amount
        const amountIn = options.amountIn || ethers.utils.parseUnits('10', 18);

        console.log(`\n🔄 Swap Details:`);
        console.log(`├─ Amount In: ${config.formatToken(amountIn)} ${tokenInSymbol}`);

        // Check if we have enough tokens
        if (balanceIn.lt(amountIn)) {
            if (tokenInAddress === config.CONTRACTS.wpush) {
                // Deposit more PUSH to WPUSH
                const neededAmount = amountIn.sub(balanceIn).add(ethers.utils.parseUnits('1', 18));
                console.log(`\n💳 Depositing ${config.formatToken(neededAmount)} PUSH → WPUSH...`);
                const depositTx = await wpush.deposit({ value: neededAmount });
                await depositTx.wait();
                console.log('✅ Deposit completed');
            } else {
                throw new Error(`Insufficient ${tokenInSymbol} balance. Need ${config.formatToken(amountIn)}, have ${config.formatToken(balanceIn)}`);
            }
        }

        // Get quote
        console.log('\n💬 Getting swap quote...');
        const quoterV2 = config.getContract('quoterV2');

        let amountOut;
        try {
            amountOut = await quoterV2.quoteExactInputSingle.staticCall({
                tokenIn: tokenInAddress,
                tokenOut: tokenOutAddress,
                fee: 3000,
                amountIn: amountIn,
                sqrtPriceLimitX96: 0
            });
        } catch (error) {
            console.log('⚠️  Could not get quote, proceeding with swap...');
            amountOut = ethers.utils.parseUnits('1', 18); // Fallback
        }

        const amountOutMin = amountOut.mul(95).div(100); // 5% slippage tolerance

        console.log(`├─ Expected Out: ${config.formatToken(amountOut)} ${tokenOutSymbol}`);
        console.log(`└─ Min Out: ${config.formatToken(amountOutMin)} ${tokenOutSymbol} (5% slippage)`);

        // Approve tokens
        console.log('\n🔐 Approving tokens...');
        await tokenInContract.approve(swapRouter.address, amountIn);
        console.log('✅ Approval completed');

        // Perform swap
        console.log('\n🔄 Executing swap...');
        const swapParams = {
            tokenIn: tokenInAddress,
            tokenOut: tokenOutAddress,
            fee: 3000,
            recipient: signer.address,
            deadline: Math.floor(Date.now() / 1000) + 60 * 20,
            amountIn: amountIn,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: 0
        };

        const swapTx = await swapRouter.exactInputSingle(swapParams);
        const receipt = await swapTx.wait();

        // Get actual amount out from events
        const transferEvent = receipt.events?.find(e =>
            e.event === 'Transfer' &&
            e.args.to === signer.address &&
            e.args.from === swapRouter.address
        );

        const actualAmountOut = transferEvent ? transferEvent.args.value : amountOut;

        console.log('✅ Swap completed successfully!');
        console.log(`\n📊 Swap Results:`);
        console.log(`├─ Amount In: ${config.formatToken(amountIn)} ${tokenInSymbol}`);
        console.log(`├─ Amount Out: ${config.formatToken(actualAmountOut)} ${tokenOutSymbol}`);
        console.log(`├─ Exchange Rate: 1 ${tokenInSymbol} = ${config.formatToken(actualAmountOut.mul(ethers.utils.parseUnits('1', 18)).div(amountIn))} ${tokenOutSymbol}`);
        console.log(`└─ Transaction Hash: ${swapTx.hash}`);

        // Check new balances
        const newBalanceIn = await tokenInContract.balanceOf(signer.address);
        const newBalanceOut = await tokenOutContract.balanceOf(signer.address);

        console.log(`\n💰 New Balances:`);
        console.log(`├─ ${tokenInSymbol}: ${config.formatToken(newBalanceIn)}`);
        console.log(`└─ ${tokenOutSymbol}: ${config.formatToken(newBalanceOut)}`);

        return {
            success: true,
            poolAddress,
            tokenIn: tokenInAddress,
            tokenOut: tokenOutAddress,
            tokenInSymbol,
            tokenOutSymbol,
            amountIn: amountIn.toString(),
            amountOut: actualAmountOut.toString(),
            exchangeRate: config.formatToken(actualAmountOut.mul(ethers.utils.parseUnits('1', 18)).div(amountIn)),
            txHash: swapTx.hash
        };

    } catch (error) {
        console.error('❌ Swap failed:', error.message);
        throw error;
    }
}

// Parse command line arguments from environment variables
function parseArgs() {
    const options = {};

    // Read from environment variables
    if (process.env.POOL_ADDRESS) {
        options.poolAddress = process.env.POOL_ADDRESS;
    }
    if (process.env.TOKEN_IN_ADDRESS) {
        options.tokenIn = process.env.TOKEN_IN_ADDRESS;
    }
    if (process.env.TOKEN_OUT_ADDRESS) {
        options.tokenOut = process.env.TOKEN_OUT_ADDRESS;
    }
    if (process.env.AMOUNT_IN) {
        options.amountIn = ethers.utils.parseUnits(process.env.AMOUNT_IN, 18);
    }

    return options;
}

module.exports = { performSwap };

// Run if executed directly
if (require.main === module) {
    const options = parseArgs();

    performSwap(options)
        .then((results) => {
            if (results.success) {
                console.log('\n🎉 Swap completed successfully!');
                process.exit(0);
            } else {
                console.log('\n💥 Failed to perform swap!');
                process.exit(1);
            }
        })
        .catch((error) => {
            console.error('\n💥 Error:', error.message);
            process.exit(1);
        });
} 