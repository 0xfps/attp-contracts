// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IMain } from "./interfaces/IMain.sol";

import { Computer } from "./lib/Computer.sol";
import { Extractor } from "./lib/Extractor.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { Fee } from "./Fee.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { TinyMerkleTree } from "@fifteenfigures/TinyMerkleTree.sol";
import { Groth16Verifier } from "./Verifier.sol";

contract Main is IMain, Fee, TinyMerkleTree, ReentrancyGuard, Groth16Verifier {
    using Extractor for bytes;
    using SafeERC20 for IERC20;

    mapping(bytes32 leaf => bool inUse) internal leaves;
    mapping(bytes withdrawalKeyHash => uint256 amountWithdrawn) internal withdrawals;
    mapping(bytes32 depositLeaf => address depositor) internal deposits;

    constructor (bytes32 initLeaf) TinyMerkleTree (initLeaf) {}

    function generateKeys(
        address asset,
        uint256 amount,
        bytes16 secretKey
    ) public view returns (
        bytes memory withdrawalKey,
        bytes memory depositKey
    ) {
        withdrawalKey = abi.encodePacked(
            keccak256(
                abi.encodePacked(msg.sender, block.timestamp, block.chainid, secretKey)
            ), asset, amount
        );

        depositKey = abi.encodePacked(
            keccak256(
                abi.encodePacked(withdrawalKey, secretKey)
            ), asset, amount
        );
    }

    function leafExists(bytes32 leaf) public view returns (bool) {
        return leaves[leaf];
    }

    function getMaxWithdrawalOnKey(bytes calldata key) public pure returns (uint256 maxWithdrawal) {
        (, , uint256 amount) = key._extractKeyMetadata();
        maxWithdrawal = getMaxWithdrawalOnAmount(amount);
    }

    function getMaxWithdrawalOnAmount(uint256 amount) public pure returns (uint256 maxWithdrawal) {
        uint256 fee = calculateFee(amount);
        maxWithdrawal = amount - fee;
    }

    function getDeposit(bytes32 leaf) public view returns (address depositor) {
        return deposits[leaf];
    }

    function deposit(bytes calldata depositKey, bytes32 standardizedKey) public payable {
        if (leafExists(standardizedKey)) revert("Key already used!");
        (, address asset, uint256 amount) = depositKey._extractKeyMetadata();

        leaves[standardizedKey] = true;
        deposits[standardizedKey] = msg.sender;

        uint256 depositAmount = getMaxWithdrawalOnKey(depositKey);
        _takeFee(IERC20(asset), amount);

        if (asset != NATIVE_TOKEN)
            IERC20(asset).safeTransferFrom(msg.sender, address(this), depositAmount);

        _addLeaf(standardizedKey);
        emit DepositAdded(standardizedKey);
    }
    
    function withdraw(
        bytes32 root,
        bytes calldata withdrawalKey,
        uint256[2] calldata pA,     // Proof.
        uint256[2][2] calldata pB,  // Proof.
        uint256[2] calldata pC,     // Proof.
        address recipient,
        uint256 amount
    ) external {
        if (!_rootIsInHistory(root)) revert("This root is not in history!");
        (, address asset, uint256 amountInKey) = withdrawalKey._extractKeyMetadata();

        uint256 maxWithdrawable = getMaxWithdrawalOnAmount(amountInKey);
        uint256 amountWithdrawn = withdrawals[withdrawalKey];

        if ((amountWithdrawn + amount) > maxWithdrawable) revert("Withdrawal exceeds max!");
        withdrawals[withdrawalKey] += amount;

        uint256[928] memory publicSignals = Computer._computePublicSignals(root, withdrawalKey);
        if (!this.verifyProof(pA, pB, pC, publicSignals)) revert("Proof not verified!");

        if (asset == NATIVE_TOKEN) {
            (bool sent, ) = recipient.call { value: amount} ("");
            require(sent);
        } else IERC20(asset).safeTransfer(recipient, amount);
    }

    function _rootIsInHistory(bytes32 root) private view returns (bool) {
        for (uint8 i = 0; i < STORED_ROOT_LENGTH; i++) {
            if (last32Roots[i] == root) return true;
        }

        return false;
    }
}