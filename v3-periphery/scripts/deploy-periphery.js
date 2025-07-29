const { ethers } = require('hardhat');
const fs = require('fs');

async function main() {
    console.log('🚀 Deploying Uniswap V3 Periphery...\n');

    // Get Factory address from core deployment, use existing WPUSH
    let FACTORY_ADDRESS;
    const WPUSH_ADDRESS = process.env.WPUSH_ADDRESS || "0xefFe95a7c6C4b7fcDC972b6B30FE9219Ad1AfD17";

    try {
        const coreDeployment = JSON.parse(fs.readFileSync('../core-deployment.json', 'utf8'));
        FACTORY_ADDRESS = coreDeployment.factory;
        console.log('📋 Loaded Factory from core deployment:', FACTORY_ADDRESS);
        console.log('💎 Using existing WPUSH contract:', WPUSH_ADDRESS);
    } catch (error) {
        console.error('❌ Could not load core deployment file!');
        console.log('💡 Make sure to run "npm run deploy-core" first');
        console.log('💡 Expected file: v3-core/core-deployment.json');
        process.exit(1);
    }

    // Use private key from .env instead of default account
    require('dotenv').config();
    const provider = new ethers.providers.JsonRpcProvider(process.env.PUSH_RPC_URL);
    const deployer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    console.log('📋 Deploying with account:', deployer.address);
    console.log('💰 Account balance:', ethers.utils.formatEther(await deployer.getBalance()));
    console.log('🏭 Factory address:', FACTORY_ADDRESS);
    console.log('💎 WPUSH address:', WPUSH_ADDRESS);

    const deployments = {};

    // Step 1: Deploy NFTDescriptor library
    console.log('\n📦 Step 1: Deploying NFTDescriptor library...');
    const NFTDescriptor = await ethers.getContractFactory('NFTDescriptor', deployer);
    const nftDescriptor = await NFTDescriptor.deploy();
    await nftDescriptor.deployed();
    deployments.nftDescriptor = nftDescriptor.address;
    console.log('✅ NFTDescriptor:', nftDescriptor.address);

    // Step 2: Deploy NonfungibleTokenPositionDescriptor
    console.log('\n📦 Step 2: Deploying NonfungibleTokenPositionDescriptor...');
    const NonfungibleTokenPositionDescriptor = await ethers.getContractFactory(
        'NonfungibleTokenPositionDescriptor',
        {
            libraries: {
                NFTDescriptor: nftDescriptor.address
            },
            signer: deployer
        }
    );
    const positionDescriptor = await NonfungibleTokenPositionDescriptor.deploy(
        WPUSH_ADDRESS,
        ethers.utils.formatBytes32String('PUSH')
    );
    await positionDescriptor.deployed();
    deployments.positionDescriptor = positionDescriptor.address;
    console.log('✅ PositionDescriptor:', positionDescriptor.address);

    // Step 3: Deploy SwapRouter
    console.log('\n📦 Step 3: Deploying SwapRouter...');
    const SwapRouter = await ethers.getContractFactory('SwapRouter', deployer);
    const swapRouter = await SwapRouter.deploy(FACTORY_ADDRESS, WPUSH_ADDRESS);
    await swapRouter.deployed();
    deployments.swapRouter = swapRouter.address;
    console.log('✅ SwapRouter:', swapRouter.address);

    // Step 4: Deploy NonfungiblePositionManager
    console.log('\n📦 Step 4: Deploying NonfungiblePositionManager...');
    const NonfungiblePositionManager = await ethers.getContractFactory('NonfungiblePositionManager', deployer);
    const positionManager = await NonfungiblePositionManager.deploy(
        FACTORY_ADDRESS,
        WPUSH_ADDRESS,
        positionDescriptor.address
    );
    await positionManager.deployed();
    deployments.positionManager = positionManager.address;
    console.log('✅ PositionManager:', positionManager.address);

    // Step 5: Deploy QuoterV2
    console.log('\n📦 Step 5: Deploying QuoterV2...');
    const QuoterV2 = await ethers.getContractFactory('QuoterV2', deployer);
    const quoterV2 = await QuoterV2.deploy(FACTORY_ADDRESS, WPUSH_ADDRESS);
    await quoterV2.deployed();
    deployments.quoterV2 = quoterV2.address;
    console.log('✅ QuoterV2:', quoterV2.address);

    // Step 6: Deploy TickLens
    console.log('\n📦 Step 6: Deploying TickLens...');
    const TickLens = await ethers.getContractFactory('TickLens', deployer);
    const tickLens = await TickLens.deploy();
    await tickLens.deployed();
    deployments.tickLens = tickLens.address;
    console.log('✅ TickLens:', tickLens.address);

    // Step 7: Deploy UniswapInterfaceMulticall
    console.log('\n📦 Step 7: Deploying UniswapInterfaceMulticall...');
    const UniswapInterfaceMulticall = await ethers.getContractFactory('UniswapInterfaceMulticall', deployer);
    const multicall = await UniswapInterfaceMulticall.deploy();
    await multicall.deployed();
    deployments.multicall = multicall.address;
    console.log('✅ Multicall:', multicall.address);

    // Step 8: Deploy V3Migrator
    console.log('\n📦 Step 8: Deploying V3Migrator...');
    const V3Migrator = await ethers.getContractFactory('V3Migrator', deployer);
    const migrator = await V3Migrator.deploy(
        FACTORY_ADDRESS,
        WPUSH_ADDRESS,
        positionManager.address
    );
    await migrator.deployed();
    deployments.migrator = migrator.address;
    console.log('✅ V3Migrator:', migrator.address);

    // Save deployment info
    const deployment = {
        network: (await ethers.provider.getNetwork()).name,
        chainId: (await ethers.provider.getNetwork()).chainId,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        dependencies: {
            factory: FACTORY_ADDRESS,
            wpush: WPUSH_ADDRESS
        },
        contracts: deployments
    };

    fs.writeFileSync('periphery-deployment.json', JSON.stringify(deployment, null, 2));

    console.log('\n💾 Deployment info saved to: periphery-deployment.json');
    console.log('\n🎉 Periphery deployment complete!');

    console.log('\n📋 All Contract Addresses:');
    console.log('├─ Factory:', FACTORY_ADDRESS);
    console.log('├─ WPUSH:', WPUSH_ADDRESS);
    Object.entries(deployments).forEach(([name, address]) => {
        console.log(`├─ ${name}: ${address}`);
    });

    console.log('\n🔗 Key Addresses for Frontend:');
    console.log(`├─ Factory: ${FACTORY_ADDRESS}`);
    console.log(`├─ SwapRouter: ${deployments.swapRouter}`);
    console.log(`├─ PositionManager: ${deployments.positionManager}`);
    console.log(`├─ QuoterV2: ${deployments.quoterV2}`);
    console.log(`└─ WPUSH: ${WPUSH_ADDRESS}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('❌ Deployment failed:', error);
        process.exit(1);
    }); 