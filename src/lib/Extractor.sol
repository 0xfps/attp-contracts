// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library Extractor {
    function _extractKeyMetadata(bytes calldata key) internal pure returns (
        bytes32 keyHash,
        address asset,
        uint256 amount
    ) {
        keyHash = _extractKeyHash(key);
        asset = _extractAsset(key);
        amount = _extractAmount(key);
    }

    function _extractKeyHash(bytes calldata key) private pure returns (bytes32 keyHash) {
        keyHash = bytes32(key[0 : 32]);
    }

    function _extractAsset(bytes calldata key) private pure returns (address asset) {
        asset = address(bytes20(key[32 : 52]));
    }

    function _extractAmount(bytes calldata key) private pure returns (uint256 amount) {
        amount = uint256(bytes32(key[52 : ]));
    }
}