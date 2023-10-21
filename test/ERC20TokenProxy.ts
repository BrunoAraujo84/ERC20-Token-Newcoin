import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract, ContractFactory, Signer } from "ethers";
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { ERC20Token, ERC20TokenProxy as ImportedERC20TokenProxy } from "../typechain-types";
import { Overrides, ContractTransaction } from "@ethersproject/contracts";
import hre from "hardhat";
import { Console } from "console";
// import ERC20TokenProxyArtifact from '../artifacts/contracts/ERC20TokenProxy.sol/ERC20TokenProxy.json';
import { proxy } from "../typechain-types/@openzeppelin/contracts";


interface TransparentUpgradeableProxy {
    upgradeTo: (newImplementation: string) => Promise<void>;

    // outros métodos que você deseja usar...
  }

interface ERC20TokenProxy extends Contract {
    // Adicione esta linha para a função implementation
    // upgradeTo(newImplementation: string, overrides?: Overrides): Promise<ContractTransaction>;
}

interface ExtendedContract extends Contract, ERC20TokenProxy {}

async function callUpgradeTo(signer: Signer, contract: Contract, newImplementation: string): Promise<any> {
    return await signer.sendTransaction({
        to: contract.getAddress(),
        data: contract.interface.encodeFunctionData("upgradeTo", [newImplementation])
    });
}

