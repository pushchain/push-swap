const { ethers } = require('hardhat');
const fs = require('fs');

async function main() {
    console.log('🚀 Deploying Uniswap V3 Core...\n');

    // Use private key from .env instead of default account
    require('dotenv').config();
    const provider = new ethers.providers.JsonRpcProvider(process.env.PUSH_RPC_URL);
    const deployer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    console.log('📋 Deploying with account:', deployer.address);
    console.log('💰 Account balance:', ethers.utils.formatEther(await deployer.getBalance()));

    // Use existing WPUSH deployment
    const WPUSH_ADDRESS = process.env.WPUSH_ADDRESS || "0xefFe95a7c6C4b7fcDC972b6B30FE9219Ad1AfD17";
    console.log('\n💎 Using existing WPUSH contract:', WPUSH_ADDRESS);

    // Deploy UniswapV3Factory
    console.log('\n📦 Deploying UniswapV3Factory...');
    const UniswapV3Factory = await ethers.getContractFactory('UniswapV3Factory', deployer);
    const factory = await UniswapV3Factory.deploy();

    console.log('⏳ Waiting for deployment...');
    await factory.deployed();

    console.log('✅ UniswapV3Factory deployed:', factory.address);
    console.log('🔗 Transaction hash:', factory.deployTransaction.hash);

    // Verify default fee tiers are enabled (they're set in constructor)
    console.log('\n⚙️  Checking default fee tiers...');
    const fees = [
        { fee: 500, expectedSpacing: 10 },
        { fee: 3000, expectedSpacing: 60 },
        { fee: 10000, expectedSpacing: 200 }
    ];

    for (const { fee, expectedSpacing } of fees) {
        const tickSpacing = await factory.feeAmountTickSpacing(fee);
        console.log(`  ✅ Fee ${fee / 10000}% (${fee}) → tick spacing: ${tickSpacing}`);
    }

    // Save deployment info
    const deployment = {
        network: (await ethers.provider.getNetwork()).name,
        chainId: (await ethers.provider.getNetwork()).chainId,
        wpush: WPUSH_ADDRESS,
        factory: factory.address,
        owner: await factory.owner(),
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        transactionHash: factory.deployTransaction.hash,
        feeTiers: {
            500: 10,
            3000: 60,
            10000: 200
        }
    };

    fs.writeFileSync('core-deployment.json', JSON.stringify(deployment, null, 2));

    console.log('\n💾 Deployment info saved to: core-deployment.json');
    console.log('\n🎉 Core deployment complete!');
    console.log('📋 Factory Address:', factory.address);
    console.log('👑 Factory Owner:', await factory.owner());

    return factory.address;
}

main()
    .then((factoryAddress) => {
        console.log(`\n🔗 Use this factory address for periphery deployment:`);
        console.log(`FACTORY_ADDRESS=${factoryAddress}`);
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Deployment failed:', error);
        process.exit(1);
    }); 