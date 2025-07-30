const { ethers } = require('hardhat');
const config = require('./core/config');
const fs = require('fs');
const path = require('path');

// Simple and correct sqrt price calculation
function calculateSqrtPriceX96Precise(priceRatio, token0Decimals, token1Decimals) {
    const Q96 = ethers.BigNumber.from(2).pow(96);

    // For tokens with same decimals, price ratio is direct
    if (token0Decimals === token1Decimals) {
        if (priceRatio === 1) return Q96;
        if (priceRatio === 4) return Q96.mul(2); // sqrt(4) = 2
        
        // General case: sqrt(priceRatio) * 2^96
        const sqrtValue = Math.sqrt(priceRatio);
        const sqrtScaled = ethers.utils.parseUnits(sqrtValue.toFixed(18), 18);
        return sqrtScaled.mul(Q96).div(ethers.utils.parseUnits("1", 18));
    }

    // For tokens with different decimals, adjust for decimal difference
    const decimalDiff = token1Decimals - token0Decimals;
    const adjustedRatio = priceRatio * Math.pow(10, decimalDiff);
    
    const sqrtValue = Math.sqrt(adjustedRatio);
    const sqrtScaled = ethers.utils.parseUnits(sqrtValue.toFixed(18), 18);
    return sqrtScaled.mul(Q96).div(ethers.utils.parseUnits("1", 18));
}

// Deploy tokens
async function deployTokens(token1Name, token1Symbol, token1Decimals, token1Supply, token2Name, token2Symbol, token2Decimals, token2Supply) {
    console.log('🪙 DEPLOYING TOKENS');
    console.log('='.repeat(50));

    try {
        const signer = config.getSigner();
        const TestTokenFactory = await ethers.getContractFactory('TestERC20');

        // Deploy Token 1
        console.log(`├─ Deploying ${token1Symbol}...`);
        const token1 = await TestTokenFactory.connect(signer).deploy(
            token1Name, token1Symbol, token1Decimals, ethers.utils.parseUnits(token1Supply, token1Decimals)
        );
        await token1.deployed();

        // Deploy Token 2
        console.log(`├─ Deploying ${token2Symbol}...`);
        const token2 = await TestTokenFactory.connect(signer).deploy(
            token2Name, token2Symbol, token2Decimals, ethers.utils.parseUnits(token2Supply, token2Decimals)
        );
        await token2.deployed();

        const deployedTokens = {
            [token1Symbol]: {
                contract: token1,
                address: token1.address,
                name: await token1.name(),
                symbol: await token1.symbol(),
                decimals: token1Decimals
            },
            [token2Symbol]: {
                contract: token2,
                address: token2.address,
                name: await token2.name(),
                symbol: await token2.symbol(),
                decimals: token2Decimals
            }
        };

        console.log(`├─ ${token1Symbol} deployed:`, token1.address);
        console.log(`├─ ${token2Symbol} deployed:`, token2.address);
        console.log('└─ ✅ Tokens deployed successfully!');

        // Save addresses
        const addressesPath = path.join(__dirname, '..', 'test-addresses.json');
        let addressesData = {};
        try {
            addressesData = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));
        } catch (e) {
            addressesData = {
                network: {
                    name: "Push Chain",
                    chainId: 42101,
                    rpcUrl: "https://rpc.push.org"
                },
                contracts: {
                    factory: '0x4cBD1E2E6f44C0e406F5FfC9bb5312a281610E94',
                    wpush: '0xefFe95a7c6C4b7fcDC972b6B30FE9219Ad1AfD17',
                    swapRouter: '0xf90F08fD301190Cd34CC9eFc5A76351e95051670',
                    positionManager: '0x4e8152fB4C72De9f187Cc93E85135283517B2fbB',
                    quoterV2: '0x83D3B8bAe05C36b5404c1e284D306a6a1351Ef60',
                    tickLens: '0x0b19E6e4dA71Be4F12db104373340d8fFc49880A',
                    multicall: '0x10cB82cb3Fa3cf01855cF90AbF61855Cfe92d937'
                }
            };
        }

        addressesData.testTokens = addressesData.testTokens || {};
        addressesData.testTokens[token1Symbol] = {
            name: deployedTokens[token1Symbol].name,
            symbol: deployedTokens[token1Symbol].symbol,
            address: deployedTokens[token1Symbol].address,
            decimals: token1Decimals,
            totalSupply: token1Supply
        };
        addressesData.testTokens[token2Symbol] = {
            name: deployedTokens[token2Symbol].name,
            symbol: deployedTokens[token2Symbol].symbol,
            address: deployedTokens[token2Symbol].address,
            decimals: token2Decimals,
            totalSupply: token2Supply
        };

        fs.writeFileSync(addressesPath, JSON.stringify(addressesData, null, 2));
        console.log('💾 Addresses saved to test-addresses.json');

        return deployedTokens;

    } catch (error) {
        console.error('❌ Token deployment failed:', error.message);
        throw error;
    }
}

