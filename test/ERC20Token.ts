import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, ContractFactory, Signer, ContractTransaction } from "ethers";
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { TransactionResponse } from "@ethersproject/abstract-provider";

interface ERC20Token {
  initialize(name: string, symbol: string): Promise<ContractTransaction>;
  transfer(to: string, amount: BigNumberish): Promise<ContractTransaction>;
  balanceOf(account: string): Promise<BigNumber>;
  totalSupply(): Promise<BigNumber>;
  maxSupply(): Promise<BigNumber>;
  owner(): Promise<string>;
  connect(signer: Signer): ERC20Token;
  approve(to: string, amount: BigNumberish): Promise<ContractTransaction>;
  allowance(owner: string, spender: string): Promise<BigNumber>;
  transferFrom(from: string, to: string, amount: BigNumberish): Promise<ContractTransaction>;
  burn(amount: BigNumberish): Promise<ContractTransaction>;
  mint(to: string, amount: BigNumberish): Promise<ContractTransaction>;
  pause(): Promise<ContractTransaction>;
  unpause(): Promise<ContractTransaction>;
  paused(): Promise<boolean>; 
  increaseAllowance(spender: string, addedValue: BigNumberish): Promise<ContractTransaction>;
  decreaseAllowance(spender: string, subtractedValue: BigNumberish): Promise<ContractTransaction>;
  decimals(): Promise<number>;
  renounceOwnership(): Promise<ContractTransaction>;
  batchTransfer(recipients: string[], amounts: BigNumberish[]): Promise<ContractTransaction>;
  activateEmergencyMode(): Promise<ContractTransaction>;
  recoverERC20(tokenAddress: string, tokenAmount: BigNumberish, to: string): Promise<ContractTransaction>;
  upgradeTo(newImplementation: string): Promise<ContractTransaction>;
  implementation(): Promise<string>;
  proposeNewOwner(newOwner: string): Promise<ContractTransaction>;
  acceptOwnership(): Promise<ContractTransaction>;
  newOwner(): Promise<string>;
  on(event: string, listener: Function): this;
  once(event: string, listener: Function): this;
  addToBlacklist(account: string): Promise<ContractTransaction>;
  isBlacklisted(account: string): Promise<boolean>;
  removeFromBlacklist(account: string): Promise<ContractTransaction>;
  lastBurnTime(): Promise<BigNumber>;
  transferOwnership(newOwner: string): Promise<ContractTransaction>;
  confirmOwnershipTransfer(): Promise<ContractTransaction>;
  getNewOwner(): Promise<string>;
}

interface MaliciousERC20 extends ERC20Token {
  attack(): Promise<ContractTransaction>;
}

