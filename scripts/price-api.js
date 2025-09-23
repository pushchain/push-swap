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

// Dynamic token configurations
function getTokens() {
    const tokens = {};

    // Add WPC from test-addresses.json
    if (addressesData.contracts?.WPC) {
        tokens[addressesData.contracts.WPC] = { symbol: "WPC", decimals: 18 };
    }

    // Add official tokens from official-prc20.json
    for (const [symbol, tokenData] of Object.entries(officialTokens)) {
        if (tokenData.Proxy) {
            tokens[tokenData.Proxy] = {
                symbol: symbol,
                decimals: symbol.includes('USDT') || symbol.includes('USDC') ? 6 : 18
            };
        }
    }

    // Add tokens from pool data (for deployed test tokens)
    if (addressesData.pools) {
        for (const [poolKey, poolData] of Object.entries(addressesData.pools)) {
            // Add token0 if not already present
            if (poolData.token0 && !tokens[poolData.token0]) {
                tokens[poolData.token0] = {
                    symbol: poolData.token0Symbol || "UNKNOWN",
                    decimals: poolData.token0Symbol?.includes('USDT') || poolData.token0Symbol?.includes('USDC') ? 6 : 18
                };
            }
            // Add token1 if not already present
            if (poolData.token1 && !tokens[poolData.token1]) {
                tokens[poolData.token1] = {
                    symbol: poolData.token1Symbol || "UNKNOWN",
                    decimals: poolData.token1Symbol?.includes('USDT') || poolData.token1Symbol?.includes('USDC') ? 6 : 18
                };
            }
        }
    }

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
        const TOKENS = getTokens();

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
        const signer = config.getSigner();
        const quoterAddress = addressesData.contracts.quoterV2;
        const quoterContract = new ethers.Contract(quoterAddress, QUOTER_V2_ABI, signer);

        const amountInWei = ethers.utils.parseUnits(amountIn.toString(), 18);

        const quoteParams = {
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountInWei,
            fee: fee,
            sqrtPriceLimitX96: 0
        };

        const result = await quoterContract.quoteExactInputSingle(quoteParams);

        // Get token decimals dynamically
        const tokenOutInfo = TOKENS[tokenOut];
        const tokenOutDecimals = tokenOutInfo ? tokenOutInfo.decimals : 18;

        const amountOut = parseFloat(ethers.utils.formatUnits(result.amountOut, tokenOutDecimals));

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
function getAvailablePools() {
    const POOLS = getPools();
    const TOKENS = getTokens();

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
                    decimals: token0Info.decimals
                },
                token1: {
                    address: pool.token1,
                    symbol: token1Info.symbol,
                    decimals: token1Info.decimals
                },
                fee: pool.fee
            });
        }
    }

    return pools;
}

// Get all available tokens
function getAvailableTokens() {
    const TOKENS = getTokens();

    const tokens = [];
    for (const [address, tokenInfo] of Object.entries(TOKENS)) {
        tokens.push({
            address: address,
            symbol: tokenInfo.symbol,
            decimals: tokenInfo.decimals
        });
    }

    return tokens;
}

// CLI interface for testing
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('🎯 PRICE API - Available Commands:');
        console.log('');
        console.log('📊 Get Price:');
        console.log('  node scripts/price-api.js price <tokenIn> <tokenOut> <amount>');
        console.log('  Example: node scripts/price-api.js price WPC USDT 100');
        console.log('');
        console.log('📋 List Pools:');
        console.log('  node scripts/price-api.js pools');
        console.log('');
        console.log('🪙 List Tokens:');
        console.log('  node scripts/price-api.js tokens');
        console.log('');
        process.exit(1);
    }

    const command = args[0];

    if (command === 'pools') {
        const pools = getAvailablePools();
        console.log('📊 Available Pools:');
        pools.forEach(pool => {
            console.log(`├─ ${pool.name}: ${pool.token0.symbol}/${pool.token1.symbol} (${pool.fee} fee)`);
            console.log(`│  Address: ${pool.address}`);
        });
    } else if (command === 'tokens') {
        const tokens = getAvailableTokens();
        console.log('🪙 Available Tokens:');
        tokens.forEach(token => {
            console.log(`├─ ${token.symbol}: ${token.address} (${token.decimals} decimals)`);
        });
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
    getAvailableTokens
};
