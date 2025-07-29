const { ethers } = require('hardhat');
const config = require('./config');
const fs = require('fs');
const path = require('path');

async function createPool(options = {}) {
    console.log('🏊 CREATE NEW POOL');
    console.log('='.repeat(50));

    try {
        if (!options.token0 || !options.token1) {
            throw new Error('Both token0 and token1 addresses are required.');
        }

        const signer = config.getSigner();
        const factory = config.getContract('factory');

        // Sort tokens
        const [sortedToken0, sortedToken1] = config.sortTokens(options.token0, options.token1);
        const fee = options.fee || 3000; // Default 0.3%

        console.log('📋 Pool Configuration:');
        console.log(`├─ Token0: ${sortedToken0}`);
        console.log(`├─ Token1: ${sortedToken1}`);
        console.log(`├─ Fee: ${fee} (${fee / 10000}%)`);
        console.log(`└─ Price Ratio: ${options.priceRatio || '1:1'}`);

        // Check if pool already exists
        let poolAddress = await factory.getPool(sortedToken0, sortedToken1, fee);

        if (poolAddress !== ethers.constants.AddressZero) {
            console.log(`⚠️  Pool already exists at: ${poolAddress}`);
            console.log('💡 Use --force to recreate the pool');

            if (!options.force) {
                return {
                    success: true,
                    poolAddress,
                    message: 'Pool already exists'
                };
            }
        }

        // Create pool
        console.log('\n🏗️  Creating pool...');
        const createPoolTx = await factory.createPool(sortedToken0, sortedToken1, fee);
        const receipt = await createPoolTx.wait();

        const poolCreatedEvent = receipt.events.find(e => e.event === 'PoolCreated');
        poolAddress = poolCreatedEvent.args.pool;

        console.log(`✅ Pool created at: ${poolAddress}`);

        // Initialize pool with price
        if (options.priceRatio) {
            console.log('\n💰 Initializing pool with price...');
            const pool = new ethers.Contract(poolAddress, config.ABIS.pool, signer);

            const slot0 = await pool.slot0();
            if (slot0.sqrtPriceX96.eq(0)) {
                const sqrtPriceX96 = calculateSqrtPriceX96(options.priceRatio);
                await pool.initialize(sqrtPriceX96);
                console.log(`✅ Pool initialized with price ratio: ${options.priceRatio}`);
            } else {
                console.log('⚠️  Pool already initialized');
            }
        }

        // Get token symbols for display
        const token0Contract = new ethers.Contract(sortedToken0, config.ABIS.erc20, signer);
        const token1Contract = new ethers.Contract(sortedToken1, config.ABIS.erc20, signer);

        let token0Symbol, token1Symbol;
        try {
            token0Symbol = await token0Contract.symbol();
        } catch {
            token0Symbol = 'Unknown';
        }
        try {
            token1Symbol = await token1Contract.symbol();
        } catch {
            token1Symbol = 'Unknown';
        }

        // Save to addresses file
        await updateAddressesFile(poolAddress, sortedToken0, sortedToken1, fee, token0Symbol, token1Symbol, options.priceRatio);

        console.log('\n📊 Pool Information:');
        console.log(`├─ Pool Address: ${poolAddress}`);
        console.log(`├─ Token0: ${token0Symbol} (${sortedToken0})`);
        console.log(`├─ Token1: ${token1Symbol} (${sortedToken1})`);
        console.log(`├─ Fee: ${fee} (${fee / 10000}%)`);
        console.log(`└─ Price Ratio: ${options.priceRatio || 'Not set'}`);

        console.log('\n💡 Next Steps:');
        console.log(`├─ Add liquidity: npm run add-liquidity --pool ${poolAddress}`);
        console.log(`├─ Perform swaps: npm run swap --pool ${poolAddress}`);
        console.log(`└─ View pool status in test-addresses.json`);

        return {
            success: true,
            poolAddress,
            token0: sortedToken0,
            token1: sortedToken1,
            fee,
            priceRatio: options.priceRatio,
            token0Symbol,
            token1Symbol
        };

    } catch (error) {
        console.error('❌ Create pool failed:', error.message);
        throw error;
    }
}