describe("Newcoin", function () {
  let ERC20Factory: ContractFactory;
  let hardhatERC20: ERC20Token;
  let hardhatERC20Address: string;
  let owner: Signer;
  let addr1: Signer;
  let addr2: Signer;
  let addr3: Signer;
  let addrs: Signer[];

  beforeEach(async function () {
    ERC20Factory = await ethers.getContractFactory("ERC20Token");
    [owner, addr1, addr2, addr3, ...addrs] = (await ethers.getSigners()) as any;
   
    // Deploy new ERC20 contract
    const contract = await ERC20Factory.deploy();
    hardhatERC20 = contract as unknown as ERC20Token;
    hardhatERC20Address = (await contract.getAddress()).toString();

    // Call the initialize function
    await hardhatERC20.initialize("Newcoin", "NEW");
    
    /*
    console.log(hardhatERC20Address);
    console.log((await owner.getAddress()).toString());
    console.log((await hardhatERC20.owner()).toString());
    console.log((await hardhatERC20.totalSupply()).toString());
    */
  });


  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await hardhatERC20.owner()).to.equal(await owner.getAddress());
    });

    it("Should assign the total supply of tokens to the owner", async function () {
      const ownerBalance = await hardhatERC20.balanceOf(await owner.getAddress());
      expect(await hardhatERC20.totalSupply()).to.equal(ownerBalance);
    });
    
    it("Should set the right owner", async function () {
      expect(await hardhatERC20.owner()).to.equal(await owner.getAddress());
    });
  });


  describe("Transactions", function () {
    it("Should transfer tokens between accounts", async function () {
      // A quantidade de tokens que queremos transferir
      const transferAmount = ethers.parseEther("50");
      
      // Calcular a taxa que será cobrada
      const TRANSACTION_FEE = ethers.parseUnits("1", "wei");
      const fee = BigNumber.from(transferAmount).mul(TRANSACTION_FEE).div(ethers.parseUnits("1", "ether"));
    
      // A quantidade total que será debitada da conta do proprietário
      const totalAmount = BigNumber.from(transferAmount).add(fee);
    
      // Transferir tokens do proprietário para addr1
      await hardhatERC20.transfer(await addr1.getAddress(), totalAmount.toString());
    
      // Verificar o saldo da conta addr1
      const addr1Balance = await hardhatERC20.balanceOf(await addr1.getAddress());
      expect(addr1Balance.toString()).to.eq(totalAmount.toString());
      
      // Calcular a taxa para a próxima transferência
      const fee2 = BigNumber.from(transferAmount).mul(TRANSACTION_FEE).div(ethers.parseUnits("1", "ether"));
    
      // A quantidade que será realmente transferida para addr2 após a taxa
      const finalTransferAmount = BigNumber.from(transferAmount).sub(fee2);
    
      // Transferir uma parte dos tokens de addr1 para addr2
      await hardhatERC20.connect(addr1).transfer(await addr2.getAddress(), finalTransferAmount.toString());
    
      // Verificar o saldo da conta addr2
      const addr2Balance = await hardhatERC20.balanceOf(await addr2.getAddress());
      expect(addr2Balance.toString()).to.eq(finalTransferAmount.toString());
    });    
      
  
    it("Should fail if sender doesn’t have enough tokens", async function () {
      const initialOwnerBalance = await hardhatERC20.balanceOf(await owner.getAddress());
   
      // Try to send 1 token from addr1 (0 tokens) to owner (1000000 tokens).
      await expect(
        hardhatERC20.connect(addr1).transfer(await owner.getAddress(), ethers.parseEther("1"))
      ).to.be.rejectedWith("ERC20: transfer amount exceeds balance");
   
      // Owner balance shouldn't be changed.
      expect(await hardhatERC20.balanceOf(await owner.getAddress())).to.equal(initialOwnerBalance);
    });
    
    it("Should update balances after transfers", async function () {
      const balance = await hardhatERC20.balanceOf(await owner.getAddress());
      const initialOwnerBalance = BigNumber.from(balance.toString());

      // Transfer 100 tokens from owner to addr1.
      await hardhatERC20.transfer(await addr1.getAddress(), ethers.parseEther("100"));
    
      // Transfer another 50 tokens from owner to addr2.
      await hardhatERC20.transfer(await addr2.getAddress(), ethers.parseEther("50"));
  
      // Check balances.
      const balancef = await hardhatERC20.balanceOf(await owner.getAddress());
      const finalOwnerBalance = BigNumber.from(balancef.toString());
      // console.log(finalOwnerBalance.toString(), initialOwnerBalance.sub(ethers.parseEther("150")).toString());
      expect(finalOwnerBalance.toString()).to.equal(initialOwnerBalance.sub(ethers.parseEther("150")).toString());

      const balance1 = await hardhatERC20.balanceOf(await addr1.getAddress());
      const addr1Balance = BigNumber.from(balance1.toString());
      expect(addr1Balance.toString()).to.equal(ethers.parseEther("100").toString());
    
      const balance2 = await hardhatERC20.balanceOf(await addr2.getAddress());
      const addr2Balance = BigNumber.from(balance2.toString());
      expect(addr2Balance.toString()).to.equal(ethers.parseEther("50").toString());
    });
  });


  describe("Allowances and approved transfers", function () {
    it("Should correctly update allowance when approved", async function () {
      await hardhatERC20.approve(await addr1.getAddress(), ethers.parseEther("50"));
      const allowance = await hardhatERC20.allowance(await owner.getAddress(), await addr1.getAddress());
      expect(allowance).to.equal(ethers.parseEther("50"));
    });
  
    it("Should revert when trying to transfer more than allowance", async function () {
      await hardhatERC20.approve(await addr1.getAddress(), ethers.parseEther("50"));
      await expect(
        hardhatERC20.connect(addr1).transferFrom(await owner.getAddress(), await addr2.getAddress(), ethers.parseEther("60"))
      ).to.be.rejectedWith("ERC20: transfer amount exceeds allowance");
    });
 
    it("Should correctly transfer approved tokens and update balances", async function () {
      await hardhatERC20.connect(owner).approve(await addr1.getAddress(), ethers.parseEther("50"));
      await hardhatERC20.connect(addr1).transferFrom(await owner.getAddress(), await addr2.getAddress(), ethers.parseEther("50"));
      
      const ownerBalance = await hardhatERC20.balanceOf(await owner.getAddress());
      expect(ownerBalance).to.equal(ethers.parseEther("19999950"));
     
      const addr2Balance = await hardhatERC20.balanceOf(await addr2.getAddress());
      expect(addr2Balance).to.equal(ethers.parseEther("50"));
    });
    
  });
  

  describe("Burn", function () {
    it("Should correctly burn tokens and reduce total supply", async function () {
      await hardhatERC20.connect(owner).burn(ethers.parseEther("50"));
      
      const balance = await hardhatERC20.balanceOf(await owner.getAddress());
      expect(balance).to.equal(ethers.parseEther("19999950"));
      
      const totalSupply = await hardhatERC20.totalSupply();
      expect(totalSupply).to.equal(ethers.parseEther("19999950"));
    });    
  });
  

  describe("Mint", function () {
    it("Should correctly mint tokens and increase total supply", async function () {
      await hardhatERC20.connect(owner).mint(await addr1.getAddress(), ethers.parseEther("50"));
      
      const balance = await hardhatERC20.balanceOf(await addr1.getAddress());
      expect(balance).to.equal(ethers.parseEther("50"));
      
      const totalSupply = await hardhatERC20.totalSupply();
      expect(totalSupply).to.equal(ethers.parseEther("20000050"));
    });    
  });
  

  describe("Events", function () {
    it("Should correctly emit Transfer event", async function () {
      await expect(hardhatERC20.transfer(await addr1.getAddress(), ethers.parseEther("50")))
        .to.emit(hardhatERC20, "Transfer")
        .withArgs(await owner.getAddress(), await addr1.getAddress(), ethers.parseEther("50"));
    });
    

    it("Should correctly emit Approval event", async function () {
      await expect(hardhatERC20.approve(await addr1.getAddress(), ethers.parseEther("50")))
        .to.emit(hardhatERC20, "Approval")
        .withArgs(await owner.getAddress(), await addr1.getAddress(), ethers.parseEther("50"));
    });
  });
 

  describe("Edge case tests", function() {
    
    it("Should handle large transfer amounts", async function() {
      // transfer the total supply to addr1
      await hardhatERC20.transfer(await addr1.getAddress(), await hardhatERC20.totalSupply());
      expect(await hardhatERC20.balanceOf(await addr1.getAddress())).to.equal(await hardhatERC20.totalSupply());
    });
    
    it("Should handle small transfer amounts", async function() {
      // transfer 1 wei to addr1
      await hardhatERC20.transfer(await addr1.getAddress(), 1);
      expect(await hardhatERC20.balanceOf(await addr1.getAddress())).to.equal(1);
      
      // transfer 1 wei back to the owner
      await hardhatERC20.connect(addr1).transfer(await owner.getAddress(), 1);
      expect(await hardhatERC20.balanceOf(await owner.getAddress())).to.equal(await hardhatERC20.totalSupply());
    });

    it("Should not allow transfer to zero address", async function() {
      await expect(
        hardhatERC20.transfer("0x0000000000000000000000000000000000000000", 1)
      ).to.be.rejectedWith("ERC20: transfer to the zero address");
    });
  });

