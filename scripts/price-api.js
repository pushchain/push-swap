// PRODUCTION-READY PRICE API FOR FRONTEND
// Dynamic JSON loading, error handling, and clean responses

const { ethers } = require('hardhat');
const config = require('./core/config');
const fs = require('fs');
const path = require('path');

// Load addresses dynamically from JSON files
const addressesPath = path.join(__dirname, '..', 'test-addresses.json');
const officialTokensPath = path.join(__dirname, '..', 'official-prc20.json');

let addressesData = {};
let officialTokens = {};

try {
    addressesData = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));
} catch (error) {
    console.warn('Could not load test-addresses.json:', error.message);
}

try {
    officialTokens = JSON.parse(fs.readFileSync(officialTokensPath, 'utf8'));
} catch (error) {
    console.warn('Could not load official-prc20.json:', error.message);
}

// Dynamic pool configurations
function getPools() {
    const pools = {};

    if (addressesData.pools) {
        for (const [poolKey, poolData] of Object.entries(addressesData.pools)) {
            pools[poolKey] = {
                address: poolData.address,
                token0: poolData.token0,
                token1: poolData.token1,
                fee: poolData.fee,
                name: poolData.name || poolKey
            };
        }
    }

    return pools;
}

// Universal ERC20/PRC20 ABI for dynamic token discovery
const ERC20_ABI = [
    "function symbol() external view returns (string)",
    "function decimals() external view returns (uint8)",
    "function name() external view returns (string)"
];

// Universal token discovery - fetches token info directly from blockchain
async function discoverTokenInfo(tokenAddress) {
    try {
        const provider = new ethers.providers.JsonRpcProvider(process.env.PUSH_RPC_URL);
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

        const [symbol, decimals, name] = await Promise.all([
            tokenContract.symbol(),
            tokenContract.decimals(),
            tokenContract.name()
        ]);

        return {
            symbol: symbol,
            decimals: decimals,
            name: name,
            address: tokenAddress
        };
    } catch (error) {
        console.warn(`Could not discover token info for ${tokenAddress}:`, error.message);
        return null;
    }
}

// Universal token configurations - discovers all tokens dynamically
async function getTokens() {
    const tokens = {};
    const tokenAddresses = new Set();

    // Collect all unique token addresses from various sources
    if (addressesData.contracts?.WPC) {
        tokenAddresses.add(addressesData.contracts.WPC);
    }

    // Add official tokens from official-prc20.json
    for (const [symbol, tokenData] of Object.entries(officialTokens)) {
        if (tokenData.Proxy) {
            tokenAddresses.add(tokenData.Proxy);
        }
    }

    // Add tokens from pool data
    if (addressesData.pools) {
        for (const [poolKey, poolData] of Object.entries(addressesData.pools)) {
            if (poolData.token0) tokenAddresses.add(poolData.token0);
            if (poolData.token1) tokenAddresses.add(poolData.token1);
        }
    }

    // Discover token info for all addresses
    const discoveryPromises = Array.from(tokenAddresses).map(async (address) => {
        const tokenInfo = await discoverTokenInfo(address);
        if (tokenInfo) {
            tokens[address] = tokenInfo;
        }
    });

    await Promise.all(discoveryPromises);

    return tokens;
}

// Industry Standard ABIs
const QUOTER_V2_ABI = [
    "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) view returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
];

// Main price fetching function with clean API response
async function getPrice(tokenInSymbol, tokenOutSymbol, amountIn) {
    try {
        // Get dynamic data
        const POOLS = getPools();
        const TOKENS = await getTokens();

        // Find the pool for this token pair
        let poolInfo = null;
        let tokenIn = null;
        let tokenOut = null;

        // Check all pools to find the right one
        for (const [poolKey, pool] of Object.entries(POOLS)) {
            const token0Info = TOKENS[pool.token0];
            const token1Info = TOKENS[pool.token1];

            if (token0Info && token1Info &&
                ((token0Info.symbol === tokenInSymbol && token1Info.symbol === tokenOutSymbol) ||
                    (token1Info.symbol === tokenInSymbol && token0Info.symbol === tokenOutSymbol))) {
                poolInfo = pool;
                tokenIn = token0Info.symbol === tokenInSymbol ? pool.token0 : pool.token1;
                tokenOut = token0Info.symbol === tokenOutSymbol ? pool.token0 : pool.token1;
                break;
            }
        }

        if (!poolInfo) {
            return {
                success: false,
                error: `No pool found for ${tokenInSymbol}/${tokenOutSymbol}`,
                availablePools: Object.keys(POOLS)
            };
        }

        // Try QuoterV2 (industry standard)
        const quoterResult = await tryQuoterV2(tokenIn, tokenOut, amountIn, poolInfo.fee, TOKENS);

        if (quoterResult.success) {
            return {
                success: true,
                method: 'QuoterV2',
                input: {
                    token: tokenInSymbol,
                    amount: amountIn
                },
                output: {
                    token: tokenOutSymbol,
                    amount: quoterResult.amountOut
                },
                rate: quoterResult.amountOut / amountIn,
                pool: {
                    address: poolInfo.address,
                    name: poolInfo.name,
                    fee: poolInfo.fee
                },
                gasEstimate: quoterResult.gasEstimate
            };
        }

        return {
            success: false,
            error: 'QuoterV2 failed',
            details: quoterResult.error
        };

    } catch (error) {
        return {
            success: false,
            error: 'Price fetch failed',
            details: error.message
        };
    }
}

