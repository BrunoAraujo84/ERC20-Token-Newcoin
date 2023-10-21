// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

contract InvalidContract {
    function doSomething() public pure returns (uint) {
        return 42;
    }
}
