import 'hardhat-typechain'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import '@nomiclabs/hardhat-etherscan'
import 'dotenv/config'

export default {
  networks: {
    hardhat: {
      allowUnlimitedContractSize: false,
    },
    pushchain: {
      url: process.env.PUSH_RPC_URL || 'https://rpc.push.org',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: parseInt(process.env.PUSH_CHAIN_ID || '1337'),
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

  solidity: {
    version: '0.7.6',
    settings: {
      optimizer: {
        enabled: true,
        runs: 800,
      },
      metadata: {
        // do not include the metadata hash, since this is machine dependent
        // and we want all generated code to be deterministic
        // https://docs.soliditylang.org/en/v0.7.6/metadata.html
        bytecodeHash: 'none',
      },
    },
  },
}
