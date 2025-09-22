#!/usr/bin/env node

const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

// This script is for deploying a NEW WPC contract
// Use this when you want to deploy your own WPC for production
// For testing, we use the existing WPC contract
async function deployWPC() {
    console.log('🚀 Deploying NEW WPC Contract...\n');

    // Use private key from .env instead of default account
    require('dotenv').config();
    const provider = new ethers.providers.JsonRpcProvider(process.env.PUSH_RPC_URL);
    const deployer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    console.log('📋 Deploying with account:', deployer.address);
    console.log('💰 Account balance:', ethers.utils.formatEther(await deployer.getBalance()));

    try {
        // Deploy WPC
        console.log('\n📦 Deploying WPC...');
        const WPCFactory = await ethers.getContractFactory('WPC', deployer);
        const WPC = await WPCFactory.deploy();

        console.log('⏳ Waiting for deployment...');
        await WPC.deployed();

        console.log('✅ WPC deployed:', WPC.address);
        console.log('🔗 Transaction hash:', WPC.deployTransaction.hash);

        // Test basic functionality
        console.log('\n🧪 Testing WPC functionality...');
        console.log('├─ Name:', await WPC.name());
        console.log('├─ Symbol:', await WPC.symbol());
        console.log('├─ Decimals:', await WPC.decimals());
        console.log('├─ Total Supply:', ethers.utils.formatEther(await WPC.totalSupply()));

        // Test deposit
        console.log('├─ Testing deposit of 1 PUSH...');
        const depositTx = await WPC.deposit({ value: ethers.utils.parseEther('1') });
        await depositTx.wait();

        const balance = await WPC.balanceOf(deployer.address);
        console.log('├─ WPC balance after deposit:', ethers.utils.formatEther(balance));
        console.log('└─ Deposit test successful ✅');

        // Save WPC address to test-addresses.json
        const addressesPath = path.join(__dirname, '..', 'test-addresses.json');
        let addressesData = {};

        try {
            if (fs.existsSync(addressesPath)) {
                addressesData = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));
            }
        } catch (error) {
            console.warn('Could not read existing test-addresses.json:', error.message);
        }

        // Initialize structure if needed
        if (!addressesData.contracts) {
            addressesData.contracts = {};
        }

        // Update WPC address
        addressesData.contracts.WPC = WPC.address;
        addressesData.lastUpdated = new Date().toISOString().split('T')[0];

        // Save updated addresses
        fs.writeFileSync(addressesPath, JSON.stringify(addressesData, null, 2));
        console.log('💾 WPC address saved to test-addresses.json');

        console.log('\n📋 Deployment Summary:');
        console.log('├─ WPC Address:', WPC.address);
        console.log('├─ Deployer:', deployer.address);
        console.log('├─ Network: Push Chain');
        console.log('└─ Status: Ready for use ✅');

        console.log('\n💡 Next steps:');
        console.log('├─ WPC address automatically saved to test-addresses.json');
        console.log('├─ Core and periphery deployments will use this address');
        console.log('└─ Ready for Uniswap V3 deployment');

    } catch (error) {
        console.log('❌ WPC deployment failed:', error.message);
        process.exit(1);
    }
}

// Run deployment if called directly
if (require.main === module) {
    deployWPC()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = deployWPC; 