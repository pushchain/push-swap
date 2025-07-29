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
        case '--tokenIn':
            options.tokenIn = args[++i];
            break;
        case '--tokenOut':
            options.tokenOut = args[++i];
            break;
        case '--amountIn':
            options.amountIn = args[++i];
            break;
        case '--help':
            console.log(`
🔄 Swap Script

Usage: npm run swap [options]

Options:
  --pool <address>     Pool address to swap in
  --tokenIn <address>  Token to swap from (use with --tokenOut)
  --tokenOut <address> Token to swap to (use with --tokenIn)
  --amountIn <number>  Amount of tokenIn to swap (default: 10)
  --help               Show this help message

Examples:
  npm run swap -- --pool 0x1234... --amountIn 50
  npm run swap -- --tokenIn 0x1234... --tokenOut 0x5678... --amountIn 100
  npm run swap  # Uses default pool with default amount

Note: If using --pool, you can optionally specify --tokenIn and --tokenOut
to control which direction to swap. Otherwise, it defaults to token0 → token1.
            `);
            process.exit(0);
    }
}

// Set environment variables
const env = { ...process.env };
if (options.poolAddress) env.POOL_ADDRESS = options.poolAddress;
if (options.tokenIn) env.TOKEN_IN_ADDRESS = options.tokenIn;
if (options.tokenOut) env.TOKEN_OUT_ADDRESS = options.tokenOut;
if (options.amountIn) env.AMOUNT_IN = options.amountIn;

// Run the hardhat script with environment variables
const hardhatProcess = spawn('npx', [
    'hardhat',
    'run',
    path.join(__dirname, '..', 'core', 'swap-core.js'),
    '--network',
    'pushchain'
], {
    stdio: 'inherit',
    env: env
});

hardhatProcess.on('close', (code) => {
    process.exit(code);
}); 