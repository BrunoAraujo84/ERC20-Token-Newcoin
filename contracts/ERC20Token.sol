// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract ERC20Token is IERC20, Initializable, Ownable, Pausable, ReentrancyGuard {
    uint256 public contractVersion;
    using SafeMath for uint256;
    using Address for address;
    // Defina o máximo de tokens que podem existir
    uint256 private constant MAX_SUPPLY = 100000000 * 10**18;  // 100 milhões de tokens, ajustados para a quantidade de casas decimais

    mapping (address => uint256) private _balances;
    mapping (address => mapping (address => uint256)) private _allowances;
    uint256 private _totalSupply;
    string private _name;
    string private _symbol;

    // taxas de transação em percentagem
    uint256 public constant TRANSACTION_FEE_LEVEL_1 = 100; // 1%
    uint256 public constant TRANSACTION_FEE_LEVEL_2 = 50; // 0.5%
    uint256 public constant TRANSACTION_FEE_LEVEL_3 = 25; // 0.25%

    // limites de fornecimento total de tokens
    uint256 public constant SUPPLY_LEVEL_1 = 85000000 * 10**18; // 85 milhões
    uint256 public constant SUPPLY_LEVEL_2 = 50000000 * 10**18; // 50 milhões
    uint256 public constant SUPPLY_LEVEL_3 = 30000000 * 10**18; // 30 milhões

    mapping (address => bool) public isBlacklisted;

    // Queimas programadas anualmente 0.2% do total de tokens fornecido
    uint256 public lastBurnTime;
    uint256 public constant BURN_PERIOD = 365 days;
    uint256 public constant BURN_RATE = 200; // 0.2%, representado como partes por 10.000 para evitar decimais

    bool private _initialized;


    address private _newOwner;
    event OwnershipTransferInitiated(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferConfirmed(address indexed previousOwner, address indexed newOwner);

    function setContractVersion(uint256 _contractVersion) public onlyOwner {
        contractVersion = _contractVersion;
    }

    // Funções de lista negra
    function addToBlacklist(address _address) public onlyOwner {
        isBlacklisted[_address] = true;
    }

    function removeFromBlacklist(address _address) public onlyOwner {
        isBlacklisted[_address] = false;
    }

    function initialize(string memory name_, string memory symbol_) external initializer {
        require(!_initialized, "Contract is already initialized");
        require(bytes(name_).length > 0, "ERC20: name parameter is invalid");
        require(bytes(symbol_).length > 0, "ERC20: symbol parameter is invalid");

        _name = name_;
        _symbol = symbol_;
        // Cria 20 milhões de tokens e atribui ao contrato
        _totalSupply = 20000000 * 10**18;
        
        _balances[msg.sender] = _totalSupply;

        _initialized = true;

        emit Transfer(address(0), msg.sender, _balances[msg.sender]);
    }

    function name() public view returns (string memory) {
        return _name;
    }

    function symbol() public view returns (string memory) {
        return _symbol;
    }

    function decimals() public pure returns (uint8) {
        return 18;
    }

    function totalSupply() public view override returns (uint256) {
        return _totalSupply;
    }

    function maxSupply() public pure returns (uint256) {
        return MAX_SUPPLY;
    }

    function balanceOf(address account) public view override returns (uint256) {
        return _balances[account];
    }

    function _transfer(address recipient, uint256 amount) internal returns (bool) {
        uint256 currentFee = _calculateCurrentFee();
        uint256 fee = amount.mul(currentFee).div(10000);
        require(_balances[msg.sender] >= amount.add(fee), "ERC20: transfer amount exceeds balance");

        _balances[msg.sender] = _balances[msg.sender].sub(amount.add(fee));
        _balances[recipient] = _balances[recipient].add(amount);

        if (fee > 0 && _totalSupply >= SUPPLY_LEVEL_3) {
            _burn(fee);  // Queime a taxa
        }

        emit Transfer(msg.sender, recipient, amount);
        // Emita o evento de transferência para a taxa apenas se a taxa for maior que zero
        if (fee > 0) {
            emit Transfer(msg.sender, address(0), fee); 
        }
        return true;
    }

    // Modificar a função transfer para chamar a função interna _transfer
    function transfer(address recipient, uint256 amount) public override whenNotPaused nonReentrant returns (bool) {
        require(isBlacklisted[msg.sender] == false, "ERC20: Address is blacklisted");
        require(isBlacklisted[recipient] == false, "ERC20: recipient is blacklisted");
        require(recipient != address(0), "ERC20: transfer to the zero address");
        // Se o período de queima passou e o total de fornecimento é maior que 30 milhões
        if (block.timestamp >= lastBurnTime + BURN_PERIOD && _totalSupply > SUPPLY_LEVEL_3) {
            // Queime 0.2% do total fornecido
            uint256 burnAmount = _totalSupply.mul(BURN_RATE).div(10000);
            _burn(burnAmount);
        
            // Atualize o último momento da queima
            lastBurnTime = block.timestamp;
        }

        // Se o fornecimento total é maior que 30 milhões, proceda com a queima de tokens
        if (_totalSupply > SUPPLY_LEVEL_3) {
            return _transfer(recipient, amount);
        } else {
            // Caso contrário, faça uma transferência sem queima de tokens
            _balances[msg.sender] = _balances[msg.sender].sub(amount, "ERC20: transfer amount exceeds balance");
            _balances[recipient] = _balances[recipient].add(amount);
            emit Transfer(msg.sender, recipient, amount);
            return true;
        }
    }

    function _burn(uint256 amount) internal {
        _balances[owner()] = _balances[owner()].sub(amount);
        _totalSupply = _totalSupply.sub(amount);
        emit Transfer(owner(), address(0), amount);
    }

    function allowance(address tokenOwner, address spender) public view override returns (uint256) {
        return _allowances[tokenOwner][spender];
    }

    function approve(address spender, uint256 amount) public override whenNotPaused nonReentrant returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public override whenNotPaused nonReentrant returns (bool) {
        require(_balances[sender] >= amount, "ERC20: transfer amount exceeds balance");
        require(_allowances[sender][msg.sender] >= amount, "ERC20: transfer amount exceeds allowance");
    
        uint256 currentFee = _calculateCurrentFee();
        uint256 fee = amount.mul(currentFee).div(10000);

        // Se o período de queima passou e o total de fornecimento é maior que 30 milhões
        if (block.timestamp >= lastBurnTime + BURN_PERIOD && _totalSupply > SUPPLY_LEVEL_3) {
            // Queime 0.2% do total fornecido
            uint256 burnAmount = _totalSupply.mul(BURN_RATE).div(10000);
            _burn(burnAmount);
        
            // Atualize o último momento da queima
            lastBurnTime = block.timestamp;
        }

        // Se o fornecimento total é maior que 30 milhões, proceda com a queima de tokens
        if (_totalSupply > SUPPLY_LEVEL_3) {
            // Ajustar a alocação antes da transferência
            _allowances[sender][msg.sender] = _allowances[sender][msg.sender].sub(amount.add(fee), "ERC20: transfer amount exceeds allowance");
            return _transfer(recipient, amount);
        } else {
            // Caso contrário, faça uma transferência sem queima de tokens
            _balances[sender] = _balances[sender].sub(amount, "ERC20: transfer amount exceeds balance");
            _balances[recipient] = _balances[recipient].add(amount);
            _allowances[sender][msg.sender] = _allowances[sender][msg.sender].sub(amount, "ERC20: transfer amount exceeds allowance");
            emit Transfer(sender, recipient, amount);
            return true;
        }
    }

    // Funções para aumentar e diminuir a permissão (allowance)
    function increaseAllowance(address spender, uint256 addedValue) public whenNotPaused nonReentrant returns (bool) {
        _approve(msg.sender, spender, _allowances[msg.sender][spender].add(addedValue));
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) public whenNotPaused nonReentrant returns (bool) {
        _approve(msg.sender, spender, _allowances[msg.sender][spender].sub(subtractedValue, "ERC20: decreased allowance below zero"));
        return true;
    }

    // Função mint
    function mint(address account, uint256 amount) public onlyOwner nonReentrant {
        require(_totalSupply.add(amount) <= MAX_SUPPLY, "ERC20: minting would exceed max supply");
        _totalSupply = _totalSupply.add(amount);
        _balances[account] = _balances[account].add(amount);
        emit Transfer(address(0), account, amount);
        // Atualizar o último momento da queima após a mineração
        lastBurnTime = block.timestamp;
    }

    // Função burn
    function burn(uint256 amount) public onlyOwner nonReentrant {
        require(_balances[msg.sender] >= amount, "ERC20: burn amount exceeds balance");
        _balances[msg.sender] = _balances[msg.sender].sub(amount);
        _totalSupply = _totalSupply.sub(amount);
        emit Transfer(msg.sender, address(0), amount);
    }

    // Funções para pausar e retomar todas as transferências de token
    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    // Função interna para lidar com aprovações de permissões (allowances)
    function _approve(address tokenOwner, address spender, uint256 amount) internal {
        require(tokenOwner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");
        _allowances[tokenOwner][spender] = amount;
        emit Approval(tokenOwner, spender, amount);
    }

    // Função para transferir tokens para várias contas de uma vez
    function batchTransfer(address[] memory recipients, uint256[] memory amounts) public onlyOwner nonReentrant {
        require(recipients.length == amounts.length, "ERC20: recipients and amounts array length must be the same");
        for (uint256 i = 0; i < recipients.length; i++) {
            _transfer(recipients[i], amounts[i]);
        }
    }

    // Função para recuperar tokens ERC20
    function recoverERC20(address tokenAddress, uint256 tokenAmount, address to) public onlyOwner {
        IERC20 token = IERC20(tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        require(tokenAmount <= balance, "ERC20: not enough tokens in the address specified");
        token.transfer(to, tokenAmount);
    }


    // Tranferencia do contrato para um novo proprietário
    function transferOwnership(address newOwner) override public onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        _newOwner = newOwner;
        emit OwnershipTransferInitiated(owner(), _newOwner);
    }

    function confirmOwnershipTransfer() public {
        require(msg.sender == _newOwner, "Ownable: only new owner can confirm ownership transfer");
        emit OwnershipTransferConfirmed(owner(), _newOwner);
        _transferOwnership(_newOwner); // Função interna para efetivar a transferência de propriedade
    }

    function _transferOwnership(address newOwner) internal override {
        super._transferOwnership(newOwner);
        _newOwner = address(0);
    }

    function getNewOwner() public view returns (address) {
        return _newOwner;
    }

    function _calculateCurrentFee() internal view returns (uint256) {
        uint256 currentFee;
        if (_totalSupply > SUPPLY_LEVEL_1) {
            currentFee = TRANSACTION_FEE_LEVEL_1;
        } else if (_totalSupply > SUPPLY_LEVEL_2) {
            currentFee = TRANSACTION_FEE_LEVEL_2;
        } else if (_totalSupply > SUPPLY_LEVEL_3) {
            currentFee = TRANSACTION_FEE_LEVEL_3;
        } else {
            currentFee = 0;
        }
        return currentFee;
    }

}
