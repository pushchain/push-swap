#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
        case '--pool':
            options.poolAddress = args[++i];
            break;
        case '--token0':
            options.token0 = args[++i];
            break;
        case '--token1':
            options.token1 = args[++i];
            break;
        case '--amount0':
            options.amount0 = args[++i];
            break;
        case '--amount1':
            options.amount1 = args[++i];
            break;
        case '--tickLower':
            options.tickLower = args[++i];
            break;
        case '--tickUpper':
            options.tickUpper = args[++i];
            break;
        case '--help':
            console.log(`
💰 Add Liquidity Script

Usage: npm run add-liquidity [options]

Options:
  --pool <address>     Pool address to add liquidity to
  --token0 <address>   Token0 address (use with --token1)
  --token1 <address>   Token1 address (use with --token0)
  --amount0 <number>   Amount of token0 to add (default: 100)
  --amount1 <number>   Amount of token1 to add (default: 100)
  --tickLower <number> Lower tick for position (default: -887220)
  --tickUpper <number> Upper tick for position (default: 887220)
  --help              Show this help message

Examples:
  npm run add-liquidity -- --pool 0x1234... --amount0 50 --amount1 50
  npm run add-liquidity -- --token0 0x1234... --token1 0x5678... --amount0 100
  npm run add-liquidity  # Uses default pool with default amounts
            `);
            process.exit(0);
    }
}

// Set environment variables
const env = { ...process.env };
if (options.poolAddress) env.POOL_ADDRESS = options.poolAddress;
if (options.token0) env.TOKEN0_ADDRESS = options.token0;
if (options.token1) env.TOKEN1_ADDRESS = options.token1;
if (options.amount0) env.AMOUNT0 = options.amount0;
if (options.amount1) env.AMOUNT1 = options.amount1;
if (options.tickLower) env.TICK_LOWER = options.tickLower;
if (options.tickUpper) env.TICK_UPPER = options.tickUpper;

// Run the hardhat script with environment variables
const hardhatProcess = spawn('npx', [
    'hardhat',
    'run',
    path.join(__dirname, '..', 'core', 'add-liquidity-core.js'),
    '--network',
    'pushchain'
], {
    stdio: 'inherit',
    env: env
});

hardhatProcess.on('close', (code) => {
    process.exit(code);
}); 