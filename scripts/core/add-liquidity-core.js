const { ethers } = require('hardhat');
const config = require('./config');
const fs = require('fs');
const path = require('path');

async function addLiquidity(options = {}) {
    console.log('💰 ADD LIQUIDITY TO POOL');
    console.log('='.repeat(50));

    try {
        // Load addresses from JSON file
        const addressesPath = path.join(__dirname, '..', '..', 'test-addresses.json');
        if (!fs.existsSync(addressesPath)) {
            throw new Error('test-addresses.json not found. Please run deploy-pools first.');
        }

        const addressesData = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));
        const signer = config.getSigner();
        const positionManager = config.getContract('positionManager');
        const wpush = config.getContract('wpush');

        let poolAddress, token0Address, token1Address, poolName;

        // Determine pool to add liquidity to
        if (options.poolAddress) {
            // Use provided pool address
            poolAddress = options.poolAddress;
            console.log(`🎯 Using provided pool address: ${poolAddress}`);

            // Get pool info
            const pool = new ethers.Contract(poolAddress, config.ABIS.pool, signer);
            token0Address = await pool.token0();
            token1Address = await pool.token1();
            poolName = `${token0Address} / ${token1Address}`;

        } else if (options.token0 && options.token1) {
            // Find pool by token addresses
            const factory = config.getContract('factory');
            const [sortedToken0, sortedToken1] = config.sortTokens(options.token0, options.token1);
            poolAddress = await factory.getPool(sortedToken0, sortedToken1, 3000);

            if (poolAddress === ethers.constants.AddressZero) {
                throw new Error('Pool not found for the specified tokens. Please create the pool first.');
            }

            token0Address = sortedToken0;
            token1Address = sortedToken1;
            poolName = `${token0Address} / ${token1Address}`;
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
            token0Address = firstPool.token0;
            token1Address = firstPool.token1;
            poolName = firstPool.name;

            console.log(`🎯 Using default pool: ${poolName}`);
        }

        // Get token contracts
        const token0Contract = token0Address === config.CONTRACTS.wpush ? wpush :
            new ethers.Contract(token0Address, config.ABIS.erc20, signer);
        const token1Contract = token1Address === config.CONTRACTS.wpush ? wpush :
            new ethers.Contract(token1Address, config.ABIS.erc20, signer);

        // Get token symbols
        const token0Symbol = token0Address === config.CONTRACTS.wpush ? 'WPUSH' : await token0Contract.symbol();
        const token1Symbol = token1Address === config.CONTRACTS.wpush ? 'WPUSH' : await token1Contract.symbol();

        console.log(`\n📋 Pool Information:`);
        console.log(`├─ Pool Address: ${poolAddress}`);
        console.log(`├─ Token0: ${token0Symbol} (${token0Address})`);
        console.log(`├─ Token1: ${token1Symbol} (${token1Address})`);
        console.log(`└─ Fee: 0.3%`);

        // Check balances
        const balance0 = await token0Contract.balanceOf(signer.address);
        const balance1 = await token1Contract.balanceOf(signer.address);

        console.log(`\n💰 Current Balances:`);
        console.log(`├─ ${token0Symbol}: ${config.formatToken(balance0)}`);
        console.log(`└─ ${token1Symbol}: ${config.formatToken(balance1)}`);

        // Determine amounts to add
        const amount0Desired = options.amount0 || ethers.utils.parseUnits('100', 18);
        const amount1Desired = options.amount1 || ethers.utils.parseUnits('100', 18);

        console.log(`\n💧 Adding Liquidity:`);
        console.log(`├─ ${token0Symbol}: ${config.formatToken(amount0Desired)}`);
        console.log(`└─ ${token1Symbol}: ${config.formatToken(amount1Desired)}`);

        // Check if we have enough tokens
        if (balance0.lt(amount0Desired)) {
            if (token0Address === config.CONTRACTS.wpush) {
                // Deposit more PUSH to WPUSH
                const neededAmount = amount0Desired.sub(balance0).add(ethers.utils.parseUnits('10', 18));
                console.log(`\n💳 Depositing ${config.formatToken(neededAmount)} PUSH → WPUSH...`);
                const depositTx = await wpush.deposit({ value: neededAmount });
                await depositTx.wait();
                console.log('✅ Deposit completed');
            } else {
                throw new Error(`Insufficient ${token0Symbol} balance. Need ${config.formatToken(amount0Desired)}, have ${config.formatToken(balance0)}`);
            }
        }

        if (balance1.lt(amount1Desired)) {
            if (token1Address === config.CONTRACTS.wpush) {
                // Deposit more PUSH to WPUSH
                const neededAmount = amount1Desired.sub(balance1).add(ethers.utils.parseUnits('10', 18));
                console.log(`\n💳 Depositing ${config.formatToken(neededAmount)} PUSH → WPUSH...`);
                const depositTx = await wpush.deposit({ value: neededAmount });
                await depositTx.wait();
                console.log('✅ Deposit completed');
            } else {
                throw new Error(`Insufficient ${token1Symbol} balance. Need ${config.formatToken(amount1Desired)}, have ${config.formatToken(balance1)}`);
            }
        }

        // Approve tokens
        console.log('\n🔐 Approving tokens...');
        await token0Contract.approve(positionManager.address, amount0Desired);
        await token1Contract.approve(positionManager.address, amount1Desired);
        console.log('✅ Approvals completed');

        // Mint position
        console.log('\n🎨 Minting liquidity position...');
        const mintParams = {
            token0: token0Address,
            token1: token1Address,
            fee: 3000,
            tickLower: options.tickLower || -887220, // Full range by default
            tickUpper: options.tickUpper || 887220,  // Full range by default
            amount0Desired: amount0Desired,
            amount1Desired: amount1Desired,
            amount0Min: options.amount0Min || 1,
            amount1Min: options.amount1Min || 1,
            recipient: signer.address,
            deadline: Math.floor(Date.now() / 1000) + 60 * 20
        };

        const mintTx = await positionManager.mint(mintParams);
        const receipt = await mintTx.wait();
        const transferEvent = receipt.events?.find(e => e.event === 'Transfer');
        const tokenId = transferEvent?.args?.tokenId;

        console.log('✅ Liquidity position minted successfully!');
        console.log(`\n📊 Results:`);
        console.log(`├─ Position NFT ID: #${tokenId}`);
        console.log(`├─ Pool: ${poolName}`);
        console.log(`├─ ${token0Symbol} Added: ${config.formatToken(amount0Desired)}`);
        console.log(`└─ ${token1Symbol} Added: ${config.formatToken(amount1Desired)}`);

        return {
            success: true,
            tokenId: tokenId.toString(),
            poolAddress,
            amount0: amount0Desired.toString(),
            amount1: amount1Desired.toString(),
            token0Symbol,
            token1Symbol
        };

    } catch (error) {
        console.error('❌ Add liquidity failed:', error.message);
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
    if (process.env.TOKEN0_ADDRESS) {
        options.token0 = process.env.TOKEN0_ADDRESS;
    }
    if (process.env.TOKEN1_ADDRESS) {
        options.token1 = process.env.TOKEN1_ADDRESS;
    }
    if (process.env.AMOUNT0) {
        options.amount0 = ethers.utils.parseUnits(process.env.AMOUNT0, 18);
    }
    if (process.env.AMOUNT1) {
        options.amount1 = ethers.utils.parseUnits(process.env.AMOUNT1, 18);
    }
    if (process.env.TICK_LOWER) {
        options.tickLower = parseInt(process.env.TICK_LOWER);
    }
    if (process.env.TICK_UPPER) {
        options.tickUpper = parseInt(process.env.TICK_UPPER);
    }

    return options;
}

module.exports = { addLiquidity };

// Run if executed directly
if (require.main === module) {
    const options = parseArgs();

    addLiquidity(options)
        .then((results) => {
            if (results.success) {
                console.log('\n🎉 Liquidity added successfully!');
                process.exit(0);
            } else {
                console.log('\n💥 Failed to add liquidity!');
                process.exit(1);
            }
        })
        .catch((error) => {
            console.error('\n💥 Error:', error.message);
            process.exit(1);
        });
} 