async function updateAddressesFile(poolAddress, token0, token1, fee, token0Symbol, token1Symbol, priceRatio) {
    try {
        const addressesPath = path.join(__dirname, '..', '..', 'test-addresses.json');
        let addressesData = {};

        if (fs.existsSync(addressesPath)) {
            addressesData = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));
        }

        // Add new pool to pools section
        const poolKey = `${token0Symbol.toLowerCase()}_${token1Symbol.toLowerCase()}`;
        addressesData.pools = addressesData.pools || {};
        addressesData.pools[poolKey] = {
            name: `${token0Symbol}/${token1Symbol} Pool`,
            address: poolAddress,
            token0: token0,
            token1: token1,
            fee: fee,
            feePercentage: `${fee / 10000}%`,
            targetPricing: priceRatio ? `1 ${token0Symbol} = ${priceRatio} ${token1Symbol}` : 'Not set'
        };

        fs.writeFileSync(addressesPath, JSON.stringify(addressesData, null, 2));
        console.log('✅ Pool address saved to test-addresses.json');

    } catch (error) {
        console.warn('⚠️  Could not save to addresses file:', error.message);
    }
}

// Helper function to calculate sqrtPriceX96
function calculateSqrtPriceX96(priceRatio) {
    const Q96 = ethers.BigNumber.from(2).pow(96);

    // Common price ratios
    const ratios = {
        1: Q96,
        2: Q96.mul(1414).div(1000),
        5: Q96.mul(2236).div(1000),
        10: Q96.mul(3162).div(1000),
        20: Q96.mul(4472).div(1000),
        50: Q96.mul(7071).div(1000),
        100: Q96.mul(10000).div(1000),
        0.5: Q96.mul(707).div(1000),
        0.1: Q96.mul(316).div(1000),
        0.05: Q96.mul(224).div(1000),
        0.01: Q96.mul(100).div(1000)
    };

    // Find closest match
    let closestRatio = 1;
    let minDiff = Math.abs(priceRatio - 1);

    for (const [ratio, value] of Object.entries(ratios)) {
        const diff = Math.abs(priceRatio - parseFloat(ratio));
        if (diff < minDiff) {
            minDiff = diff;
            closestRatio = parseFloat(ratio);
        }
    }

    return ratios[closestRatio];
}

// Parse command line arguments from environment variables
function parseArgs() {
    const options = {};

    // Read from environment variables
    if (process.env.TOKEN0_ADDRESS) {
        options.token0 = process.env.TOKEN0_ADDRESS;
    }
    if (process.env.TOKEN1_ADDRESS) {
        options.token1 = process.env.TOKEN1_ADDRESS;
    }
    if (process.env.POOL_FEE) {
        options.fee = parseInt(process.env.POOL_FEE);
    }
    if (process.env.PRICE_RATIO) {
        options.priceRatio = parseFloat(process.env.PRICE_RATIO);
    }
    if (process.env.FORCE_CREATE) {
        options.force = process.env.FORCE_CREATE === 'true';
    }

    return options;
}

module.exports = { createPool };

// Run if executed directly
if (require.main === module) {
    // Check for help flag first
    if (process.argv.includes('--help')) {
        console.log(`
🏊 Create Pool Script

Usage: npm run create-pool [options]

Options:
  --token0 <address>   Token0 address (required)
  --token1 <address>   Token1 address (required)
  --fee <number>       Pool fee in basis points (default: 3000 = 0.3%)
  --price <number>     Initial price ratio (e.g., 10 means 1 token0 = 10 token1)
  --force              Force recreate if pool exists
  --help               Show this help message

Examples:
  npm run create-pool --token0 0x1234... --token1 0x5678... --price 10
  npm run create-pool --token0 0x1234... --token1 0x5678... --fee 500 --price 2
  npm run create-pool --token0 0x1234... --token1 0x5678... --force

Common Fees:
  500  = 0.05%
  3000 = 0.3%
  10000 = 1%
        `);
        process.exit(0);
    }

    const options = parseArgs();

    if (!options.token0 || !options.token1) {
        console.error('❌ Both --token0 and --token1 are required.');
        console.log('Use --help for usage information.');
        process.exit(1);
    }

    createPool(options)
        .then((results) => {
            if (results.success) {
                console.log('\n🎉 Pool created successfully!');
                process.exit(0);
            } else {
                console.log('\n💥 Failed to create pool!');
                process.exit(1);
            }
        })
        .catch((error) => {
            console.error('\n💥 Error:', error.message);
            process.exit(1);
        });
} 