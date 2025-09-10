// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IMain } from "./interfaces/IMain.sol";

import { Computer } from "./lib/Computer.sol";
import { Extractor } from "./lib/Extractor.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { Fee } from "./Fee.sol";
import { Recorder } from "./Recorder.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { TinyMerkleTree } from "@fifteenfigures/TinyMerkleTree.sol";
import { Groth16Verifier } from "./Verifier.sol";

contract Main is IMain, Recorder, Fee, TinyMerkleTree, ReentrancyGuard, Groth16Verifier {
    using Extractor for bytes;
    using SafeERC20 for IERC20;

    mapping(bytes withdrawalKeyHash => uint256 amountWithdrawn) internal withdrawals;

    constructor (bytes32 initLeaf) TinyMerkleTree (initLeaf) {}

    function deposit(bytes calldata depositKey, bytes32 standardizedKey) public payable {
        if (_leafExists(standardizedKey)) revert KeyAlreadyUsed(standardizedKey);

        (, address asset, uint256 amount) = depositKey._extractKeyMetadata();

        uint256 depositAmount = _getMaxWithdrawalOnAmount(amount);
        _takeFee(IERC20(asset), amount);

        if (asset != NATIVE_TOKEN)
            IERC20(asset).safeTransferFrom(msg.sender, address(this), depositAmount);

        _addLeaf(standardizedKey);
        _recordDeposit(standardizedKey, asset);
        emit DepositAdded(standardizedKey);
    }
    
    function withdraw(
        bytes32 root,
        bytes calldata withdrawalKey,
        uint256[2] calldata pA,     // Proof.
        uint256[2][2] calldata pB,  // Proof.
        uint256[2] calldata pC,     // Proof.
        uint256 nullifier,
        address recipient,
        uint256 amount
    ) public nonReentrant {
        nullifier; // @todo Utilize this.

        if (!_rootIsInHistory(root)) revert RootNotInHistory(root);
        (, address asset, uint256 amountInKey) = withdrawalKey._extractKeyMetadata();

        uint256 maxWithdrawable = _getMaxWithdrawalOnAmount(amountInKey);
        uint256 amountWithdrawn = withdrawals[withdrawalKey];

        if ((amountWithdrawn + amount) > maxWithdrawable) revert WithdrawalExceedsMax(amount);
        withdrawals[withdrawalKey] += amount;

        uint256[928] memory publicSignals = Computer._computePublicSignals(root, withdrawalKey);
        if (!this.verifyProof(pA, pB, pC, publicSignals)) revert ProofNotVerified();

        if (asset == NATIVE_TOKEN) {
            (bool sent, ) = recipient.call { value: amount}("");
            require(sent);
        } else IERC20(asset).safeTransfer(recipient, amount);
    }

    function _getMaxWithdrawalOnAmount(uint256 amount) internal pure returns (uint256 maxWithdrawal) {
        uint256 fee = _calculateFee(amount);
        maxWithdrawal = amount - fee;
    }

    function _rootIsInHistory(bytes32 root) private view returns (bool) {
        for (uint8 i = 0; i < STORED_ROOT_LENGTH; i++) {
            if (last32Roots[i] == root) return true;
        }

        return false;
    }
}