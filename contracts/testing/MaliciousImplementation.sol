// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/access/Ownable.sol";

contract MaliciousImplementation is Ownable {
    // Adicionamos uma variável de estado inútil para garantir que o código deste contrato
    // seja diferente do seu contrato atual.
    uint256 public maliciousVariable;

    constructor() {
        maliciousVariable = 42;
    }
   
    function stealFunds(address payable recipient) public onlyOwner {
        recipient.transfer(address(this).balance);
    }
}
