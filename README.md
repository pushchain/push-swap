# Uniswap V3 Fork on Push Chain

A clean, streamlined implementation of Uniswap V3 for the Push Chain network.

## 🏗️ Project Structure

```
push-swap/
├── scripts/                          # ✅ ALL SCRIPTS (Organized & Clean)
│   ├── deploy-pools.js               # Complete deployment (tokens + pools + liquidity)
│   ├── deploy-wpush.js               # WPUSH token deployment
│   ├── cli/                          # CLI wrapper scripts
│   │   ├── add-liquidity.js          # CLI wrapper for adding liquidity
│   │   ├── create-pool.js            # CLI wrapper for creating pools
│   │   └── swap.js                   # CLI wrapper for swaps
│   └── core/                         # Core business logic scripts
│       ├── add-liquidity-core.js     # Core liquidity logic
│       ├── create-pool-core.js       # Core pool creation logic
│       ├── swap-core.js              # Core swap logic
│       └── config.js                 # Configuration and utilities
├── test-addresses.json               # All deployed addresses
├── v3-core/                         # Uniswap V3 core contracts
├── v3-periphery/                    # Uniswap V3 periphery contracts
└── package.json                     # Project dependencies and scripts
```

## 🚀 Quick Start

### 1. Deploy the Complete DEX
```bash
npm run deploy-pools
```
This deploys:
- Test Token A (TTA) and Test Token B (TTB)
- Three pools: WPUSH/TokenA, WPUSH/TokenB, TokenA/TokenB
- Initial liquidity with target pricing: 1 WPUSH = 10 TokenA = 20 TokenB

### 2. Add Liquidity to Existing Pools
```bash
# Add to specific pool
npm run add-liquidity -- --pool 0x1234... --amount0 100 --amount1 100

# Add to pool by token addresses
npm run add-liquidity -- --token0 0x1234... --token1 0x5678... --amount0 50

# Add to default pool with default amounts
npm run add-liquidity
```

### 3. Create New Pools
```bash
# Create pool with specific price
npm run create-pool -- --token0 0x1234... --token1 0x5678... --price 10

# Create pool with custom fee
npm run create-pool -- --token0 0x1234... --token1 0x5678... --fee 500 --price 2

# Force recreate existing pool
npm run create-pool -- --token0 0x1234... --token1 0x5678... --force
```

### 4. Perform Swaps
```bash
# Swap in specific pool
npm run swap -- --pool 0x1234... --amountIn 50

# Swap by token addresses
npm run swap -- --tokenIn 0x1234... --tokenOut 0x5678... --amountIn 100

# Swap in default pool
npm run swap
```

## 📋 Available Scripts

| Script | Description | Usage |
|--------|-------------|-------|
| `deploy-pools` | Deploy complete 3-pool DEX setup | `npm run deploy-pools` |
| `add-liquidity` | Add liquidity to pools | `npm run add-liquidity [options]` |
| `create-pool` | Create new pools | `npm run create-pool [options]` |
| `swap` | Perform token swaps | `npm run swap [options]` |
| `deploy-core` | Deploy core contracts only | `npm run deploy-core` |
| `deploy-periphery` | Deploy periphery contracts only | `npm run deploy-periphery` |
| `deploy-all` | Deploy core + periphery | `npm run deploy-all` |
| `clean` | Clean build artifacts | `npm run clean` |

## 🎯 Target Pricing

The default deployment creates pools with these target prices:
- **1 WPUSH = 10 TokenA**
- **1 WPUSH = 20 TokenB**  
- **1 TokenA = 2 TokenB**

## 💰 Fee Structure

All pools use **0.3% fee** (3000 basis points) by default.

## 📊 Address Management

All deployed addresses are automatically saved to `test-addresses.json` and include:
- Contract addresses (Factory, Router, etc.)
- Token addresses (WPUSH, TokenA, TokenB)
- Pool addresses with metadata
- Network configuration
- Deployment information

## 🔧 Configuration

Edit `tests/config.js` to modify:
- Network settings
- Contract addresses
- RPC endpoints
- Default parameters

## 📝 Examples

### Create a New Pool with Custom Pricing
```bash
npm run create-pool -- --token0 0x1234... --token1 0x5678... --price 5
```

### Add Large Liquidity Position
```bash
npm run add-liquidity -- --pool 0x1234... --amount0 1000 --amount1 1000
```

### Perform Large Swap
```bash
npm run swap -- --pool 0x1234... --amountIn 500
```

## 🚨 Important Notes

1. **Always run `deploy-pools` first** to set up the initial DEX
2. **Check `test-addresses.json`** for all deployed addresses
3. **Use `--help`** with any script for detailed options
4. **Ensure sufficient token balances** before operations
5. **Monitor gas costs** on Push Chain network

## 🔍 Troubleshooting

- **"Pool not found"**: Run `create-pool` first
- **"Insufficient balance"**: Check token balances or deposit more PUSH
- **"Address not found"**: Ensure `test-addresses.json` exists (run `deploy-pools`)

## 📈 Next Steps

After deployment, you can:
1. Add more liquidity to existing pools
2. Create new pools with different tokens
3. Perform arbitrage between pools
4. Build frontend interfaces
5. Deploy to mainnet

---

**Ready to trade on Push Chain! 🚀** 