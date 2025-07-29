#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
        case '--token0':
            options.token0 = args[++i];
            break;
        case '--token1':
            options.token1 = args[++i];
            break;
        case '--fee':
            options.fee = args[++i];
            break;
        case '--price':
            options.priceRatio = args[++i];
            break;
        case '--force':
            options.force = 'true';
            break;
        case '--help':
            console.log(`
🏊 Create Pool Script

Usage: npm run create-pool [options]

Options:
  --token0 <address>   Token0 address (required)
  --token1 <address>   Token1 address (required)
  --fee <number>       Pool fee in basis points (default: 3000 = 0.3%)
  --price <number>     Initial price ratio (e.g., 10 means 1 token0 = 10 token1)
  --force              Force recreate if pool exists
  --help               Show this help message

Examples:
  npm run create-pool -- --token0 0x1234... --token1 0x5678... --price 10
  npm run create-pool -- --token0 0x1234... --token1 0x5678... --fee 500 --price 2
  npm run create-pool -- --token0 0x1234... --token1 0x5678... --force

Common Fees:
  500  = 0.05%
  3000 = 0.3%
  10000 = 1%
            `);
            process.exit(0);
    }
}

// Set environment variables
const env = { ...process.env };
if (options.token0) env.TOKEN0_ADDRESS = options.token0;
if (options.token1) env.TOKEN1_ADDRESS = options.token1;
if (options.fee) env.POOL_FEE = options.fee;
if (options.priceRatio) env.PRICE_RATIO = options.priceRatio;
if (options.force) env.FORCE_CREATE = options.force;

// Run the hardhat script with environment variables
const hardhatProcess = spawn('npx', [
    'hardhat',
    'run',
    path.join(__dirname, '..', 'core', 'create-pool-core.js'),
    '--network',
    'pushchain'
], {
    stdio: 'inherit',
    env: env
});

hardhatProcess.on('close', (code) => {
    process.exit(code);
}); 