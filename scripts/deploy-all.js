const { deployTokens, createPool, addLiquidityToPool, performSwap } = require('./pool-manager');

async function deployAll() {
    console.log('🚀 DEPLOYING COMPLETE DEX SETUP');
    console.log('='.repeat(60));
    console.log('📋 Plan:');
    console.log('├─ 1. Deploy pETH and pUSDC tokens');
    console.log('├─ 2. Create pETH/pUSDC pool (1 pETH = 4000 pUSDC)');
    console.log('├─ 3. Add liquidity and test swap');
    console.log('├─ 4. Create WPUSH/pUSDC pool (1 WPUSH = 1000 pUSDC)');
    console.log('├─ 5. Add liquidity and test swap');
    console.log('├─ 6. Create pETH/WPUSH pool (calculated from above)');
    console.log('└─ 7. Add liquidity and test swap');
    console.log('');

    try {
        // Step 1: Deploy tokens
        console.log('🟢 STEP 1: Deploy pETH and pUSDC tokens');
        console.log('-'.repeat(50));
        const tokens = await deployTokens(
            "Push ETH", "pETH", 18, "1000000",
            "Push USDC", "pUSDC", 6, "10000000"
        );
        const pETHAddress = tokens.pETH.address;
        const pUSDCAddress = tokens.pUSDC.address;
        console.log('✅ Tokens deployed successfully!\n');

        // Step 2: Create pETH/pUSDC pool
        console.log('🟢 STEP 2: Create pETH/pUSDC pool (1 pETH = 4000 pUSDC)');
        console.log('-'.repeat(50));
        const pethUsdcPool = await createPool(
            pETHAddress, pUSDCAddress, 4000, 3000, true, "10", "40000"
        );
        console.log('✅ pETH/pUSDC pool created and liquidity added!\n');

        // Step 3: Test pETH/pUSDC swap
        console.log('🟢 STEP 3: Test pETH/pUSDC swap');
        console.log('-'.repeat(50));
        await performSwap(pethUsdcPool, pUSDCAddress, pETHAddress, "4000");
        console.log('✅ pETH/pUSDC swap test successful!\n');

        // Step 4: Create WPUSH/pUSDC pool
        console.log('🟢 STEP 4: Create WPUSH/pUSDC pool (1 WPUSH = 1000 pUSDC)');
        console.log('-'.repeat(50));
        const wpushAddress = "0xefFe95a7c6C4b7fcDC972b6B30FE9219Ad1AfD17"; // From config
        const wpushUsdcPool = await createPool(
            wpushAddress, pUSDCAddress, 1000, 3000, true, "10", "10000"
        );
        console.log('✅ WPUSH/pUSDC pool created and liquidity added!\n');

        // Step 5: Test WPUSH/pUSDC swap
        console.log('🟢 STEP 5: Test WPUSH/pUSDC swap');
        console.log('-'.repeat(50));
        await performSwap(wpushUsdcPool, pUSDCAddress, wpushAddress, "1000");
        console.log('✅ WPUSH/pUSDC swap test successful!\n');

        // Step 6: Create pETH/WPUSH pool
        // From the ratios: 1 pETH = 4000 pUSDC, 1 WPUSH = 1000 pUSDC
        // Therefore: 1 pETH = 4 WPUSH (or 1 WPUSH = 0.25 pETH)
        console.log('🟢 STEP 6: Create pETH/WPUSH pool (1 pETH = 4 WPUSH)');
        console.log('-'.repeat(50));
        const pethWpushPool = await createPool(
            pETHAddress, wpushAddress, 4, 3000, true, "10", "40"
        );
        console.log('✅ pETH/WPUSH pool created and liquidity added!\n');

        // Step 7: Test pETH/WPUSH swap
        console.log('🟢 STEP 7: Test pETH/WPUSH swap');
        console.log('-'.repeat(50));
        await performSwap(pethWpushPool, wpushAddress, pETHAddress, "4");
        console.log('✅ pETH/WPUSH swap test successful!\n');

        // Final summary
        console.log('🎉 DEPLOYMENT COMPLETE!');
        console.log('='.repeat(60));
        console.log('📊 Summary:');
        console.log('├─ pETH/pUSDC Pool:', pethUsdcPool);
        console.log('├─ WPUSH/pUSDC Pool:', wpushUsdcPool);
        console.log('├─ pETH/WPUSH Pool:', pethWpushPool);
        console.log('└─ All pools tested and working!');
        console.log('');
        console.log('💰 Price Relationships:');
        console.log('├─ 1 pETH = 4000 pUSDC');
        console.log('├─ 1 WPUSH = 1000 pUSDC');
        console.log('└─ 1 pETH = 4 WPUSH');
        console.log('');
        console.log('🚀 Your DEX is ready for trading!');

    } catch (error) {
        console.error('💥 Deployment failed:', error);
        process.exit(1);
    }
}

deployAll(); 