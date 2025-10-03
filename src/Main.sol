// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IMain } from "./interfaces/IMain.sol";
import { IVerifier } from "./interfaces/IVerifier.sol";

import { Extractor } from "./lib/Extractor.sol";
import { PoseidonT4 } from "./lib/PoseidonT4.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { NATIVE_TOKEN, Fee } from "./Fee.sol";
import { Recorder } from "./Recorder.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { TinyMerkleTree } from "@fifteenfigures/TinyMerkleTree.sol";

contract Main is IMain, Recorder, Fee, TinyMerkleTree, ReentrancyGuard {
    using Extractor for bytes;
    using SafeERC20 for IERC20;

    IVerifier internal verifier;

    constructor (bytes32 initLeaf, address _verifier) TinyMerkleTree (initLeaf) {
        verifier = IVerifier(_verifier);
        emit DepositAdded(initLeaf);
    }

    receive() external payable {}

    function deposit(bytes32 commitment, address asset, uint256 amount) public payable {
        bytes32 leaf = bytes32(PoseidonT4.hash([uint256(commitment), uint256(uint160(asset)), amount]));
        
        if (_leafExists(leaf)) revert KeyAlreadyUsed(leaf);

        uint256 balance;
        
        if (asset == NATIVE_TOKEN) {
            if (msg.value < amount) revert ETHSentLessThanDeposit(msg.value, amount);
            balance = msg.value - amount;
        } else {
            IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
            balance = msg.value;
        }

        // Refund ETH.
        (bool sent, ) = msg.sender.call{ value: balance }("");
        require(sent);

        _takeFee(IERC20(asset), amount);
        _addLeaf(leaf);
        _recordDeposit(leaf, asset);
        emit DepositAdded(leaf);
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
        if (!_rootIsInHistory(root)) revert RootNotInHistory(root);

        if (nullifierUsed[nullifier]) revert NullifierUsed(nullifier);
        nullifierUsed[nullifier] = true;

        (bytes32 keyHash, address asset, uint256 amountInKey) = withdrawalKey._extractKeyMetadata();

        uint256 maxWithdrawable = _getMaxWithdrawalOnAmount(amountInKey);
        uint256 amountWithdrawn = withdrawals[withdrawalKey];

        if ((amountWithdrawn + amount) > maxWithdrawable) revert WithdrawalExceedsMax(amount);
        withdrawals[withdrawalKey] += amount;

        uint256[5] memory publicSignals;
        publicSignals[0] = uint256(root);
        publicSignals[1] = uint256(keyHash);
        publicSignals[2] = uint256(uint160(asset));
        publicSignals[3] = uint256(amountInKey);
        publicSignals[4] = nullifier;

        if (!verifier.verifyProof(pA, pB, pC, publicSignals)) revert ProofNotVerified();

        if (asset == NATIVE_TOKEN) {
            (bool sent, ) = recipient.call{ value: amount }("");
            require(sent);
        } else IERC20(asset).safeTransfer(recipient, amount);
    }

    function _getMaxWithdrawalOnAmount(uint256 amount) internal pure returns (uint256 maxWithdrawal) {
        uint256 fee = _calculateFee(amount);
        maxWithdrawal = amount - fee;
    }

    function _rootIsInHistory(bytes32 root) private view returns (bool) {
        for (uint8 i = 0; i < STORED_ROOT_LENGTH; i++) {
            if (last64Roots[i] == root) return true;
        }

        return false;
    }
}