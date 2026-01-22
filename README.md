# Uniswap V3 Fork for Push Chain

Uniswap V3 implementation for Push Chain with proper sqrtPriceX96 calculations and decimal handling.

## Project Structure

```
push-swap/
├── scripts/
│   ├── pool-manager.js              # Main operations script
│   ├── price-api.js                 # Price quotes and token information API
│   ├── deploy-all.js                # Complete DEX deployment
│   ├── deploy-WPC.js              # WPC token deployment
│   └── core/
│       └── config.js                # Configuration and utilities
├── test-addresses.json              # Deployed contract addresses
├── v3-core/                        # Uniswap V3 core contracts
├── v3-periphery/                   # Uniswap V3 periphery contracts  
└── package.json                    # Dependencies and scripts
```

## Deployed Addresses

The following files contain deployed contract addresses and pool information:

- **[`core-deployment.json`](./v3-core/core-deployment.json)** - Uniswap V3 core contracts deployment:

- **[`periphery-deployment.json`](./v3-periphery/periphery-deployment.json)** - Uniswap V3 periphery contracts deployment:

- **[`test-addresses.json`](./test-addresses.json)** - Current active deployment addresses:


## Quick Start

### Deploy Complete pools with liquidity
```bash
npm run deploy-dex
```

Creates a 3-pool DEX with:
- pETH (18 decimals), pUSDC (6 decimals), WPC (18 decimals)
- Pool 1: 1 pETH = 4000 pUSDC
- Pool 2: 1 WPC = 1000 pUSDC  
- Pool 3: 1 pETH = 4 WPC

### Individual Operations

**Get WPC Tokens:**
```bash
# Get 1 WPC (default)
node scripts/pool-manager.js get-WPC

# Get specific amount (e.g., 10 WPC)
node scripts/pool-manager.js get-WPC 10
```

**Deploy Tokens:**
```bash
node scripts/pool-manager.js deploy-tokens pETH "Push ETH" 18 1000000 pUSDC "Push USDC" 6 10000000
```

**Or, deploy a single token**
```bash
node scripts/pool-manager.js deploy-tokens pUSDC "Push USDC" 6 10000000
```

**Create Pool:**
```bash
node scripts/pool-manager.js create-pool [pETH_addr] [WPC_addr] 4 3000 true 1 4
```

**Add Liquidity:**
```bash
node scripts/pool-manager.js add-liquidity [pool_addr] [pETH_addr] [WPC_addr] 1 4  
```

