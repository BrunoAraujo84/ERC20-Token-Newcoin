import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import fs from 'fs';
import "@nomicfoundation/hardhat-chai-matchers"; 
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import "hardhat-deploy";

const mnemonic = fs.readFileSync('.secret').toString();
const ETHERSCAN_API_KEY = fs.readFileSync('.env').toString();

const config: HardhatUserConfig = {
  solidity: "0.8.15",
  defaultNetwork: "hardhat",
  networks: {
      hardhat: {
        accounts: {
          mnemonic: mnemonic,
          accountsBalance: "10000000000000000000000"  // 10,000 ETH
        },
      },
      testnet: {
          url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
          chainId: 97,
          // gasPrice: 1000000000, // 20 Gwei
          accounts: {
            mnemonic: mnemonic,
          },
          saveDeployments: true,
          tags: ["testnet"],
      },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};

export default config;
