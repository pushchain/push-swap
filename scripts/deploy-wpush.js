#!/usr/bin/env node

const { ethers } = require('hardhat');

// This script is for deploying a NEW WPUSH contract
// Use this when you want to deploy your own WPUSH for production
// For testing, we use the existing WPUSH contract
async function deployWPUSH() {
    console.log('🚀 Deploying NEW WPUSH Contract...\n');

    // Use private key from .env instead of default account
    require('dotenv').config();
    const provider = new ethers.providers.JsonRpcProvider(process.env.PUSH_RPC_URL);
    const deployer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    console.log('📋 Deploying with account:', deployer.address);
    console.log('💰 Account balance:', ethers.utils.formatEther(await deployer.getBalance()));

    try {
        // Deploy WPUSH
        console.log('\n📦 Deploying WPUSH...');
        const WPUSHFactory = await ethers.getContractFactory('WPUSH', deployer);
        const wpush = await WPUSHFactory.deploy();

        console.log('⏳ Waiting for deployment...');
        await wpush.deployed();

        console.log('✅ WPUSH deployed:', wpush.address);
        console.log('🔗 Transaction hash:', wpush.deployTransaction.hash);

        // Test basic functionality
        console.log('\n🧪 Testing WPUSH functionality...');
        console.log('├─ Name:', await wpush.name());
        console.log('├─ Symbol:', await wpush.symbol());
        console.log('├─ Decimals:', await wpush.decimals());
        console.log('├─ Total Supply:', ethers.utils.formatEther(await wpush.totalSupply()));

        // Test deposit
        console.log('├─ Testing deposit of 1 PUSH...');
        const depositTx = await wpush.deposit({ value: ethers.utils.parseEther('1') });
        await depositTx.wait();

        const balance = await wpush.balanceOf(deployer.address);
        console.log('├─ WPUSH balance after deposit:', ethers.utils.formatEther(balance));
        console.log('└─ Deposit test successful ✅');

        console.log('\n📋 Deployment Summary:');
        console.log('├─ WPUSH Address:', wpush.address);
        console.log('├─ Deployer:', deployer.address);
        console.log('├─ Network: Push Chain');
        console.log('└─ Status: Ready for use ✅');

        console.log('\n💡 Next steps:');
        console.log('├─ Update your .env file with: WPUSH_ADDRESS=' + wpush.address);
        console.log('├─ Update tests/config.js with the new WPUSH address');
        console.log('└─ Use this WPUSH in your Uniswap V3 deployment');

    } catch (error) {
        console.log('❌ WPUSH deployment failed:', error.message);
        process.exit(1);
    }
}

// Run deployment if called directly
if (require.main === module) {
    deployWPUSH()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = deployWPUSH; 