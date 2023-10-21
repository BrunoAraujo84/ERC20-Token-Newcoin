// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "../ERC20BiennialStaking.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ProxyBiennialStaking is Ownable {

    // Endereço da implementação atual de staking
    address public stakingImplementation;
    // Armazena o endereço da próxima implementação para caso haja uma troca planejada
    address public pendingImplementation;
    // Timestamp para controle de quando uma nova implementação foi solicitada
    uint256 public pendingImplementationTimestamp;
    // Define um atraso de 2 dias entre a solicitação de mudança de implementação e sua efetivação
    uint256 public constant IMPLEMENTATION_CHANGE_DELAY = 2 days;
    // Armazena o hash do bytecode esperado da nova implementação
    bytes32 public expectedImplementationHash;
    // Registra as implementações já utilizadas, evitando reutilização
    mapping(address => bool) public usedImplementations;
    // Evento disparado quando a implementação de staking muda
    event StakingImplementationChanged(address indexed previousImplementation, address indexed newImplementation);
    // Evento disparado quando uma troca de implementação é solicitada
    event ImplementationChangeRequested(address indexed newImplementation);

    // Construtor: define a implementação inicial e o hash do bytecode esperado
    constructor(address _stakingImplementation, bytes32 _expectedImplementationHash) {
        // Verifica se o endereço e o hash fornecidos são válidos
        require(_stakingImplementation != address(0), "Implementation address cannot be 0x0");
        require(_expectedImplementationHash != 0, "Expected hash cannot be 0x0");
        // Confirma se o hash do bytecode da implementação corresponde ao esperado
        require(codeHash(_stakingImplementation) == _expectedImplementationHash, "Implementation code hash does not match expected hash");
        // Configura a implementação inicial e seu hash esperado
        stakingImplementation = _stakingImplementation;
        expectedImplementationHash = _expectedImplementationHash;
        // Dispara um evento indicando a mudança da implementação
        emit StakingImplementationChanged(address(0), _stakingImplementation);
    }

    // Função para solicitar a mudança da implementação de staking
    function requestStakingImplementationChange(address _stakingImplementation) public onlyOwner {
        // Garante que o endereço da nova implementação é válido e diferente da implementação atual
        require(_stakingImplementation != address(0), "Implementation address cannot be 0x0");
        require(_stakingImplementation != stakingImplementation, "New address is the same as the current address");
        // Proíbe o downgrade para uma versão anterior
        require(!usedImplementations[_stakingImplementation], "Cannot downgrade to previous version");
        // Garante que o hash do bytecode da nova implementação corresponda ao esperado
        require(codeHash(_stakingImplementation) == expectedImplementationHash, "Implementation code hash does not match expected hash");
        // Marca a implementação proposta como usada
        usedImplementations[_stakingImplementation] = true;
        // Define a implementação pendente e o timestamp da solicitação
        pendingImplementation = _stakingImplementation;
        pendingImplementationTimestamp = block.timestamp;
        // Emite um evento informando sobre a solicitação de mudança
        emit ImplementationChangeRequested(_stakingImplementation);
    }

    // Função para confirmar a mudança da implementação de staking após o período de espera
    function confirmStakingImplementationChange() public onlyOwner {
        // Garante que uma mudança de implementação foi solicitada
        require(pendingImplementation != address(0), "No implementation change requested");
        // Verifica se o período de espera foi respeitado
        require(block.timestamp >= pendingImplementationTimestamp + IMPLEMENTATION_CHANGE_DELAY, "Implementation change delay not passed");
        // Armazena a implementação atual
        address oldImplementation = stakingImplementation;

        // Marcar a implementação antiga como usada
        usedImplementations[oldImplementation] = true;
        // Atualiza o endereço da implementação e limpa a implementação pendente
        stakingImplementation = pendingImplementation;
        pendingImplementation = address(0);
        // Emite um evento informando sobre a conclusão da mudança
        emit StakingImplementationChanged(oldImplementation, stakingImplementation);
    }

    // Função para resgatar tokens ERC20 do contrato
    function rescueTokens(address tokenAddress, address to, uint256 amount) public onlyOwner {
        IERC20 token = IERC20(tokenAddress);
        require(token.transfer(to, amount), "Token transfer failed");
    }

    // Função para resgatar Ether do contrato
    function rescueEther(address payable to, uint256 amount) public onlyOwner {
        (bool success,) = to.call{value: amount}("");
        require(success, "Ether transfer failed");
    }

    // Retorna o hash do bytecode do contrato fornecido
    function codeHash(address target) private view returns (bytes32) {
        bytes32 hash;
        assembly { hash := extcodehash(target) }
        return hash;
    }

    // Função para obter o hash esperado da implementação
    function getExpectedImplementationHash() external onlyOwner view returns (bytes32) {
        return expectedImplementationHash;
    }

    // Função que permite que o contrato receba Ether sem dados
    receive() external payable {}

    // Função de fallback para fazer chamadas ao contrato de implementação
    fallback() external payable {
        address target = stakingImplementation;
        require(target != address(0), "Implementation address not set");

        assembly {
            // Copia os dados da transação para a memória.
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize())
            
            // Executa delegatecall. Isso irá propagar o remetente e a quantidade de ether.
            let result := delegatecall(gas(), target, ptr, calldatasize(), 0, 0)
            
            // Carrega o tamanho da resposta.
            let size := returndatasize()
            returndatacopy(ptr, 0, size)

            // Verifica o resultado da chamada e retorna ou reverte.
            switch result
            case 0 { revert(ptr, size) }
            default { return(ptr, size) }
        }
    }
}