// Create pool and optionally add liquidity
async function createPool(token0Address, token1Address, priceRatio, fee = 3000, addLiquidity = false, amount0 = "1000", amount1 = "1000") {
    console.log('🏊 CREATING POOL');
    console.log('='.repeat(50));
    console.log(`💰 Price Ratio: ${priceRatio} (token1/token0)`);

    try {
        const factory = config.getContract('factory');
        const signer = config.getSigner();

        // Sort tokens
        const [token0, token1] = config.sortTokens(token0Address, token1Address);
        console.log('├─ Token0 (sorted):', token0);
        console.log('├─ Token1 (sorted):', token1);

        // Check if pool already exists
        const existingPool = await factory.getPool(token0, token1, fee);
        if (existingPool !== ethers.constants.AddressZero) {
            console.log('⚠️  Pool already exists at:', existingPool);

            if (addLiquidity) {
                console.log('📈 Adding liquidity to existing pool...');
                await addLiquidityToPool(existingPool, token0Address, token1Address, amount0, amount1);
            }

            return existingPool;
        }

        // Create pool
        console.log('├─ Creating pool...');
        const createPoolTx = await factory.createPool(token0, token1, fee);
        const receipt = await createPoolTx.wait();
        const poolCreatedEvent = receipt.events.find(e => e.event === 'PoolCreated');
        const poolAddress = poolCreatedEvent.args.pool;

        console.log('├─ Pool created:', poolAddress);

        // Initialize pool
        const pool = new ethers.Contract(poolAddress, config.ABIS.pool, signer);

        // Determine price ratio based on token order
        // priceRatio parameter represents: 1 inputToken0 = priceRatio inputToken1
        // We need to convert this to token1/token0 in the sorted pool order
        const isInputToken0SortedFirst = token0.toLowerCase() === token0Address.toLowerCase();
        const actualPriceRatio = isInputToken0SortedFirst ? priceRatio : (1 / priceRatio);

        console.log('├─ Input price meaning: 1', await (new ethers.Contract(token0Address, config.ABIS.erc20, signer)).symbol(), '=', priceRatio, await (new ethers.Contract(token1Address, config.ABIS.erc20, signer)).symbol());
        console.log('├─ Pool token0 (sorted):', await (new ethers.Contract(token0, config.ABIS.erc20, signer)).symbol());
        console.log('├─ Pool token1 (sorted):', await (new ethers.Contract(token1, config.ABIS.erc20, signer)).symbol());
        console.log('├─ Actual price ratio for pool (token1/token0):', actualPriceRatio);

        // Get token decimals for proper price calculation
        const token0Contract = new ethers.Contract(token0, config.ABIS.erc20, signer);
        const token1Contract = new ethers.Contract(token1, config.ABIS.erc20, signer);
        const token0Decimals = await token0Contract.decimals();
        const token1Decimals = await token1Contract.decimals();

        const sqrtPriceX96 = calculateSqrtPriceX96Precise(actualPriceRatio, token0Decimals, token1Decimals);
        console.log('├─ SqrtPriceX96:', sqrtPriceX96.toString());

        console.log('├─ Initializing pool...');
        const initTx = await pool.initialize(sqrtPriceX96);
        await initTx.wait();
        console.log('└─ ✅ Pool initialized successfully!');

        // Verify initialization
        const slot0 = await pool.slot0();
        console.log('📊 Pool State:');
        console.log('├─ SqrtPriceX96:', slot0.sqrtPriceX96.toString());
        console.log('├─ Current Tick:', slot0.tick.toString());

        // Save pool info
        const addressesPath = path.join(__dirname, '..', 'test-addresses.json');
        let addressesData = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));

        addressesData.pools = addressesData.pools || {};
        const poolKey = `${token0}_${token1}_${fee}`;
        addressesData.pools[poolKey] = {
            address: poolAddress,
            token0: token0,
            token1: token1,
            fee: fee,
            priceRatio: actualPriceRatio,
            sqrtPriceX96: sqrtPriceX96.toString(),
            currentTick: slot0.tick.toString()
        };

        fs.writeFileSync(addressesPath, JSON.stringify(addressesData, null, 2));
        console.log('💾 Pool info saved to test-addresses.json');

        // Add liquidity if requested
        if (addLiquidity) {
            console.log('📈 Adding initial liquidity...');
            // Wait a moment for the pool to be properly initialized
            await new Promise(resolve => setTimeout(resolve, 1000));
            await addLiquidityToPool(poolAddress, token0Address, token1Address, amount0, amount1);
        }

        return poolAddress;

    } catch (error) {
        console.error('❌ Pool creation failed:', error.message);
        throw error;
    }
}