// QuoterV2 implementation
async function tryQuoterV2(tokenIn, tokenOut, amountIn, fee, TOKENS) {
    try {
        const provider = new ethers.providers.JsonRpcProvider(process.env.PUSH_RPC_URL);
        const quoterAddress = addressesData.contracts.quoterV2;
        const quoterContract = new ethers.Contract(quoterAddress, QUOTER_V2_ABI, provider);

        // Get token decimals dynamically
        const tokenInInfo = TOKENS[tokenIn];
        const tokenOutInfo = TOKENS[tokenOut];

        if (!tokenInInfo || !tokenOutInfo) {
            throw new Error(`Token info not found for ${tokenIn} or ${tokenOut}`);
        }

        const amountInWei = ethers.utils.parseUnits(amountIn.toString(), tokenInInfo.decimals);

        const quoteParams = {
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountInWei,
            fee: fee,
            sqrtPriceLimitX96: 0
        };

        const result = await quoterContract.quoteExactInputSingle(quoteParams);

        const amountOut = parseFloat(ethers.utils.formatUnits(result.amountOut, tokenOutInfo.decimals));

        return {
            success: true,
            amountOut: amountOut,
            gasEstimate: result.gasEstimate.toNumber()
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// Get all available pools
async function getAvailablePools() {
    const POOLS = getPools();
    const TOKENS = await getTokens();

    const pools = [];
    for (const [poolKey, pool] of Object.entries(POOLS)) {
        const token0Info = TOKENS[pool.token0];
        const token1Info = TOKENS[pool.token1];

        if (token0Info && token1Info) {
            pools.push({
                key: poolKey,
                name: pool.name,
                address: pool.address,
                token0: {
                    address: pool.token0,
                    symbol: token0Info.symbol,
                    decimals: token0Info.decimals,
                    name: token0Info.name
                },
                token1: {
                    address: pool.token1,
                    symbol: token1Info.symbol,
                    decimals: token1Info.decimals,
                    name: token1Info.name
                },
                fee: pool.fee
            });
        }
    }

    return pools;
}

// Get all available tokens
async function getAvailableTokens() {
    const TOKENS = await getTokens();

    const tokens = [];
    for (const [address, tokenInfo] of Object.entries(TOKENS)) {
        tokens.push({
            address: address,
            symbol: tokenInfo.symbol,
            decimals: tokenInfo.decimals,
            name: tokenInfo.name
        });
    }

    return tokens;
}

// Get prices for all pools
async function getAllPoolPrices() {
    const POOLS = getPools();
    const TOKENS = await getTokens();
    const prices = [];

    for (const [poolKey, pool] of Object.entries(POOLS)) {
        const token0Info = TOKENS[pool.token0];
        const token1Info = TOKENS[pool.token1];

        if (!token0Info || !token1Info) {
            continue;
        }

        try {
            // Get price for 1 unit of token0 -> token1
            const result = await getPrice(token0Info.symbol, token1Info.symbol, 1);

            if (result.success) {
                prices.push({
                    pool: pool.name,
                    poolKey: poolKey,
                    token0: token0Info.symbol,
                    token1: token1Info.symbol,
                    price: result.rate,
                    priceDisplay: `1 ${token0Info.symbol} = ${result.rate.toFixed(6)} ${token1Info.symbol}`,
                    poolAddress: pool.address,
                    fee: pool.fee
                });
                console.log(`1 ${token0Info.symbol} = ${result.rate.toFixed(6)} ${token1Info.symbol}`);
            } else {
                prices.push({
                    pool: pool.name,
                    poolKey: poolKey,
                    token0: token0Info.symbol,
                    token1: token1Info.symbol,
                    price: null,
                    priceDisplay: `Error: ${result.error}`,
                    poolAddress: pool.address,
                    fee: pool.fee
                });
            }
        } catch (error) {
            prices.push({
                pool: pool.name,
                poolKey: poolKey,
                token0: token0Info.symbol,
                token1: token1Info.symbol,
                price: null,
                priceDisplay: `Error: ${error.message}`,
                poolAddress: pool.address,
                fee: pool.fee
            });
        }
    }

    return prices;
}

// Add new token manually (for future tokens not in pools yet)
async function addToken(tokenAddress) {
    try {
        const tokenInfo = await discoverTokenInfo(tokenAddress);
        if (tokenInfo) {
            console.log(`✅ Added token: ${tokenInfo.symbol} (${tokenInfo.name})`);
            console.log(`   Address: ${tokenAddress}`);
            console.log(`   Decimals: ${tokenInfo.decimals}`);
            return tokenInfo;
        } else {
            console.log(`❌ Could not add token at ${tokenAddress}`);
            return null;
        }
    } catch (error) {
        console.log(`❌ Error adding token: ${error.message}`);
        return null;
    }
}

// CLI interface for testing
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('🌍 UNIVERSAL PRICE API - 100% Future Compatible');
        console.log('');
        console.log('📊 Get Price:');
        console.log('  node scripts/price-api.js price <tokenIn> <tokenOut> <amount>');
        console.log('  Example: node scripts/price-api.js price WPC USDT 100');
        console.log('');
        console.log('📋 List Pools:');
        console.log('  node scripts/price-api.js pools');
        console.log('');
        console.log('💰 Get All Pool Prices:');
        console.log('  node scripts/price-api.js all-prices');
        console.log('');
        console.log('🪙 List Tokens:');
        console.log('  node scripts/price-api.js tokens');
        console.log('');
        console.log('➕ Add New Token:');
        console.log('  node scripts/price-api.js add-token <address>');
        console.log('');
        process.exit(1);
    }

    const command = args[0];

    if (command === 'pools') {
        getAvailablePools().then(pools => {
            console.log('📊 Available Pools:');
            pools.forEach(pool => {
                console.log(`├─ ${pool.name}: ${pool.token0.symbol}/${pool.token1.symbol} (${pool.fee} fee)`);
                console.log(`│  Address: ${pool.address}`);
                console.log(`│  Token0: ${pool.token0.name} (${pool.token0.decimals} decimals)`);
                console.log(`│  Token1: ${pool.token1.name} (${pool.token1.decimals} decimals)`);
            });
        });
    } else if (command === 'all-prices') {
        console.log('Fetching all pool prices...');
        getAllPoolPrices().then(prices => {
            console.log('💰 ALL POOL PRICES');
            console.log('='.repeat(80));
            prices.forEach(price => {
                console.log(`\n${price.pool}`);
                console.log(`  ${price.priceDisplay}`);
                console.log(`  Pool: ${price.poolAddress}`);
                console.log(`  Fee: ${price.fee} bps (${(price.fee / 10000).toFixed(2)}%)`);
            });
            console.log('\n' + '='.repeat(80));
            console.log(`\n📊 Total: ${prices.length} pools`);
        }).catch(error => {
            console.error('❌ Error:', error.message);
            process.exit(1);
        });
    } else if (command === 'tokens') {
        getAvailableTokens().then(tokens => {
            console.log('🪙 Available Tokens:');
            tokens.forEach(token => {
                console.log(`├─ ${token.symbol}: ${token.name}`);
                console.log(`│  Address: ${token.address}`);
                console.log(`│  Decimals: ${token.decimals}`);
            });
        });
    } else if (command === 'add-token' && args.length === 2) {
        const tokenAddress = args[1];
        addToken(tokenAddress);
    } else if (command === 'price' && args.length === 4) {
        const tokenIn = args[1];
        const tokenOut = args[2];
        const amount = parseFloat(args[3]);

        if (isNaN(amount) || amount <= 0) {
            console.log('❌ Amount must be a positive number');
            process.exit(1);
        }

        getPrice(tokenIn, tokenOut, amount)
            .then(result => {
                console.log(JSON.stringify(result, null, 2));
            })
            .catch(error => {
                console.error('❌ Error:', error.message);
                process.exit(1);
            });
    } else {
        console.log('❌ Invalid command or arguments');
        process.exit(1);
    }
}

module.exports = {
    getPrice,
    getAvailablePools,
    getAvailableTokens,
    addToken,
    discoverTokenInfo,
    getAllPoolPrices
};
