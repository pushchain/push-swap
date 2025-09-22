const { deployTokens, createPool, addLiquidityToPool, performSwap } = require('./pool-manager');

async function deployAll() {
    console.log('🚀 DEPLOYING COMPLETE DEX SETUP');
    console.log('='.repeat(60));
    console.log('📋 Plan:');
    console.log('├─ 1. Deploy pETH and pUSDC tokens');
    console.log('├─ 2. Create pETH/pUSDC pool');
    console.log('├─ 3. Add liquidity and test swap');
    console.log('├─ 4. Create WPC/pUSDC pool');
    console.log('├─ 5. Add liquidity and test swap');
    console.log('├─ 6. Create pETH/WPC pool');
    console.log('└─ 7. Add liquidity and test swap');
    console.log('');

    try {
        // Step 1: Deploy tokens
        console.log('🟢 STEP 1: Deploy pETH and pUSDC tokens');
        console.log('-'.repeat(50));
        const tokens = await deployTokens(
            "pETH", "Push ETH", 18, "1000000",
            "pUSDC", "Push USDC", 6, "10000000"
        );
        const pETHAddress = tokens.pETH.address;
        const pUSDCAddress = tokens.pUSDC.address;
        console.log('✅ Tokens deployed successfully!\n');

        // Step 2: Create pETH/pUSDC pool
        const pethUsdcPriceRatio = 4000;
        const pethUsdcLiquidity0 = "10";
        const pethUsdcLiquidity1 = "40000";
        console.log('🟢 STEP 2: Create pETH/pUSDC pool');
        console.log('-'.repeat(50));
        const pethUsdcPool = await createPool(
            pETHAddress, pUSDCAddress, pethUsdcPriceRatio, 3000, true, pethUsdcLiquidity0, pethUsdcLiquidity1
        );
        console.log('✅ pETH/pUSDC pool created and liquidity added!\n');

        // Step 3: Test pETH/pUSDC swap
        console.log('🟢 STEP 3: Test pETH/pUSDC swap');
        console.log('-'.repeat(50));
        await performSwap(pethUsdcPool, pUSDCAddress, pETHAddress, "4000");
        console.log('✅ pETH/pUSDC swap test successful!\n');

        // Step 4: Create WPC/pUSDC pool
        const WPCUsdcPriceRatio = 1000;
        const WPCUsdcLiquidity0 = "1";
        const WPCUsdcLiquidity1 = "1000";
        console.log('🟢 STEP 4: Create WPC/pUSDC pool');
        console.log('-'.repeat(50));
        const WPCAddress = "0x2c7EbF633ffC84ea67eB6C8B232DC5f42970B818"; // Updated WPC deployment
        const WPCUsdcPool = await createPool(
            WPCAddress, pUSDCAddress, WPCUsdcPriceRatio, 3000, true, WPCUsdcLiquidity0, WPCUsdcLiquidity1
        );
        console.log('✅ WPC/pUSDC pool created and liquidity added!\n');

        // Step 5: Test WPC/pUSDC swap
        console.log('🟢 STEP 5: Test WPC/pUSDC swap');
        console.log('-'.repeat(50));
        await performSwap(WPCUsdcPool, pUSDCAddress, WPCAddress, "1000");
        console.log('✅ WPC/pUSDC swap test successful!\n');

        // Step 6: Create pETH/WPC pool
        // Calculate the ratio from the other two pools
        const pethWPCPriceRatio = pethUsdcPriceRatio / WPCUsdcPriceRatio;
        const pethWPCLiquidity0 = "1";
        const pethWPCLiquidity1 = "1";
        console.log('🟢 STEP 6: Create pETH/WPC pool');
        console.log('-'.repeat(50));
        const pethWPCPool = await createPool(
            pETHAddress, WPCAddress, pethWPCPriceRatio, 3000, true, pethWPCLiquidity0, pethWPCLiquidity1
        );
        console.log('✅ pETH/WPC pool created and liquidity added!\n');

        // Step 7: Test pETH/WPC swap
        console.log('🟢 STEP 7: Test pETH/WPC swap');
        console.log('-'.repeat(50));
        await performSwap(pethWPCPool, WPCAddress, pETHAddress, "0.25");
        console.log('✅ pETH/WPC swap test successful!\n');

        // Final summary
        console.log('🎉 DEPLOYMENT COMPLETE!');
        console.log('='.repeat(60));
        console.log('📊 Summary:');
        console.log('├─ pETH/pUSDC Pool:', pethUsdcPool);
        console.log('├─ WPC/pUSDC Pool:', WPCUsdcPool);
        console.log('├─ pETH/WPC Pool:', pethWPCPool);
        console.log('└─ All pools tested and working!');
        console.log('');
        console.log('💰 Price Relationships:');
        console.log(`├─ 1 pETH = ${pethUsdcPriceRatio} pUSDC`);
        console.log(`├─ 1 WPC = ${WPCUsdcPriceRatio} pUSDC`);
        console.log(`└─ 1 pETH = ${pethWPCPriceRatio} WPC`);
        console.log('');
        console.log('🚀 Your DEX is ready for trading!');

    } catch (error) {
        console.error('💥 Deployment failed:', error);
        process.exit(1);
    }
}

deployAll(); 