**Perform Swap:**
See [pool-manager.js Commands](#pool-managerjs-commands) section below for all swap options.

## Available Scripts

| Script | Description | Command |
|--------|-------------|---------|
| `deploy-dex` | Complete DEX deployment | `npm run deploy-dex` |
| `pool-manager` | Individual operations | `npm run pool-manager [command] [args]` |
| `price-api` | Price quotes and token information | `node scripts/price-api.js [command] [args]` |
| `deploy-core` | Deploy core contracts | `npm run deploy-core` |
| `deploy-periphery` | Deploy periphery contracts | `npm run deploy-periphery` |

## pool-manager.js Commands

```bash
# Token Deployment
node scripts/pool-manager.js deploy-tokens [symbol1] [name1] [decimals1] [supply1] [symbol2] [name2] [decimals2] [supply2]

# Pool Creation  
node scripts/pool-manager.js create-pool [token0] [token1] [priceRatio] [fee] [addLiquidity] [amount0] [amount1]

# Liquidity Addition
node scripts/pool-manager.js add-liquidity [poolAddr] [token0] [token1] [amount0] [amount1]

# Token Swaps
node scripts/pool-manager.js swap [poolAddr] [tokenIn] [tokenOut] [amountIn]
node scripts/pool-manager.js swap-with-native [poolAddr] [tokenOut] [amountIn]

# Multi-hop Route Swaps (PRC20 → PRC20 via intermediate tokens)
node scripts/pool-manager.js route-swap [tokenIn] [tokenOut] [amount] [intermediateToken1] [intermediateToken2...] --fees [fee1] [fee2] [fee3...]
```

## price-api.js Commands

The `price-api.js` script provides a production-ready price API for fetching quotes and token information.

### Get Price Quote
```bash
# Get price quote for swapping tokens
node scripts/price-api.js price <tokenIn> <tokenOut> <amount>

# Examples
node scripts/price-api.js price WPC USDT 1
node scripts/price-api.js price WPC "USDC.eth" 1
node scripts/price-api.js price pETH WPC 1
```

### List Available Pools
```bash
# List all configured pools with token information
node scripts/price-api.js pools
```

### Get All Pool Prices
```bash
# Get current prices for all pools at once
node scripts/price-api.js all-prices
```

### List Available Tokens
```bash
# List all available tokens with their addresses and decimals
node scripts/price-api.js tokens
```

### Add New Token
```bash
# Add a new token by address (for tokens not yet in pools)
node scripts/price-api.js add-token <address>
```

### Available Tokens
The following tokens are available for price queries (use the symbol, not the name):
- **WPC** - Wrapped Push Coin (base token in all pools)
- **pSOL**, **pETH**, **pBNB** - Push native tokens
- **USDT**, **USDC.eth**, **USDC.arb**, **USDC.base** - Stablecoins
- **USDT.base**, **USDT.arb**, **USDT.bsc** - Cross-chain USDT
- **pETH.base**, **pETH.arb** - Cross-chain pETH

**Note:** Use the token's **symbol** (shown in `tokens` command), not the name. For example, use `USDT` not `USDT.eth`.

## Price Calculation

### sqrtPriceX96 Implementation

**Same Decimals:**
```javascript
// For 1:4 ratio: sqrtPriceX96 = sqrt(4) * 2^96 = 2 * 2^96
if (priceRatio === 4) return Q96.mul(2);
```

**Different Decimals:**
```javascript
// Accounts for 10^(decimal_difference) in price calculation
const decimalDiff = token1Decimals - token0Decimals;
const adjustedRatio = priceRatio * Math.pow(10, decimalDiff);
```

## Configuration

## Address Management

Deployed addresses are saved to `test-addresses.json`:

```json
{
  "tokens": {
    "pETH": "0x...",
    "pUSDC": "0x...", 
    "WPC": "0x..."
  },
  "pools": {
    "pETH_WPC": "0x...",
    "pETH_pUSDC": "0x...",
    "WPC_pUSDC": "0x..."
  },
  "contracts": {
    "factory": "0x...",
    "router": "0x...",
    "positionManager": "0x..."
  }
}
```

## Examples

### Create Custom Pool
```bash
# Deploy custom tokens
node scripts/pool-manager.js deploy-tokens USDT "Tether" 6 1000000 DAI "Dai" 18 1000000

# Create 1:1 stablecoin pool  
node scripts/pool-manager.js create-pool [USDT] [DAI] 1 500 true 1000 1000
```

### Cross-Pool Trading (PRC20 → PRC20)

For swapping between PRC20 tokens (e.g., pETH → pSOL), use `route-swap` which executes the entire route in a single transaction:

```bash
# Swap pETH to pSOL via WPC (single transaction)
# Route: pETH → WPC → pSOL
node scripts/pool-manager.js route-swap pETH pSOL 1 WPC --fees 500 500

# Swap USDC.arb to USDC.base via WPC
node scripts/pool-manager.js route-swap USDC.arb USDC.base 100 WPC --fees 500 500

# Multi-hop route with multiple intermediate tokens
node scripts/pool-manager.js route-swap tokenA tokenD 100 tokenB tokenC --fees 500 3000 500
```

**Note:** All tokens must be in `official-prc20.json`. The number of fees must be one less than the total number of tokens in the route.

## Pool Health Monitoring

Check and maintain pool health:

```bash
# Check all pool health
npm run pool-health check

# Heal a specific pool
npm run pool-health heal [poolAddress] [amount0] [amount1]

# Auto-heal all unhealthy pools
npm run pool-health auto-heal
```

**Health Checks:**
- ✅ **Liquidity**: Ensures minimum liquidity threshold
- ✅ **Tick Position**: Alerts if pool is near extreme prices (>90% of MAX/MIN tick)