// Add liquidity to pool
async function addLiquidityToPool(poolAddress, inputToken0Address, inputToken1Address, inputAmount0, inputAmount1) {
    console.log('💰 ADDING LIQUIDITY TO POOL');
    console.log('='.repeat(50));

    try {
        const signer = config.getSigner();
        const positionManager = config.getContract('positionManager');

        // Get input token contracts
        const inputToken0 = new ethers.Contract(inputToken0Address, config.ABIS.erc20, signer);
        const inputToken1 = new ethers.Contract(inputToken1Address, config.ABIS.erc20, signer);

        // Get input token info
        const inputDecimals0 = await inputToken0.decimals();
        const inputDecimals1 = await inputToken1.decimals();
        const inputSymbol0 = await inputToken0.symbol();
        const inputSymbol1 = await inputToken1.symbol();

        // Parse input amounts
        const inputAmount0Parsed = ethers.utils.parseUnits(inputAmount0, inputDecimals0);
        const inputAmount1Parsed = ethers.utils.parseUnits(inputAmount1, inputDecimals1);

        console.log('├─ Pool Address:', poolAddress);
        console.log('├─ Input Token0:', inputSymbol0, inputToken0Address);
        console.log('├─ Input Token1:', inputSymbol1, inputToken1Address);
        console.log('├─ Input Amount0:', inputAmount0, inputSymbol0);
        console.log('├─ Input Amount1:', inputAmount1, inputSymbol1);

        // Check current balances
        const currentBalance0 = await inputToken0.balanceOf(signer.address);
        const currentBalance1 = await inputToken1.balanceOf(signer.address);

        console.log('├─ Current Balance0:', ethers.utils.formatUnits(currentBalance0, inputDecimals0), inputSymbol0);
        console.log('├─ Current Balance1:', ethers.utils.formatUnits(currentBalance1, inputDecimals1), inputSymbol1);

        // Sort tokens to match pool's token0/token1 order
        const [sortedToken0, sortedToken1] = config.sortTokens(inputToken0Address, inputToken1Address);

        // Create contracts for sorted tokens
        const sortedTokenContract0 = new ethers.Contract(sortedToken0, config.ABIS.erc20, signer);
        const sortedTokenContract1 = new ethers.Contract(sortedToken1, config.ABIS.erc20, signer);
        const sortedSymbol0 = await sortedTokenContract0.symbol();
        const sortedSymbol1 = await sortedTokenContract1.symbol();
        const sortedDecimals0 = await sortedTokenContract0.decimals();
        const sortedDecimals1 = await sortedTokenContract1.decimals();

        console.log('├─ Pool Token0 (sorted):', sortedSymbol0, sortedToken0);
        console.log('├─ Pool Token1 (sorted):', sortedSymbol1, sortedToken1);

        // Map input amounts to sorted pool token amounts
        let poolAmount0Desired, poolAmount1Desired;

        if (sortedToken0.toLowerCase() === inputToken0Address.toLowerCase()) {
            // Input token0 maps to pool token0
            poolAmount0Desired = inputAmount0Parsed;
            poolAmount1Desired = inputAmount1Parsed;
            console.log('├─ Pool Amount0:', inputAmount0, sortedSymbol0);
            console.log('├─ Pool Amount1:', inputAmount1, sortedSymbol1);
        } else {
            // Input token0 maps to pool token1, input token1 maps to pool token0
            poolAmount0Desired = inputAmount1Parsed;
            poolAmount1Desired = inputAmount0Parsed;
            console.log('├─ Pool Amount0:', inputAmount1, sortedSymbol0);
            console.log('├─ Pool Amount1:', inputAmount0, sortedSymbol1);
        }

        // Approve tokens (approve the actual tokens we're using)
        console.log('├─ Approving tokens...');
        await sortedTokenContract0.approve(positionManager.address, poolAmount0Desired);
        await sortedTokenContract1.approve(positionManager.address, poolAmount1Desired);

        // Get pool info for fee and current state
        const pool = new ethers.Contract(poolAddress, config.ABIS.pool, signer);
        const fee = await pool.fee();
        const slot0 = await pool.slot0();
        const currentTick = slot0.tick.toNumber ? slot0.tick.toNumber() : slot0.tick;

        // Use a range of ±10% around current price (about ±1000 ticks)
        const tickSpacing = fee === 500 ? 10 : fee === 3000 ? 60 : 200;
        const tickRange = 120; // TIGHT range for balanced liquidity usage
        const tickLower = Math.floor((currentTick - tickRange) / tickSpacing) * tickSpacing;
        const tickUpper = Math.ceil((currentTick + tickRange) / tickSpacing) * tickSpacing;

        console.log('├─ Current Tick:', currentTick);
        console.log('├─ Tick Range:', `[${tickLower}, ${tickUpper}]`);

        // Mint position with correct sorted token order
        const mintParams = {
            token0: sortedToken0,
            token1: sortedToken1,
            fee: fee,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: poolAmount0Desired,
            amount1Desired: poolAmount1Desired,
            amount0Min: 1,
            amount1Min: 1,
            recipient: signer.address,
            deadline: Math.floor(Date.now() / 1000) + 60 * 20
        };

        console.log('├─ Minting position...');
        const mintTx = await positionManager.mint(mintParams);
        const receipt = await mintTx.wait();
        const transferEvent = receipt.events?.find(e => e.event === 'Transfer');
        const tokenId = transferEvent?.args?.tokenId;

        console.log('└─ ✅ Position NFT #' + tokenId + ' minted successfully!');

        // Check new balances (using original input token order for consistency)
        const newBalance0 = await inputToken0.balanceOf(signer.address);
        const newBalance1 = await inputToken1.balanceOf(signer.address);

        console.log('💰 New Balances:');
        console.log('├─', inputSymbol0 + ':', ethers.utils.formatUnits(newBalance0, inputDecimals0));
        console.log('└─', inputSymbol1 + ':', ethers.utils.formatUnits(newBalance1, inputDecimals1));

        return tokenId;

    } catch (error) {
        console.error('❌ Liquidity addition failed:', error.message);
        throw error;
    }
}

