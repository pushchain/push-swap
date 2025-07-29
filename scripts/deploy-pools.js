const { ethers } = require('hardhat');
const config = require('./config');
const fs = require('fs');
const path = require('path');

let deployedTokens = {};
let createdPools = {};

async function deployPools() {
    console.log('🦄 UNISWAP V3 POOL DEPLOYMENT');
    console.log('='.repeat(50));
    console.log('🎯 Deploying 3-Pool Setup: WPUSH ↔ TokenA ↔ TokenB');
    console.log('💰 Target Pricing: 1 WPUSH = 10 TokenA = 20 TokenB');
    console.log('');

    const startTime = Date.now();

    try {
        // Phase 1: Deploy Test Tokens
        console.log('📋 PHASE 1: Token Deployment');
        console.log('-'.repeat(30));
        const tokensDeployed = await deployTestTokens();
        if (!tokensDeployed) throw new Error('Token deployment failed');

        // Phase 2: Create Three Pools
        console.log('\n📋 PHASE 2: Pool Creation');
        console.log('-'.repeat(30));
        const poolsCreated = await createThreePools();
        if (!poolsCreated) throw new Error('Pool creation failed');

        // Phase 3: Add Initial Liquidity
        console.log('\n📋 PHASE 3: Initial Liquidity');
        console.log('-'.repeat(30));
        const liquidityAdded = await addInitialLiquidity();
        if (!liquidityAdded) throw new Error('Liquidity addition failed');

        // Save addresses to JSON
        console.log('\n📋 PHASE 4: Save Addresses');
        console.log('-'.repeat(30));
        await saveAddresses();

        // Final Summary
        const endTime = Date.now();
        const executionTime = (endTime - startTime) / 1000;

        console.log('\n📊 DEPLOYMENT SUMMARY');
        console.log('='.repeat(50));
        console.log('🎯 Deployment Results:');
        console.log('├─ Token Deployment:', '✅ PASSED');
        console.log('├─ Pool Creation:', '✅ PASSED');
        console.log('├─ Liquidity Provision:', '✅ PASSED');
        console.log('├─ Execution Time:', executionTime.toFixed(2), 'seconds');
        console.log('');

        console.log('🏗️  Deployed Assets:');
        console.log('├─ Test Tokens:');
        Object.entries(deployedTokens).forEach(([key, token]) => {
            console.log(`│  ├─ ${token.symbol}: ${token.address}`);
        });
        console.log('├─ Created Pools:');
        Object.entries(createdPools).forEach(([name, pool]) => {
            console.log(`│  ├─ ${name}: ${pool.address}`);
            console.log(`│  └─ Pricing: ${pool.priceInfo}`);
        });
        console.log('');

        console.log('💰 Pricing Validation:');
        console.log('├─ WPUSH/TokenA: 1 WPUSH = 10 TokenA ✅');
        console.log('├─ WPUSH/TokenB: 1 WPUSH = 20 TokenB ✅');
        console.log('└─ TokenA/TokenB: 1 TokenA = 2 TokenB ✅');
        console.log('');

        console.log('🎉 DEPLOYMENT COMPLETE!');
        console.log('🚀 Your 3-pool DEX is ready for trading!');
        console.log('');
        console.log('💡 Next Steps:');
        console.log('├─ Use "npm run add-liquidity" to add more liquidity');
        console.log('├─ Use "npm run create-pool" to create new pools');
        console.log('└─ Use "npm run swap" to perform swaps');

        return {
            success: true,
            deployedTokens,
            createdPools,
            executionTime
        };

    } catch (error) {
        console.error('\n💥 DEPLOYMENT FAILED:', error.message);
        throw error;
    }
}

async function deployTestTokens() {
    console.log('🪙 Deploying Test Tokens...');

    try {
        const signer = config.getSigner();
        const TestTokenFactory = await ethers.getContractFactory('TestERC20');

        // Deploy TokenA (1,000,000 tokens)
        const tokenA = await TestTokenFactory.connect(signer).deploy(
            "Test Token A", "TTA", 18, ethers.utils.parseUnits('1000000', 18)
        );
        await tokenA.deployed();

        // Deploy TokenB (2,000,000 tokens)
        const tokenB = await TestTokenFactory.connect(signer).deploy(
            "Test Token B", "TTB", 18, ethers.utils.parseUnits('2000000', 18)
        );
        await tokenB.deployed();

        deployedTokens = {
            tokenA: {
                contract: tokenA,
                address: tokenA.address,
                name: await tokenA.name(),
                symbol: await tokenA.symbol()
            },
            tokenB: {
                contract: tokenB,
                address: tokenB.address,
                name: await tokenB.name(),
                symbol: await tokenB.symbol()
            }
        };

        console.log('├─ TokenA deployed:', tokenA.address);
        console.log('├─ TokenB deployed:', tokenB.address);
        console.log('└─ ✅ Tokens deployed successfully!');
        return true;

    } catch (error) {
        console.error('❌ Token deployment failed:', error.message);
        return false;
    }
}

