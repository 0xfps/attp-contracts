// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library Computer {
    /// @notice Length of the concatenation of the root and withdrawal key
    ///         in bytes. By design, the root is 32 bytes, and withdrawal
    ///         key is 84 bytes.
    uint8 internal constant CONCAT_LENGTH = 116;
    /// @notice Number of bits in a byte.
    uint8 internal constant BIT_LENGTH = 8;
    /// @notice Length of public signals needed by Circom.
    uint16 internal constant PUBLIC_SIGNALS_LENGTH = 929;

    function _computePublicSignals(
        bytes32 root,
        bytes memory withdrawalKey
    ) internal pure returns (uint256[PUBLIC_SIGNALS_LENGTH] memory publicSignals) {
        uint16 index;


        bytes memory rootConcat = abi.encodePacked(root);
        
        // Reverse root.
        for (int8 i = 31; i >= 0; i--) {
            uint256[8] memory bits = _computeByteToBitArray(rootConcat[uint8(i)]);
            
            for (uint8 j = 0; j < BIT_LENGTH; j++) {
                publicSignals[index] = bits[j];
                index++;
            }
        }

        bytes memory withdrawalKeyConcat = abi.encodePacked(withdrawalKey);
        
        for (uint8 i = 0; i < 84; i++) {
            uint256[8] memory bits = _computeByteToBitArray(withdrawalKeyConcat[i]);
            
            for (uint8 j = 0; j < BIT_LENGTH; j++) {
                publicSignals[index] = bits[j];
                index++;
            }
        }
    }

    /// @notice Returns an 8 element array representing each individual bit for
    ///         a given byte, ordered in LSB (Least Significant Bit) format.
    function _computeByteToBitArray(bytes1 b) private pure returns (uint256[BIT_LENGTH] memory bits) {
        for (uint8 i = 0; i < BIT_LENGTH; i++) {
            if ((uint8(b) & (1 << i)) > 0) {
                bits[i] = 1;
            } else {
                bits[i] = 0;
            }
        }
    }
}