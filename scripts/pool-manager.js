const { ethers } = require('hardhat');
const config = require('./core/config');
const fs = require('fs');
const path = require('path');
const BN = require('bignumber.js');

// Import WPUSH management function
const { ensureWPUSH } = require('./core/config');

// Precise sqrt price calculation using bignumber.js to match Uniswap's encodePriceSqrt
function calculateSqrtPriceX96Precise(priceRatio, token0Decimals, token1Decimals) {
    BN.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

    // priceRatio represents the ratio token1/token0 in human readable terms
    // We need to convert this to the ratio in base units
    // Base unit ratio = (human_ratio * 10^token1_decimals) / 10^token0_decimals

    const ratio = new BN(priceRatio.toString());
    const token0Factor = new BN(10).pow(token0Decimals);
    const token1Factor = new BN(10).pow(token1Decimals);

    // Calculate the ratio in base units: (price * 10^token1_decimals) / 10^token0_decimals
    const baseUnitRatio = ratio.multipliedBy(token1Factor).dividedBy(token0Factor);

    // sqrt(price) * 2^96, floored to integer (uint160)
    const sqrtPriceTimesQ96 = baseUnitRatio
        .sqrt()
        .multipliedBy(new BN(2).pow(96))
        .integerValue(BN.ROUND_FLOOR)
        .toString();

    return ethers.BigNumber.from(sqrtPriceTimesQ96);
}

// Safe approval helper - checks allowance before approving
async function safeApprove(tokenContract, spenderAddress, amount, signerAddress) {
    try {
        const currentAllowance = await tokenContract.allowance(signerAddress, spenderAddress);

        if (currentAllowance.lt(amount)) {
            console.log('├─ Approving token for', ethers.utils.formatUnits(amount, await tokenContract.decimals()));
            // Approve max uint256 to avoid future re-approvals
            const maxApproval = ethers.constants.MaxUint256;
            const approveTx = await tokenContract.approve(spenderAddress, maxApproval);
            await approveTx.wait();
            console.log('├─ ✅ Token approved (MaxUint256)');
        } else {
            console.log('├─ ✅ Token already approved (sufficient allowance)');
        }
    } catch (error) {
        console.log('├─ ❌ Approval failed:', error.message);
        throw error;
    }
}

