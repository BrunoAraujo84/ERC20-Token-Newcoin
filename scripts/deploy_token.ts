import { ethers } from "hardhat";
import { parseEther, ContractFactory } from "ethers";
import { ERC20Token, ERC20TokenProxy as ImportedERC20TokenProxy } from "../typechain-types";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log(
      "Deploying contracts with the account:",
      deployer.address
  );

  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  let Token = await ethers.getContractFactory("ERC20Token") as ContractFactory;
  const token = await Token.deploy();
  let  tokenERC20 = token as unknown as ERC20Token;
  let tokenERC20Address = (await token.getAddress()).toString();

  console.log("Token address:", tokenERC20Address);

  // Agora você deve chamar a função `initialize`
  await tokenERC20.initialize("Newcoin", "NEW");
  console.log("Token has been initialized");
  
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
      console.error(error);
      process.exit(1);
  });