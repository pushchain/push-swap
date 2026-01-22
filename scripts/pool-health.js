const { ethers } = require('ethers');
const config = require('./core/config');
const { addLiquidityToPool } = require('./pool-manager');
const testAddresses = require('../test-addresses.json');

const MAX_TICK = 887272;
const MIN_TICK = -887272;
const TICK_THRESHOLD = 0.9; // Alert if tick is > 90% of MAX or < -90% of MIN
const MIN_LIQUIDITY = ethers.BigNumber.from('100000000000000000'); // Minimum liquidity threshold (0.1 in 18 decimals)

// Check pool health
async function checkPoolHealth(poolAddress) {
    try {
        const signer = config.getSigner();
        const pool = new ethers.Contract(poolAddress, config.ABIS.pool, signer);

        const [slot0, liquidity] = await Promise.all([
            pool.slot0(),
            pool.liquidity()
        ]);

        const currentTick = parseInt(slot0.tick.toString());
        const currentSqrtPriceX96 = slot0.sqrtPriceX96;
        const poolLiquidity = liquidity;

        // Calculate tick position as percentage
        const tickPercent = (currentTick / MAX_TICK) * 100;
        const absTickPercent = Math.abs(tickPercent);

        // Health checks
        const isHealthy = {
            liquidity: poolLiquidity.gte(MIN_LIQUIDITY),
            tickPosition: absTickPercent < (TICK_THRESHOLD * 100),
            overall: false
        };

        isHealthy.overall = isHealthy.liquidity && isHealthy.tickPosition;

        // Get pool info
        const token0 = await pool.token0();
        const token1 = await pool.token1();
        const fee = await pool.fee();

        const token0Contract = new ethers.Contract(token0, config.ABIS.prc20, signer);
        const token1Contract = new ethers.Contract(token1, config.ABIS.prc20, signer);
        const token0Symbol = await token0Contract.symbol();
        const token1Symbol = await token1Contract.symbol();

        return {
            poolAddress,
            poolName: `${token0Symbol}/${token1Symbol}`,
            token0,
            token1,
            token0Symbol,
            token1Symbol,
            fee,
            currentTick,
            currentSqrtPriceX96: currentSqrtPriceX96.toString(),
            liquidity: poolLiquidity.toString(),
            liquidityFormatted: ethers.utils.formatEther(poolLiquidity),
            tickPercent: tickPercent.toFixed(2),
            absTickPercent: absTickPercent.toFixed(2),
            isHealthy,
            issues: []
        };
    } catch (error) {
        throw new Error(`Failed to check pool ${poolAddress}: ${error.message}`);
    }
}

// Check all pools
async function checkAllPools() {
    console.log('🏥 POOL HEALTH CHECK');
    console.log('='.repeat(80));

    const pools = testAddresses.pools || {};
    const results = [];
    const unhealthyPools = [];

    for (const [key, poolInfo] of Object.entries(pools)) {
        try {
            const health = await checkPoolHealth(poolInfo.address);
            results.push(health);

            if (!health.isHealthy.overall) {
                unhealthyPools.push(health);
            }

            // Display health status
            const status = health.isHealthy.overall ? '✅ HEALTHY' : '❌ UNHEALTHY';
            console.log(`\n${status} - ${health.poolName}`);
            console.log(`  Pool: ${health.poolAddress}`);
            console.log(`  Tick: ${health.currentTick} (${health.tickPercent}% of MAX)`);
            console.log(`  Liquidity: ${health.liquidityFormatted}`);

            if (!health.isHealthy.liquidity) {
                console.log(`  ⚠️  LOW LIQUIDITY: ${health.liquidityFormatted} < ${ethers.utils.formatEther(MIN_LIQUIDITY)}`);
                health.issues.push('Low liquidity');
            }

            if (!health.isHealthy.tickPosition) {
                console.log(`  ⚠️  EXTREME TICK: ${health.absTickPercent}% of MAX (threshold: ${TICK_THRESHOLD * 100}%)`);
                health.issues.push('Extreme tick position');
            }
        } catch (error) {
            console.log(`\n❌ ERROR - ${poolInfo.name || key}`);
            console.log(`  ${error.message}`);
        }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 SUMMARY`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Total Pools: ${results.length}`);
    console.log(`Healthy: ${results.filter(r => r.isHealthy.overall).length}`);
    console.log(`Unhealthy: ${unhealthyPools.length}`);

    if (unhealthyPools.length > 0) {
        console.log(`\n⚠️  UNHEALTHY POOLS:`);
        unhealthyPools.forEach(pool => {
            console.log(`  - ${pool.poolName}: ${pool.issues.join(', ')}`);
        });
    }

    return { results, unhealthyPools };
}

