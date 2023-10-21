// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

// MASTER - STAKING POOL

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

// Importe o contrato ERC20Token
import "../ERC20Token.sol";

contract ERC20SemiAnnualStaking is Ownable, ReentrancyGuard, Pausable {
    // Importando a biblioteca SafeMath para operações aritméticas seguras, evitando overflows e underflows.
    using SafeMath for uint256;
    // Importando a biblioteca Address para realizar operações relacionadas a endereços Ethereum de forma segura.
    using Address for address;

    // Estrutura que define as informações de uma aposta.
    struct StakeInfo {
        uint256 amount; // Quantidade de tokens apostados.
        uint256 time; // Timestamp do momento em que a aposta foi feita.
        uint256 rewardRate; // Taxa de recompensa para a aposta.
        uint256 reward; // Quantidade total de recompensa acumulada.
    }

    // Estrutura para controlar stakers ativos no contrato.
    struct ActiveStaker {
        address stakerAddress; // Endereço Ethereum do staker.
        bool exists; // Flag para verificar se um staker está ativo ou não.
    }

    // Referência ao token ERC20 que será usado para staking.
    ERC20Token private token;

    // Mapeamento para armazenar informações sobre a aposta de cada staker.
    mapping(address => StakeInfo) private stakers;

    // Mapeamento para gerenciar stakers ativos. 
    // Isso permite uma rápida verificação de existência e acesso ao endereço do staker.
    mapping(address => ActiveStaker) public activeStakersList;

    // Mapeamento para verificar se um endereço específico está congelado ou não.
    // Endereços congelados podem ter restrições adicionais ou bloqueios.
    mapping(address => bool) public frozenAddresses;

    // Referência ao primeiro staker ativo na lista de stakers ativos. 
    // Pode ser útil para operações de iteração ou para aplicar regras específicas ao primeiro staker.
    address public firstActiveStaker;

    // Referência ao último staker ativo na lista de stakers ativos.
    // Pode ser útil para operações de iteração ou para aplicar regras específicas ao último staker.
    address public lastActiveStaker;

    uint256 public totalStaked; // Total staking
    uint256 private constant LOCK_PERIOD = 180 days; // seis meses para bloqueio
    uint256 private constant INITIAL_REWARD_RATE = 45; // 0.45% em base de pontos percentuais
    uint256 private constant FINAL_REWARD_RATE = 25; // 0.25% em base de pontos percentuais
    uint256 private constant MAX_STAKE = 1000000 * (10**18); // limite de 1.000.000 tokens (com 18 casas decimais)
    uint256 private constant REWARD_FEE_RATE = 1; // 1% taxa sobre a recompensa
    uint256 private constant REWARD_THRESHOLD = 10000 * (10**18); // Dividendos 10.000 - Distribuição para os Holders
    uint256 private constant MAX_REWARD_PERIOD = 365 days; // Período máximo de recompensa para o recebimento de recompensa
    uint256 public totalRewardFee; // Novo campo para armazenar o total da taxa de recompensa

    event Staked(address indexed user, uint256 amount, uint256 time); // Evento disparado quando um usuário faz uma aposta (stake).
    event Withdrawn(address indexed user, uint256 amount); // Evento disparado quando um usuário retira sua aposta.
    event RewardUpdated(address indexed staker, uint256 reward); // Evento disparado quando a recompensa de um staker é atualizada.
    event RewardFeeDistributed(uint256 amount); // Evento disparado quando a taxa de recompensa é distribuída.
    event AddressFrozen(address indexed staker); // Evento disparado quando um endereço (staker) é congelado.
    event AddressUnfrozen(address indexed staker); // Evento disparado quando um endereço (staker) é descongelado.
    event FundsRescued(address token, uint256 amount); // Evento para resgatar fundos em caso de erros ou problemas.
    // event DebugEvent(address indexed sender); // Evento de depuração para rastrear informações úteis durante o desenvolvimento ou teste.

    // Construtor para inicializar o contrato com o endereço do token ERC20.
    constructor(address _tokenAddress) {
        // Verificando se o endereço fornecido é de um contrato.
        require(_tokenAddress.isContract(), "Token address is not a contract address");
        // Inicializando a variável token com a instância ERC20Token fornecida.
        token = ERC20Token(_tokenAddress);
    }

    // Função para verificar se um determinado endereço é um contrato.
    function isContract(address account) public view returns (bool) {
        uint256 size;
        // Assembly inline usado para obter o tamanho do código no endereço fornecido.
        assembly { size := extcodesize(account) }
        return size > 0;
    }

    // Função para depositar recompensas no contrato. Apenas o proprietário do contrato pode usar.
    function depositRewards(uint256 amount) external onlyOwner {
        require(amount > 0, "Deposit amount must be greater than zero");
        // Transferir tokens do chamador para o contrato.
        require(token.transferFrom(msg.sender, address(this), amount), "Transfer failed");
    }

    // Função para permitir que os usuários apostem (stake) seus tokens no contrato.
    function stake(uint256 amount) public notFrozen nonReentrant whenNotPaused {
        require(amount > 0, "Cannot stake 0 tokens");
        require(token.balanceOf(msg.sender) >= amount, "Not enough tokens to stake");
        // Verificando se o chamador não é um contrato (para evitar ataques de contratos maliciosos).
        require(!isContract(msg.sender), "Sender address must not be a contract");

        // Referência para as informações do staker.
        StakeInfo storage staker = stakers[msg.sender];

        require(staker.amount.add(amount) <= MAX_STAKE, "Exceeds max stake amount");

        // Verificar o saldo do contrato antes da transferência.
        uint256 balanceBefore = token.balanceOf(address(this));

        // Transferir os tokens do chamador para o contrato.
        token.transferFrom(msg.sender, address(this), amount);

        // Verificar o saldo do contrato após a transferência.
        uint256 balanceAfter = token.balanceOf(address(this));
        uint256 actualTransferred = balanceAfter.sub(balanceBefore);

        // Certificar-se de que a quantidade transferida é a esperada.
        require(actualTransferred == amount, "Unexpected amount transferred due to burning");

        // Caso o staker não tenha apostado antes.
        if (staker.amount == 0) {
            staker.time = block.timestamp;

            // Se esta é a primeira aposta ativa.
            if (lastActiveStaker == address(0)) {
                firstActiveStaker = msg.sender;
            } else {
                activeStakersList[lastActiveStaker].stakerAddress = msg.sender;
            }

            // Atualizar o último staker ativo.
            lastActiveStaker = msg.sender;
            activeStakersList[msg.sender] = ActiveStaker(address(0), true);
        }

        // Atualizar a quantidade apostada pelo staker e a taxa de recompensa.
        staker.amount = staker.amount.add(amount);
        staker.rewardRate = INITIAL_REWARD_RATE;
        totalStaked = totalStaked.add(amount);

        // Emitir um evento indicando que os tokens foram apostados.
        emit Staked(msg.sender, amount, block.timestamp);
    }

    // Função para calcular a recompensa para um staker com base em sua aposta e tempo decorrido.
    function calculateReward(StakeInfo memory staker) private view returns (uint256) {
        // Calculando o tempo desde que a aposta foi feita.
        uint256 timeSinceStake = block.timestamp - staker.time;

        // Se o tempo exceder o período de recompensa máximo, limite-o ao valor máximo.
        if (timeSinceStake > MAX_REWARD_PERIOD) {
            timeSinceStake = MAX_REWARD_PERIOD;
        }

        // Calcular a recompensa com base na quantidade apostada, na taxa de recompensa e no tempo.
        uint256 reward = staker.amount.mul(staker.rewardRate).mul(timeSinceStake).div(365 days).div(10000);
        return reward;
    }

    // Função para atualizar a recompensa de um staker.
    function updateReward(address stakerAddress) public {
        require(stakerAddress != address(0), "Invalid staker address");
        // Verificar se o endereço é um staker ativo.
        require(activeStakersList[stakerAddress].exists, "Address is not an active staker");
        // Certificar-se de que apenas o próprio staker pode atualizar sua recompensa.
        require(stakerAddress == msg.sender, "Can only update own reward");

        StakeInfo storage staker = stakers[stakerAddress];
        uint256 reward = calculateReward(staker);
        // Adicionar a nova recompensa calculada ao saldo acumulado de recompensas do staker.
        staker.reward = staker.reward.add(reward);

        uint256 timeSinceStake = block.timestamp - staker.time;
        // Ajustar a taxa de recompensa com base no tempo decorrido desde a aposta.
        if (timeSinceStake < LOCK_PERIOD) {
            uint256 rateDifference = INITIAL_REWARD_RATE - FINAL_REWARD_RATE;
            uint256 rateDecrease = rateDifference.mul(timeSinceStake).div(LOCK_PERIOD);
            staker.rewardRate = INITIAL_REWARD_RATE.sub(rateDecrease);
        } else {
            staker.rewardRate = FINAL_REWARD_RATE;
        }

        // Atualizar o tempo da última interação do staker.
        staker.time = block.timestamp;
        // Emitir um evento indicando que a recompensa do staker foi atualizada.
        emit RewardUpdated(stakerAddress, staker.reward); 
    }

    // Função para permitir que os stakers retirem sua aposta e as recompensas acumuladas.
    function withdraw(uint256 amount) public notFrozen nonReentrant {
        require(amount > 0, "Cannot withdraw 0 tokens");
        require(totalStaked > 0, "No tokens to withdraw");
        // Verificando se o chamador não é um contrato (para evitar ataques de contratos maliciosos).
        require(!isContract(msg.sender), "Sender address must not be a contract");

        StakeInfo storage staker = stakers[msg.sender];
        // Verificando condições de saque.
        require(staker.amount >= amount, "Withdrawal amount exceeds staked amount");
        require(block.timestamp >= staker.time + LOCK_PERIOD, "Staking still in lock period");
        // Atualizar recompensas antes de retirar.
        updateReward(msg.sender);
        // Calculando a taxa da recompensa e atualizando o total de taxas de recompensa.
        uint256 rewardFee = staker.reward.mul(REWARD_FEE_RATE).div(10000);
        totalRewardFee = totalRewardFee.add(rewardFee);

        uint256 totalWithdraw = amount.add(staker.reward).sub(rewardFee);

        // Atualizar o montante apostado pelo staker e redefinir sua recompensa.
        staker.amount = staker.amount.sub(amount);
        staker.reward = 0;
        totalStaked = totalStaked.sub(amount);
        // Transferir a quantidade total de saque para o staker.
        token.transfer(msg.sender, totalWithdraw);

        // Removendo da lista de stakers ativos, se necessário.
        if (staker.amount == 0) {
            if (msg.sender == firstActiveStaker) {
                firstActiveStaker = activeStakersList[msg.sender].stakerAddress;
            } else {
                address previousStakerAddress = activeStakersList[firstActiveStaker].stakerAddress;
                activeStakersList[previousStakerAddress].stakerAddress = activeStakersList[msg.sender].stakerAddress;
            }

            if (msg.sender == lastActiveStaker) {
                lastActiveStaker = activeStakersList[firstActiveStaker].stakerAddress;
            }

            delete activeStakersList[msg.sender];
        }

        emit Withdrawn(msg.sender, amount);

        // Distribuir a taxa de recompensa se atingir o limite.
        if (totalRewardFee >= REWARD_THRESHOLD) {
            distributeRewardFee();
        }
    }

    // Função para distribuir a taxa de recompensa acumulada entre os stakers qualificados.
    function distributeRewardFee() private {
        if (totalStaked == 0 || totalRewardFee < REWARD_THRESHOLD) return;

        uint256 totalRewardFeeToDistribute = totalRewardFee;
        totalRewardFee = 0;

        address currentStakerAddress = firstActiveStaker;

        // Distribuir recompensas para stakers qualificados.
        while (currentStakerAddress != address(0)) {
            uint256 stakerPercentage = stakers[currentStakerAddress].amount.mul(100).div(totalStaked);

            // Distribuir apenas para stakers com mais de 10% de participação no pool.
            if (stakerPercentage >= 10) {
                StakeInfo storage currentStaker = stakers[currentStakerAddress];
                uint256 rewardFeeShare = totalRewardFeeToDistribute.mul(currentStaker.amount).div(totalStaked);
                currentStaker.reward = currentStaker.reward.add(rewardFeeShare);
            }
            currentStakerAddress = activeStakersList[currentStakerAddress].stakerAddress;
        }

        emit RewardFeeDistributed(totalRewardFeeToDistribute);
    }

    // Permite que um staker reivindique suas recompensas sem retirar seus tokens apostados.
    function claimReward() public notFrozen nonReentrant whenNotPaused {
        require(activeStakersList[msg.sender].exists, "Address is not an active staker");

        StakeInfo storage staker = stakers[msg.sender];
        // Verifica se o período de bloqueio terminou.
        require(block.timestamp >= staker.time + LOCK_PERIOD, "Staking still in lock period");
        // Atualiza as recompensas antes de reivindicá-las.
        updateReward(msg.sender);
        // Calcula a taxa da recompensa.
        uint256 rewardFee = staker.reward.mul(REWARD_FEE_RATE).div(10000);
        totalRewardFee = totalRewardFee.add(rewardFee);
        uint256 rewardToClaim = staker.reward.sub(rewardFee);

        require(rewardToClaim > 0, "No rewards to claim");
        // Reseta as recompensas do staker e transfere a recompensa para ele.
        staker.reward = 0;
        token.transfer(msg.sender, rewardToClaim);

        emit RewardUpdated(msg.sender, 0); 
        // Distribui a taxa de recompensa se atingir o limite.
        if (totalRewardFee >= REWARD_THRESHOLD) {
            distributeRewardFee();
        }
    }

    // Função que permite ao proprietário congelar um endereço, impedindo-o de interagir com o contrato.
    function freezeAddress(address _address) public onlyOwner {
        frozenAddresses[_address] = true;
        emit AddressFrozen(_address);
    }

    // Função que permite ao proprietário descongelar um endereço, permitindo que ele interaja novamente com o contrato.
    function unfreezeAddress(address _address) public onlyOwner {
        frozenAddresses[_address] = false;
        emit AddressUnfrozen(_address);
    }

    // Modificador que impede que endereços congelados interajam com as funções que o usam.
    modifier notFrozen() {
        require(!frozenAddresses[msg.sender], "Address is frozen");
        _;
    }

    // Função que permite ao proprietário pausar interações com o contrato.
    function pause() public onlyOwner {
        _pause();
    }

    // Função que permite ao proprietário retomar interações com o contrato após ter sido pausado.
    function unpause() public onlyOwner {
        _unpause();
    }

    // Permite que o proprietário retire a taxa acumulada de recompensas.
    function withdrawRewardFee() public onlyOwner {
        require(totalRewardFee > 0, "No reward fee to withdraw");

        uint256 amountToWithdraw = totalRewardFee;
        // Reseta a taxa acumulada de recompensas
        totalRewardFee = 0;
        // Transfere a taxa acumulada para o proprietário.
        token.transfer(msg.sender, amountToWithdraw);
    }

    // Permite que o proprietário resgate fundos (tokens) que possam ter sido enviados erroneamente ao contrato.
    function rescueFunds(address _token, uint256 _amount) external onlyOwner {
        // Garante que os tokens de staking não possam ser resgatados.
        require(_token != address(token), "Cannot rescue the staking token");
        // Cria uma instância do token usando a interface IERC20
        IERC20 erc20Token = IERC20(_token); 
        uint256 contractBalance = erc20Token.balanceOf(address(this));
        // Certifica-se de que o contrato tem tokens suficientes para resgatar.
        require(contractBalance >= _amount, "Not enough tokens to rescue");
        // Tenta transferir os tokens para o proprietário.
        bool success = erc20Token.transfer(msg.sender, _amount);
        // Garante que a transferência foi bem-sucedida
        require(success, "Transfer failed");
        // Emite um evento informando que fundos foram resgatados.
        emit FundsRescued(_token, _amount);
    }

    // Função utilitária para identificar que este é um contrato de staking - Utilizado no Contrato de Governanca
    function isStakingContract() public pure returns (bool) {
        return true;
    }

    // Retorna a recompensa pendente de um staker.
    function pendingReward(address stakerAddress) public view returns (uint256) {
        require(stakerAddress != address(0), "Invalid staker address");
        require(activeStakersList[stakerAddress].exists, "Address is not an active staker");

        StakeInfo memory staker = stakers[stakerAddress];
        // Calcula e retorna a recompensa pendente.
        return calculateReward(staker);
    }

    // Esta função retorna o total de tokens que um determinado endereço colocou em staking no contrato. Ela não tem nada a ver com recompensas.
    function totalStakeOf(address stakerAddress) public view returns (uint256) {
        require(stakerAddress != address(0), "Invalid staker address");
        return stakers[stakerAddress].amount;
    }

    // Esta função retorna o total da recompensa acumulada de um determinado endereço
    // Retornam a recompensa total (já calculada + pendente).
    function rewardOf(address stakerAddress) public view returns (uint256) {
        return stakers[stakerAddress].reward.add(calculateReward(stakers[stakerAddress]));
    }

    // Esta função retorna o total da recompensa acumulada de um determinado endereço
    // Retornam a recompensa total (já calculada + pendente).
    function totalRewardOf(address stakerAddress) private view returns (uint256) {
        return stakers[stakerAddress].reward.add(calculateReward(stakers[stakerAddress]));
    }
   
    /* ESTATISTICAS */

    // Retorna informações sobre a quantia staked de um endereço, o momento do staking, a taxa de recompensa e a recompensa total.
    function getStakeInfo(address staker) public view returns (uint256 amount, uint256 time, uint256 rewardRate, uint256 reward) {
        return (stakers[staker].amount, stakers[staker].time, stakers[staker].rewardRate, totalRewardOf(staker));
    }

    // Retorna a taxa de recompensa acumulada no contrato.
    function getTotalRewardFee() public view returns (uint256) {
        return totalRewardFee;
    }

    // Fornece o momento exato (timestamp) em que um usuário pode retirar suas recompensas após o período de bloqueio.
    function getUnlockTime(address stakerAddress) public view returns (uint256) {
        return stakers[stakerAddress].time + LOCK_PERIOD;
    }

    // Retorna o tempo restante (em segundos) até que um usuário possa retirar suas recompensas após o período de bloqueio.
    function getTimeUntilUnlock(address stakerAddress) public view returns (uint256) {
        uint256 timeStaked = stakers[stakerAddress].time;
        uint256 lockEndTime = timeStaked + LOCK_PERIOD;

        // Se o período de bloqueio já tiver passado, retorna 0.
        if (block.timestamp >= lockEndTime) {
            return 0;
        }
        return lockEndTime - block.timestamp;
    }

    // Retorna o total de recompensas distribuídas para todos os stakers ativos.
    function getTotalDistributedRewards() public view returns (uint256) {
        uint256 totalRewards = 0;
        address currentStakerAddress = firstActiveStaker;

        // Soma as recompensas de todos os stakers ativos.
        while (currentStakerAddress != address(0)) {
            totalRewards = totalRewards.add(stakers[currentStakerAddress].reward);
            currentStakerAddress = activeStakersList[currentStakerAddress].stakerAddress;
        }
        return totalRewards;
    }

    // Retorna a quantidade de tokens, recompensa e taxa de recompensa de um staker.
    function getStakerDetails(address stakerAddress) public view returns (uint256 amount, uint256 reward, uint256 rewardRate) {
        StakeInfo storage staker = stakers[stakerAddress];
        return (staker.amount, staker.reward, staker.rewardRate);
    }

    // Retorna a porcentagem de tokens que um staker tem em relação ao total de tokens staked.
    function getStakerPercentage(address stakerAddress) public view returns (uint256) {
        if (totalStaked == 0) return 0;
        return stakers[stakerAddress].amount.mul(100).div(totalStaked);
    }

    // Calcula o tempo médio de staking para todos os stakers.
    function getAverageStakingTime() public view returns (uint256) {
        uint256 totalStakingTime = 0;
        uint256 count = 0;
        address currentStakerAddress = firstActiveStaker;
        while (currentStakerAddress != address(0)) {
            totalStakingTime = totalStakingTime.add(block.timestamp - stakers[currentStakerAddress].time);
            count++;
            currentStakerAddress = activeStakersList[currentStakerAddress].stakerAddress;
        }
        if (count == 0) return 0;
        return totalStakingTime / count;
    }

    // Calcula a recompensa pendente para um staker.
    function getPendingReward(address stakerAddress) public view returns (uint256) {
        StakeInfo storage staker = stakers[stakerAddress];
        uint256 reward = calculateReward(staker);
        return staker.reward.add(reward);
    }

    // Calcula a taxa de recompensa média para todos os stakers.
    function getAverageRewardRate() public view returns (uint256) {
        uint256 totalRewardRate = 0;
        uint256 count = 0;
        address currentStakerAddress = firstActiveStaker;
        while (currentStakerAddress != address(0)) {
            totalRewardRate = totalRewardRate.add(stakers[currentStakerAddress].rewardRate);
            count++;
            currentStakerAddress = activeStakersList[currentStakerAddress].stakerAddress;
        }
        if (count == 0) return 0;
        return totalRewardRate / count;
    }

    // Retorna o saldo de tokens reservados para recompensas, excluindo os tokens que estão staked.
    // Função para visualizar o saldo de tokens depositados para recompensa (Acompanhamento Owner)
    function getRewardBalance() public view returns (uint256) {
        return token.balanceOf(address(this)).sub(totalStaked);
    }

    // Retorna o saldo total de tokens, incluindo os tokens reservados para recompensas e os tokens staked pelos usuários.
    // Função para visualizar o total de tokens depositados para recompensa + os Tokens em staking pelos usuários
    function getRewardBalanceGeneral() public view returns (uint256) {
        return token.balanceOf(address(this));
    }

}
