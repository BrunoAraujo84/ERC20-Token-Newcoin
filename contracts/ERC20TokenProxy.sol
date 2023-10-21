// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "./ERC20Token.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract ERC20TokenProxy is TransparentUpgradeableProxy {
    uint256 public contractVersion = 1;

    // Mapeamento para controlar versões anteriores do contrato
    mapping(address => bool) public previousImplementations;

    event ContractUpgraded(address newImplementation, uint256 newVersion, uint256 timestamp);
    event AdminChanged(address indexed newAdmin, uint256 timestamp);

    constructor(address _logic, address _admin, bytes memory _data) TransparentUpgradeableProxy(_logic, _admin, _data) {}

    function init(string memory name_, string memory symbol_) public {
        ERC20Token(address(this)).initialize(name_, symbol_);
    }

    function getImplementation() public view returns (address) {
        return _implementation();
    }

    function getAdmin() public view returns (address) {
        return _admin();
    }

    function upgradeTo(address newImplementation) public {
        require(msg.sender == getAdmin(), "Admin only");
        require(isValidImplementation(newImplementation), "Invalid implementation");

        // Verifica se a implementação não foi usada anteriormente
        require(!previousImplementations[newImplementation], "Cannot downgrade");

        _upgradeTo(newImplementation);

        // Registra a nova implementação no mapeamento
        previousImplementations[newImplementation] = true;

        contractVersion += 1;
        emit ContractUpgraded(newImplementation, contractVersion, block.timestamp);
    }

    function changeAdminAndEmitEvent(address newAdmin) external {
        require(msg.sender == getAdmin(), "Admin only");
        _changeAdmin(newAdmin);
        emit AdminChanged(newAdmin, block.timestamp);
    }

    function isValidImplementation(address implementation) public view returns (bool) {
        // Aqui, adicionamos uma condição simples: a implementação é válida se ela tiver o mesmo bytecode que o atual
        // Obviamente, isso é apenas um exemplo e provavelmente você precisará de uma condição diferente
        return keccak256(codeAt(implementation)) == keccak256(codeAt(getImplementation()));
    }

    function codeAt(address _addr) internal view returns (bytes memory o_code) {
        assembly {
            // get size of code at address _addr
            let size := extcodesize(_addr)

            // allocate output byte array - this could also be done at compile time
            // since the size is known and constant
            o_code := mload(0x40)

            // new "memory end" including padding
            mstore(0x40, add(o_code, and(add(add(size, 0x20), 0x1f), not(0x1f))))

            // store length in memory
            mstore(o_code, size)

            // fetch code, skipping first 0x20 bytes
            extcodecopy(_addr, add(o_code, 0x20), 0, size)
        }
    }



}