// Perform swap
async function performSwap(poolAddress, tokenInAddress, tokenOutAddress, amountIn) {
    console.log('🔄 PERFORMING SWAP');
    console.log('='.repeat(50));

    try {
        const signer = config.getSigner();
        const swapRouter = config.getContract('swapRouter');

        // Get token contracts
        const tokenIn = new ethers.Contract(tokenInAddress, config.ABIS.erc20, signer);
        const tokenOut = new ethers.Contract(tokenOutAddress, config.ABIS.erc20, signer);

        // Get decimals
        const decimalsIn = await tokenIn.decimals();
        const decimalsOut = await tokenOut.decimals();

        // Parse amount
        const amountInParsed = ethers.utils.parseUnits(amountIn, decimalsIn);

        const symbolIn = await tokenIn.symbol();
        const symbolOut = await tokenOut.symbol();

        console.log('├─ Pool Address:', poolAddress);
        console.log('├─ Token In:', symbolIn, tokenInAddress);
        console.log('├─ Token Out:', symbolOut, tokenOutAddress);
        console.log('├─ Amount In:', amountIn, symbolIn);

        // Check balances
        const balanceInBefore = await tokenIn.balanceOf(signer.address);
        const balanceOutBefore = await tokenOut.balanceOf(signer.address);

        console.log('├─ Balance In Before:', ethers.utils.formatUnits(balanceInBefore, decimalsIn), symbolIn);
        console.log('├─ Balance Out Before:', ethers.utils.formatUnits(balanceOutBefore, decimalsOut), symbolOut);

        // Approve token
        console.log('├─ Approving token...');
        await tokenIn.approve(swapRouter.address, amountInParsed);

        // Get pool fee
        const pool = new ethers.Contract(poolAddress, config.ABIS.pool, signer);
        const fee = await pool.fee();

        // Swap params
        const swapParams = {
            tokenIn: tokenInAddress,
            tokenOut: tokenOutAddress,
            fee: fee,
            recipient: signer.address,
            deadline: Math.floor(Date.now() / 1000) + 60 * 20,
            amountIn: amountInParsed,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        };

        console.log('├─ Executing swap...');
        const swapTx = await swapRouter.exactInputSingle(swapParams);
        const receipt = await swapTx.wait();

        // Check new balances
        const balanceInAfter = await tokenIn.balanceOf(signer.address);
        const balanceOutAfter = await tokenOut.balanceOf(signer.address);

        const amountInActual = balanceInBefore.sub(balanceInAfter);
        const amountOutActual = balanceOutAfter.sub(balanceOutBefore);

        console.log('📊 Swap Results:');
        console.log('├─ Amount In:', ethers.utils.formatUnits(amountInActual, decimalsIn), symbolIn);
        console.log('├─ Amount Out:', ethers.utils.formatUnits(amountOutActual, decimalsOut), symbolOut);

        // Calculate exchange rate properly
        if (amountInActual.gt(0)) {
            const rate = amountOutActual.mul(ethers.utils.parseUnits('1', decimalsIn)).div(amountInActual);
            console.log('├─ Exchange Rate:', `1 ${symbolIn} = ${ethers.utils.formatUnits(rate, decimalsOut)} ${symbolOut}`);
        } else {
            console.log('├─ Exchange Rate: N/A (no input amount)');
        }
        console.log('└─ Transaction Hash:', receipt.transactionHash);

        console.log('💰 New Balances:');
        console.log('├─ Token In:', ethers.utils.formatUnits(balanceInAfter, decimalsIn), symbolIn);
        console.log('└─ Token Out:', ethers.utils.formatUnits(balanceOutAfter, decimalsOut), symbolOut);

        console.log('🎉 Swap completed successfully!');

        return receipt.transactionHash;

    } catch (error) {
        console.error('❌ Swap failed:', error.message);
        throw error;
    }
}

