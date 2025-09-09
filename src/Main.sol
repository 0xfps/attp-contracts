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

abstract contract Main is IMain, Fee, ReentrancyGuard, Groth16Verifier {
    using Extractor for bytes;

    mapping(bytes32 depositLeaf => address depositor) internal deposits;

    function generateKeys(
        address asset,
        uint256 amount,
        bytes16 secretKey
    ) external pure returns (
        bytes memory withdrawalKey,
        bytes memory depositKey
    ) {
        withdrawalKey = abi.encodePacked(
            keccak256(abi.encodePacked(secretKey)), asset, amount
        );

        depositKey = abi.encodePacked(
            keccak256(
                abi.encodePacked(withdrawalKey, secretKey)
            ), asset, amount
        );
    }

    function getMaxWithdrawal(
        bytes calldata withdrawalKey
    ) external pure returns (uint256 maxWithdrawal) {
        (, , uint256 amount) = withdrawalKey._extractKeyMetadata();
        uint256 fee = calculateFee(amount);

        maxWithdrawal = amount - fee;
    }

    function getDeposit(bytes32 leaf) external view returns (address depositor) {
        return deposits[leaf];
    }
}