require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-etherscan');
require('dotenv').config();

// Default private key for local testing (DO NOT USE IN PRODUCTION)
const DEFAULT_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        compilers: [
            {
                version: '0.7.6',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 800,
                    },
                    metadata: {
                        bytecodeHash: 'none',
                    },
                },
            },
            {
                version: '0.8.29',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                    metadata: {
                        bytecodeHash: 'none',
                    },
                },
            },
        ],
        overrides: {
            'tests/contracts/WPUSH.sol': {
                version: '0.8.29',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                    metadata: {
                        bytecodeHash: 'none',
                    },
                },
            },
        },
    },
    networks: {
        hardhat: {
            allowUnlimitedContractSize: true,
            chainId: 31337,
        },
        push_testnet: {
            url: process.env.PUSH_RPC_URL || 'https://evm.rpc-testnet-donut-node1.push.org/',
            accounts: process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.length === 66 ? [process.env.PRIVATE_KEY] : [DEFAULT_PRIVATE_KEY],
            chainId: parseInt(process.env.PUSH_CHAIN_ID || '42101'),
            gasPrice: 'auto',
            gas: 'auto',
            timeout: 120000,
        },
    },
    etherscan: {
        apiKey: {
            // Blockscout doesn't require an actual API key, any non-empty string will work
            push_testnet: 'blockscout',
        },
        customChains: [
            {
                network: 'push_testnet',
                chainId: 42101,
                urls: {
                    apiURL: 'https://donut.push.network/api/v2/verifyContract',
                    browserURL: 'https://donut.push.network/',
                },
            },
        ],
    },
    sourcify: {
        // Disable sourcify for manual verification
        enabled: false,
    },
    paths: {
        sources: './contracts',
        artifacts: './artifacts',
        cache: './cache',
    },
}; 