describe("Proxy", function() {
    let TokenFactory: ContractFactory;
    let ProxyFactory: ContractFactory;
    let proxy: ExtendedContract;
    let token: ERC20Token;
    let owner: Signer;
    let addr1: Signer;
    let addr2: Signer;
    let signers: Signer[];

    beforeEach(async function() {
        signers = await ethers.getSigners();
        owner = signers[0];
        addr1 = signers[1];
        addr2 = signers[2];

        TokenFactory = await ethers.getContractFactory("ERC20Token", owner);
        token = (await TokenFactory.deploy()) as ERC20Token;
        
        ProxyFactory = await ethers.getContractFactory("ERC20TokenProxy", owner);
        proxy = (await ProxyFactory.deploy(await token.getAddress(),await owner.getAddress(), ethers.toUtf8Bytes(""))) as ExtendedContract;

        await token.initialize("Newcoin", "NEW");
    });

    describe("Initial Analysis", function (){
        // Teste para verificar o endereço do administrador
        it("Should correctly set the admin address", async function() {
            expect(await proxy.getAdmin()).to.equal(await owner.getAddress());
        });

        it("Should change the admin correctly", async function() {
            let newAdmin = ethers.Wallet.createRandom();
        
            // Mudança de admin
            await proxy.changeAdminAndEmitEvent(newAdmin.address);
        
            // Verifique se o admin foi alterado corretamente
            expect(await proxy.getAdmin()).to.equal(newAdmin.address);
        });

        it("Should not allow non-admins to upgrade the contract", async function() {
            let randomWallet = ethers.Wallet.createRandom();
            let nonAdmin = randomWallet.connect(ethers.provider); // Conecte a carteira ao provedor
            let newToken = (await TokenFactory.deploy()) as ERC20Token;
            await newToken.initialize("NewZyncoin", "NZC");
         
            // Cast proxy to any so we can call upgradeTo method
            let proxyAny: any = proxy;
         
            // Try to upgrade using the non-admin account
            await expect(proxyAny.connect(nonAdmin).upgradeTo(await newToken.getAddress())).to.be.rejectedWith("Admin only");
          });
          
          it("Should not allow non-admins to change the admin", async function() {
            let randomNonAdmin = ethers.Wallet.createRandom();
            let randomNewAdmin = ethers.Wallet.createRandom();
            let nonAdmin = randomNonAdmin.connect(ethers.provider); // Conecte a carteira ao provedor
            let newAdmin = randomNewAdmin.connect(ethers.provider); // Conecte a carteira ao provedor

            // Cast proxy to any so we can call changeAdmin method
            let proxyAny: any = proxy;
          
            // Try to change the admin using the non-admin account
            await expect(proxyAny.connect(nonAdmin).changeAdminAndEmitEvent(newAdmin.address)).to.be.rejectedWith("Admin only");
          });
          
    });


    describe("Contract Version", function (){
        it("Should increment the contract version after an upgrade", async function() {
            let initialVersionString = await proxy.contractVersion(); // assume this returns a string
            let initialVersion = BigNumber.from(initialVersionString);
        
            // Implante um novo contrato ERC20Token
            let newToken = (await TokenFactory.deploy()) as ERC20Token;
            await newToken.initialize("NewZyncoin", "NZC");
        
            // Upgrade para o novo contrato ERC20Token
            await proxy.upgradeTo(await newToken.getAddress());
           
            // Adicionando valor no formato BigNumber
            let expectedVersion = initialVersion.add(1).toString();
           
            // Verifique se a versão do contrato foi incrementada
            expect((await proxy.contractVersion()).toString()).to.equal(expectedVersion);
        });

        it('Should increment the contract version after multiple upgrades', async function () {
            let newToken = (await TokenFactory.deploy()) as ERC20Token;
            await proxy.upgradeTo(await newToken.getAddress());
            newToken = (await TokenFactory.deploy()) as ERC20Token;
            await proxy.upgradeTo(await newToken.getAddress());
            expect(await proxy.contractVersion()).to.equal(3);
        });
    });


    describe("Initialize Contracts ", function(){
        // Teste para verificar a inicialização dos contratos e a implementação do contrato
        it("Should correctly initialize contracts and set the correct implementation", async function() {
            expect(await proxy.getImplementation()).to.equal(await token.getAddress());
        });

        it('Should fail if the initialization parameters are invalid', async function () {
            let testToken = (await TokenFactory.deploy()) as ERC20Token;
            await expect(testToken.initialize("", "")).to.be.rejectedWith("ERC20: name parameter is invalid"); // Adapte esta mensagem de erro para a que você definiu no seu contrato
        });
    });


    describe("Interoperability and Events", function(){
        // Teste de Interoperabilidade com o Contrato Base:
        it('Should interact correctly with the base contract', async function () {
            expect((await token.totalSupply()).toString()).to.equal((20000000n * 10n**18n).toString());
            await token.connect(owner).mint(await addr1.getAddress(), 1000);
            expect((await token.totalSupply()).toString()).to.equal(((20000000n * 10n**18n) + 1000n).toString());
            expect((await token.balanceOf(await addr1.getAddress())).toString()).to.equal('1000');
        });
        
        // Testes de Eventos Emitidos:
        it('Should emit events correctly when the contract is upgraded', async function () {
            const newToken = (await TokenFactory.deploy()) as ERC20Token;
        
            // obtém o bloco mais recente antes da atualização
            let blockBeforeUpgrade = await ethers.provider.getBlock('latest');
        
            if(blockBeforeUpgrade === null) {
                throw new Error("Failed to get the block before upgrade");
            }
        
            await proxy.upgradeTo(await newToken.getAddress());
        
            // obtém o bloco mais recente após a atualização
            let blockAfterUpgrade = await ethers.provider.getBlock('latest');
        
            if(blockAfterUpgrade === null) {
                throw new Error("Failed to get the block after upgrade");
            }
        
            const filter = proxy.filters.ContractUpgraded();
            const events = await proxy.queryFilter(filter);
        
            //console.log(events);
            const eventData = events.map((event: any) => ({
                args: event.args.map((arg: any) => (typeof arg === "bigint" ? Number(arg) : arg)),
                event: event.fragment ? event.fragment.name : undefined,
            }));
            
            expect(eventData).to.deep.equal([
                {
                    args: [await newToken.getAddress(), 2, blockAfterUpgrade.timestamp],
                    event: 'ContractUpgraded',
                }
            ]);
        });
        
        it("Should emit events correctly when the admin is changed", async function() {
            const newAdmin = addr1;
            const admin = await proxy.getAdmin();  // Obtenha a conta administradora atual
            const adminWallet = owner;  // Assumindo que o deployer é a conta administradora
        
            const proxyInterface = new ethers.Contract(await proxy.getAddress(), ["function changeAdminAndEmitEvent(address)", "event AdminChanged(address indexed newAdmin, uint256 timestamp)"], adminWallet);
        
            await expect(proxyInterface.changeAdminAndEmitEvent(await newAdmin.getAddress()))
                .to.emit(proxyInterface, "AdminChanged");
        });
        
    });


    describe("Implementation Upgrades", function() {
        // Teste para verificar a atualização do contrato
        it("Should be able to upgrade the contract", async function() {
            // Implante um novo contrato ERC20Token
            let newToken = (await TokenFactory.deploy()) as ERC20Token;
            await newToken.initialize("NewZyncoin", "NZC");
    
            // Upgrade para o novo contrato ERC20Token
            await proxy.upgradeTo(await newToken.getAddress());
    
            // Verifique se a implementação do contrato foi atualizada para o novo contrato
            expect(await proxy.getImplementation()).to.equal(await newToken.getAddress());
        });
        
        it("Should handle multiple implementation upgrades", async function() {
          let initialVersionString = await proxy.contractVersion();
          let initialVersion = BigNumber.from(initialVersionString);
      
          // Deploy a new ERC20Token contract and upgrade the proxy to this new implementation
          let newToken = (await TokenFactory.deploy()) as ERC20Token;
          await newToken.initialize("NewZyncoin", "NZC");
          await proxy.upgradeTo(await newToken.getAddress());
          expect(await proxy.getImplementation()).to.equal(await newToken.getAddress());
          let newVersion = initialVersion.add(1);
          expect((await proxy.contractVersion()).toString()).to.equal(newVersion.toString());
      
          // Deploy another ERC20Token contract and upgrade the proxy to this new implementation
          newToken = (await TokenFactory.deploy()) as ERC20Token;
          await newToken.initialize("NewNewZyncoin", "NNZC");
          await proxy.upgradeTo(await newToken.getAddress());
          expect(await proxy.getImplementation()).to.equal(await newToken.getAddress());
          newVersion = newVersion.add(1);
          expect((await proxy.contractVersion()).toString()).to.equal(newVersion.toString());
        });
      
        it("Should reject invalid implementation upgrades", async function() {
            // Deploy a contract that is not a valid ERC20Token
            const InvalidContractFactory = await ethers.getContractFactory("InvalidContract", owner);
            const invalidContract = await InvalidContractFactory.deploy();
        
            // Check that the invalid implementation is indeed invalid
            expect(await proxy.isValidImplementation(await invalidContract.getAddress())).to.equal(false);
        
            // Try to upgrade the proxy to this invalid implementation
            await expect(proxy.upgradeTo(await invalidContract.getAddress())).to.be.rejectedWith("Invalid implementation");
        
            // The proxy implementation should not have changed
            expect(await proxy.getImplementation()).to.equal(await token.getAddress());
        });        
     
        it("Should only allow the admin to upgrade", async function() {
            // Tente executar a função de upgrade como um não-admin
            await expect(callUpgradeTo(addr1, proxy, await token.getAddress())).to.be.rejectedWith("Admin only");
        
            // Agora tente executar a função de upgrade como o admin
            await expect(callUpgradeTo(owner, proxy, await token.getAddress())).to.not.be.reverted;
        });

        it("Should not allow downgrades", async function() {
            const TokenFactory = await ethers.getContractFactory("ERC20Token");
            const token1 = await TokenFactory.deploy();
            const token2 = await TokenFactory.deploy();
        
            await callUpgradeTo(owner, proxy,await token1.getAddress());
            await callUpgradeTo(owner, proxy,await token2.getAddress());
            await expect(callUpgradeTo(owner, proxy,await token1.getAddress())).to.be.rejectedWith("Cannot downgrade");
        });
        
        
        
        

      });

});
