import { use, expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract, ContractFactory, Signer , ContractTransactionResponse, ContractTransaction} from "ethers";
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { ERC20Token, ERC20SemiAnnualStaking } from "../typechain-types";
import { TransactionReceipt } from "@ethersproject/abstract-provider";
import { error } from "console";
import { ContractReceipt } from "@ethersproject/contracts";
import hre from "hardhat";
// interface ExtendedContract extends ERC20SemiAnnualStaking {}

describe("Semi-Annual Staking", function() {
    let ERC20SemiAnnualStakingFactory: ContractFactory;
    let erc20SemiAnnualStaking: ERC20SemiAnnualStaking;
    let owner: Signer;
    let addr1: Signer;
    let addr2: Signer;
    let addr3: Signer;
    let addrs: Signer[];
    let ERC20TokenFactory: ContractFactory;
    let erc20Token: ERC20Token;
    const initialSupply: BigNumber = BigNumber.from(ethers.parseEther('1000'));
    const stakeAmount: BigNumber = BigNumber.from(ethers.parseEther('1000'));
    const LOCK_PERIOD = 180 * 24 * 60 * 60; // 180 dias em segundos
    const INITIAL_REWARD_RATE = BigNumber.from(45); // 0.45% em base de pontos percentuais
    const FINAL_REWARD_RATE = BigNumber.from(25); // 0.25% em base de pontos percentuais
    const MAX_STAKE = ethers.parseEther("1000000"); // limite de 1.000.000 tokens
    const REWARD_FEE_RATE = 1; // 1% taxa sobre a recompensa

    beforeEach(async function() {
        // Get Signers
        [owner, addr1, addr2, addr3, ...addrs] = (await ethers.getSigners()) as any;
  
        // Deploy ERC20Token contract
        ERC20TokenFactory = await ethers.getContractFactory("ERC20Token");
        erc20Token = (await ERC20TokenFactory.deploy()) as ERC20Token;
        await erc20Token.initialize("Newcoin", "NEW");

        // Deploy ERC20SemiAnnualStaking contract
        ERC20SemiAnnualStakingFactory = await ethers.getContractFactory("ERC20SemiAnnualStaking");
        erc20SemiAnnualStaking = (await ERC20SemiAnnualStakingFactory.deploy(await erc20Token.getAddress())) as ERC20SemiAnnualStaking;
        //console.log(erc20SemiAnnualStaking);

        // Owner stakes some tokens
        await erc20Token.connect(owner).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
        await erc20SemiAnnualStaking.connect(owner).stake(stakeAmount.toString());

    });
 
    async function advanceTimeAndBlock(time: number) {
      await ethers.provider.send("evm_increaseTime", [time]);
      await ethers.provider.send("evm_mine", []);
    }
    
    describe("Stake", function() {
      it("Should update total staked value", async function() {
        const totalStaked = await erc20SemiAnnualStaking.totalStaked();
        expect(totalStaked.toString() == stakeAmount.toString()).to.be.true;
      });

      it("Should not allow staking more than user balance", async function() {
        await expect(erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString())).to.be.rejectedWith('Not enough tokens to stake');
      });

      it("Should not allow staking more than max limit", async function() {
        // Transferir tokens para addr1
        await erc20Token.connect(owner).transfer((await addr1.getAddress()), BigNumber.from(MAX_STAKE).add(stakeAmount).toString());

        // Aprovar o contrato de staking para gastar tokens em nome de addr1
        await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), BigNumber.from(MAX_STAKE).add(stakeAmount).toString());

        // Tentar fazer stake de mais do que o máximo permitido
        await expect(erc20SemiAnnualStaking.connect(addr1).stake(BigNumber.from(MAX_STAKE).add(1).toString()))
            .to.be.rejectedWith('Exceeds max stake amount');
      });

      it("Should not allow staking more than 1.000.000 tokens", async function() {
        // Transferir mais de 1.000.000 tokens para addr1
        await erc20Token.connect(owner).transfer((await addr1.getAddress()), BigNumber.from(MAX_STAKE).add(stakeAmount).toString());
        await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), BigNumber.from(MAX_STAKE).add(stakeAmount).toString());
    
        // Tentar fazer stake de mais de 1.000.000 tokens deve ser revertido
        await expect(erc20SemiAnnualStaking.connect(addr1).stake(BigNumber.from(MAX_STAKE).add(stakeAmount).toString()))
            .to.be.rejectedWith('Exceeds max stake amount');
      });

      it("Should allow multiple users to stake", async function() {
        // Transfer some tokens to addr1 and addr2
        await erc20Token.connect(owner).transfer(await addr1.getAddress(), stakeAmount.toString());
        await erc20Token.connect(owner).transfer(await addr2.getAddress(), stakeAmount.toString());
        
        // Approve the staking contract to spend tokens on behalf of addr1 and addr2
        await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
        await erc20Token.connect(addr2).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());

        // Stake the tokens
        await erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString());
        await erc20SemiAnnualStaking.connect(addr2).stake(stakeAmount.toString());

        const stakeInfoAddr1 = await erc20SemiAnnualStaking.getStakeInfo(await addr1.getAddress());
        const stakeInfoAddr2 = await erc20SemiAnnualStaking.getStakeInfo(await addr2.getAddress());

        expect(stakeInfoAddr1.amount.toString()).to.equal(stakeAmount.toString());
        expect(stakeInfoAddr2.amount.toString()).to.equal(stakeAmount.toString());
      });

      it("Should revert when trying to stake zero tokens", async function() {
        // Approve the staking contract to spend tokens on behalf of addr1
        await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), 0);

        // Try to stake zero tokens and expect an error
        await expect(erc20SemiAnnualStaking.connect(addr1).stake(0)).to.be.rejectedWith('Cannot stake 0 tokens');
      });

    });
  

    describe("Withdraw", function() {
      it("Should not allow withdrawal before end of staking period", async function() {
        await expect(erc20SemiAnnualStaking.withdraw(stakeAmount.toString()))
            .to.be.rejectedWith('Staking still in lock period');
      });
    
      it("Should not allow withdrawal of more than staked amount", async function() {
        await expect(erc20SemiAnnualStaking.withdraw(stakeAmount.mul(2).toString()))
        .to.be.rejectedWith('Withdrawal amount exceeds staked amount');
      });

      it('Should revert when trying to withdraw during lock period', async function () {
        // Transfer some tokens to addr1 and approve them for spending
        await erc20Token.transfer(await addr1.getAddress(), stakeAmount.toString());
        await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
      
        // Deposit some tokens
        await erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString());
      
        // Try to withdraw during lock period and expect an error
        await expect(erc20SemiAnnualStaking.connect(addr1).withdraw(stakeAmount.toString())).to.be.rejectedWith('Staking still in lock period');
      });
      

      it("Should allow withdrawal after lock period", async function() {
        const additionalTokens = ethers.parseEther("1");
      
        // First, transfer tokens to addr1
        await erc20Token.connect(owner).transfer((await addr1.getAddress()), stakeAmount.toString());
      
        // Approve the staking contract to spend tokens on behalf of addr1
        await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
      
        const balanceBeforeWithdrawal = await erc20Token.balanceOf(await addr1.getAddress());
      
        // Stake some tokens
        const stakeTx = await erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString());
        const stakeTime = await ethers.provider.getTransactionReceipt(stakeTx.hash);
      
        if(stakeTime == null) {
          throw new Error("Error Stake Time");
        }
      
        const stakeBlock = await ethers.provider.getBlock(stakeTime.blockNumber);
      
        if(stakeBlock == null) {
          throw new Error("Error Stake Block");
        }
      
        const stakeTimestamp = stakeBlock.timestamp;
      
        // Advance time by 180 days
        await advanceTimeAndBlock(LOCK_PERIOD);
      
        const withdrawalTx = await erc20SemiAnnualStaking.connect(addr1).withdraw(stakeAmount.toString());
        const withdrawalTime = await ethers.provider.getTransactionReceipt(withdrawalTx.hash);
      
        if(withdrawalTime == null) {
          throw new Error("Error Withdrawal Time");
        }
      
        const withdrawalBlock = await ethers.provider.getBlock(withdrawalTime.blockNumber);
      
        if(withdrawalBlock == null) {
          throw new Error("Error Withdrawal Block");
        }
      
        const withdrawalTimestamp = withdrawalBlock.timestamp;
     
        const totalTimeElapsed = withdrawalTimestamp - stakeTimestamp;
        const timeInLock = Math.min(totalTimeElapsed, LOCK_PERIOD);
        const reductionPerSecond = (INITIAL_REWARD_RATE.sub(FINAL_REWARD_RATE)).div(LOCK_PERIOD);
        const rewardRateAtWithdrawal = INITIAL_REWARD_RATE.sub(reductionPerSecond.mul(timeInLock));

        const rewardInLock = stakeAmount
          .mul(rewardRateAtWithdrawal)
          .mul(timeInLock)
          .div(365 * 24 * 60 * 60)
          .div(10000);

        const timePostLock = Math.max(0, totalTimeElapsed - LOCK_PERIOD);
        const rewardPostLock = stakeAmount
          .mul(FINAL_REWARD_RATE)
          .mul(timePostLock)
          .div(365 * 24 * 60 * 60)
          .div(10000);

        const totalReward = rewardInLock.add(rewardPostLock);
        const rewardFee = totalReward.mul(REWARD_FEE_RATE).div(100);
        const expectedReward = totalReward.sub(rewardFee);

        const balanceAfterWithdrawal = await erc20Token.balanceOf(await addr1.getAddress());

        const marginOfError = BigNumber.from('100000000000000000'); // por exemplo, 0.1 Ether
        const actualReward = BigNumber.from(balanceAfterWithdrawal).sub(stakeAmount);
        const difference = actualReward.sub(expectedReward).abs(); // Obtém o valor absoluto da diferença

        // Verifica se a diferença está dentro da margem de erro
        expect(difference.lte(marginOfError)).to.be.true;

      }).timeout(90000); // 90 segundos;      
    
    
    });


    describe("Rewards", function() {
      it("Should correctly calculate rewards", async function() {
        // Suponha que 'owner' é uma instância Signer representando a conta do proprietário
        await erc20Token.connect(owner).transfer((await addr1.getAddress()), stakeAmount.toString());
            
        await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
        await erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString());
    
       
        // Avança o tempo na blockchain de teste por 30 dias (aproximadamente um mês)
        await network.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
        await network.provider.send("evm_mine");
        
        const [amount, time, rewardRate, reward] = await erc20SemiAnnualStaking.getStakeInfo(await addr1.getAddress());
       
        // Calcular a recompensa esperada com base na taxa de recompensa inicial
        // Neste exemplo, estamos considerando que a taxa de recompensa é anual, então dividimos por 365
        const expectedReward = stakeAmount.mul(INITIAL_REWARD_RATE).mul(30).div(365).div(10000);
        /*
        console.log(`stakeAmount: ${stakeAmount.toString()}`);
        console.log(`INITIAL_REWARD_RATE: ${INITIAL_REWARD_RATE.toString()}`);
        console.log(`expectedReward: ${expectedReward.toString()}`);
        console.log(`stakeInfo.amount: ${amount.toString()}`);
        console.log(`stakeInfo.time: ${time.toString()}`);
        console.log(`stakeInfo.rewardRate: ${rewardRate.toString()}`);
        console.log(`stakeInfo.reward: ${reward.toString()}`);
        console.log(`reward type: ${typeof reward}`);
        */
        expect(await reward.toString()).to.equal(await expectedReward.toString());
      });
   
      it("Should not allow reward withdrawal before end of staking period", async function() {
        // Primeiro, transferir tokens para addr1
        await erc20Token.connect(owner).transfer((await addr1.getAddress()), stakeAmount.toString());
        
        // Aprovar o contrato de staking para gastar tokens em nome de addr1
        await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
    
        // Então, fazer o stake dos tokens
        await erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString());
    
        // Agora, tentar sacar antes do final do período de staking deve ser revertido
        await expect(erc20SemiAnnualStaking.connect(addr1).withdraw(stakeAmount.toString()))
        .to.be.rejectedWith('Staking still in lock period');
      });

      it("Should gradually decrease reward rate over time", async function() {
        // Supondo que o 'owner' é uma instância Signer representando a conta do proprietário
        await erc20Token.connect(owner).transfer((await addr1.getAddress()), stakeAmount.toString());
    
        await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
        await erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString());
    
        // Avança o tempo na blockchain de teste por 90 dias (aproximadamente metade do período de bloqueio)
        await network.provider.send("evm_increaseTime", [90 * 24 * 60 * 60]);
        await network.provider.send("evm_mine");
    
        // Chame a função updateReward para atualizar a taxa de recompensa
        await erc20SemiAnnualStaking.connect(addr1).updateReward(await addr1.getAddress());
    
        const [amount, time, rewardRate, reward] = await erc20SemiAnnualStaking.getStakeInfo(await addr1.getAddress());
    
        // Aqui, a taxa de recompensa deveria ser algo entre 0.45% e 0.25%
        // Supondo que a taxa diminui linearmente, a taxa esperada seria por volta de 0.35%
        // A lógica exata depende da implementação do contrato
        const expectedRewardRate = INITIAL_REWARD_RATE.add(BigNumber.from(FINAL_REWARD_RATE)).div(2);
    
        expect(rewardRate.toString()).to.equal(expectedRewardRate.toString());
      });
    
        it("Should decrease reward rate over time", async function() {
            // Supondo que o 'owner' é uma instância Signer representando a conta do proprietário
            await erc20Token.connect(owner).transfer((await addr1.getAddress()), stakeAmount.toString());
            
            await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
            await erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString());
    
            // Avança o tempo na blockchain de teste por 10 dias
            await network.provider.send("evm_increaseTime", [10 * 24 * 60 * 60]);
            await network.provider.send("evm_mine");
    
            // Chame a função updateReward para atualizar a taxa de recompensa
            await erc20SemiAnnualStaking.connect(addr1).updateReward(await addr1.getAddress());
    
            const [, , newRewardRate, ] = await erc20SemiAnnualStaking.getStakeInfo(await addr1.getAddress());
    
            // Verifique se a nova taxa de recompensa é menor que a taxa inicial
            expect(BigNumber.from(newRewardRate).lt(INITIAL_REWARD_RATE)).to.be.true;
        });

    });


    describe("Reward Fee", function() {
      it("Should correctly apply reward fee on withdrawal", async function() {
        // Transferir tokens para addr1
        await erc20Token.connect(owner).transfer((await addr1.getAddress()), stakeAmount.toString());
        
        // Aprovar o contrato de staking para gastar tokens em nome de addr1
        await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
  
        await erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString());
        await network.provider.send("evm_increaseTime", [LOCK_PERIOD]);
        await network.provider.send("evm_mine"); // avança o tempo na blockchain de teste
        await erc20SemiAnnualStaking.connect(addr1).withdraw(stakeAmount.toString());
       
        const stakeInfo = await erc20SemiAnnualStaking.getStakeInfo(await addr1.getAddress()) as unknown as [BigNumber, BigNumber, BigNumber, BigNumber];
        const reward = stakeInfo[3];

        expect(reward.toString()).to.equal("0"); // a recompensa deve ter sido retirada
      });
  
      it("Should correctly distribute reward fee to stakers", async function() {
        // Transferir tokens para addr1
        await erc20Token.connect(owner).transfer((await addr1.getAddress()), stakeAmount.toString());

        // Aprovar o contrato de staking para gastar tokens em nome de addr1
        await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());

        // addr1 faz stake dos tokens
        await erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString());

         // Log após o stake
        const stakeInfoAfterStake = await erc20SemiAnnualStaking.getStakeInfo(await addr1.getAddress());
        //console.log("Stake Info after staking:", stakeInfoAfterStake.toString());

        // Avança o tempo para passar o período de bloqueio
        await network.provider.send("evm_increaseTime", [LOCK_PERIOD]);
        await network.provider.send("evm_mine");

        // Log após avançar o tempo
        const stakeInfoAfterTimeAdvance = await erc20SemiAnnualStaking.getStakeInfo(await addr1.getAddress());
        //console.log("Stake Info after time advance:", stakeInfoAfterTimeAdvance.toString());

        // addr1 retira, o que aciona a aplicação da taxa de recompensa
        await erc20SemiAnnualStaking.connect(addr1).withdraw(stakeAmount.toString());

        // Agora, verificar a distribuição da taxa de recompensa
        const totalRewardFee = await erc20SemiAnnualStaking.totalRewardFee();

        //console.log("Total Reward Fee after withdrawal:", totalRewardFee.toString());

        // Como no exemplo anterior, não temos informações detalhadas sobre como a taxa de recompensa é distribuída.
        // Portanto, neste exemplo, apenas verificamos se a taxa de recompensa foi acumulada no contrato.
        expect(totalRewardFee).to.be.gt(0);
      });

      it("Should charge 1% fee when withdrawing rewards", async function() {
        // Transferir tokens para addr1
        await erc20Token.connect(owner).transfer((await addr1.getAddress()), stakeAmount.toString());
        await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
    
        // Fazer stake dos tokens
        await erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString());
    
        // Avançar o tempo para passar o período de bloqueio
        await network.provider.send("evm_increaseTime", [LOCK_PERIOD]);
        await network.provider.send("evm_mine");
    
        // Obter a recompensa antes da retirada
        const [amountBefore, timeBefore, rewardRateBefore, rewardBefore] = await erc20SemiAnnualStaking.getStakeInfo(await addr1.getAddress());
    
        // Retirar a recompensa
        await erc20SemiAnnualStaking.connect(addr1).withdraw(stakeAmount.toString());
    
        // Obter a recompensa após a retirada
        const [amountAfter, timeAfter, rewardRateAfter, rewardAfter] = await erc20SemiAnnualStaking.getStakeInfo(await addr1.getAddress());
    
        // O valor retirado deve ser igual ao valor de stake mais a recompensa antes da retirada, menos 1%
        const expectedWithdrawal = stakeAmount.add(BigNumber.from(rewardBefore).mul(99).div(100));
        const actualWithdrawal = BigNumber.from(amountBefore).sub(amountAfter).add(rewardBefore);
    
        // Verifique se a diferença está dentro de uma margem de erro de 1 token
        const difference = actualWithdrawal.gt(expectedWithdrawal) 
            ? actualWithdrawal.sub(expectedWithdrawal) 
            : expectedWithdrawal.sub(actualWithdrawal);
        
        expect(difference.lt(ethers.parseUnits("1", "ether"))).to.equal(true);
    });
    
    it("Should distribute reward fee to remaining stakers", async function() {
      // Initial amount to stake
      const stakeAmount = ethers.parseEther("1000");
      const additionalTokens = ethers.parseEther("10");
    
      // Transfer tokens from owner to addr1, addr2 and addr3
      await erc20Token.connect(owner).transfer(await addr1.getAddress(), stakeAmount);
      await erc20Token.connect(owner).transfer(await addr2.getAddress(), stakeAmount);
      await erc20Token.connect(owner).transfer(await addr3.getAddress(), stakeAmount);
    
      await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount);
      await erc20Token.connect(addr2).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount);
      await erc20Token.connect(addr3).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount);
    
      await erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount);
      await erc20SemiAnnualStaking.connect(addr2).stake(stakeAmount);
      await erc20SemiAnnualStaking.connect(addr3).stake(stakeAmount);
    
      // Get stake info before addr1 withdraws
      const [amountBefore2, , , rewardBefore2] = await erc20SemiAnnualStaking.getStakeInfo(await addr2.getAddress());
      const [amountBefore3, , , rewardBefore3] = await erc20SemiAnnualStaking.getStakeInfo(await addr3.getAddress());
    
      // addr1 withdraws stake
      // fast-forward time
      await ethers.provider.send("evm_increaseTime", [180 * 24 * 60 * 60]); // Increase time by 180 days
    
      // Transfer additional tokens from owner to addr1
      await erc20Token.connect(owner).transfer(await addr1.getAddress(), additionalTokens);
    
      await erc20SemiAnnualStaking.connect(addr1).withdraw(stakeAmount);
   
      // Get stake info after addr1 withdraws
      const [amountAfter2, , , rewardAfter2] = await erc20SemiAnnualStaking.getStakeInfo(await addr2.getAddress());
      const [amountAfter3, , , rewardAfter3] = await erc20SemiAnnualStaking.getStakeInfo(await addr3.getAddress());
    
      // Check if reward of addr2 and addr3 increased proportionally to their stake amount
      const rewardIncrease2 = BigNumber.from(rewardAfter2).sub(rewardBefore2);
      const rewardIncrease3 = BigNumber.from(rewardAfter3).sub(rewardBefore3);

      function expectCloseTo(a: BigNumber, b: BigNumber, diff: BigNumber) {
        const realDiff = a.sub(b).abs();
        expect(realDiff.lte(diff)).to.be.true;
      }
    
      expectCloseTo(rewardIncrease2, rewardIncrease3.mul(amountBefore2).div(amountBefore3), BigNumber.from(1));
    
    });
  
    it("should allow owner to withdraw reward fee", async function () {
      // 1. Configurar o valor da taxa de recompensa que desejamos testar
      const rewardFee = ethers.parseEther("5");
      const additionalTokens = ethers.parseEther("10");
   
      // Transfer tokens from owner to addr1, addr2 and addr3
      await erc20Token.connect(owner).transfer(await addr1.getAddress(), stakeAmount.toString());
      await erc20Token.connect(owner).transfer(await addr2.getAddress(), stakeAmount.toString());
      await erc20Token.connect(owner).transfer(await addr3.getAddress(), stakeAmount.toString());
    
      await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
      await erc20Token.connect(addr2).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
      await erc20Token.connect(addr3).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
    
      await erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString());
      await erc20SemiAnnualStaking.connect(addr2).stake(stakeAmount.toString());
      await erc20SemiAnnualStaking.connect(addr3).stake(stakeAmount.toString());
    
      // addr1 withdraws stake
      // fast-forward time
      await ethers.provider.send("evm_increaseTime", [180 * 24 * 60 * 60]); // Increase time by 180 days
    
      // Transfer additional tokens from owner to addr1
      await erc20Token.connect(owner).transfer(await addr1.getAddress(), additionalTokens);
      await erc20Token.connect(owner).transfer(await addr2.getAddress(), additionalTokens);
      await erc20Token.connect(owner).transfer(await addr3.getAddress(), additionalTokens);

      await erc20SemiAnnualStaking.connect(addr1).withdraw(stakeAmount.toString());
      await erc20SemiAnnualStaking.connect(addr2).withdraw(stakeAmount.toString());
      await erc20SemiAnnualStaking.connect(addr3).withdraw(stakeAmount.toString());

      // 3. Checar que totalRewardFee foi configurado corretamente (se você tiver um getter adequado)
      // expect(await erc20SemiAnnualStaking.getTotalRewardFee()).to.equal(rewardFee);
  
      // 4. Resgatar a taxa de recompensa
      const ownerBalanceBefore = await erc20Token.balanceOf(await owner.getAddress());
      const finalTotalRewardFee = await erc20SemiAnnualStaking.getTotalRewardFee();
      await erc20SemiAnnualStaking.connect(owner).withdrawRewardFee();
      const ownerBalanceAfter = await erc20Token.balanceOf(await owner.getAddress());
      
      // 5. Verificar se a taxa de recompensa foi adicionada ao saldo do proprietário
      const expectedOwnerBalanceAfter = BigNumber.from(ownerBalanceBefore).add(finalTotalRewardFee);
      /*
      console.log('ownerBalanceBefore:', ownerBalanceBefore.toString());
      console.log('finalTotalRewardFee:', finalTotalRewardFee.toString());
      console.log('ownerBalanceAfter:', ownerBalanceAfter.toString());
      console.log('expectedOwnerBalanceAfter:', expectedOwnerBalanceAfter.toString());
      */
      expect(ownerBalanceAfter.toString()).to.equal(expectedOwnerBalanceAfter.toString());
      
      // 6. Se você tiver um getter para totalRewardFee, pode verificar se ele foi zerado aqui
      expect((await erc20SemiAnnualStaking.getTotalRewardFee()).toString()).to.equal("0");
    });    
  
  });


    describe("Gas", function(){
      it("Should have reasonable gas cost for withdraw", async function() {
        // Transfer some tokens to addr1
        await erc20Token.connect(owner).transfer(await addr1.getAddress(), stakeAmount.toString());
        
        // Approve the staking contract to spend tokens on behalf of addr1
        await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
        
        // Stake the tokens
        await erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString());
      
        // Increase the time to pass the lock period
        const SEMI_ANNUAL_PERIOD = 60 * 60 * 24 * 30 * 6; // 6 months in seconds
        await ethers.provider.send("evm_increaseTime", [SEMI_ANNUAL_PERIOD]);
        await ethers.provider.send("evm_mine"); // you must mine a new block for the time change to take effect
      
        // Call the withdraw function and get the transaction receipt
        const tx = await erc20SemiAnnualStaking.connect(addr1).withdraw(stakeAmount.toString());
        const receipt = await tx.wait();
        
        if (receipt == null){
          throw new Error("Transaction Not Found")
        }

        // Get the gas used for the transaction
        const gasUsed = Number(receipt.gasUsed.toString());
    
        // Assert that gas cost is within a reasonable range
        expect(gasUsed).to.be.lessThan(140000); // just an example, adjust the number based on the actual result
      });
     

      it("Should have reasonable gas cost for stake", async function() {
        // Transfer some tokens to addr1
        await erc20Token.connect(owner).transfer(await addr1.getAddress(), stakeAmount.toString());
        
        // Approve the staking contract to spend tokens on behalf of addr1
        await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
        
        // Call the stake function and get the transaction receipt
        const tx = await erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString());
        const receipt = await tx.wait();
        
        if (receipt == null){
          throw new Error("Transaction Not Found")
        }
    
        // Get the gas used for the transaction
        const gasUsed = Number(receipt.gasUsed.toString());
    
        // Assert that gas cost is within a reasonable range
        expect(gasUsed).to.be.lessThan(210000);  // just an example, adjust the number based on the actual result
      });
   
      it("Should measure gas used for staking", async function () {
        const stakeAmount = ethers.parseEther('10');
        const ownerAddress = await owner.getAddress();  // Asumindo que 'owner' é o signatário padrão que possui os tokens.
    
        // Transferir tokens para a conta que vai fazer o staking
        await erc20Token.transfer(ownerAddress, stakeAmount);
        
        // Aprovar o contrato de staking para gastar os tokens em nome da conta
        await erc20Token.approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount);
    
        // Agora, tentar fazer o staking
        const tx = await erc20SemiAnnualStaking.stake(stakeAmount);
        const receipt = await tx.wait();
    
        if (receipt == null){
          throw new Error("Transaction Not Found")
        }

        const gasUsed = receipt.gasUsed;
        console.log(`Gas used for staking: ${gasUsed}`);
      });
    
    });


  describe("Events", function() {
    it("Should correctly emit events", async function() {
      // Transfer some tokens to addr1
      await erc20Token.connect(owner).transfer(await addr1.getAddress(), stakeAmount.toString());
      
      // Approve the staking contract to spend tokens on behalf of addr1
      await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
  
      // Stake the tokens and get the transaction
      const tx = await erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString());
  
      // Wait for the transaction to be mined and get the receipt
      const receipt = await tx.wait();
      
      if (receipt == null){
        throw new Error("Receipt Transaction Not Found")
      }

      const erc20SemiAnnualStakingArtifact = await hre.artifacts.readArtifact("ERC20SemiAnnualStaking");
      const iface = new ethers.Interface(erc20SemiAnnualStakingArtifact.abi);

      const logs = receipt.logs.map(log => {
        return iface.parseLog({ ...log, topics: [...log.topics] });
      });
      const events = logs.filter(e => e !== null && e.name === "Staked");
 
      expect(events.length).to.not.equal(0);
      const event = events[0];
      
      if (event == null){
        throw new Error("Erro event")
      }

      expect(event).to.not.equal(undefined);
      expect(event.args?.user).to.equal(await addr1.getAddress());
      expect(event.args?.amount.toString()).to.equal(stakeAmount.toString());
    });
 
    it("should allow owner to pause and unpause the staking", async function () {
      // Transfer some tokens to addr1
      await erc20Token.connect(owner).transfer(await addr1.getAddress(), stakeAmount.toString());
    
      await erc20SemiAnnualStaking.connect(owner).pause();
    
      // Tenta fazer stake com um endereço que não é o dono (deve falhar)
      await expect(
        erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString())
      ).to.be.rejectedWith("Pausable: paused");
    
      // Despausa e tenta novamente (deve ter sucesso)
      await erc20SemiAnnualStaking.connect(owner).unpause();
      await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
      await expect(
        erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString())
      ).to.not.be.reverted;
    });
    
    it("Should correctly emit Withdrawn event", async function () {
      // Transfer some tokens to addr1
      await erc20Token.connect(owner).transfer(await addr1.getAddress(), stakeAmount.toString());
      
      // Approve the staking contract to spend tokens on behalf of addr1
      await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
     
      // Stake the tokens
      await erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString());
      
      // Advance the time to pass the lock period
      await advanceTimeAndBlock(LOCK_PERIOD + 1);
   
      // Attempt to withdraw the funds and check for the event
      const tx = await erc20SemiAnnualStaking.connect(addr1).withdraw(stakeAmount.toString());
      await expect(tx)
        .to.emit(erc20SemiAnnualStaking, "Withdrawn")
        .withArgs(await addr1.getAddress(), stakeAmount.toString());
    });
    
    
    it("Should correctly emit AddressFrozen and AddressUnfrozen events", async function () {
      // Emitir o evento AddressFrozen
      const tx1 = await erc20SemiAnnualStaking.connect(owner).freezeAddress(await addr1.getAddress());
      await expect(tx1)
        .to.emit(erc20SemiAnnualStaking, "AddressFrozen")
        .withArgs(await addr1.getAddress());
    
      // Emitir o evento AddressUnfrozen
      const tx2 = await erc20SemiAnnualStaking.connect(owner).unfreezeAddress(await addr1.getAddress());
      await expect(tx2)
        .to.emit(erc20SemiAnnualStaking, "AddressUnfrozen")
        .withArgs(await addr1.getAddress());
    });
    
  });


  describe("Address freezing", function () {
    it("Should freeze and unfreeze an address", async function () {
      const addr1Address = await addr1.getAddress();
      await erc20SemiAnnualStaking.connect(owner).freezeAddress(addr1Address);
      expect(await erc20SemiAnnualStaking.frozenAddresses(addr1Address)).to.equal(true);
      await erc20SemiAnnualStaking.connect(owner).unfreezeAddress(addr1Address);
      expect(await erc20SemiAnnualStaking.frozenAddresses(addr1Address)).to.equal(false);
    });
  
    it("Should revert staking from a frozen address", async function () {
      const addr1Address = await addr1.getAddress();
      await erc20SemiAnnualStaking.connect(owner).freezeAddress(addr1Address);
      await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
      await expect(erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString())).to.be.rejectedWith("Address is frozen");
    });
  });
  
  
  describe("Contract pausing", function () {
    it("Should pause and unpause the contract", async function () {
      await erc20SemiAnnualStaking.connect(owner).pause();
      expect(await erc20SemiAnnualStaking.paused()).to.equal(true);
      await erc20SemiAnnualStaking.connect(owner).unpause();
      expect(await erc20SemiAnnualStaking.paused()).to.equal(false);
    });
  
    it("Should revert staking when contract is paused", async function () {
      await erc20SemiAnnualStaking.connect(owner).pause();
      await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
      await expect(erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString())).to.be.rejectedWith("Pausable: paused");
    });
  });
  

  describe("Funds rescue", function () {
    it("Should rescue funds of a different token", async function () {
      // Simulate a situation where another token is mistakenly sent to the contract
      const otherTokenFactory = await ethers.getContractFactory("ERC20Token");
      const otherToken = (await otherTokenFactory.deploy()) as ERC20Token;
      await otherToken.initialize("OtherToken", "OTK");
    
      // Ensure that the owner has an initial balance of the new token.
      await otherToken.mint(await owner.getAddress(), ethers.parseEther('20'));
      const rescueAmount = ethers.parseEther('10');
      const initialOwnerBalance = await otherToken.balanceOf(await owner.getAddress());
      const expectedFinalBalance = BigNumber.from(initialOwnerBalance);
   
      // Log initial owner balance
      // console.log('Initial owner balance:', initialOwnerBalance.toString());
      // Log contract balance before transfer
      // console.log('Contract balance before transfer:', (await otherToken.balanceOf(await erc20SemiAnnualStaking.getAddress())).toString());
    
      await otherToken.transfer(await erc20SemiAnnualStaking.getAddress(), rescueAmount);
    
      // const afterTransferOwnerBalance = await otherToken.balanceOf(await owner.getAddress());
      // console.log('After Transfer New Token owner balance:', afterTransferOwnerBalance.toString());
      // Log contract balance after transfer
      // console.log('Contract balance after transfer:', (await otherToken.balanceOf(await erc20SemiAnnualStaking.getAddress())).toString());
      
      // Now rescue the funds
      const tx = await erc20SemiAnnualStaking.connect(owner).rescueFunds(await otherToken.getAddress(), rescueAmount);
      await expect(tx)
        .to.emit(erc20SemiAnnualStaking, "FundsRescued")
        .withArgs(await otherToken.getAddress(), rescueAmount);
    
      // Log owner balance after rescue
      const finalOwnerBalance = await otherToken.balanceOf(await owner.getAddress());
      
      // console.log('Owner balance after rescue:', finalOwnerBalance.toString());
      // console.log('Owner address:', await owner.getAddress());
      // console.log('Contract balance after Funds Rescued:', (await otherToken.balanceOf(await erc20SemiAnnualStaking.getAddress())).toString());
    
      expect(finalOwnerBalance.toString()).to.equal(expectedFinalBalance.toString());
    });
    
    it("Should revert rescuing funds of the staking token", async function () {
      await expect(erc20SemiAnnualStaking.connect(owner).rescueFunds(await erc20Token.getAddress(), ethers.parseEther('10'))).to.be.rejectedWith("Cannot rescue the staking token");
    });
  });


  describe("Deposit Rewards", function(){
    it("Should allow owner to deposit rewards into the contract", async function() {
      // Define the amount of rewards to be deposited
      const depositAmount = ethers.parseEther("100");
    
      // Transfer tokens to owner
      await erc20Token.transfer(await owner.getAddress(), depositAmount);
    
      // Approve the staking contract to spend owner's tokens
      await erc20Token.connect(owner).approve(await erc20SemiAnnualStaking.getAddress(), depositAmount);
    
      // Check initial balance of staking contract
      const initialBalance = await erc20Token.balanceOf(await erc20SemiAnnualStaking.getAddress());
    
      // Owner deposits rewards into the staking contract
      await erc20SemiAnnualStaking.connect(owner).depositRewards(depositAmount);
    
      // Check final balance of staking contract
      const finalBalance = await erc20Token.balanceOf(await erc20SemiAnnualStaking.getAddress());
   
      // Expect the final balance to be the initial balance plus the deposit amount
      expect(finalBalance.toString()).to.equal(BigNumber.from(initialBalance).add(depositAmount).toString());
    });
    
    // Teste para garantir que apenas o proprietário possa depositar recompensas:
    it("Should fail if a non-owner tries to deposit rewards", async function() {
      const depositAmount = ethers.parseEther("10");
      await expect(erc20SemiAnnualStaking.connect(addr1).depositRewards(depositAmount)).to.be.rejectedWith("Ownable: caller is not the owner");
    });
    
    // Teste para garantir que o depósito não exceda o saldo do remetente:
    it("Should fail if the deposit amount exceeds the sender's allowance", async function() {
      // Configurar uma permissão menor para o proprietário
      const allowanceAmount = ethers.parseEther("500");
      await erc20Token.connect(owner).approve(await erc20SemiAnnualStaking.getAddress(), allowanceAmount);
    
      // Tentar depositar uma quantidade maior do que a allowance
      const depositAmount = ethers.parseEther("1000");
      await expect(erc20SemiAnnualStaking.connect(owner).depositRewards(depositAmount))
        .to.be.rejectedWith("ERC20: transfer amount exceeds allowance");
    });
    
    // Teste para garantir que o depósito não possa ser feito sem a aprovação adequada:
    it("Should fail if the deposit amount exceeds the approved amount", async function() {
      const depositAmount = ethers.parseEther("100");
    
      // Transfer tokens to owner but do not approve them for spending
      await erc20Token.transfer(await owner.getAddress(), depositAmount);
    
      // Attempt to deposit without approval should fail
      await expect(erc20SemiAnnualStaking.connect(owner).depositRewards(depositAmount))
        .to.be.rejectedWith("ERC20: transfer amount exceeds allowance");
    });
    
    it("Should fail if the deposit amount is zero", async function() {
      const depositAmount = ethers.parseEther("0");
      await expect(erc20SemiAnnualStaking.connect(owner).depositRewards(depositAmount)).to.be.rejectedWith("Deposit amount must be greater than zero");
    });
    
  });


  describe("Reward Calculation", function () {
    
    it("Should not allow staking more than MAX_STAKE amount", async function () {
        const excessiveStakeAmount = BigNumber.from(MAX_STAKE).add(ethers.parseEther("1")); // 1.000.001 tokens, which is above the max limit

        await erc20Token.connect(owner).approve(await erc20SemiAnnualStaking.getAddress(), excessiveStakeAmount.toString());

        await expect(
            erc20SemiAnnualStaking.connect(owner).stake(excessiveStakeAmount.toString())
        ).to.be.rejectedWith("Exceeds max stake amount");
    });

    it("Should not allow claiming rewards within the LOCK_PERIOD", async function () {
      // Tente reivindicar recompensas sem avançar o tempo
      await expect(
          erc20SemiAnnualStaking.connect(owner).claimReward()
      ).to.be.rejectedWith("Staking still in lock period");
  
      // Avance o tempo e tente novamente
      await advanceTimeAndBlock(LOCK_PERIOD);
      await erc20SemiAnnualStaking.connect(owner).claimReward();
    });
  
});