// Main function to handle command line arguments
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    try {
        switch (command) {
            case 'deploy-tokens':
                // node pool-manager.js deploy-tokens pETH "Push ETH" 18 1000000 pUSDC "Push USDC" 6 10000000
                const [token1Symbol, token1Name, token1Decimals, token1Supply, token2Symbol, token2Name, token2Decimals, token2Supply] = args.slice(1);
                await deployTokens(token1Name, token1Symbol, parseInt(token1Decimals), token1Supply, token2Name, token2Symbol, parseInt(token2Decimals), token2Supply);
                break;

            case 'create-pool':
                // node pool-manager.js create-pool <token0Address> <token1Address> <priceRatio> [fee] [addLiquidity] [amount0] [amount1]
                const [token0Addr, token1Addr, priceRatio, fee, addLiq, amt0, amt1] = args.slice(1);
                await createPool(token0Addr, token1Addr, parseFloat(priceRatio), parseInt(fee) || 3000, addLiq === 'true', amt0 || "1000", amt1 || "1000");
                break;

            case 'add-liquidity':
                // node pool-manager.js add-liquidity <poolAddress> <token0Address> <token1Address> <amount0> <amount1>
                const [poolAddr, tok0Addr, tok1Addr, amount0, amount1] = args.slice(1);
                await addLiquidityToPool(poolAddr, tok0Addr, tok1Addr, amount0, amount1);
                break;

            case 'swap':
                // node pool-manager.js swap <poolAddress> <tokenInAddress> <tokenOutAddress> <amountIn>
                const [poolAddress, tokenInAddr, tokenOutAddr, amountIn] = args.slice(1);
                await performSwap(poolAddress, tokenInAddr, tokenOutAddr, amountIn);
                break;

            default:
                console.log('Usage:');
                console.log('  deploy-tokens <token1Symbol> <token1Name> <token1Decimals> <token1Supply> <token2Symbol> <token2Name> <token2Decimals> <token2Supply>');
                console.log('  create-pool <token0Address> <token1Address> <priceRatio> [fee] [addLiquidity] [amount0] [amount1]');
                console.log('  add-liquidity <poolAddress> <token0Address> <token1Address> <amount0> <amount1>');
                console.log('  swap <poolAddress> <tokenInAddress> <tokenOutAddress> <amountIn>');
        }
    } catch (error) {
        console.error('💥 Operation failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    deployTokens,
    createPool,
    addLiquidityToPool,
    performSwap,
    calculateSqrtPriceX96Precise
}; 