// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

address constant NATIVE_TOKEN = address(0);

abstract contract Fee {
    using SafeERC20 for IERC20;

    /// @notice 1%, unused, but for informational purposes.
    uint8 private constant FEE_PERCENTAGE = 1;
    uint8 private constant PERCENTAGE_BASE = 100;

    uint8 private constant COLLECTOR_PERCENTAGE = 90; // 90% of 1% fee.
    uint8 private constant SECOND_COLLECTOR_PERCENTAGE = 10; // 10% of 1% fee. Unused, but informational.

    // @todo Update addresses.
    address private constant COLLECTOR = 0x1181a7eA6E0A4350b067B0BaCdf71440e70ef219; // 90% goes to this guy.
    address private constant SECOND_COLLECTOR = 0x5f6eF81421e331f65aA3D841247927ACb00df77A; // 10% goes to this guy.

    function _takeFee(IERC20 token, uint256 amount) internal {
        _distributeFee(token, _calculateFee(amount));
    }

    function _calculateFee(uint256 amount) internal pure returns (uint256 fee) {
        fee = amount / PERCENTAGE_BASE;
    }

    function _distributeFee(IERC20 token, uint256 fee) private {
        uint256 collectorFee = (COLLECTOR_PERCENTAGE * fee) / PERCENTAGE_BASE;
        uint256 secondCollectorFee = fee - collectorFee;

        if (address(token) == NATIVE_TOKEN) {
            (bool sent, ) = COLLECTOR.call{ value: collectorFee }("");
            (bool secondSent, ) = SECOND_COLLECTOR.call{ value: secondCollectorFee }("");

            require(sent && secondSent);
        } else {
            token.safeTransfer(COLLECTOR, collectorFee);
            token.safeTransfer(SECOND_COLLECTOR, secondCollectorFee);
        }
    }
}