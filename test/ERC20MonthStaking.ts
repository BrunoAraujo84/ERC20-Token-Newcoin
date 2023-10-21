import { use, expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract, ContractFactory, Signer , ContractTransactionResponse, ContractTransaction} from "ethers";
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { ERC20Token, ERC20MonthStaking } from "../typechain-types";
import { TransactionReceipt } from "@ethersproject/abstract-provider";
import { error } from "console";
import { ContractReceipt } from "@ethersproject/contracts";
import hre from "hardhat";


describe("Month Staking", function() {
    let ERC20MonthStakingFactory: ContractFactory;
    let erc20MonthStaking: ERC20MonthStaking;
    let owner: Signer;
    let addr1: Signer;
    let addr2: Signer;
    let addr3: Signer;
    let addrs: Signer[];
    let ERC20TokenFactory: ContractFactory;
    let erc20Token: ERC20Token;
    const initialSupply: BigNumber = BigNumber.from(ethers.parseEther('1000'));
    const stakeAmount: BigNumber = BigNumber.from(ethers.parseEther('1000'));
    const LOCK_PERIOD = 30 * 24 * 60 * 60; // 30 dias em segundos
    const INITIAL_REWARD_RATE = BigNumber.from(20); // 0.20% em base de pontos percentuais
    const FINAL_REWARD_RATE = BigNumber.from(20); // 0.20% em base de pontos percentuais
    const MAX_STAKE = ethers.parseEther("500000"); // limite de 500.000 tokens
    const REWARD_FEE_RATE = 0; // 0% taxa sobre a recompensa

    beforeEach(async function() {
        // Get Signers
        [owner, addr1, addr2, addr3, ...addrs] = (await ethers.getSigners()) as any;
  
        // Deploy ERC20Token contract
        ERC20TokenFactory = await ethers.getContractFactory("ERC20Token");
        erc20Token = (await ERC20TokenFactory.deploy()) as ERC20Token;
        await erc20Token.initialize("Newcoin", "NEW");

        // Deploy ERC20SemiAnnualStaking contract
        ERC20MonthStakingFactory = await ethers.getContractFactory("ERC20MonthStaking");
        erc20MonthStaking = (await ERC20MonthStakingFactory.deploy(await erc20Token.getAddress())) as ERC20MonthStaking;
        //console.log(erc20SemiAnnualStaking);

        // Owner stakes some tokens
        await erc20Token.connect(owner).approve(await erc20MonthStaking.getAddress(), stakeAmount.toString());
        await erc20MonthStaking.connect(owner).stake(stakeAmount.toString());

    });
 
    async function advanceTimeAndBlock(time: number) {
      await ethers.provider.send("evm_increaseTime", [time]);
      await ethers.provider.send("evm_mine", []);
    }


    describe("Withdraw", function() {
        it("Should not allow withdrawal before end of staking period", async function() {
          await expect(erc20MonthStaking.withdraw(stakeAmount.toString()))
              .to.be.rejectedWith('Staking still in lock period');
        });
      
        it("Should not allow withdrawal of more than staked amount", async function() {
          await expect(erc20MonthStaking.withdraw(stakeAmount.mul(2).toString()))
          .to.be.rejectedWith('Withdrawal amount exceeds staked amount');
        });
  
        it('Should revert when trying to withdraw during lock period', async function () {
          // Transfer some tokens to addr1 and approve them for spending
          await erc20Token.transfer(await addr1.getAddress(), stakeAmount.toString());
          await erc20Token.connect(addr1).approve(await erc20MonthStaking.getAddress(), stakeAmount.toString());
        
          // Deposit some tokens
          await erc20MonthStaking.connect(addr1).stake(stakeAmount.toString());
        
          // Try to withdraw during lock period and expect an error
          await expect(erc20MonthStaking.connect(addr1).withdraw(stakeAmount.toString())).to.be.rejectedWith('Staking still in lock period');
        });
        
  
        it("Should allow withdrawal after lock period", async function() {
          const additionalTokens = ethers.parseEther("1");
        
          // First, transfer tokens to addr1
          await erc20Token.connect(owner).transfer((await addr1.getAddress()), stakeAmount.toString());
        
          // Approve the staking contract to spend tokens on behalf of addr1
          await erc20Token.connect(addr1).approve(await erc20MonthStaking.getAddress(), stakeAmount.toString());
        
          const balanceBeforeWithdrawal = await erc20Token.balanceOf(await addr1.getAddress());
        
          // Stake some tokens
          const stakeTx = await erc20MonthStaking.connect(addr1).stake(stakeAmount.toString());
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
        
          const withdrawalTx = await erc20MonthStaking.connect(addr1).withdraw(stakeAmount.toString());
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
            
        await erc20Token.connect(addr1).approve(await erc20MonthStaking.getAddress(), stakeAmount.toString());
        await erc20MonthStaking.connect(addr1).stake(stakeAmount.toString());
    
       
        // Avança o tempo na blockchain de teste por 30 dias (aproximadamente um mês)
        await network.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
        await network.provider.send("evm_mine");
        
        const [amount, time, rewardRate, reward] = await erc20MonthStaking.getStakeInfo(await addr1.getAddress());
       
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
        await erc20Token.connect(addr1).approve(await erc20MonthStaking.getAddress(), stakeAmount.toString());
    
        // Então, fazer o stake dos tokens
        await erc20MonthStaking.connect(addr1).stake(stakeAmount.toString());
    
        // Agora, tentar sacar antes do final do período de staking deve ser revertido
        await expect(erc20MonthStaking.connect(addr1).withdraw(stakeAmount.toString()))
        .to.be.rejectedWith('Staking still in lock period');
      });

      it("Should gradually decrease reward rate over time", async function() {
        // Supondo que o 'owner' é uma instância Signer representando a conta do proprietário
        await erc20Token.connect(owner).transfer((await addr1.getAddress()), stakeAmount.toString());
    
        await erc20Token.connect(addr1).approve(await erc20MonthStaking.getAddress(), stakeAmount.toString());
        await erc20MonthStaking.connect(addr1).stake(stakeAmount.toString());
    
        // Avança o tempo na blockchain de teste por 90 dias (aproximadamente metade do período de bloqueio)
        await network.provider.send("evm_increaseTime", [90 * 24 * 60 * 60]);
        await network.provider.send("evm_mine");
    
        // Chame a função updateReward para atualizar a taxa de recompensa
        await erc20MonthStaking.connect(addr1).updateReward(await addr1.getAddress());
    
        const [amount, time, rewardRate, reward] = await erc20MonthStaking.getStakeInfo(await addr1.getAddress());
    
        // Aqui, a taxa de recompensa deveria ser algo entre 0.45% e 0.25%
        // Supondo que a taxa diminui linearmente, a taxa esperada seria por volta de 0.35%
        // A lógica exata depende da implementação do contrato
        const expectedRewardRate = INITIAL_REWARD_RATE.add(BigNumber.from(FINAL_REWARD_RATE)).div(2);
    
        expect(rewardRate.toString()).to.equal(expectedRewardRate.toString());
      });
   
        it("Should keep the reward rate the same over time", async function() {
            // Supondo que o 'owner' é uma instância Signer representando a conta do proprietário
            await erc20Token.connect(owner).transfer((await addr1.getAddress()), stakeAmount.toString());
            
            await erc20Token.connect(addr1).approve(await erc20MonthStaking.getAddress(), stakeAmount.toString());
            await erc20MonthStaking.connect(addr1).stake(stakeAmount.toString());
    
            // Avança o tempo na blockchain de teste por 10 dias
            await network.provider.send("evm_increaseTime", [10 * 24 * 60 * 60]);
            await network.provider.send("evm_mine");
    
            // Chame a função updateReward para atualizar a taxa de recompensa
            await erc20MonthStaking.connect(addr1).updateReward(await addr1.getAddress());
    
            const [, , newRewardRate, ] = await erc20MonthStaking.getStakeInfo(await addr1.getAddress());
    
            // Verifique se a nova taxa de recompensa é menor que a taxa inicial
            expect(BigNumber.from(newRewardRate).eq(INITIAL_REWARD_RATE)).to.be.true;
        });

    });


    describe("Reward Fee", function() {
      it("Should correctly apply reward fee on withdrawal", async function() {
        // Transferir tokens para addr1
        await erc20Token.connect(owner).transfer((await addr1.getAddress()), stakeAmount.toString());
        
        // Aprovar o contrato de staking para gastar tokens em nome de addr1
        await erc20Token.connect(addr1).approve(await erc20MonthStaking.getAddress(), stakeAmount.toString());
  
        await erc20MonthStaking.connect(addr1).stake(stakeAmount.toString());
        await network.provider.send("evm_increaseTime", [LOCK_PERIOD]);
        await network.provider.send("evm_mine"); // avança o tempo na blockchain de teste
        await erc20MonthStaking.connect(addr1).withdraw(stakeAmount.toString());
       
        const stakeInfo = await erc20MonthStaking.getStakeInfo(await addr1.getAddress()) as unknown as [BigNumber, BigNumber, BigNumber, BigNumber];
        const reward = stakeInfo[3];

        expect(reward.toString()).to.equal("0"); // a recompensa deve ter sido retirada
      });
  
      it("Should not charge a fee when withdrawing rewards", async function() {
        // Transferir tokens para addr1
        await erc20Token.connect(owner).transfer((await addr1.getAddress()), stakeAmount.toString());
        await erc20Token.connect(addr1).approve(await erc20MonthStaking.getAddress(), stakeAmount.toString());
    
        // Fazer stake dos tokens
        await erc20MonthStaking.connect(addr1).stake(stakeAmount.toString());
    
        // Avançar o tempo para passar o período de bloqueio
        await network.provider.send("evm_increaseTime", [LOCK_PERIOD]);
        await network.provider.send("evm_mine");
    
        // Obter a recompensa antes da retirada
        const [amountBefore, , , rewardBefore] = await erc20MonthStaking.getStakeInfo(await addr1.getAddress());
    
        // Retirar a recompensa
        await erc20MonthStaking.connect(addr1).withdraw(stakeAmount.toString());
    
        // Obter a recompensa após a retirada
        const [amountAfter, , , rewardAfter] = await erc20MonthStaking.getStakeInfo(await addr1.getAddress());
    
        // O valor retirado deve ser exatamente igual ao valor de stake mais a recompensa antes da retirada
        const expectedWithdrawal = stakeAmount.add(rewardBefore);
        const actualWithdrawal = BigNumber.from(amountBefore).sub(amountAfter).add(rewardBefore);
    
        expect(actualWithdrawal.eq(expectedWithdrawal)).to.equal(true);
      });
    
    
    it("Should distribute reward fee to remaining stakers", async function() {
      // Initial amount to stake
      const stakeAmount = ethers.parseEther("1000");
      const additionalTokens = ethers.parseEther("10");
    
      // Transfer tokens from owner to addr1, addr2 and addr3
      await erc20Token.connect(owner).transfer(await addr1.getAddress(), stakeAmount);
      await erc20Token.connect(owner).transfer(await addr2.getAddress(), stakeAmount);
      await erc20Token.connect(owner).transfer(await addr3.getAddress(), stakeAmount);
    
      await erc20Token.connect(addr1).approve(await erc20MonthStaking.getAddress(), stakeAmount);
      await erc20Token.connect(addr2).approve(await erc20MonthStaking.getAddress(), stakeAmount);
      await erc20Token.connect(addr3).approve(await erc20MonthStaking.getAddress(), stakeAmount);
    
      await erc20MonthStaking.connect(addr1).stake(stakeAmount);
      await erc20MonthStaking.connect(addr2).stake(stakeAmount);
      await erc20MonthStaking.connect(addr3).stake(stakeAmount);
    
      // Get stake info before addr1 withdraws
      const [amountBefore2, , , rewardBefore2] = await erc20MonthStaking.getStakeInfo(await addr2.getAddress());
      const [amountBefore3, , , rewardBefore3] = await erc20MonthStaking.getStakeInfo(await addr3.getAddress());
    
      // addr1 withdraws stake
      // fast-forward time
      await ethers.provider.send("evm_increaseTime", [180 * 24 * 60 * 60]); // Increase time by 180 days
    
      // Transfer additional tokens from owner to addr1
      await erc20Token.connect(owner).transfer(await addr1.getAddress(), additionalTokens);
    
      await erc20MonthStaking.connect(addr1).withdraw(stakeAmount);
   
      // Get stake info after addr1 withdraws
      const [amountAfter2, , , rewardAfter2] = await erc20MonthStaking.getStakeInfo(await addr2.getAddress());
      const [amountAfter3, , , rewardAfter3] = await erc20MonthStaking.getStakeInfo(await addr3.getAddress());
    
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
    
      await erc20Token.connect(addr1).approve(await erc20MonthStaking.getAddress(), stakeAmount.toString());
      await erc20Token.connect(addr2).approve(await erc20MonthStaking.getAddress(), stakeAmount.toString());
      await erc20Token.connect(addr3).approve(await erc20MonthStaking.getAddress(), stakeAmount.toString());
    
      await erc20MonthStaking.connect(addr1).stake(stakeAmount.toString());
      await erc20MonthStaking.connect(addr2).stake(stakeAmount.toString());
      await erc20MonthStaking.connect(addr3).stake(stakeAmount.toString());
    
      // addr1 withdraws stake
      // fast-forward time
      await ethers.provider.send("evm_increaseTime", [180 * 24 * 60 * 60]); // Increase time by 180 days
    
      // Transfer additional tokens from owner to addr1
      await erc20Token.connect(owner).transfer(await addr1.getAddress(), additionalTokens);
      await erc20Token.connect(owner).transfer(await addr2.getAddress(), additionalTokens);
      await erc20Token.connect(owner).transfer(await addr3.getAddress(), additionalTokens);

      await erc20MonthStaking.connect(addr1).withdraw(stakeAmount.toString());
      await erc20MonthStaking.connect(addr2).withdraw(stakeAmount.toString());
      await erc20MonthStaking.connect(addr3).withdraw(stakeAmount.toString());

      // 4. Resgatar a taxa de recompensa
      const ownerBalanceBefore = await erc20Token.balanceOf(await owner.getAddress());
      const finalTotalRewardFee = await erc20MonthStaking.getTotalRewardFee();
      // console.log(finalTotalRewardFee, "Total Reward Fee Final")
      
      // Tente resgatar a taxa de recompensa quando não há taxa para ser resgatada.
      try {
        await erc20MonthStaking.connect(owner).withdrawRewardFee();
        // Se a linha acima for executada sem erro, o teste falha
        expect.fail("Expected 'withdrawRewardFee' to throw an error, but it did not");
      } catch (error: any) {
        // Verifique se o erro lançado é o que esperamos
        expect(error.message).to.include("No reward fee to withdraw");
      }
    });    
 
  });


});