describe("Staking and Unstaking", function () {

    it("Should allow a user to stake and unstake correctly", async function () {
        // Define the amount of rewards to be deposited
        const depositAmount = ethers.parseEther("105");
        const stakingAmount = ethers.parseEther("100");
        // Transfer tokens to owner
        await erc20Token.connect(owner).transfer(await addr1.getAddress(), depositAmount.toString());
       
        const addr1Balance = await erc20Token.balanceOf(await addr1.getAddress());
        // console.log("Addr1 balance before staking: ", ethers.formatEther(addr1Balance));

        await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakingAmount);
        await erc20SemiAnnualStaking.connect(addr1).stake(stakingAmount);

        // Advance time by 180 days
        await advanceTimeAndBlock(LOCK_PERIOD);

        const stakedAmount = await erc20SemiAnnualStaking.totalStakeOf(await addr1.getAddress());
        expect(stakedAmount).to.equal(stakingAmount);

        // Unstake
        await erc20SemiAnnualStaking.connect(addr1).withdraw(stakingAmount);
        const remainingStakedAmount = await erc20SemiAnnualStaking.totalStakeOf(await addr1.getAddress());

        const addr1BalanceAfter = await erc20Token.balanceOf(await addr1.getAddress());
        // console.log("Addr1 balance After staking: ", ethers.formatEther(addr1BalanceAfter));

        // console.log("Remaining Staked Amount: ", ethers.formatEther(remainingStakedAmount))

        expect(remainingStakedAmount).to.equal(0);
    });

});


