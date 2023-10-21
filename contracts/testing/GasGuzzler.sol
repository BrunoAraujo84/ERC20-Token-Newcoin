// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

contract GasGuzzler {
    function infiniteLoop() public pure {
        while(true) { }
    }
}