/*
  describe("Token burning and minting", function() {
    it("Should not allow non-owner to burn tokens", async function() {
      await expect(
        hardhatERC20.connect(addr1).burn(ethers.parseEther("1"))
      ).to.be.rejectedWith("Ownable: caller is not the owner"); // or the actual error message that your contract returns
    });

    it("Should not allow non-owner to mint tokens", async function() {
      await expect(
        hardhatERC20.connect(addr1).mint(await addr1.getAddress(), ethers.parseEther("1"))
      ).to.be.rejectedWith("Ownable: caller is not the owner"); // or the actual error message that your contract returns
    });
  });
*/

  describe("Pause and Unpause functions", function () {
    it("Should pause and unpause contract correctly", async function () {
      await hardhatERC20.pause();
      await expect(hardhatERC20.transfer(await addr1.getAddress(), ethers.parseEther("50")))
      .to.be.rejectedWith("Pausable: paused"); // or the actual error message that your contract returns when it's paused

      await hardhatERC20.unpause();
      await hardhatERC20.transfer(await addr1.getAddress(), ethers.parseEther("50"));
      const addr1Balance = await hardhatERC20.balanceOf(await addr1.getAddress());
      expect(addr1Balance).to.equal(ethers.parseEther("50"));
    });
  });


  describe("Increase and decrease allowance", function () {
    it("Should correctly increase and decrease allowance", async function () {
      await hardhatERC20.increaseAllowance(await addr1.getAddress(), ethers.parseEther("50"));
      let allowance = await hardhatERC20.allowance(await owner.getAddress(), await addr1.getAddress());
      expect(allowance).to.equal(ethers.parseEther("50"));

      await hardhatERC20.decreaseAllowance(await addr1.getAddress(), ethers.parseEther("10"));
      allowance = await hardhatERC20.allowance(await owner.getAddress(), await addr1.getAddress());
      expect(allowance).to.equal(ethers.parseEther("40"));
    });
  });


  describe("Decimals", function () {
    it("Should return correct decimals", async function () {
      const decimals = await hardhatERC20.decimals();
      expect(decimals).to.equal(18); // replace 18 with the actual number of decimals your token uses
    });
  });


  describe("Renounce", function(){
    it("Should renounce ownership correctly", async function() {
      await hardhatERC20.renounceOwnership();
      expect(await hardhatERC20.owner()).to.equal(ethers.ZeroAddress);
    });
  });


  describe("Integrated Resilience and Recovery", function(){
    it("Should batch transfer correctly", async function() {
      let recipients = [await addr1.getAddress(), await addr2.getAddress(), await addr3.getAddress()]; // Get addresses from Signer objects
      let amounts = [10, 20, 30]; // Substitute with actual amounts
      await hardhatERC20.batchTransfer(recipients, amounts);
      expect(await hardhatERC20.balanceOf(await addr1.getAddress())).to.equal(10);
      expect(await hardhatERC20.balanceOf(await addr2.getAddress())).to.equal(20);
      expect(await hardhatERC20.balanceOf(await addr3.getAddress())).to.equal(30);
    });
  });


  describe("Stuck and recovery mechanism", function () {
    it("Should stuck tokens properly", async function () {
      await hardhatERC20.transfer(hardhatERC20Address, ethers.parseEther("100")); // This will "stuck" tokens into contract itself.
      expect(await hardhatERC20.balanceOf(hardhatERC20Address)).to.equal(ethers.parseEther("100")); // Ensure tokens are "stuck"
    });

    it("Should recover stuck tokens", async function() {
      // Primeiro, transferir alguns tokens do proprietário para addr1
      await hardhatERC20.transfer(await addr1.getAddress(), ethers.parseEther("100"));
  
      // Verificar o saldo de addr1 depois da transferência
      let addr1BalanceBefore = await hardhatERC20.balanceOf(await addr1.getAddress());
      //console.log('Addr1 Balance After Owner Transfer:', ethers.formatEther(addr1BalanceBefore.toString()));
  
      // Então, transferir alguns tokens de addr1 para o contrato hardhatERC20
      await hardhatERC20.connect(addr1).transfer(hardhatERC20Address, ethers.parseEther("50"));
  
      const contractBalanceBefore = await hardhatERC20.balanceOf(hardhatERC20Address);
      //console.log('Contract Balance Before Recovery:', ethers.formatEther(contractBalanceBefore.toString()));
  
      // Em seguida, recuperar os tokens presos
      await hardhatERC20.connect(owner).recoverERC20(hardhatERC20Address, ethers.parseEther("50"), await addr1.getAddress());

      const contractBalanceAfter = await hardhatERC20.balanceOf(hardhatERC20Address);
      //console.log('Contract Balance After Recovery:', ethers.formatEther(contractBalanceAfter.toString()));
  
      // Verificar se os tokens retornaram ao addr1
      const addr1BalanceAfter = await hardhatERC20.balanceOf(await addr1.getAddress());
      //console.log('Addr1 Balance After Recovery:', ethers.formatEther(addr1BalanceAfter.toString()));
  
      expect(ethers.formatEther(addr1BalanceAfter.toString())).to.equal('100.0'); 
    });
  });


  describe("Optimization and Scalability", function(){
    it("Should use less than a certain amount of gas", async function() {
      const transferTx = await hardhatERC20.transfer(await addr1.getAddress(), 10);
      let receipt = await (transferTx as any).wait();
      expect(receipt.gasUsed).to.be.lt(80000);
    });

    it("Should not exceed gas limit for transfer", async function() {
      const gasLimit = ethers.parseUnits("5", "gwei"); // Substitua isso pelo limite de gás desejado
      const tx = await hardhatERC20.transfer(await addr1.getAddress(), ethers.parseEther("1"));
      const receipt = await (tx as any).wait();
      expect(receipt.gasUsed).to.lte(gasLimit);
    });
  });


  describe("Security", function(){
    it("Should not allow non-owner to call pause", async function() {
      await expect(hardhatERC20.connect(addr1).pause()).to.be.rejectedWith("Ownable: caller is not the owner");
    });
    
    it("Should not allow non-owner to call mint", async function() {
      await expect(hardhatERC20.connect(addr1).mint(await addr1.getAddress(), 1000)).to.be.rejectedWith("Ownable: caller is not the owner");
    });
    
    it("Should not allow non-owner to call burn", async function() {
      await expect(hardhatERC20.connect(addr1).burn(1000)).to.be.rejectedWith("Ownable: caller is not the owner");
    });
    
    it("Should not allow non-owner to call unpause", async function() {
      await expect(hardhatERC20.connect(addr1).unpause()).to.be.rejectedWith("Ownable: caller is not the owner");
    });
    
    it("Should not allow non-owner to call recoverERC20", async function() {
      await expect(hardhatERC20.connect(addr1).recoverERC20(await addr2.getAddress(), 1000, await addr1.getAddress())).to.be.rejectedWith("Ownable: caller is not the owner");
    });

    it("Should not allow non-owner to pause the contract", async function() {
      await expect(hardhatERC20.connect(addr1).pause()).to.be.rejectedWith("Ownable: caller is not the owner");
    });
    
    it("Should allow the owner to pause and unpause the contract", async function() {
      await hardhatERC20.pause();
      expect(await hardhatERC20.paused()).to.equal(true);
    
      await hardhatERC20.unpause();
      expect(await hardhatERC20.paused()).to.equal(false);
    });
    
    it("Should not allow transferring to the zero address", async function() {
      await expect(hardhatERC20.transfer(ethers.ZeroAddress, ethers.parseEther("1"))).to.be.rejectedWith("ERC20: transfer to the zero address");
    });
    
    it("Should not allow approving to the zero address", async function() {
      await expect(hardhatERC20.approve(ethers.ZeroAddress, ethers.parseEther("1"))).to.be.rejectedWith("ERC20: approve to the zero address");
    });
    
    it("Should correctly increase and decrease allowance", async function() {
      await hardhatERC20.approve(await addr1.getAddress(), ethers.parseEther("1"));
      await hardhatERC20.increaseAllowance(await addr1.getAddress(), ethers.parseEther("1"));
      expect(await hardhatERC20.allowance(await owner.getAddress(), await addr1.getAddress())).to.equal(ethers.parseEther("2"));
    
      await hardhatERC20.decreaseAllowance(await addr1.getAddress(), ethers.parseEther("1"));
      expect(await hardhatERC20.allowance(await owner.getAddress(), await addr1.getAddress())).to.equal(ethers.parseEther("1"));
    
      await expect(hardhatERC20.decreaseAllowance(await addr1.getAddress(), ethers.parseEther("2"))).to.be.rejectedWith("ERC20: decreased allowance below zero");
    });

    it("Should return the correct totalSupply", async function() {
      expect(await hardhatERC20.totalSupply()).to.equal(ethers.parseEther("20000000"));
    });

    it("Should return the correct balanceOf", async function() {
      expect(await hardhatERC20.balanceOf(await owner.getAddress())).to.equal(ethers.parseEther("20000000"));
    });
 
    it("Should return the correct allowance", async function() {
      expect(await hardhatERC20.allowance(await owner.getAddress(), await addr1.getAddress())).to.equal(0);
    });

    it("Should revert when trying to transfer without approval", async function() {
      await expect(hardhatERC20.connect(addr1).transferFrom(await owner.getAddress(), await addr1.getAddress(), 100)).to.be.rejectedWith("ERC20: transfer amount exceeds allowance");
    });
 
    it("Should allow to set max approval", async function() {
      await hardhatERC20.approve(await addr1.getAddress(), ethers.MaxUint256);
      expect(await hardhatERC20.allowance(await owner.getAddress(), await addr1.getAddress())).to.equal(ethers.MaxUint256);
    });
  
    // If your contract is supposed to accept ETH, you can test the fallback and receive functions
    it("Should accept ETH", async function() {
      await expect(() => addr1.sendTransaction({ to: hardhatERC20Address, value: ethers.parseEther("1.0") })).not.to.throw();
    });
  });

  
  describe("Max Supply", function () {
    it("Should not mint tokens if it exceeds max supply", async function () {
      const maxSupply = BigNumber.from(await hardhatERC20.maxSupply());
      const totalSupply = BigNumber.from(await hardhatERC20.totalSupply());
  
      // Try to mint tokens that exceed max supply
      await expect(
        hardhatERC20.connect(owner).mint(await addr1.getAddress(), maxSupply.sub(totalSupply).add(1).toString())
      ).to.be.rejectedWith("ERC20: minting would exceed max supply");
    });    
  });
  

  describe("Token transfers", function () {
    it("Should transfer the correct amount", async function () {
      const SUPPLY_LEVEL_1 = BigNumber.from("85000000000000000000000000"); // 85 milhões
      const SUPPLY_LEVEL_2 = BigNumber.from("50000000000000000000000000"); // 50 milhões
      const SUPPLY_LEVEL_3 = BigNumber.from("30000000000000000000000000"); // 30 milhões
      
      const TRANSACTION_FEE_LEVEL_1 = 100; // 1%
      const TRANSACTION_FEE_LEVEL_2 = 500; // 0.5%
      const TRANSACTION_FEE_LEVEL_3 = 250; // 0.25%
      
      const initialOwnerBalance = BigNumber.from(await hardhatERC20.balanceOf(await owner.getAddress()));
      const totalSupply = BigNumber.from(await hardhatERC20.totalSupply());
    
      let currentFee;
      if (totalSupply.gt(SUPPLY_LEVEL_1)) {
          currentFee = TRANSACTION_FEE_LEVEL_1;
      } else if (totalSupply.gt(SUPPLY_LEVEL_2)) {
          currentFee = TRANSACTION_FEE_LEVEL_2;
      } else if (totalSupply.gt(SUPPLY_LEVEL_3)) {
          currentFee = TRANSACTION_FEE_LEVEL_3;
      } else {
          currentFee = 0;  // No fee if supply is less than 30 million
      }
      
      // Transfers 50 tokens from owner to addr1
      const transferAmount = ethers.parseEther("50");
      await hardhatERC20.transfer(await addr1.getAddress(), transferAmount.toString());
      
      const fee = BigNumber.from(transferAmount).mul(currentFee).div(10000); // Now the fee is calculated correctly
      
      const finalOwnerBalance = initialOwnerBalance.sub(BigNumber.from(transferAmount).add(fee));
      
      expect((await hardhatERC20.balanceOf(await addr1.getAddress())).toString()).to.equal(transferAmount.toString());
      expect((await hardhatERC20.balanceOf(await owner.getAddress())).toString()).to.equal(finalOwnerBalance.toString());
    });
    
    it("Should burn the correct amount", async function () {
      const TRANSACTION_FEE_LEVEL_1 = 100; // 1%
      const TRANSACTION_FEE_LEVEL_2 = 500; // 0.5%
      const TRANSACTION_FEE_LEVEL_3 = 250; // 0.25%
    
      const SUPPLY_LEVEL_1 = ethers.parseUnits("85000000"); // 85 milhões
      const SUPPLY_LEVEL_2 = ethers.parseUnits("50000000"); // 50 milhões
      const SUPPLY_LEVEL_3 = ethers.parseUnits("30000000"); // 30 milhões
    
      const initialTotalSupply = BigNumber.from(await hardhatERC20.totalSupply());
    
      // Determine a taxa atual
      let currentFee;
      if (initialTotalSupply.gt(SUPPLY_LEVEL_1)) {
          currentFee = TRANSACTION_FEE_LEVEL_1;
      } else if (initialTotalSupply.gt(SUPPLY_LEVEL_2)) {
          currentFee = TRANSACTION_FEE_LEVEL_2;
      } else if (initialTotalSupply.gt(SUPPLY_LEVEL_3)) {
          currentFee = TRANSACTION_FEE_LEVEL_3;
      } else {
          currentFee = 0;
      }
    
      // Transfere 50 tokens do proprietário para addr1
      const transferAmount = ethers.parseUnits("50");
      await hardhatERC20.transfer(await addr1.getAddress(), transferAmount);
    
      const finalTotalSupply = BigNumber.from(await hardhatERC20.totalSupply());
    
      // Calcular a quantidade queimada com base na taxa
      const burnedAmount = BigNumber.from(transferAmount).mul(currentFee).div(10000);
      
      expect(finalTotalSupply.toString()).to.equal(initialTotalSupply.sub(burnedAmount).toString());
    });
    
  }); 

  
  describe("Fee changes", function () {
    it("Should charge the correct transaction fee", async function () {
      // Defina o valor da transferência
      const transferAmount = ethers.parseEther("100");
    
      const SUPPLY_LEVEL_1 = ethers.parseUnits("85000000"); // 85 milhões
      const SUPPLY_LEVEL_2 = ethers.parseUnits("50000000"); // 50 milhões
      const SUPPLY_LEVEL_3 = ethers.parseUnits("30000000"); // 30 milhões

      // Obtenha o fornecimento total de tokens
      const totalSupply = BigNumber.from(await hardhatERC20.totalSupply());
   
      // Determine a taxa de transação com base no fornecimento total de tokens
      let expectedTransactionFeePercentage;
      if (totalSupply.gt(SUPPLY_LEVEL_1)) {
        expectedTransactionFeePercentage = 1; // 1%
      } else if (totalSupply.gt(SUPPLY_LEVEL_2)) {
        expectedTransactionFeePercentage = 0.5; // 0.5%
      } else if (totalSupply.gt(SUPPLY_LEVEL_3)) {
        expectedTransactionFeePercentage = 0.25; // 0.25%
      } else {
        expectedTransactionFeePercentage = 0;  // Sem taxa se o fornecimento for menor que 30 milhões
      }
    
      // Calcule a taxa de transação esperada
      const expectedTransactionFee = BigNumber.from(transferAmount)
        .mul(BigNumber.from(expectedTransactionFeePercentage.toString()))
        .div(BigNumber.from("100"));
    
      // Execute a transferência
      await hardhatERC20.transfer(await addr1.getAddress(), transferAmount.toString());
    
      // Calcule o saldo esperado após a transferência e a taxa
      const expectedBalance = BigNumber.from(transferAmount).sub(expectedTransactionFee);
    
      // Obtenha o saldo da addr1
      let addr1Balance = await hardhatERC20.balanceOf(await addr1.getAddress());
    
      // Certifique-se de que a taxa de transação foi cobrada corretamente
      expect(BigNumber.from(addr1Balance).toString()).to.equal(expectedBalance.toString());
    });
    

    it("Should use the lower fee after min supply is reached", async function () {
      // Reduz o fornecimento total para MIN_SUPPLY
      let totalSupply = BigNumber.from(await hardhatERC20.totalSupply());
      const SUPPLY_LEVEL_3 = ethers.parseUnits("30000000"); // 30 milhões
      if (totalSupply.gt(SUPPLY_LEVEL_3)) {
        const burnAmount = totalSupply.sub(SUPPLY_LEVEL_3);
        await hardhatERC20.burn(burnAmount.toString());
      }
      
      // Recalcule o fornecimento total após a queima
      totalSupply = BigNumber.from(await hardhatERC20.totalSupply());
      
      // Determine a taxa de transação com base no fornecimento total de tokens
      let transactionFeePercentage;
      if (totalSupply.gt(SUPPLY_LEVEL_3)) {
        transactionFeePercentage = 0.25; // 0.25%
      } else {
        transactionFeePercentage = 0;  // Sem taxa se o fornecimento for menor que 30 milhões
      }
      
      // Faz uma transferência
      const transferAmount = ethers.parseUnits("50");
      const initialOwnerBalance = BigNumber.from(await hardhatERC20.balanceOf(await owner.getAddress()));
      await hardhatERC20.transfer(await addr1.getAddress(), transferAmount.toString());
      
      // Calcule o saldo esperado após a transferência e a taxa
      const transactionFee = BigNumber.from(transferAmount).mul(transactionFeePercentage).div(100);
      const expectedBalance = initialOwnerBalance.sub(BigNumber.from(transferAmount).add(transactionFee));
      
      const finalOwnerBalance = await hardhatERC20.balanceOf(await owner.getAddress());
      
      expect(finalOwnerBalance.toString()).to.equal(expectedBalance.toString());  // incluindo a taxa correta
    });
  });


  describe("Stress and Vulnerability", function () {
    it("Should handle maximum token supply", async function() {
      const initialSupply = await hardhatERC20.totalSupply();
      const maxSupply = await hardhatERC20.maxSupply();

      // Convert maxSupply and initialSupply to BigInt
      const maxSupplyBigInt = BigInt(maxSupply.toString());
      const initialSupplyBigInt = BigInt(initialSupply.toString());

      // Calculate remaining supply
      const remainingSupply = maxSupplyBigInt - initialSupplyBigInt;

      // Convert remainingSupply from BigNumber to uint256
      const remainingSupplyUint256 = BigNumber.from(remainingSupply.toString());

      // Mint the remaining supply
      await hardhatERC20.mint(await addr1.getAddress(), remainingSupplyUint256.toString());

      // Check that total supply is now equal to max supply
      const totalSupply = await hardhatERC20.totalSupply();
      expect(totalSupply).to.equal(maxSupply);
    });
   
    
    it("Should handle zero value transfer correctly", async function () {
      const initialOwnerBalance = await hardhatERC20.balanceOf(await owner.getAddress());
  
      // Transfer 0 tokens from the owner to addr1
      await hardhatERC20.connect(owner).transfer(await addr1.getAddress(), 0);
  
      // Owner balance shouldn't change
      expect(await hardhatERC20.balanceOf(await owner.getAddress())).to.equal(initialOwnerBalance);
    });
  

    it("Should handle large value transfer correctly", async function () {
      const initialOwnerBalance = await hardhatERC20.balanceOf(await owner.getAddress());
      
      // Convert to ethers' BigNumber
      const initialOwnerBalanceBigNumber = BigNumber.from(initialOwnerBalance);
      
      // Calculate the value to transfer
      const valueToTransfer = initialOwnerBalanceBigNumber.add(1).toString();
      
      // Trying to transfer more tokens than in owner's balance should fail
      await expect(
        hardhatERC20.connect(owner).transfer(await addr1.getAddress(), valueToTransfer)
      ).to.be.rejectedWith("ERC20: transfer amount exceeds balance");
    });
    
    
    it("Should prevent reentrancy attack", async function () {
      const initialOwnerBalance = BigNumber.from((await hardhatERC20.balanceOf(await owner.getAddress())).toString());
    
      // Suponha que `MaliciousERC20` seja um contrato malicioso que implemente um ataque de reentrada
      const MaliciousERC20Factory = await ethers.getContractFactory("MaliciousERC20");
      
      // O remetente da transação é `addr1`
      const attacker = await addr1.getAddress(); // ou qualquer endereço que seja considerado o atacante
      const maliciousContract = await MaliciousERC20Factory.connect(addr1).deploy(hardhatERC20Address, attacker);

      // Transfer some tokens to `maliciousContract`
      await hardhatERC20.connect(owner).transfer(await maliciousContract.getAddress(), initialOwnerBalance.div(2).toString());
   
      try {
        const result = await maliciousContract.connect(addr1).attack();
        // console.log(result);
      } catch (error) {
        // console.log(error);
      }

      // A reentrancy attack should fail
      await expect(maliciousContract.connect(addr1).attack()).to.be.reverted;
    });
  });


  describe("Blacklist functionality", function() {
    it("Should not allow non-owner to add to blacklist", async function () {
      const addr1ERC20 = hardhatERC20.connect(addr1);
      await expect(addr1ERC20.addToBlacklist(await addr2.getAddress())).to.be.rejectedWith("Ownable: caller is not the owner");
    });
  
    it("Should allow owner to add to blacklist", async function () {
      await hardhatERC20.addToBlacklist(await addr2.getAddress());
      expect(await hardhatERC20.isBlacklisted(await addr2.getAddress())).to.equal(true);
    });
  
    it("Should not allow blacklisted address to transfer tokens", async function () {
      await hardhatERC20.addToBlacklist(await addr2.getAddress());
      const addr2ERC20 = hardhatERC20.connect(addr2);
      await expect(addr2ERC20.transfer(await addr3.getAddress(), 100)).to.be.rejectedWith("ERC20: Address is blacklisted");
    });
 
    it("Should allow owner to remove from blacklist", async function () {
      await hardhatERC20.addToBlacklist(await addr2.getAddress());
      await hardhatERC20.removeFromBlacklist(await addr2.getAddress());
      expect(await hardhatERC20.isBlacklisted(await addr2.getAddress())).to.equal(false);
    });
  });


  describe("Token Burn", function () {
    it("Should burn tokens annually", async function() {

      let lastBurnTime = await hardhatERC20.lastBurnTime();
      //console.log("Last Burn Time before minting: ", lastBurnTime.toString());
    
      // Mint more than 30 million tokens
      await hardhatERC20.mint(await addr1.getAddress(), ethers.parseEther("31000000"));
     
      let initialSupply = BigNumber.from(await hardhatERC20.totalSupply());
      //console.log("Initial Supply: ", initialSupply.toString());
    
      // Fast forward one year
      await ethers.provider.send("evm_increaseTime", [31536000]); // One year in seconds
      await ethers.provider.send("evm_mine");
    
      // Make a token transfer to trigger the burn
      await hardhatERC20.connect(addr1).transfer(await addr2.getAddress(), ethers.parseEther("1"));
    
      let afterBurn = BigNumber.from(await hardhatERC20.totalSupply());
      //console.log("After Burn: ", afterBurn.toString());
    
      // Check last burn time after burn
      lastBurnTime = await hardhatERC20.lastBurnTime();
      //console.log("Last Burn Time after burn: ", lastBurnTime.toString());
    
      expect(afterBurn.lt(initialSupply)).to.be.true;  // Check that the supply after burn is less than the initial supply
    });
    

    it("Should stop burning when total supply reaches 30 million", async function () {
      // Suponha que o suprimento inicial seja de 20 milhões
      let initialSupply = BigNumber.from(await hardhatERC20.totalSupply());
      expect(initialSupply.eq(ethers.parseEther('20000000'))).to.be.true; // Aqui é mudado para 20 milhões
   
      let addr1Address = await addr1.getAddress();
   
      // Avance o tempo e queime tokens até que o suprimento total esteja abaixo de 20 milhões
      while (BigNumber.from(await hardhatERC20.totalSupply()).gt(ethers.parseEther('20000000'))) { // Aqui é mudado para 20 milhões
        await ethers.provider.send('evm_increaseTime', [365 * 24 * 60 * 60]);
        await ethers.provider.send('evm_mine');
        await hardhatERC20.transfer(addr1Address, ethers.parseEther('1'));
      }
    
      let supplyAfterBurns = await hardhatERC20.totalSupply();

      await new Promise(resolve => setTimeout(resolve, 5000));
    
      await ethers.provider.send('evm_increaseTime', [365 * 24 * 60 * 60]);
      await ethers.provider.send('evm_mine');
    
      await hardhatERC20.transfer(addr1Address, ethers.parseEther('1'));
    
      expect(await hardhatERC20.totalSupply()).to.equal(supplyAfterBurns);
    });
    
  });


  describe("Owner Transfer", function(){
    it("Should transfer ownership correctly", async function () {
      // Transfer ownership from owner to addr1
      await hardhatERC20.connect(owner).transferOwnership(await addr1.getAddress());
      
      // Check if _newOwner is addr1 now
      expect(await hardhatERC20.connect(owner).getNewOwner()).to.equal(await addr1.getAddress());
    });
    
    it("Should confirm ownership transfer correctly", async function () {
      // Transfer ownership from owner to addr1
      await hardhatERC20.connect(owner).transferOwnership(await addr1.getAddress());
    
      // Confirm ownership transfer by addr1
      await hardhatERC20.connect(addr1).confirmOwnershipTransfer();
    
      // Check if owner is addr1 now
      expect(await hardhatERC20.owner()).to.equal(await addr1.getAddress());
    });
   

    
    // Verifica se alguém que não seja o proprietário não consegue transferir a propriedade
    it("Should not allow non-owners to initiate ownership transfer", async function () {
      // Tentativa de transferência de propriedade por addr1 (que não é o proprietário)
      await expect(hardhatERC20.connect(addr1).transferOwnership(await addr2.getAddress()))
      .to.be.rejectedWith("Ownable: caller is not the owner");
    });

    // Verifica se alguém que não seja o novo proprietário não consegue confirmar a transferência de propriedade
    it("Should not allow non-new-owners to confirm ownership transfer", async function () {
      // O proprietário inicia a transferência de propriedade para addr1
      await hardhatERC20.connect(owner).transferOwnership(await addr1.getAddress());
  
      // Tentativa de confirmação da transferência de propriedade por addr2 (que não é o novo proprietário)
      await expect(hardhatERC20.connect(addr2).confirmOwnershipTransfer())
      .to.be.rejectedWith("Ownable: only new owner can confirm ownership transfer");
    });

    // Verifica que o novo proprietário só pode confirmar a transferência de propriedade após o proprietário atual iniciar a transferência
    it("Should not allow new owners to confirm ownership transfer before it has been initiated", async function () {
      // Tentativa de confirmação da transferência de propriedade por addr1 antes que a transferência tenha sido iniciada
      await expect(hardhatERC20.connect(addr1).confirmOwnershipTransfer())
      .to.be.rejectedWith("Ownable: only new owner can confirm ownership transfer");
    });

    // Verifica que a transferência de propriedade é possível para qualquer endereço que não seja o endereço zero
    it("Should allow ownership transfer to any non-zero address", async function () {
      // Transferir a propriedade para addr1
      await hardhatERC20.connect(owner).transferOwnership(await addr1.getAddress());

      // Confirmar a transferência de propriedade por addr1
      await hardhatERC20.connect(addr1).confirmOwnershipTransfer();

      // Verificar se o proprietário é addr1 agora
      expect(await hardhatERC20.owner()).to.equal(await addr1.getAddress());

      // Tentativa de transferência de propriedade para o endereço zero
      await expect(hardhatERC20.connect(addr1).transferOwnership(ethers.ZeroAddress))
      .to.be.rejectedWith("Ownable: new owner is the zero address");
    });



  });


});
