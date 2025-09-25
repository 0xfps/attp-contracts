import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-foundry";
import dotenv from "dotenv"

dotenv.config()

const PRIVATE_KEY = process.env.PRIVATE_KEY!
const ACCOUNTS_CONFIG = {
  accounts: [PRIVATE_KEY],
  allowUnlimitedContractSize: true
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 2
      }
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY!
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true
    },
    arbitrumSepolia: {
      chainId: 421614,
      url: "https://arbitrum-sepolia.gateway.tenderly.co",
      ...ACCOUNTS_CONFIG
    },
    avalancheFuji: {
      chainId: 43113,
      url: "https://avalanche-fuji-c-chain-rpc.publicnode.com",
      ...ACCOUNTS_CONFIG
    },
    baseSepolia: {
      chainId: 84532,
      url: "https://base-sepolia.gateway.tenderly.co",
      ...ACCOUNTS_CONFIG
    },
    bscTestnet: {
      chainId: 97,
      url: "https://bsc-testnet-rpc.publicnode.com",
      ...ACCOUNTS_CONFIG
    },
    optimismSepolia: {
      chainId: 11155420,
      url: "https://optimism-sepolia.gateway.tenderly.co",
      ...ACCOUNTS_CONFIG
    },
    polygonAmoy: {
      chainId: 80002,
      url: "https://polygon-amoy.gateway.tenderly.co",
      ...ACCOUNTS_CONFIG
    },
    sepolia: {
      chainId: 11155111,
      url: "https://sepolia.gateway.tenderly.co",
      ...ACCOUNTS_CONFIG
    }
  },
  mocha: {
    timeout: 0
  }
};

export default config;