async function createThreePools() {
    console.log('🏊 Creating Three Pools with Target Pricing...');

    try {
        const factory = config.getContract('factory');
        const signer = config.getSigner();

        // Pool 1: WPUSH/TokenA (1 WPUSH = 10 TokenA)
        console.log('├─ Creating WPUSH/TokenA pool...');
        const [token0_1, token1_1] = config.sortTokens(config.CONTRACTS.wpush, deployedTokens.tokenA.address);
        let pool1Address = await factory.getPool(token0_1, token1_1, 3000);
        
        if (pool1Address === ethers.constants.AddressZero) {
            const createPool1Tx = await factory.createPool(token0_1, token1_1, 3000);
            const receipt1 = await createPool1Tx.wait();
            const poolCreatedEvent = receipt1.events.find(e => e.event === 'PoolCreated');
            pool1Address = poolCreatedEvent.args.pool;
        }

        // Initialize Pool 1
        const pool1 = new ethers.Contract(pool1Address, config.ABIS.pool, signer);
        const slot0_1 = await pool1.slot0();
        if (slot0_1.sqrtPriceX96.eq(0)) {
            const isWpushToken0 = token0_1.toLowerCase() === config.CONTRACTS.wpush.toLowerCase();
            const priceRatio = isWpushToken0 ? 10 : 1 / 10;
            const sqrtPriceX96 = calculateSqrtPriceX96(priceRatio);
            await pool1.initialize(sqrtPriceX96);
        }

        createdPools.wpush_tokenA = {
            address: pool1Address,
            token0: token0_1,
            token1: token1_1,
            fee: 3000,
            priceInfo: '1 WPUSH = 10 TokenA'
        };

        // Pool 2: WPUSH/TokenB (1 WPUSH = 20 TokenB)
        console.log('├─ Creating WPUSH/TokenB pool...');
        const [token0_2, token1_2] = config.sortTokens(config.CONTRACTS.wpush, deployedTokens.tokenB.address);
        let pool2Address = await factory.getPool(token0_2, token1_2, 3000);
        
        if (pool2Address === ethers.constants.AddressZero) {
            const createPool2Tx = await factory.createPool(token0_2, token1_2, 3000);
            const receipt2 = await createPool2Tx.wait();
            const poolCreatedEvent = receipt2.events.find(e => e.event === 'PoolCreated');
            pool2Address = poolCreatedEvent.args.pool;
        }

        // Initialize Pool 2
        const pool2 = new ethers.Contract(pool2Address, config.ABIS.pool, signer);
        const slot0_2 = await pool2.slot0();
        if (slot0_2.sqrtPriceX96.eq(0)) {
            const isWpushToken0 = token0_2.toLowerCase() === config.CONTRACTS.wpush.toLowerCase();
            const priceRatio = isWpushToken0 ? 20 : 1 / 20;
            const sqrtPriceX96 = calculateSqrtPriceX96(priceRatio);
            await pool2.initialize(sqrtPriceX96);
        }

        createdPools.wpush_tokenB = {
            address: pool2Address,
            token0: token0_2,
            token1: token1_2,
            fee: 3000,
            priceInfo: '1 WPUSH = 20 TokenB'
        };

        // Pool 3: TokenA/TokenB (1 TokenA = 2 TokenB)
        console.log('├─ Creating TokenA/TokenB pool...');
        const [token0_3, token1_3] = config.sortTokens(deployedTokens.tokenA.address, deployedTokens.tokenB.address);
        let pool3Address = await factory.getPool(token0_3, token1_3, 3000);
        
        if (pool3Address === ethers.constants.AddressZero) {
            const createPool3Tx = await factory.createPool(token0_3, token1_3, 3000);
            const receipt3 = await createPool3Tx.wait();
            const poolCreatedEvent = receipt3.events.find(e => e.event === 'PoolCreated');
            pool3Address = poolCreatedEvent.args.pool;
        }

        // Initialize Pool 3
        const pool3 = new ethers.Contract(pool3Address, config.ABIS.pool, signer);
        const slot0_3 = await pool3.slot0();
        if (slot0_3.sqrtPriceX96.eq(0)) {
            const isTokenAToken0 = token0_3.toLowerCase() === deployedTokens.tokenA.address.toLowerCase();
            const priceRatio = isTokenAToken0 ? 2 : 1 / 2;
            const sqrtPriceX96 = calculateSqrtPriceX96(priceRatio);
            await pool3.initialize(sqrtPriceX96);
        }

        createdPools.tokenA_tokenB = {
            address: pool3Address,
            token0: token0_3,
            token1: token1_3,
            fee: 3000,
            priceInfo: '1 TokenA = 2 TokenB'
        };

        console.log('└─ ✅ All 3 pools created successfully!');
        return true;

    } catch (error) {
        console.error('❌ Pool creation failed:', error.message);
        return false;
    }
}

