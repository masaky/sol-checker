// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title VulnerableBank
/// @notice This contract is intentionally vulnerable for testing purposes.
///         DO NOT USE IN PRODUCTION.
contract VulnerableBank {
    mapping(address => uint256) public balances;
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    // Vulnerability #1: Reentrancy
    // The balance is updated AFTER the external call, allowing reentrant withdrawals.
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");

        // ❌ External call before state update (reentrancy risk)
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        balances[msg.sender] -= amount;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    // Vulnerability #2: tx.origin authentication
    // tx.origin can be spoofed via phishing contracts.
    function adminWithdrawAll() external {
        // ❌ Should use msg.sender instead of tx.origin
        require(tx.origin == owner, "Not owner");
        payable(owner).transfer(address(this).balance);
    }

    // Vulnerability #3: Unbounded loop (DoS risk)
    // If the users array grows large, this function will run out of gas.
    address[] public users;

    function registerUser() external {
        users.push(msg.sender);
    }

    function payAllUsers(uint256 amount) external {
        // ❌ Unbounded loop — DoS via block gas limit
        for (uint256 i = 0; i < users.length; i++) {
            payable(users[i]).transfer(amount);
        }
    }

    // Vulnerability #4: Unchecked return value
    function unsafeSend(address to, uint256 amount) external {
        // ❌ Return value of send() is not checked
        payable(to).send(amount);
    }

    receive() external payable {}
}
