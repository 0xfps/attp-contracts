// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IMain {
    event DepositAdded(bytes32 indexed leaf);

    function generateKeys(
        address asset,
        uint256 amount,
        bytes16 secretKey
    ) external view returns (
        bytes memory withdrawalKey,
        bytes memory depositKey
    );

    function leafExists(bytes32 leaf) external view returns (bool);
    function getMaxWithdrawalOnKey(bytes calldata key) external pure returns (uint256 maxWithdrawal);
    function getMaxWithdrawalOnAmount(uint256 amount) external pure returns (uint256 maxWithdrawal);

    function getDeposit(bytes32 leaf) external view returns (address depositor);

    function deposit(bytes calldata depositKey, bytes32 standardizedKey) external payable;

    function withdraw(
        bytes32 root,
        bytes calldata withdrawalKey,
        uint256[2] calldata pA,     // Proof.
        uint256[2][2] calldata pB,  // Proof.
        uint256[2] calldata pC,     // Proof.
        address receipient,
        uint256 amount
    ) external;
}