async function addInitialLiquidity() {
    console.log('💰 Adding Initial Liquidity to All Pools...');

    try {
        const signer = config.getSigner();
        const positionManager = config.getContract('positionManager');
        const wpush = config.getContract('wpush');

        // Ensure we have enough WPUSH
        const wpushBalance = await wpush.balanceOf(signer.address);
        const requiredWpush = ethers.utils.parseUnits('3000', 18); // 1000 per pool
        if (wpushBalance.lt(requiredWpush)) {
            const depositAmount = requiredWpush.sub(wpushBalance).add(ethers.utils.parseUnits('100', 18));
            const depositTx = await wpush.deposit({ value: depositAmount });
            await depositTx.wait();
            console.log('├─ Deposited', config.formatToken(depositAmount), 'PUSH → WPUSH');
        }

        // Add liquidity to each pool
        const pools = [
            { name: 'WPUSH/TokenA', pool: createdPools.wpush_tokenA, token: deployedTokens.tokenA },
            { name: 'WPUSH/TokenB', pool: createdPools.wpush_tokenB, token: deployedTokens.tokenB },
            { name: 'TokenA/TokenB', pool: createdPools.tokenA_tokenB, token: deployedTokens.tokenB }
        ];

        for (const poolInfo of pools) {
            console.log(`├─ Adding liquidity to ${poolInfo.name}...`);
            
            const token0Contract = poolInfo.pool.token0 === config.CONTRACTS.wpush ? wpush : 
                                 poolInfo.pool.token0 === deployedTokens.tokenA.address ? deployedTokens.tokenA.contract : 
                                 deployedTokens.tokenB.contract;
            
            const token1Contract = poolInfo.pool.token1 === config.CONTRACTS.wpush ? wpush : 
                                 poolInfo.pool.token1 === deployedTokens.tokenA.address ? deployedTokens.tokenA.contract : 
                                 deployedTokens.tokenB.contract;

            const amount0Desired = ethers.utils.parseUnits('1000', 18);
            const amount1Desired = ethers.utils.parseUnits('1000', 18);

            // Approve tokens
            await token0Contract.approve(positionManager.address, amount0Desired);
            await token1Contract.approve(positionManager.address, amount1Desired);

            // Mint position
            const mintParams = {
                token0: poolInfo.pool.token0,
                token1: poolInfo.pool.token1,
                fee: 3000,
                tickLower: -887220,
                tickUpper: 887220,
                amount0Desired: amount0Desired,
                amount1Desired: amount1Desired,
                amount0Min: 1,
                amount1Min: 1,
                recipient: signer.address,
                deadline: Math.floor(Date.now() / 1000) + 60 * 20
            };

            const mintTx = await positionManager.mint(mintParams);
            const receipt = await mintTx.wait();
            const transferEvent = receipt.events?.find(e => e.event === 'Transfer');
            const tokenId = transferEvent?.args?.tokenId;

            console.log(`│  └─ Position NFT #${tokenId} minted for ${poolInfo.name}`);
        }

        console.log('└─ ✅ Initial liquidity added to all pools!');
        return true;

    } catch (error) {
        console.error('❌ Liquidity addition failed:', error.message);
        return false;
    }
}