// Deploy PRC20 tokens (supports single or dual token deployment)
async function deployTokens(token1Symbol, token1Name, token1Decimals, token1Supply, token2Symbol = null, token2Name = null, token2Decimals = null, token2Supply = null) {
    console.log('🪙 DEPLOYING PRC20 TOKENS');
    console.log('='.repeat(50));

    try {
        const signer = config.getSigner();
        const PRC20Factory = await ethers.getContractFactory('PRC20');

        // Use deployer address as handler and universal executor for testing
        const handlerAddress = signer.address;
        const universalExecutor = signer.address;

        // Deploy Token 1 (PRC20)
        console.log(`├─ Deploying ${token1Symbol} (PRC20)...`);
        const token1 = await PRC20Factory.connect(signer).deploy(
            token1Name,                                    // name
            token1Symbol,                                  // symbol  
            token1Decimals,                               // decimals
            1,                                            // sourceChainId (mock)
            2,                                            // TokenType.ERC20
            21000,                                        // gasLimit (mock)
            0,                                            // protocolFlatFee
            universalExecutor,                            // universalExecutor
            handlerAddress                                // handler
        );
        await token1.deployed();

        // Deploy Token 2 (PRC20) - only if parameters are provided
        let token2 = null;
        if (token2Symbol && token2Name && token2Decimals !== null) {
            console.log(`├─ Deploying ${token2Symbol} (PRC20)...`);
            token2 = await PRC20Factory.connect(signer).deploy(
                token2Name,                                    // name
                token2Symbol,                                  // symbol
                token2Decimals,                               // decimals
                1,                                            // sourceChainId (mock)
                2,                                            // TokenType.ERC20
                21000,                                        // gasLimit (mock)
                0,                                            // protocolFlatFee
                universalExecutor,                            // universalExecutor
                handlerAddress                                // handler
            );
            await token2.deployed();
        }

        const deployedTokens = {
            [token1Symbol]: {
                contract: token1,
                address: token1.address,
                name: await token1.name(),
                symbol: await token1.symbol(),
                decimals: token1Decimals
            }
        };

        console.log(`├─ ${token1Symbol} deployed:`, token1.address);

        // Add token2 to deployedTokens if it exists
        if (token2) {
            deployedTokens[token2Symbol] = {
                contract: token2,
                address: token2.address,
                name: await token2.name(),
                symbol: await token2.symbol(),
                decimals: token2Decimals
            };
            console.log(`├─ ${token2Symbol} deployed:`, token2.address);
        }

        console.log('└─ ✅ Tokens deployed successfully!');

        // Save addresses with proper structure
        const addressesPath = path.join(__dirname, '..', 'test-addresses.json');
        let addressesData = {};
        try {
            addressesData = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));
        } catch (e) {
            addressesData = {
                version: "1.0.0",
                lastUpdated: new Date().toISOString().split('T')[0],
                productionPools: {},
                network: {
                    name: "Push Chain",
                    chainId: 42101,
                    rpcUrl: "https://evm.rpc-testnet-donut-node1.push.org"
                },
                contracts: config.CONTRACTS,
                testTokens: {},
                pools: {}
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

        // Save token2 data if it exists
        if (token2) {
            addressesData.testTokens[token2Symbol] = {
                name: deployedTokens[token2Symbol].name,
                symbol: deployedTokens[token2Symbol].symbol,
                address: deployedTokens[token2Symbol].address,
                decimals: token2Decimals,
                totalSupply: token2Supply
            };
        }

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

    // Validate price ratio is reasonable (human-readable)
    if (priceRatio <= 0) {
        throw new Error('Price ratio must be positive');
    }
    if (priceRatio > 1e12 || priceRatio < 1e-12) {
        console.log('⚠️  Warning: Price ratio seems extreme. Ensure you\'re using human-readable ratios');
    }
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

        // Get token symbols for better debugging
        const inputToken0Contract = new ethers.Contract(token0Address, config.ABIS.prc20, signer);
        const inputToken1Contract = new ethers.Contract(token1Address, config.ABIS.prc20, signer);
        const inputSymbol0 = await inputToken0Contract.symbol();
        const inputSymbol1 = await inputToken1Contract.symbol();

        const sortedToken0Contract = new ethers.Contract(token0, config.ABIS.prc20, signer);
        const sortedToken1Contract = new ethers.Contract(token1, config.ABIS.prc20, signer);
        const sortedSymbol0 = await sortedToken0Contract.symbol();
        const sortedSymbol1 = await sortedToken1Contract.symbol();

        // Determine price ratio for pool initialization
        // Pool always needs: token1/token0 ratio
        // Input format: "1 inputToken0 = priceRatio inputToken1"

        console.log('🧮 PRICE CALCULATION:');
        console.log('├─ Input format: 1', inputSymbol0, '=', priceRatio, inputSymbol1);
        console.log('├─ Pool token0:', sortedSymbol0);
        console.log('├─ Pool token1:', sortedSymbol1);

        let actualPriceRatio;

        // Case 1: inputToken0=pETH, inputToken1=pUSDC, input="1 pETH = 4000 pUSDC"
        // Pool: token0=pUSDC, token1=pETH
        // Need: token1/token0 = pETH/pUSDC = 1/4000 = 0.00025
        if (inputSymbol0 === sortedSymbol1 && inputSymbol1 === sortedSymbol0) {
            actualPriceRatio = 1 / priceRatio;
            console.log('├─ Case: Input swapped vs pool order');
            console.log('├─ Calculation: token1/token0 =', sortedSymbol1 + '/' + sortedSymbol0, '= 1/' + priceRatio, '=', actualPriceRatio);
        } else {
            actualPriceRatio = priceRatio;
            console.log('├─ Case: Input matches pool order');
            console.log('├─ Calculation: token1/token0 =', sortedSymbol1 + '/' + sortedSymbol0, '=', priceRatio);
        }

        console.log('├─ Input price meaning: 1', inputSymbol0, '=', priceRatio, inputSymbol1);
        console.log('├─ Pool token0 (sorted):', sortedSymbol0);
        console.log('├─ Pool token1 (sorted):', sortedSymbol1);
        console.log('├─ Actual price ratio for pool (token1/token0):', actualPriceRatio);

        // Get token decimals for proper price calculation
        const token0Contract = new ethers.Contract(token0, config.ABIS.prc20, signer);
        const token1Contract = new ethers.Contract(token1, config.ABIS.prc20, signer);
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

        // Save pool info with readable keys and token symbols
        const addressesPath = path.join(__dirname, '..', 'test-addresses.json');
        let addressesData = {};

        try {
            addressesData = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));
        } catch (error) {
            // Initialize new file structure
            addressesData = {
                version: "1.0.0",
                lastUpdated: new Date().toISOString().split('T')[0],
                productionPools: {},
                network: {
                    name: "Push Chain",
                    chainId: 42101,
                    rpcUrl: "https://evm.rpc-testnet-donut-node1.push.org"
                },
                contracts: config.CONTRACTS,
                testTokens: {},
                pools: {}
            };
        }

        // Get token symbols for readable pool key
        const token0ContractForSymbol = new ethers.Contract(token0, config.ABIS.prc20, signer);
        const token1ContractForSymbol = new ethers.Contract(token1, config.ABIS.prc20, signer);
        const token0Symbol = await token0ContractForSymbol.symbol();
        const token1Symbol = await token1ContractForSymbol.symbol();

        // Create readable pool key
        const poolKey = `${token0Symbol}_${token1Symbol}_${fee}`;

        addressesData.pools[poolKey] = {
            name: `${token0Symbol}/${token1Symbol} Pool`,
            address: poolAddress,
            token0: token0,
            token1: token1,
            token0Symbol: token0Symbol,
            token1Symbol: token1Symbol,
            fee: fee,
            feePercentage: `${(fee / 10000).toFixed(2)}%`,
            priceRatio: actualPriceRatio,
            sqrtPriceX96: sqrtPriceX96.toString(),
            currentTick: slot0.tick.toString(),
            targetPricing: `1 ${token0Symbol} = ${1 / actualPriceRatio} ${token1Symbol}`,
            createdAt: new Date().toISOString()
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

        // Check if we need WPUSH for this liquidity addition
        const wpushAddress = config.CONTRACTS.wpush;
        if (inputToken0Address.toLowerCase() === wpushAddress.toLowerCase()) {
            await ensureWPUSH(inputAmount0);
        }
        if (inputToken1Address.toLowerCase() === wpushAddress.toLowerCase()) {
            await ensureWPUSH(inputAmount1);
        }

        // Get input token contracts
        const inputToken0 = new ethers.Contract(inputToken0Address, config.ABIS.prc20, signer);
        const inputToken1 = new ethers.Contract(inputToken1Address, config.ABIS.prc20, signer);

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
        const sortedTokenContract0 = new ethers.Contract(sortedToken0, config.ABIS.prc20, signer);
        const sortedTokenContract1 = new ethers.Contract(sortedToken1, config.ABIS.prc20, signer);
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

        // Safe approve tokens (approve the actual tokens we're using)
        console.log('├─ Safe approving tokens...');
        await safeApprove(sortedTokenContract0, positionManager.address, poolAmount0Desired, signer.address);
        await safeApprove(sortedTokenContract1, positionManager.address, poolAmount1Desired, signer.address);

        // Get pool info for fee and current state
        const pool = new ethers.Contract(poolAddress, config.ABIS.pool, signer);
        const fee = await pool.fee();
        const slot0 = await pool.slot0();
        const currentTick = slot0.tick.toNumber ? slot0.tick.toNumber() : slot0.tick;

        // Dynamic tick range based on fee tier for better liquidity coverage
        const tickSpacing = fee === 500 ? 10 : fee === 3000 ? 60 : 200;

        // Wider range for higher fee tiers, scales with tick spacing
        const baseTickRange = fee === 500 ? 2000 : fee === 3000 ? 5000 : 10000;
        const tickRange = Math.max(baseTickRange, tickSpacing * 50); // Ensure minimum coverage

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
        let mintTx, receipt;
        try {
            mintTx = await positionManager.mint(mintParams);
            receipt = await mintTx.wait();
        } catch (mintError) {
            console.log('├─ ❌ Mint failed:', mintError.reason || mintError.message);
            throw new Error(`Position minting failed: ${mintError.reason || mintError.message}`);
        }
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

        // Check if we need WPUSH for this swap (if tokenIn is WPUSH)
        const wpushAddress = config.CONTRACTS.wpush;
        if (tokenInAddress.toLowerCase() === wpushAddress.toLowerCase()) {
            await ensureWPUSH(amountIn);
        }

        // Get token contracts
        const tokenIn = new ethers.Contract(tokenInAddress, config.ABIS.prc20, signer);
        const tokenOut = new ethers.Contract(tokenOutAddress, config.ABIS.prc20, signer);

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

        // Safe approve token
        console.log('├─ Safe approving token...');
        await safeApprove(tokenIn, swapRouter.address, amountInParsed, signer.address);

        // Get pool fee
        const pool = new ethers.Contract(poolAddress, config.ABIS.pool, signer);
        const fee = await pool.fee();

        // Calculate expected minimum output (allow 50% slippage for testing)
        const expectedOut = amountInParsed.div(4000); // Rough estimate based on price
        const minOut = expectedOut.div(2); // 50% slippage tolerance

        // Swap params
        const swapParams = {
            tokenIn: tokenInAddress,
            tokenOut: tokenOutAddress,
            fee: fee,
            recipient: signer.address,
            deadline: Math.floor(Date.now() / 1000) + 60 * 20,
            amountIn: amountInParsed,
            amountOutMinimum: 0, // Allow any output for debugging
            sqrtPriceLimitX96: 0
        };

        console.log('├─ Swap params:', JSON.stringify({
            ...swapParams,
            amountIn: swapParams.amountIn.toString(),
            deadline: new Date(swapParams.deadline * 1000).toISOString()
        }, null, 2));

        console.log('├─ Executing swap...');
        let receipt;
        try {
            const swapTx = await swapRouter.exactInputSingle(swapParams);
            console.log('├─ Transaction sent:', swapTx.hash);
            receipt = await swapTx.wait();
            console.log('├─ Transaction confirmed, gas used:', receipt.gasUsed.toString());

            // Check for swap events
            if (receipt.logs && receipt.logs.length > 0) {
                console.log('├─ Transaction had', receipt.logs.length, 'events');
                receipt.logs.forEach((log, i) => {
                    console.log(`├─ Event ${i}: ${log.topics[0]}`);
                });
            } else {
                console.log('├─ ⚠️  Transaction had NO EVENTS - this might be the issue!');
            }
        } catch (swapError) {
            console.log('├─ ❌ Swap transaction failed:', swapError.message);
            throw swapError;
        }

        // Check new balances
        const balanceInAfter = await tokenIn.balanceOf(signer.address);
        const balanceOutAfter = await tokenOut.balanceOf(signer.address);

        const amountInActual = balanceInBefore.sub(balanceInAfter);
        const amountOutActual = balanceOutAfter.sub(balanceOutBefore);

        console.log('📊 Swap Results:');
        console.log('├─ Amount In:', ethers.utils.formatUnits(amountInActual, decimalsIn), symbolIn);
        console.log('├─ Amount Out (formatted):', ethers.utils.formatUnits(amountOutActual, decimalsOut), symbolOut);
        console.log('├─ Amount Out (raw wei):', amountOutActual.toString());
        console.log('├─ Amount Out (18 decimals):', parseFloat(ethers.utils.formatUnits(amountOutActual, decimalsOut)).toFixed(18));

        // Calculate exchange rate properly
        if (amountInActual.gt(0)) {
            const rate = amountOutActual.mul(ethers.utils.parseUnits('1', decimalsIn)).div(amountInActual);
            console.log('├─ Exchange Rate:', `1 ${symbolIn} = ${ethers.utils.formatUnits(rate, decimalsOut)} ${symbolOut}`);
        } else {
            console.log('├─ Exchange Rate: N/A (no input amount)');
        }

        // Status check
        if (amountOutActual.gt(0)) {
            console.log('├─ ✅ SWAP SUCCESS: Received', amountOutActual.toString(), 'wei of', symbolOut);
        } else {
            console.log('├─ ❌ NO OUTPUT: Zero tokens received');
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

// Add full-range liquidity (covers all possible prices)
async function addFullRangeLiquidity(poolAddress, token0Address, token1Address, amount0, amount1) {
    console.log('💰 ADDING FULL-RANGE LIQUIDITY');
    console.log('='.repeat(50));

    try {
        const signer = config.getSigner();
        const positionManager = new ethers.Contract(config.CONTRACTS.positionManager, config.ABIS.positionManager, signer);

        // Get pool info
        const pool = new ethers.Contract(poolAddress, config.ABIS.pool, signer);
        const token0 = await pool.token0();
        const token1 = await pool.token1();
        const fee = await pool.fee();

        console.log('├─ Pool Address:', poolAddress);
        console.log('├─ Token0 (sorted):', token0);
        console.log('├─ Token1 (sorted):', token1);

        // Get token contracts and info
        const token0Contract = new ethers.Contract(token0, config.ABIS.prc20, signer);
        const token1Contract = new ethers.Contract(token1, config.ABIS.prc20, signer);
        const decimals0 = await token0Contract.decimals();
        const decimals1 = await token1Contract.decimals();
        const symbol0 = await token0Contract.symbol();
        const symbol1 = await token1Contract.symbol();

        // Parse amounts
        const amount0Parsed = ethers.utils.parseUnits(amount0, decimals0);
        const amount1Parsed = ethers.utils.parseUnits(amount1, decimals1);

        console.log('├─ Amount0:', amount0, symbol0);
        console.log('├─ Amount1:', amount1, symbol1);

        // Use FULL RANGE ticks (covers all possible prices)
        const MIN_TICK = -887272;
        const MAX_TICK = 887272;

        // Align to tick spacing
        const tickSpacing = fee === 500 ? 10 : fee === 3000 ? 60 : 200;
        const tickLower = Math.ceil(MIN_TICK / tickSpacing) * tickSpacing;
        const tickUpper = Math.floor(MAX_TICK / tickSpacing) * tickSpacing;

        console.log('├─ Tick Range: FULL RANGE [', tickLower, ',', tickUpper, ']');
        console.log('├─ This covers ALL possible prices!');

        // Safe approve tokens
        console.log('├─ Safe approving tokens...');
        await safeApprove(token0Contract, positionManager.address, amount0Parsed, signer.address);
        await safeApprove(token1Contract, positionManager.address, amount1Parsed, signer.address);

        // Mint position
        const mintParams = {
            token0: token0,
            token1: token1,
            fee: fee,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: amount0Parsed,
            amount1Desired: amount1Parsed,
            amount0Min: 0,
            amount1Min: 0,
            recipient: signer.address,
            deadline: Math.floor(Date.now() / 1000) + 60 * 20
        };

        console.log('├─ Minting full-range position...');
        const mintTx = await positionManager.mint(mintParams);
        const receipt = await mintTx.wait();

        // Get token ID from events
        const mintEvent = receipt.events?.find(e => e.event === 'IncreaseLiquidity' || e.event === 'Transfer');
        const tokenId = mintEvent ? (mintEvent.args?.tokenId || mintEvent.args?.[2]) : 'Unknown';

        console.log('└─ ✅ Full-range position NFT #' + tokenId + ' minted successfully!');
        console.log('🎯 Now swaps should work with unlimited liquidity!');

    } catch (error) {
        console.log('❌ Full-range liquidity addition failed:', error.message);
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
                // node pool-manager.js deploy-tokens pETH "Push ETH" 18 1000000 [pUSDC "Push USDC" 6 10000000]
                const [token1Symbol, token1Name, token1Decimals, token1Supply, token2Symbol, token2Name, token2Decimals, token2Supply] = args.slice(1);

                // Handle single token deployment (4 args) or dual token deployment (8 args)
                if (args.length === 5) {
                    // Single token: deploy-tokens pUSDC "Push USDC" 6 10000000
                    await deployTokens(token1Symbol, token1Name, parseInt(token1Decimals), token1Supply);
                } else if (args.length === 9) {
                    // Dual tokens: deploy-tokens pETH "Push ETH" 18 1000000 pUSDC "Push USDC" 6 10000000
                    await deployTokens(token1Symbol, token1Name, parseInt(token1Decimals), token1Supply, token2Symbol, token2Name, parseInt(token2Decimals), token2Supply);
                } else {
                    throw new Error('Invalid number of arguments. Use: deploy-tokens <symbol> <name> <decimals> <supply> [symbol2 name2 decimals2 supply2]');
                }
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

            case 'add-liquidity-full-range':
                // node pool-manager.js add-liquidity-full-range <poolAddress> <token0Address> <token1Address> <amount0> <amount1>
                const [poolAddr2, tok0Addr2, tok1Addr2, amount0_2, amount1_2] = args.slice(1);
                await addFullRangeLiquidity(poolAddr2, tok0Addr2, tok1Addr2, amount0_2, amount1_2);
                break;

            default:
                console.log('Usage:');
                console.log('  deploy-tokens <token1Symbol> <token1Name> <token1Decimals> <token1Supply> [token2Symbol token2Name token2Decimals token2Supply]');
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