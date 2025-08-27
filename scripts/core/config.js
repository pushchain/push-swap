const { ethers } = require('ethers');

// Contract addresses from deployment (using existing WPUSH)
const CONTRACTS = {
    factory: '0xF02DA51d1Ef1c593a95f5C97d7BdFc49fbaBbaA5',
    wpush: '0x884B23638596A7DCbbC133Ba671e4F2A2dedf285', // Fresh WPUSH deployment
    swapRouter: '0x34B10a283c2331Afa2C7a6bb5FB961E01f218fa0',
    positionManager: '0xf90F08fD301190Cd34CC9eFc5A76351e95051670',
    quoterV2: '0x4e8152fB4C72De9f187Cc93E85135283517B2fbB',
    tickLens: '0x83D3B8bAe05C36b5404c1e284D306a6a1351Ef60',
    multicall: '0x0b19E6e4dA71Be4F12db104373340d8fFc49880A'
};

// Contract ABIs
const ABIS = {
    factory: [
        'function owner() view returns (address)',
        'function feeAmountTickSpacing(uint24) view returns (int24)',
        'function getPool(address,address,uint24) view returns (address)',
        'function createPool(address,address,uint24) returns (address)',
        'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
    ],

    wpush: [
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

// Simple WPUSH balance check and deposit
async function ensureWPUSH(amount) {
    const signer = getSigner();
    const wpushContract = getContract('wpush');

    const currentBalance = await wpushContract.balanceOf(signer.address);
    const amountParsed = parseToken(amount, 18);

    if (currentBalance.lt(amountParsed)) {
        const needed = amountParsed.sub(currentBalance);
        console.log(`├─ WPUSH balance low, depositing ${formatToken(needed, 18)} PUSH...`);

        const depositTx = await wpushContract.deposit({ value: needed });
        await depositTx.wait();
        console.log(`├─ ✅ WPUSH balance updated`);
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
    ensureWPUSH
}; 