// Auto-heal pool by adding liquidity
async function healPool(poolAddress, amount0, amount1) {
    console.log(`\n💊 HEALING POOL: ${poolAddress}`);
    console.log('='.repeat(80));

    try {
        const signer = config.getSigner();
        const pool = new ethers.Contract(poolAddress, config.ABIS.pool, signer);

        const token0 = await pool.token0();
        const token1 = await pool.token1();

        const token0Contract = new ethers.Contract(token0, config.ABIS.prc20, signer);
        const token1Contract = new ethers.Contract(token1, config.ABIS.prc20, signer);
        const token0Symbol = await token0Contract.symbol();
        const token1Symbol = await token1Contract.symbol();

        console.log(`Adding liquidity: ${amount0} ${token0Symbol} + ${amount1} ${token1Symbol}`);

        await addLiquidityToPool(poolAddress, token0, token1, amount0, amount1);

        console.log('✅ Pool healed successfully!');

        // Re-check health
        const health = await checkPoolHealth(poolAddress);
        return health;
    } catch (error) {
        console.error(`❌ Failed to heal pool: ${error.message}`);
        throw error;
    }
}

// Auto-heal all unhealthy pools
async function autoHealAll() {
    console.log('🔧 AUTO-HEALING UNHEALTHY POOLS');
    console.log('='.repeat(80));

    const { unhealthyPools } = await checkAllPools();

    if (unhealthyPools.length === 0) {
        console.log('\n✅ All pools are healthy! No healing needed.');
        return;
    }

    for (const pool of unhealthyPools) {
        try {
            // Determine amounts based on pool type
            // For now, use default amounts - you can customize this
            const defaultAmount = '1000'; // Adjust based on your needs

            if (pool.issues.includes('Low liquidity')) {
                await healPool(pool.poolAddress, defaultAmount, defaultAmount);
            }

            // Note: Extreme tick positions usually require rebalancing via swaps
            // This is more complex and may need manual intervention
            if (pool.issues.includes('Extreme tick position')) {
                console.log(`\n⚠️  Pool ${pool.poolName} has extreme tick position.`);
                console.log(`   Consider rebalancing via swaps or manual intervention.`);
            }
        } catch (error) {
            console.error(`Failed to heal ${pool.poolName}: ${error.message}`);
        }
    }
}

// Main function
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    try {
        switch (command) {
            case 'check':
                await checkAllPools();
                break;

            case 'heal':
                const [poolAddr, amount0, amount1] = args.slice(1);
                if (!poolAddr || !amount0 || !amount1) {
                    throw new Error('Usage: node pool-health.js heal <poolAddress> <amount0> <amount1>');
                }
                await healPool(poolAddr, amount0, amount1);
                break;

            case 'auto-heal':
                await autoHealAll();
                break;

            default:
                console.log('Usage:');
                console.log('  node pool-health.js check              - Check all pool health');
                console.log('  node pool-health.js heal <pool> <amt0> <amt1> - Heal specific pool');
                console.log('  node pool-health.js auto-heal          - Auto-heal all unhealthy pools');
        }
    } catch (error) {
        console.error('💥 Operation failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    checkPoolHealth,
    checkAllPools,
    healPool,
    autoHealAll
};