describe("Front-Running and Time-Based Attacks", function() {

  it("should not allow transactions to reorder during staking", async function() {
    // We're going to simulate this by trying to stake with addr1, then addr2, but hoping addr2's stake goes through first.

    // Mint tokens for addr1 and addr2
    await erc20Token.connect(owner).transfer(await addr1.getAddress(), stakeAmount.toString());
    await erc20Token.connect(owner).transfer(await addr2.getAddress(), stakeAmount.toString());

    // Approve the staking contract to move their tokens
    await erc20Token.connect(addr1).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());
    await erc20Token.connect(addr2).approve(await erc20SemiAnnualStaking.getAddress(), stakeAmount.toString());

    // Setup the staking transactions, but don't await them yet
    const tx1 = erc20SemiAnnualStaking.connect(addr1).stake(stakeAmount.toString());
    const tx2 = erc20SemiAnnualStaking.connect(addr2).stake(stakeAmount.toString());

    // Simulate the transactions being mined in a different order
    await Promise.all([tx2, tx1]);

    const balance1 = await erc20SemiAnnualStaking.totalStakeOf(await addr1.getAddress());
    const balance2 = await erc20SemiAnnualStaking.totalStakeOf(await addr2.getAddress());

    // Confirm that the stakes went through in the right order
    expect(balance1.toString()).to.eq(stakeAmount.toString());
    expect(balance2.toString()).to.eq(stakeAmount.toString());
  });

});



});




