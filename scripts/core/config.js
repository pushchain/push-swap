const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Function to load contract addresses from deployment JSON files
function loadContractAddresses() {
    const contracts = {};

    try {
        // Load core deployment (factory, WPC)
        const coreDeploymentPath = path.join(__dirname, '../../v3-core/core-deployment.json');
        if (fs.existsSync(coreDeploymentPath)) {
            const coreDeployment = JSON.parse(fs.readFileSync(coreDeploymentPath, 'utf8'));
            contracts.factory = coreDeployment.factory;
            contracts.WPC = coreDeployment.WPC;
        }

        // Load periphery deployment (swapRouter, positionManager, etc.)
        const peripheryDeploymentPath = path.join(__dirname, '../../v3-periphery/periphery-deployment.json');
        if (fs.existsSync(peripheryDeploymentPath)) {
            const peripheryDeployment = JSON.parse(fs.readFileSync(peripheryDeploymentPath, 'utf8'));
            contracts.swapRouter = peripheryDeployment.contracts.swapRouter;
            contracts.positionManager = peripheryDeployment.contracts.positionManager;
            contracts.quoterV2 = peripheryDeployment.contracts.quoterV2;
            contracts.tickLens = peripheryDeployment.contracts.tickLens;
            contracts.multicall = peripheryDeployment.contracts.multicall;
            contracts.migrator = peripheryDeployment.contracts.migrator;
        }
    } catch (error) {
        console.warn('Warning: Could not load deployment addresses:', error.message);
    }

    return contracts;
}

// Contract addresses loaded from deployment JSON files
const CONTRACTS = loadContractAddresses();

// Contract ABIs
const ABIS = {
    factory: [
        'function owner() view returns (address)',
        'function feeAmountTickSpacing(uint24) view returns (int24)',
        'function getPool(address,address,uint24) view returns (address)',
        'function createPool(address,address,uint24) returns (address)',
        'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
    ],

    WPC: [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
        'function totalSupply() view returns (uint256)',
        'function balanceOf(address) view returns (uint256)',
        'function deposit() payable',
        'function withdraw(uint256)',
        'function transfer(address,uint256) returns (bool)',
        'function approve(address,uint256) returns (bool)',
        'event Deposit(address indexed dst, uint256 wad)',
        'event Withdrawal(address indexed src, uint256 wad)'
    ],

    erc20: [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
        'function totalSupply() view returns (uint256)',
        'function balanceOf(address account) view returns (uint256)',
        'function transfer(address recipient, uint256 amount) returns (bool)',
        'function approve(address spender, uint256 amount) returns (bool)',
        'function transferFrom(address sender, address recipient, uint256 amount) returns (bool)',
        'function allowance(address owner, address spender) view returns (uint256)',
        'function mint(address to, uint256 amount)',
        'function burn(address from, uint256 amount)',
        'function increaseAllowance(address spender, uint256 addedValue) returns (bool)',
        'function decreaseAllowance(address spender, uint256 subtractedValue) returns (bool)',
        'event Transfer(address indexed from, address indexed to, uint256 value)',
        'event Approval(address indexed owner, address indexed spender, uint256 value)'
    ],

    // PRC20 ABI (includes ERC20 + PRC20 specific functions)
    prc20: [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
        'function totalSupply() view returns (uint256)',
        'function balanceOf(address account) view returns (uint256)',
        'function transfer(address recipient, uint256 amount) returns (bool)',
        'function approve(address spender, uint256 amount) returns (bool)',
        'function transferFrom(address sender, address recipient, uint256 amount) returns (bool)',
        'function allowance(address owner, address spender) view returns (uint256)',
        'function burn(uint256 amount) returns (bool)',
        'function mint(address to, uint256 amount) returns (bool)',
        'function deposit(address to, uint256 amount) returns (bool)',
        'function withdraw(bytes to, uint256 amount) returns (bool)',
        'function withdrawGasFee() view returns (address, uint256)',
        'function UNIVERSAL_EXECUTOR_MODULE() view returns (address)',
        'function SOURCE_CHAIN_ID() view returns (uint256)',
        'function TOKEN_TYPE() view returns (uint8)',
        'function HANDLER_CONTRACT() view returns (address)',
        'function GAS_LIMIT() view returns (uint256)',
        'function PC_PROTOCOL_FEE() view returns (uint256)',
        'event Transfer(address indexed from, address indexed to, uint256 value)',
        'event Approval(address indexed owner, address indexed spender, uint256 value)',
        'event Deposit(bytes from, address to, uint256 amount)',
        'event Withdrawal(address from, bytes to, uint256 amount, uint256 gasFee, uint256 protocolFlatFee)'
    ],

    swapRouter: [
        'function factory() view returns (address)',
        'function WETH9() view returns (address)',
        'function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
        'function exactInput(tuple(bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)) payable returns (uint256 amountOut)',
        'function exactOutputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountIn)',
        'function multicall(bytes[] data) payable returns (bytes[] results)'
    ],

    quoterV2: [
        'function factory() view returns (address)',
        'function WETH9() view returns (address)'
    ],

    positionManager: [
        'function factory() view returns (address)',
        'function WETH9() view returns (address)',
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function mint(tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
        'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
        'function balanceOf(address owner) view returns (uint256 balance)',
        'function ownerOf(uint256 tokenId) view returns (address owner)',
        'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
        'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
    ],

    pool: [
        'function token0() view returns (address)',
        'function token1() view returns (address)',
        'function fee() view returns (uint24)',
        'function tickSpacing() view returns (int24)',
        'function liquidity() view returns (uint128)',
        'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
        'function initialize(uint160 sqrtPriceX96)',
        'function mint(address recipient, int24 tickLower, int24 tickUpper, uint128 amount, bytes data) returns (uint256 amount0, uint256 amount1)',
        'function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96, bytes data) returns (int256 amount0, int256 amount1)'
    ]
};

// We'll use TestERC20 from v3-core (already compiled and working)
// No need for manual bytecode - we'll deploy via Hardhat compilation

// Helper functions
function getProvider() {
    require('dotenv').config();
    return new ethers.providers.JsonRpcProvider(process.env.PUSH_RPC_URL);
}

function getSigner() {
    require('dotenv').config();
    const provider = getProvider();
    return new ethers.Wallet(process.env.PRIVATE_KEY, provider);
}

function getContract(contractName, address = null) {
    const signer = getSigner();
    const contractAddress = address || CONTRACTS[contractName];
    return new ethers.Contract(contractAddress, ABIS[contractName], signer);
}

// Utility functions
function formatToken(amount, decimals = 18) {
    return ethers.utils.formatUnits(amount, decimals);
}

function parseToken(amount, decimals = 18) {
    return ethers.utils.parseUnits(amount.toString(), decimals);
}

function sortTokens(tokenA, tokenB) {
    return tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];
}

// Simple WPC balance check and deposit
async function ensureWPC(amount) {
    const signer = getSigner();
    const WPCContract = getContract('WPC');

    const currentBalance = await WPCContract.balanceOf(signer.address);
    const amountParsed = parseToken(amount, 18);

    if (currentBalance.lt(amountParsed)) {
        const needed = amountParsed.sub(currentBalance);
        console.log(`├─ WPC balance low, depositing ${formatToken(needed, 18)} PUSH...`);

        const depositTx = await WPCContract.deposit({ value: needed });
        await depositTx.wait();
        console.log(`├─ ✅ WPC balance updated`);
    }
}

// Export everything
module.exports = {
    CONTRACTS,
    ABIS,
    getProvider,
    getSigner,
    getContract,
    formatToken,
    parseToken,
    sortTokens,
    ensureWPC
}; 