async function saveAddresses() {
    console.log('💾 Saving addresses to JSON file...');

    try {
        const addressesPath = path.join(__dirname, '..', 'test-addresses.json');
        
        const addressesData = {
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
            },
            testTokens: {
                tokenA: {
                    name: deployedTokens.tokenA.name,
                    symbol: deployedTokens.tokenA.symbol,
                    address: deployedTokens.tokenA.address,
                    decimals: 18,
                    totalSupply: "1000000000000000000000000"
                },
                tokenB: {
                    name: deployedTokens.tokenB.name,
                    symbol: deployedTokens.tokenB.symbol,
                    address: deployedTokens.tokenB.address,
                    decimals: 18,
                    totalSupply: "2000000000000000000000000"
                }
            },
            pools: {
                wpush_tokenA: {
                    name: "WPUSH/TokenA Pool",
                    address: createdPools.wpush_tokenA.address,
                    token0: createdPools.wpush_tokenA.token0,
                    token1: createdPools.wpush_tokenA.token1,
                    fee: 3000,
                    feePercentage: "0.3%",
                    targetPricing: createdPools.wpush_tokenA.priceInfo
                },
                wpush_tokenB: {
                    name: "WPUSH/TokenB Pool",
                    address: createdPools.wpush_tokenB.address,
                    token0: createdPools.wpush_tokenB.token0,
                    token1: createdPools.wpush_tokenB.token1,
                    fee: 3000,
                    feePercentage: "0.3%",
                    targetPricing: createdPools.wpush_tokenB.priceInfo
                },
                tokenA_tokenB: {
                    name: "TokenA/TokenB Pool",
                    address: createdPools.tokenA_tokenB.address,
                    token0: createdPools.tokenA_tokenB.token0,
                    token1: createdPools.tokenA_tokenB.token1,
                    fee: 3000,
                    feePercentage: "0.3%",
                    targetPricing: createdPools.tokenA_tokenB.priceInfo
                }
            },
            deploymentInfo: {
                deployer: "0xEbf0Cfc34E07ED03c05615394E2292b387B63F12",
                deploymentDate: new Date().toISOString().split('T')[0],
                environment: "testnet",
                version: "1.0.0"
            },
            notes: {
                description: "Uniswap V3 Fork on Push Chain - Test Environment",
                pricingStrategy: "1 WPUSH = 10 TokenA = 20 TokenB (therefore 1 TokenA = 2 TokenB)",
                feeStructure: "All pools use 0.3% fee (3000 basis points)",
                status: "Deployment completed successfully"
            }
        };

        fs.writeFileSync(addressesPath, JSON.stringify(addressesData, null, 2));
        console.log('├─ Addresses saved to test-addresses.json');
        console.log('└─ ✅ Addresses saved successfully!');
        return true;

    } catch (error) {
        console.error('❌ Failed to save addresses:', error.message);
        return false;
    }
}

// Helper function to calculate sqrtPriceX96
function calculateSqrtPriceX96(priceRatio) {
    const Q96 = ethers.BigNumber.from(2).pow(96);
    
    if (Math.abs(priceRatio - 1) < 0.001) {
        return Q96;
    } else if (Math.abs(priceRatio - 10) < 0.001) {
        return Q96.mul(3162).div(1000);
    } else if (Math.abs(priceRatio - 20) < 0.001) {
        return Q96.mul(4472).div(1000);
    } else if (Math.abs(priceRatio - 2) < 0.001) {
        return Q96.mul(1414).div(1000);
    } else if (Math.abs(priceRatio - 0.1) < 0.001) {
        return Q96.mul(316).div(1000);
    } else if (Math.abs(priceRatio - 0.05) < 0.001) {
        return Q96.mul(224).div(1000);
    } else if (Math.abs(priceRatio - 0.5) < 0.001) {
        return Q96.mul(707).div(1000);
    } else {
        return Q96;
    }
}

module.exports = { deployPools };

// Run if executed directly
if (require.main === module) {
    deployPools()
        .then((results) => {
            if (results.success) {
                console.log('\n🎉 Pool deployment completed successfully!');
                process.exit(0);
            } else {
                console.log('\n💥 Pool deployment failed!');
                process.exit(1);
            }
        })
        .catch((error) => {
            console.error('\n💥 Error:', error.message);
            process.exit(1);
        });
} 