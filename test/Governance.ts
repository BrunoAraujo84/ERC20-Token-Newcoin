import { use, expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract, ContractFactory, Signer , ContractTransactionResponse, ContractTransaction} from "ethers";
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { ERC20Token, ERC20SemiAnnualStaking, ERC20AnnualStaking, ERC20BiennialStaking, ERC20QuadrennialStaking, Governance } from "../typechain-types";
import { TransactionReceipt } from "@ethersproject/abstract-provider";
import { error } from "console";
import { ContractReceipt } from "@ethersproject/contracts";
import hre from "hardhat";

describe("Governance", function() {
    let owner: Signer;
    let addr1: Signer;
    let addr2: Signer;
    let addr3: Signer;

    let GovernanceContract: ContractFactory;
    let governance: Governance;

    let ERC20TokenContract: ContractFactory;
    let token: ERC20Token;

    let ERC20SemiAnnualStakingContract: ContractFactory;
    let stakingSemiAnnual: ERC20SemiAnnualStaking;

    let ERC20AnnualStakingContract: ContractFactory;
    let stakingAnnual: ERC20AnnualStaking;

    let ERC20BiennialStakingContract: ContractFactory;
    let stakingBiennial: ERC20BiennialStaking;

    let ERC20QuadrennialStaking: ContractFactory;
    let stakingQuadrennial: ERC20QuadrennialStaking;

    before(async function() {
        // Obtenha os signatários
        [owner, addr1, addr2, addr3] = await ethers.getSigners();

        // Implemente o token
        ERC20TokenContract = await ethers.getContractFactory("ERC20Token");
        token = (await ERC20TokenContract.deploy()) as ERC20Token;
        await token.initialize("Newcoin", "NEW");

        // Implemente o contrato de staking
        ERC20SemiAnnualStakingContract = await ethers.getContractFactory("ERC20SemiAnnualStaking");
        stakingSemiAnnual = (await ERC20SemiAnnualStakingContract.deploy(await token.getAddress())) as ERC20SemiAnnualStaking;

        ERC20AnnualStakingContract = await ethers.getContractFactory("ERC20AnnualStaking");
        stakingAnnual = (await ERC20AnnualStakingContract.deploy(await token.getAddress())) as ERC20AnnualStaking;

        ERC20BiennialStakingContract = await ethers.getContractFactory("ERC20BiennialStaking");
        stakingBiennial = (await ERC20BiennialStakingContract.deploy(await token.getAddress())) as ERC20BiennialStaking;

        ERC20QuadrennialStaking = await ethers.getContractFactory("ERC20QuadrennialStaking");
        stakingQuadrennial = (await ERC20QuadrennialStaking.deploy(await token.getAddress())) as ERC20QuadrennialStaking;

        // Implemente o contrato de Governance
        GovernanceContract = await ethers.getContractFactory("Governance");
        let otherStakingContracts = [stakingAnnual.getAddress(), stakingBiennial.getAddress(), stakingQuadrennial.getAddress()];
        governance = (await GovernanceContract.connect(owner).deploy(
            await stakingSemiAnnual.getAddress(),
            otherStakingContracts
        )) as Governance;        

    });

    async function advanceTimeAndBlock(time: number) {
        await ethers.provider.send("evm_increaseTime", [time]);
        await ethers.provider.send("evm_mine", []);
    }

    describe("First Testing", function(){

        it("O dono do contrato deve ser o criador do contrato", async function() {
            expect(await governance.owner()).to.equal(await owner.getAddress());
        });
    
        it("Deve permitir que o dono proponha uma nova proposta", async function() {
            await expect(governance.connect(owner).propose("Nova proposta","Descricao Maroto", stakingSemiAnnual.getAddress(), 7))
                .to.emit(governance, 'NewProposal');
        });
    
        it("Não deve permitir que não proprietários proponham uma nova proposta", async function() {
            await expect(governance.connect(addr1).propose("Nova proposta","Descricao Maroto", stakingSemiAnnual.getAddress(), 7))
                .to.be.rejectedWith("Ownable: caller is not the owner");
        });
    
        it("Deve permitir a transferência de propriedade", async function() {
            await governance.connect(owner).transferOwnership(await addr1.getAddress());
            expect(await governance.owner()).to.equal(await addr1.getAddress());

            // Reverter a transferência de propriedade
            await governance.connect(addr1).transferOwnership(await owner.getAddress());
        });

    });


    describe("Second Testing", function(){

        it("Should reject proposals with ineligible staking contracts", async function() {
            await expect(governance.connect(owner).propose("New proposal","Descricao Maroto", await owner.getAddress(), 7))
                .to.be.rejectedWith("Provided address is not a recognized staking contract");
        });
     
        it("Should allow a user with stake to vote on a proposal", async function() {
            // Define the amount of rewards to be deposited
            const depositAmount = ethers.parseEther("105");
            const stakingAmount = ethers.parseEther("100");
            const LOCK_PERIOD = 10 * 24 * 60 * 60; // 10 dias em segundos
            // Transfer tokens to owner
            await token.connect(owner).transfer(await addr3.getAddress(), depositAmount.toString());
           
            await token.connect(addr3).approve(await stakingSemiAnnual.getAddress(), stakingAmount);
            await stakingSemiAnnual.connect(addr3).stake(stakingAmount);

            // Assumindo que você tem algum mecanismo para 'stake' tokens para addr2 em stakingSemiAnnual
            await governance.connect(owner).propose("New proposal","Descricao Maroto", stakingSemiAnnual.getAddress(), 7);

            const proposalCount = await governance.proposalCount();
            // console.log(`Number of proposals: ${proposalCount.toString()}`);
            // console.log(`Voting with address: ${await addr3.getAddress()}`);

            // const test = await governance.connect(owner).lastVotedProposal(await addr3.getAddress());
            // console.log("Check voted to Addr2: ", test)

            const tx = await governance.connect(addr3).vote(BigNumber.from(proposalCount).sub(1).toNumber(), true);
            const receipt: any = await tx.wait();
           
            if (receipt == null){
                throw new Error("Error")
            }

            /*
            const debugVoteEvent = receipt.events?.filter((x: { event: string; args: any }) => { 
                return x.event === "DebugVote"; 
              })[0];
            
            if (debugVoteEvent) {
                console.log("DebugVote event captured: ", debugVoteEvent.args);
            } else {
                console.log("DebugVote event not found");
            }
            */

            await expect(tx).to.emit(governance, 'Voted');

            await advanceTimeAndBlock(LOCK_PERIOD);
            // const test2 = await governance.connect(owner).lastVotedProposal(await addr3.getAddress());
            // console.log("Teste 2 - Check voted to Addr2: ", test2)
        });
   
        it("Should prevent a user from voting twice on the same proposal", async function() {
            // Define the amount of rewards to be deposited
            const depositAmount = ethers.parseEther("105");
            const stakingAmount = ethers.parseEther("100");
            // Transfer tokens to owner
            await token.connect(owner).transfer(await addr1.getAddress(), depositAmount.toString());
           
            await token.connect(addr1).approve(await stakingSemiAnnual.getAddress(), stakingAmount);
            await stakingSemiAnnual.connect(addr1).stake(stakingAmount);

            await governance.connect(owner).propose("New proposal","Descricao Maroto", stakingSemiAnnual.getAddress(), 7);
            const proposalCount = await governance.proposalCount();
            const propostaid = BigNumber.from(proposalCount).sub(1).toNumber();
            await governance.connect(addr1).vote(propostaid, true);
            await expect(governance.connect(addr1).vote(propostaid, false))
                .to.be.rejectedWith("Address has already voted on this proposal");
        });
    
        it("Should allow the owner to close an open proposal", async function() {
            await governance.connect(owner).propose("New proposal","Descricao Maroto", stakingSemiAnnual.getAddress(), 0); // Proposta que fecha imediatamente
            await expect(governance.connect(owner).closeProposal(0)).to.emit(governance, 'ProposalClosed');
        });
   
        it("Should correctly count yes and no voters", async function() {
            // Define the amount of rewards to be deposited
            const depositAmount = ethers.parseEther("105");
            const stakingAmount = ethers.parseEther("100");
            // Transfer tokens to owner
            await token.connect(owner).transfer(await addr1.getAddress(), depositAmount.toString());
            await token.connect(owner).transfer(await addr2.getAddress(), depositAmount.toString());
           
            await token.connect(addr1).approve(await stakingSemiAnnual.getAddress(), stakingAmount);
            await token.connect(addr2).approve(await stakingSemiAnnual.getAddress(), stakingAmount);
            await stakingSemiAnnual.connect(addr1).stake(stakingAmount);
            await stakingSemiAnnual.connect(addr2).stake(stakingAmount);

            await governance.connect(owner).propose("New proposal","Descricao Maroto", stakingSemiAnnual.getAddress(), 7);

            const proposalCount = await governance.proposalCount();
            const propostaid = BigNumber.from(proposalCount).sub(1).toNumber();

            await governance.connect(addr1).vote(propostaid, true);
            await governance.connect(addr2).vote(propostaid, false);
   
            const [yesVoters, noVoters] = await governance.getVotersCount(propostaid);
            expect(yesVoters.toString()).to.equal("1");
            expect(noVoters.toString()).to.equal("1");
        });

    });


    describe("Testing staking restrictions", function(){

        it("Should only allow voting for users who have staked in the specified staking contract", async function() {
            // Define the amount of rewards to be deposited
            const depositAmount = ethers.parseEther("105");
            const stakingAmount = ethers.parseEther("100");
    
            // Transfer tokens to addr1 and addr2
            await token.connect(owner).transfer(await addr1.getAddress(), depositAmount.toString());
            await token.connect(owner).transfer(await addr2.getAddress(), depositAmount.toString());
    
            // addr1 stakes in stakingBiennial
            await token.connect(addr1).approve(await stakingBiennial.getAddress(), stakingAmount);
            await stakingBiennial.connect(addr1).stake(stakingAmount);
    
            // addr2 stakes in stakingSemiAnnual
            await token.connect(addr2).approve(await stakingSemiAnnual.getAddress(), stakingAmount);
            await stakingSemiAnnual.connect(addr2).stake(stakingAmount);
    
            // Owner proposes a new proposal, allowing only stakingBiennial stakers to vote
            await governance.connect(owner).propose("Proposal for Biennial stakers only","Descricao Maroto", stakingBiennial.getAddress(), 7);
            const proposalCount = await governance.proposalCount();
            const proposalId = BigNumber.from(proposalCount).sub(1).toNumber();
    
            // addr1 should be able to vote because they staked in stakingBiennial
            await expect(governance.connect(addr1).vote(proposalId, true)).to.emit(governance, 'Voted');
   
            // addr2 should NOT be able to vote because they staked in stakingSemiAnnual
            await expect(governance.connect(addr2).vote(proposalId, true))
                .to.be.rejectedWith("Must have tokens in staking to vote");
        });
    
    });
   
    
    describe("Proposal Retrieval", function() {
        it("Should retrieve proposal details correctly", async function() {
            // Criar uma proposta
            const proposalTitle = "Test Proposal";
            const proposalDescription = "Descricao Maroto";
            const stakingAddress = stakingSemiAnnual.getAddress();
            const duration = 7 * 24 * 60 * 60; // 7 dias em segundos
            const someTolerance = 5 * 60; // 5 minutos em segundos
            
            const block = await ethers.provider.getBlock('latest');
            if (!block) {
                throw new Error('Failed to retrieve the latest block.');
            }
            const currentTime = block.timestamp;

            await governance.connect(owner).propose(proposalTitle, proposalDescription, stakingAddress, duration);
    
            const proposalCount = await governance.proposalCount();
            const proposal = await governance.proposals(BigNumber.from(proposalCount).sub(1).toNumber());
 
            expect(proposal.description).to.equal(proposalDescription);
            expect(proposal.eligibleStakingContract).to.equal(await stakingAddress);
            // Se você quiser verificar o closingTime, por exemplo:
            // expect(proposal.closingTime).to.be.closeTo(currentTime + duration, someTolerance);
        });
    });
    

    describe("Proposal Timing", function() {
        it("Should not allow voting after proposal duration has ended", async function() {
            let stakingAddress = await stakingSemiAnnual.getAddress();
            await governance.connect(owner).propose("OK","Short duration proposal", stakingAddress, 1);

            // Avançando no tempo
            const ONE_DAY = 86400; // Número de segundos em um dia
            await advanceTimeAndBlock(ONE_DAY + 1);
    
            const proposalCount = await governance.proposalCount();
            await expect(governance.connect(addr1).vote(BigNumber.from(proposalCount).sub(1).toNumber(), true))
                .to.be.rejectedWith("Proposal is not open");
        });
    });

});

