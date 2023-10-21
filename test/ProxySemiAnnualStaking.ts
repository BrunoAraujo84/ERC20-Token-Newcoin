import { use, expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract, ContractFactory, Signer } from "ethers";
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { ERC20Token, ERC20SemiAnnualStaking, ProxySemiAnnualStaking } from "../typechain-types";
import { futimes } from "fs";

describe("Proxy Semi-Annual Staking", function () {
  let erc20SemiAnnualStaking: ERC20SemiAnnualStaking;
  let proxy: ProxySemiAnnualStaking;
  let ERC20TokenFactory: ContractFactory;
  let erc20Token: ERC20Token;
  let owner: Signer;
  let addr1: Signer;
  let addr2: Signer;
  let addrs: Signer[];
  let newImplementationAddress: string; // Defina o endereço da nova implementação aqui.
  let expectedImplementationHash: string;

  // Defina o atraso da mudança de implementação aqui.
  const IMPLEMENTATION_CHANGE_DELAY = 2 * 24 * 60 * 60; // 2 dias em segundos

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    // Deploy ERC20Token contract
    ERC20TokenFactory = await ethers.getContractFactory("ERC20Token");
    erc20Token = (await ERC20TokenFactory.deploy()) as ERC20Token;
    await erc20Token.initialize("Newcoin", "NEW");

    // Implante o contrato ERC20SemiAnnualStaking primeiro
    const ERC20SemiAnnualStakingFactory = await ethers.getContractFactory("ERC20SemiAnnualStaking");
    erc20SemiAnnualStaking = await ERC20SemiAnnualStakingFactory.deploy(await erc20Token.getAddress());

    const ERC20SemiAnnualStakingFactoryNew = await ethers.getContractFactory("ERC20SemiAnnualStaking");
    const newImplementation = await ERC20SemiAnnualStakingFactoryNew.deploy(await erc20Token.getAddress());
    newImplementationAddress = await newImplementation.getAddress();

    // Obtenha o código de runtime da implementação
    const implementationCode = await ethers.provider.getCode(newImplementationAddress);

    // Calcule o hash do código da implementação
    expectedImplementationHash = ethers.keccak256(implementationCode);

    // Implante o contrato ProxySemiAnnualStaking
    const ProxyFactory = await ethers.getContractFactory("ProxySemiAnnualStaking");
    proxy = await ProxyFactory.deploy(await erc20SemiAnnualStaking.getAddress(), expectedImplementationHash) as ProxySemiAnnualStaking;

  });


  describe("Functions Testing", function(){
    it("Should deploy contract with correct properties", async function () {
      expect(await proxy.stakingImplementation()).to.equal(await erc20SemiAnnualStaking.getAddress());
      expect(await proxy.expectedImplementationHash()).to.equal(expectedImplementationHash);
    });
  
    it("Should request implementation change", async function () {
      // Solicitar uma mudança de implementação e verificar o estado
      await proxy.requestStakingImplementationChange(newImplementationAddress);
      expect(await proxy.pendingImplementation()).to.equal(newImplementationAddress);
      expect(await proxy.pendingImplementationTimestamp()).to.not.equal(0);
    });
  
    it("Should confirm implementation change after delay", async function () {
      // Solicitar a mudança de implementação
      await proxy.requestStakingImplementationChange(newImplementationAddress);
  
      // Avançar o tempo para permitir a confirmação da mudança
      await ethers.provider.send('evm_increaseTime', [IMPLEMENTATION_CHANGE_DELAY]);
      await ethers.provider.send('evm_mine', []);
  
      // Confirmar a mudança de implementação
      await proxy.confirmStakingImplementationChange();
      expect(await proxy.stakingImplementation()).to.equal(newImplementationAddress);
    });

    it("Should rescue Ether", async function () {
      // Enviar Ether para o contrato
      await owner.sendTransaction({ to: await proxy.getAddress(), value: ethers.parseEther("1") });
    
      // Resgatar Ether
      const balanceBefore = await ethers.provider.getBalance(await owner.getAddress());
      await proxy.rescueEther(await owner.getAddress(), ethers.parseEther("1"));
      const balanceAfter = await ethers.provider.getBalance(await owner.getAddress());
    
      // Verificar o equilíbrio aproximado
      const expectedIncrease = ethers.parseEther("1");
      const actualIncrease = BigNumber.from(balanceAfter).sub(balanceBefore);
      const tolerance = ethers.parseEther("0.01"); // Tolerância de 0.01 Ether
    
      expect(actualIncrease.gte(BigNumber.from(expectedIncrease).sub(tolerance))).to.be.true;
      expect(actualIncrease.lte(BigNumber.from(expectedIncrease).add(tolerance))).to.be.true;
    });
    
    it("Should rescue tokens", async function () {
      // Quantidade de tokens para resgatar
      const amountToRescue = ethers.parseUnits("100", 18);
    
      // Aprovar e transferir tokens para o contrato proxy
      await erc20Token.connect(owner).approve(await proxy.getAddress(), amountToRescue);
      await erc20Token.connect(owner).transfer(await proxy.getAddress(), amountToRescue);
    
      // Verificar o saldo do token no contrato proxy
      expect(await erc20Token.balanceOf(await proxy.getAddress())).to.equal(amountToRescue);
    
      // Saldo inicial do owner
      const initialOwnerBalance = await erc20Token.balanceOf(await owner.getAddress());
    
      // Resgatar tokens
      await proxy.rescueTokens(await erc20Token.getAddress(), await owner.getAddress(), amountToRescue);
    
      // Verificar o saldo do token no contrato proxy (deve ser 0)
      expect(await erc20Token.balanceOf(await proxy.getAddress())).to.equal(0);
    
      // Verificar o saldo do token no endereço do owner (deve ter aumentado pela quantidade resgatada)
      expect((await erc20Token.balanceOf(await owner.getAddress())).toString()).to.equal(BigNumber.from(initialOwnerBalance).add(amountToRescue).toString());
    });
    
    it("Should reject implementation change before delay", async function () {
      // Solicitar uma mudança de implementação
      await proxy.requestStakingImplementationChange(await newImplementationAddress);
      
      // Tentar confirmar a mudança antes do tempo de atraso
      await expect(proxy.confirmStakingImplementationChange()).to.be.rejectedWith("Implementation change delay not passed");
      
      // Aguardar o tempo de atraso
      await ethers.provider.send("evm_increaseTime", [IMPLEMENTATION_CHANGE_DELAY]);
      await ethers.provider.send("evm_mine");
    
      // Agora deve ser possível confirmar a mudança
      await proxy.confirmStakingImplementationChange();
    });
   
    it("Should revert if non-owner tries to request implementation change", async function () {
      await expect(proxy.connect(addr1).requestStakingImplementationChange(newImplementationAddress))
        .to.be.rejectedWith("Ownable: caller is not the owner");
    });
    
    it("Should revert if non-owner tries to confirm implementation change", async function () {
      await proxy.requestStakingImplementationChange(newImplementationAddress);
      await expect(proxy.connect(addr1).confirmStakingImplementationChange())
        .to.be.rejectedWith("Ownable: caller is not the owner");
    });
   
    it("Should revert if non-owner tries to rescue tokens", async function () {
      await expect(proxy.connect(addr1).rescueTokens(await erc20Token.getAddress(), await addr1.getAddress(), 1000))
        .to.be.rejectedWith("Ownable: caller is not the owner");
    });
   
    it("Should revert if non-owner tries to rescue Ether", async function () {
      await expect(proxy.connect(addr1).rescueEther(await addr1.getAddress(), ethers.parseEther("1")))
        .to.be.rejectedWith("Ownable: caller is not the owner");
    });

    it("Should revert if code hash does not match expected hash", async function () {
      const fakeAddress = "0x1111111111111111111111111111111111111111";
      await expect(proxy.requestStakingImplementationChange(fakeAddress))
        .to.be.rejectedWith("Implementation code hash does not match expected hash");
    });
   
    it("Should revert if trying to confirm implementation change before delay", async function () {
      await proxy.requestStakingImplementationChange(newImplementationAddress);
      await expect(proxy.confirmStakingImplementationChange())
        .to.be.rejectedWith("Implementation change delay not passed");
    });
    
    it("Should revert if trying to rescue more Ether than balance", async function () {
      await expect(proxy.rescueEther(await owner.getAddress(), ethers.parseEther("10000")))
        .to.be.rejectedWith("Ether transfer failed");
    });
    
    it("Should receive Ether", async function () {
      const balanceBefore = await ethers.provider.getBalance(await proxy.getAddress());
      await owner.sendTransaction({ to: await proxy.getAddress(), value: ethers.parseEther("1") });
      const balanceAfter = await ethers.provider.getBalance(await proxy.getAddress());
      expect(BigNumber.from(balanceAfter).sub(balanceBefore).toString()).to.equal(ethers.parseEther("1").toString());
    });
    
    it("Should emit the correct event when requesting an implementation change", async function () {
      await expect(proxy.requestStakingImplementationChange(newImplementationAddress))
        .to.emit(proxy, "ImplementationChangeRequested")
        .withArgs(newImplementationAddress);
    });
    
    it("Should only allow eligible addresses to request implementation change", async function () {
      // Testar que apenas um endereço elegível (como o proprietário) pode solicitar uma mudança de implementação
      await expect(proxy.connect(addr1).requestStakingImplementationChange(newImplementationAddress))
        .to.be.rejectedWith("Ownable: caller is not the owner");
    });
   
    it("Should handle when there is no pending implementation change", async function () {
      await expect(proxy.confirmStakingImplementationChange()).to.be.rejectedWith("No implementation change requested");
    });
    
    it("Should rescue unsupported tokens", async function () {
      // Criar um token aleatório e enviar para o contrato proxy
      const randomToken = await ERC20TokenFactory.deploy() as ERC20Token;
      await randomToken.initialize("RandomToken", "RND");
      
      const initialOwnerBalance = await randomToken.balanceOf(await owner.getAddress());
      //console.log("Initial owner balance:", initialOwnerBalance.toString());

      const amountToRescue = ethers.parseUnits("100", 18);
      await randomToken.transfer(await proxy.getAddress(), amountToRescue);

      const balanceAfterTransfer = await randomToken.balanceOf(await owner.getAddress());
      //console.log("Owner balance after transfer:", balanceAfterTransfer.toString());

      // Resgatar tokens aleatórios
      await proxy.rescueTokens(await randomToken.getAddress(), await owner.getAddress(), amountToRescue);
  
      const finalOwnerBalance = await randomToken.balanceOf(await owner.getAddress());
      //console.log("Final owner balance:", finalOwnerBalance.toString());

      // Verificar se os tokens foram resgatados
      expect((await randomToken.balanceOf(await owner.getAddress())).toString()).to.equal(BigNumber.from(initialOwnerBalance).toString());
    });
    
    it("Should reject malicious implementation", async function () {
      const maliciousImplementation = await ethers.getContractFactory("MaliciousImplementation");
      const deployedMaliciousImplementation = await maliciousImplementation.deploy();
  
      // Tentativa de configurar a implementação maliciosa deve ser revertida
      await expect(proxy.requestStakingImplementationChange(await deployedMaliciousImplementation.getAddress()))
          .to.be.rejectedWith("Implementation code hash does not match expected hash");
      });
 
  });


  describe ("Contract Version", function(){
    it("Should emit correct event on version change", async function () {
      // Acompanhar o evento ImplementationChangeRequested
      await expect(proxy.requestStakingImplementationChange(newImplementationAddress))
        .to.emit(proxy, 'ImplementationChangeRequested')
        //.withArgs(newImplementationAddress, expectedImplementationHash, await ethers.provider.getBlockNumber());
   
      // Avançar o tempo para o período de atraso
      await network.provider.send("evm_increaseTime", [IMPLEMENTATION_CHANGE_DELAY]);
   
      // Acompanhar o evento ImplementationChangeConfirmed
      await expect(proxy.confirmStakingImplementationChange())
        .to.emit(proxy, 'StakingImplementationChanged')
        //.withArgs(newImplementationAddress, await ethers.provider.getBlockNumber());
    });

    it("Should reject downgrades to previous versions", async function () {
      // Obter endereço de implementação atual
      const currentImplementation = await proxy.stakingImplementation();
    
      // Solicitar mudança de implementação (defina uma nova implementação válida)
      await proxy.requestStakingImplementationChange(newImplementationAddress);
    
      // Avançar o tempo para o período de atraso e confirmar a mudança
      await network.provider.send("evm_increaseTime", [IMPLEMENTATION_CHANGE_DELAY]);
      await proxy.confirmStakingImplementationChange();
    
      const isUsed = await proxy.usedImplementations(currentImplementation);
      // console.log("Is the current implementation marked as used?", isUsed);

      // Tentar mudar para a implementação anterior (downgrade)
      await expect(proxy.requestStakingImplementationChange(currentImplementation))
        .to.be.rejectedWith("Cannot downgrade to previous version");
    });
    
    it("Should upgrade to a new version and maintain data and functionality", async function () {
      // Configurar os detalhes de staking (como quantidade e token), se necessário
      const stakeAmount = ethers.parseEther('1000');
      const someAccount = await addr1.getAddress();
      
      // Transferir alguns tokens para addr1 e aprovar para gasto
      await erc20Token.transfer(someAccount, stakeAmount);
      await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount);
      
      // Investir alguns tokens (staking) através da função de stake
      await erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount);
      
      // Recuperar os detalhes do staking original através da função getStakeInfo
      const originalStakeInfo = await erc20SemiAnnualStaking.connect(addr1).getStakeInfo(someAccount);
      
      // Realizar o upgrade
      await proxy.requestStakingImplementationChange(newImplementationAddress);
      await network.provider.send("evm_increaseTime", [IMPLEMENTATION_CHANGE_DELAY]);
      await proxy.confirmStakingImplementationChange();
      
      // Verificar se os detalhes do staking (exceto recompensas) são mantidos após o upgrade
      const newStakeInfo = await erc20SemiAnnualStaking.connect(addr1).getStakeInfo(someAccount);
      
      // Comparar todos os campos, exceto a recompensa
      expect(newStakeInfo.amount).to.equal(originalStakeInfo.amount, "Staked amount after upgrade does not match the original");
      expect(newStakeInfo.time).to.equal(originalStakeInfo.time, "Staking time after upgrade does not match the original");
      expect(newStakeInfo.rewardRate).to.equal(originalStakeInfo.rewardRate, "Reward rate after upgrade does not match the original");
    });
  
  });

  describe("Gas", function(){
    it("Should measure gas used for requestStakingImplementationChange", async function () {
      // Aqui, consideramos que você já tem um novo endereço de implementação válido e que este não foi usado antes
      const tx = await proxy.requestStakingImplementationChange(newImplementationAddress);
      const receipt = await tx.wait();
  
      if(receipt == null){
        throw new Error ("Not Found");
      }

      const gasUsed = receipt.gasUsed;
      console.log(`Gas used for requestStakingImplementationChange: ${gasUsed}`);
    });
  
    it("Should measure gas used for confirmStakingImplementationChange", async function () {
      // Primeiro, solicitamos a mudança da implementação
      await proxy.requestStakingImplementationChange(newImplementationAddress);
  
      // Agora, simulamos a passagem do tempo para atender ao requisito IMPLEMENTATION_CHANGE_DELAY
      await network.provider.send("evm_increaseTime", [IMPLEMENTATION_CHANGE_DELAY + 1]); // Adicionamos 1 segundo extra para garantir que o tempo mínimo passou
      await network.provider.send("evm_mine"); // Minar um novo bloco para refletir a mudança de tempo
  
      // Agora, chamamos a função confirmStakingImplementationChange e medimos o gás usado
      const tx = await proxy.confirmStakingImplementationChange();
      const receipt = await tx.wait();
      
      if(receipt == null){
        throw new Error ("Not Found");
      }

      const gasUsed = receipt.gasUsed;
      console.log(`Gas used for confirmStakingImplementationChange: ${gasUsed}`);
    });
  
  });


  describe("Permissions", function(){
    it("Should revert requestStakingImplementationChange for non-owner", async function () {
      const nonOwner = addr2; // Asumindo que addr2 não é o owner.
      await expect(proxy.connect(nonOwner).requestStakingImplementationChange(newImplementationAddress)).to.be.rejectedWith("Ownable: caller is not the owner");
    });
  
    it("Should revert confirmStakingImplementationChange for non-owner", async function () {
      const nonOwner = addr2; // Asumindo que addr2 não é o owner.
      await expect(proxy.connect(nonOwner).confirmStakingImplementationChange()).to.be.rejectedWith("Ownable: caller is not the owner");
    });
 
    it("Should transfer ownership and respect new permissions", async function () {
      const newOwner = addr2; // Asumindo que addr2 será o novo owner.
  
      // Transferir propriedade para addr2
      await proxy.transferOwnership(await newOwner.getAddress());
  
      // Testar se o novo proprietário pode chamar a função requestStakingImplementationChange
      await proxy.connect(newOwner).requestStakingImplementationChange(newImplementationAddress);
  
      // Tentar chamar a função requestStakingImplementationChange com o antigo proprietário e verificar se é revertida
      await expect(proxy.requestStakingImplementationChange(newImplementationAddress)).to.be.rejectedWith("Ownable: caller is not the owner");
    });

  });


  describe("Proxy Semi-Annual Staking - Malicious Tests", function() {
    it("Should not allow malicious contract to steal funds", async function() {
      const MaliciousImplementationFactory = await ethers.getContractFactory("MaliciousImplementation");
      
      // Deploy the malicious contract with the owner's account.
      const malicious = await MaliciousImplementationFactory.deploy();
  
      // Verify that addr1 is not the owner of the malicious contract.
      const maliciousOwner = await malicious.owner();
      expect(maliciousOwner).not.to.equal(await addr1.getAddress());
  
      const maliciousCode = await ethers.provider.getCode(await malicious.getAddress());
      // console.log("Malicious Code (Manual):", maliciousCode);
  
      const maliciousCodeHash = ethers.keccak256(maliciousCode);
      // console.log("Malicious Code Hash (Manual):", maliciousCodeHash);
      
      // Deploying the proxy with the malicious implementation set from the start.
      const ProxyFactory = await ethers.getContractFactory("ProxySemiAnnualStaking");
      proxy = await ProxyFactory.deploy(await malicious.getAddress(), maliciousCodeHash) as ProxySemiAnnualStaking;
      
      // Sending 1 ether to the proxy contract.
      await owner.sendTransaction({
          to: proxy.getAddress(),
          value: ethers.parseEther("1.0")
      });
    
      const originalBalance = await ethers.provider.getBalance(await proxy.getAddress());
  
      // Trying to steal funds with the malicious contract.
      await expect(malicious.connect(addr1).stealFunds(await addr1.getAddress())).to.be.rejectedWith("Ownable: caller is not the owner");
    
      const newBalance = await ethers.provider.getBalance(await proxy.getAddress());
      expect(newBalance).to.equal(originalBalance);
    });
  


  });



});


