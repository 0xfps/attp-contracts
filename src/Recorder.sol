// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { NATIVE_TOKEN } from "./Fee.sol";

abstract contract Recorder {
    struct UserInfo {
        address depositor;
        address asset;
        uint256 amountAfterDeposit;
    }

    struct DepositInfo {
        UserInfo info;
        uint256 uniqueDeposits;
        uint256 currentDeposit;
    }

    mapping(bytes32 leaf => bool inUse) internal leaves;
    
    mapping(bytes32 depositLeaf => UserInfo info) internal deposits;
    mapping(address asset => mapping(address depositor => bool)) internal uniqueDeposit;
    mapping(address asset => uint256 deposits) internal uniqueDepositCount;

    mapping(uint256 nullifier => bool used) internal nullifierUsed;
    mapping(bytes withdrawalKeyHash => uint256 amountWithdrawn) public withdrawals;

    function getDepositDelta(bytes32 standardizedKey) public view returns (DepositInfo memory) {
        address asset = deposits[standardizedKey].asset;

        DepositInfo memory depositDelta;

        depositDelta.info = deposits[standardizedKey];
        depositDelta.uniqueDeposits = uniqueDepositCount[asset];
        depositDelta.currentDeposit = asset == NATIVE_TOKEN 
            ? address(this).balance
            : IERC20(asset).balanceOf(address(this));

        return depositDelta;
    }

    function userHasDeposited(address user, address asset) public view returns (bool) {
        return uniqueDeposit[asset][user];
    }

    function _leafExists(bytes32 leaf) internal view returns (bool) {
        return leaves[leaf];
    }

    function _recordDeposit(bytes32 standardizedKey, address asset) internal {
        leaves[standardizedKey] = true;

        uint256 updatedAmount = asset == NATIVE_TOKEN 
            ? address(this).balance
            : IERC20(asset).balanceOf(address(this));

        deposits[standardizedKey] = UserInfo({
            depositor: msg.sender,
            asset: asset,
            amountAfterDeposit: updatedAmount
        });

        if (!uniqueDeposit[asset][msg.sender]) {
            uniqueDeposit[asset][msg.sender] = true;
            uniqueDepositCount[asset]++;
        }
    }
}