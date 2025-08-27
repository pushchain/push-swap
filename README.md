# Uniswap V3 Fork for Push Chain

Uniswap V3 implementation for Push Chain with proper sqrtPriceX96 calculations and decimal handling.

## Project Structure

```
push-swap/
├── scripts/
│   ├── pool-manager.js              # Main operations script
│   ├── deploy-all.js                # Complete DEX deployment
│   ├── deploy-wpush.js              # WPUSH token deployment
│   └── core/
│       └── config.js                # Configuration and utilities
├── test-addresses.json              # Deployed contract addresses
├── v3-core/                        # Uniswap V3 core contracts
├── v3-periphery/                   # Uniswap V3 periphery contracts  
└── package.json                    # Dependencies and scripts
```

## Deployed Addresses

The following files contain deployed contract addresses and pool information:

- **[`core-deployment.json`](./core-deployment.json)** - Uniswap V3 core contracts deployment:

- **[`periphery-deployment.json`](./periphery-deployment.json)** - Uniswap V3 periphery contracts deployment:

- **[`test-addresses.json`](./test-addresses.json)** - Current active deployment addresses:


## Quick Start

### Deploy Complete pools with liquidity
```bash
npm run deploy-dex
```

Creates a 3-pool DEX with:
- pETH (18 decimals), pUSDC (6 decimals), WPUSH (18 decimals)
- Pool 1: 1 pETH = 4000 pUSDC
- Pool 2: 1 WPUSH = 1000 pUSDC  
- Pool 3: 1 pETH = 4 WPUSH

### Individual Operations

**Get WPUSH Tokens:**
```bash
# Get 1 WPUSH (default)
node scripts/pool-manager.js get-wpush

# Get specific amount (e.g., 10 WPUSH)
node scripts/pool-manager.js get-wpush 10
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
node scripts/pool-manager.js create-pool [pETH_addr] [WPUSH_addr] 4 3000 true 1 4
```

**Add Liquidity:**
```bash
node scripts/pool-manager.js add-liquidity [pool_addr] [pETH_addr] [WPUSH_addr] 1 4  
```

**Perform Swap:**
```bash
node scripts/pool-manager.js swap [pool_addr] [pETH_addr] [WPUSH_addr] 1
```

## Available Scripts

| Script | Description | Command |
|--------|-------------|---------|
| `deploy-dex` | Complete DEX deployment | `npm run deploy-dex` |
| `pool-manager` | Individual operations | `npm run pool-manager [command] [args]` |
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
```

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
    "WPUSH": "0x..."
  },
  "pools": {
    "pETH_WPUSH": "0x...",
    "pETH_pUSDC": "0x...",
    "WPUSH_pUSDC": "0x..."
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

### Cross-Pool Trading
```bash
# Execute trades across multiple pools
node scripts/pool-manager.js swap [pool1] [tokenA] [tokenB] 100
node scripts/pool-manager.js swap [pool2] [tokenB] [tokenC] [amount_received]
``` 