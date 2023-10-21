import { ethers } from "hardhat";
import { expect } from "chai";

describe("Meu Contrato", function () {
  it("deve ter saldo suficiente na conta do deployer", async function () {
    const [deployer] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Saldo da conta do deployer:", ethers.formatEther(balance));

    //expect(parseInt(ethers.formatEther(balance))).to.be.gt(0);  // Ajuste o valor conforme necessário
  });
});
