// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

// Importações de contratos e bibliotecas externas
import "@openzeppelin/contracts/access/Ownable.sol";
import "../ERC20SemiAnnualStaking.sol";
import "../ERC20AnnualStaking.sol";
import "../ERC20BiennialStaking.sol";
import "../ERC20QuadrennialStaking.sol";

// Importe o contrato ERC20Token
import "../../ERC20Token.sol";

contract Governance is Ownable {

    // Enumeração para o status da proposta
    enum ProposalStatus { Open, Accepted, Rejected }

    // Estrutura para armazenar informações sobre uma proposta
    struct Proposal {
        string title; // Título da proposta
        string description; // Descrição da proposta
        uint256 yesVotes; // Total de votos a favor
        uint256 noVotes; // Total de votos contra
        ProposalStatus status; // Status atual da proposta
        address eligibleStakingContract; // Contrato de staking elegível para esta proposta
        uint256 closingTime; // Data de encerramento da proposta
        uint256 yesVotersCount; // Contagem de votantes que votaram "Sim"
        uint256 noVotersCount; // Contagem de votantes que votaram "Não"
    }

    // Declaração de variáveis de estado
    ERC20SemiAnnualStaking private defaultStakingContract; // Contrato de staking padrão
    mapping(address => uint256) private lastVotedProposal; // Armazena a última proposta em que um endereço votou
    mapping(address => bool) public validStakingContracts; // Lista de contratos de staking válidos
    mapping(uint256 => Proposal) public proposals; // Propostas
    mapping(uint256 => mapping(address => bool)) public proposalVotes; // Votos para propostas

    // Contadores e constantes
    uint256 public proposalCount; // Contador de propostas
    uint256 public constant MAX_VOTE_WEIGHT = 100000 * (10 ** 18); // Limite de peso: 100.000 tokens.
    uint256[] public openProposals; // Lista de IDs de propostas abertas
    uint256[] public rejectedProposals; // Lista de IDs de propostas rejeitadas

    // Eventos
    event DebugVote(address indexed voter, uint256 indexed proposalId); // Evento de depuração para votos
    event NewProposal(uint256 proposalId, string title, string description, address eligibleStakingContract); // Evento para nova proposta
    event Voted(uint256 proposalId, address voter, bool inFavor, uint256 weight); // Evento para votos
    event ProposalClosed(uint256 proposalId, ProposalStatus status); // Evento para propostas fechadas

    // Modificador para verificar se o contrato é um contrato de staking válido
    modifier isStakingContract(address _contract) {
        require(validStakingContracts[_contract], "Provided address is not a recognized staking contract");
        _;
    }

    // Construtor para inicializar o contrato
    constructor(address _defaultStakingContract, address[] memory _otherStakingContracts) Ownable() {
        // Validações iniciais
        require(_defaultStakingContract != address(0), "Default staking contract cannot be zero address");
        require(validStakingContracts[_defaultStakingContract] == false, "Default staking contract already recognized");

        // Inicialização
        defaultStakingContract = ERC20SemiAnnualStaking(_defaultStakingContract);
        validStakingContracts[_defaultStakingContract] = true;

        // Adicionar outros contratos de staking à lista de contratos válidos
        for (uint i = 0; i < _otherStakingContracts.length; i++) {
            require(_otherStakingContracts[i] != address(0), "Staking contract address cannot be zero");
            require(validStakingContracts[_otherStakingContracts[i]] == false, "Duplicate or already recognized staking contract");
            validStakingContracts[_otherStakingContracts[i]] = true;
        }
    }

    // Função para transferir a propriedade do contrato
    function transferOwnership(address newOwner) override public onlyOwner {
        require(newOwner != address(0), "New owner cannot be zero address");
        emit OwnershipTransferred(owner(), newOwner);
        super.transferOwnership(newOwner);
    }

    // Função para propor uma nova governança ou alteração
    function propose(string memory title, string memory description, address _eligibleStakingContract, uint256 daysOpen) public onlyOwner isStakingContract(_eligibleStakingContract) {
        proposals[proposalCount] = Proposal({
            title: title,
            description: description,
            yesVotes: 0,
            noVotes: 0,
            status: ProposalStatus.Open,
            eligibleStakingContract: _eligibleStakingContract,
            closingTime: block.timestamp + daysOpen * 1 days,
            yesVotersCount: 0,
            noVotersCount: 0
        });
        emit NewProposal(proposalCount, title, description, _eligibleStakingContract);
        proposalCount++;
        openProposals.push(proposalCount);
    }

    // Função para votar em uma proposta
    function vote(uint256 proposalId, bool inFavor) public {
        // Verifica se a proposta deveria ser fechada automaticamente
        if (block.timestamp >= proposals[proposalId].closingTime) {
            closeProposal(proposalId);
        }
        // Realiza novas verificacoes antes de dar continuidade
        require(proposalId < proposalCount, "Invalid proposal ID");
        require(validStakingContracts[proposals[proposalId].eligibleStakingContract], "Staking contract is not recognized");
        require(proposals[proposalId].status == ProposalStatus.Open, "Proposal is not open");
        require(lastVotedProposal[msg.sender] != proposalId, "Address has already voted on this proposal");

        // Cálculo do peso do voto
        address stakingContractAddress = proposals[proposalId].eligibleStakingContract;
        uint256 weight;
        if (stakingContractAddress == address(defaultStakingContract)) {
            weight = defaultStakingContract.totalStakeOf(msg.sender);
        } else {
            weight = ERC20SemiAnnualStaking(stakingContractAddress).totalStakeOf(msg.sender);
        }

        if (weight > MAX_VOTE_WEIGHT){
            weight = MAX_VOTE_WEIGHT;
        }

        require(weight > 0, "Must have tokens in staking to vote");

        lastVotedProposal[msg.sender] = proposalId;

        // Registro do voto
        if (inFavor) {
            proposals[proposalId].yesVotes += weight;
            proposals[proposalId].yesVotersCount++;
        } else {
            proposals[proposalId].noVotes += weight;
            proposals[proposalId].noVotersCount++;
        }

        proposalVotes[proposalId][msg.sender] = inFavor;

        emit Voted(proposalId, msg.sender, inFavor, weight);

        emit DebugVote(msg.sender, proposalId);

    }

    // Função para fechar uma proposta
    function closeProposal(uint256 proposalId) public {
        // Verificações de validade da proposta
        require(proposalId < proposalCount, "Invalid proposal ID");
        require(proposals[proposalId].status == ProposalStatus.Open, "Proposal is not open");
        require(block.timestamp >= proposals[proposalId].closingTime, "Voting period is still active");

        // Atualiza o status da proposta com base nos votos
        if (proposals[proposalId].yesVotes > proposals[proposalId].noVotes) {
            proposals[proposalId].status = ProposalStatus.Accepted;
        } else {
            proposals[proposalId].status = ProposalStatus.Rejected;
        }

        // Remover da lista de propostas abertas
        for (uint i = 0; i < openProposals.length; i++) {
            if (openProposals[i] == proposalId) {
                openProposals[i] = openProposals[openProposals.length - 1];
                openProposals.pop();
                break;
            }
        }

        // Adiciona à lista de propostas rejeitadas se necessário
        if (proposals[proposalId].status == ProposalStatus.Rejected) {
            rejectedProposals.push(proposalId);
        }

        emit ProposalClosed(proposalId, proposals[proposalId].status);
    }

    // Função para obter detalhes de uma proposta
    function getProposal(uint256 proposalId) public view returns (string memory description, uint256 yesVotes, uint256 noVotes, ProposalStatus status, address eligibleStakingContract) {
        require(proposalId < proposalCount, "Invalid proposal ID");
        Proposal memory proposal = proposals[proposalId];
        return (proposal.description, proposal.yesVotes, proposal.noVotes, proposal.status, proposal.eligibleStakingContract);
    }

    // Função para obter o tempo restante para votação em uma proposta
    function timeRemaining(uint256 proposalId) public view returns (uint256) {
        if (block.timestamp >= proposals[proposalId].closingTime) {
            return 0;
        }
        return proposals[proposalId].closingTime - block.timestamp;
    }

    // Função para obter a porcentagem de votos 'Sim' em uma proposta
    function getYesVotesPercentage(uint256 proposalId) public view returns (uint256) {
        Proposal memory proposal = proposals[proposalId];
        uint256 totalVotes = proposal.yesVotes + proposal.noVotes;
        if (totalVotes == 0) return 0;
        return (proposal.yesVotes * 100) / totalVotes;
    }

    // Função para obter a contagem de eleitores de uma proposta
    function getVotersCount(uint256 proposalId) public view returns (uint256 yesVoters, uint256 noVoters) {
        Proposal memory proposal = proposals[proposalId];
        return (proposal.yesVotersCount, proposal.noVotersCount);
    }

    // Função para obter uma lista de propostas ainda abertas
    function getOpenProposals() public view returns (uint256[] memory) {
        return openProposals;
    }

    // Função para obter uma lista de propostas rejeitadas
    function getRejectedProposals() public view returns (uint256[] memory) {
        return rejectedProposals;
    }

    // Função para verificar se um eleitor votou em uma proposta
    function didVote(uint256 proposalId, address voter) public view returns (bool) {
        return proposalVotes[proposalId][voter];
    }

}
