// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

abstract contract Fees {
    using SafeERC20 for IERC20;

    /// @notice 1%, unused, but for informational purposes.
    uint8 private constant FEE_PERCENTAGE = 1;
    uint8 private constant PERCENTAGE_BASE = 100;

    uint8 private constant COLLECTOR_PERCENTAGE = 90; // 90% of 1% fee.
    uint8 private constant SECOND_COLLECTOR_PERCENTAGE = 10; // 10% of 1% fee.

    address private immutable COLLECTOR; // 90% goes to this guy.
    address private immutable SECOND_COLLECTOR; // 10% goes to this guy.

    constructor(address collector, address secondCollector) {
        COLLECTOR = collector;
        SECOND_COLLECTOR = secondCollector;
    }

    /// @notice For UI purposes.
    function calculateFee(uint256 amount) public pure returns (uint256 fee) {
        fee = _calculateFee(amount);
    }

    function _calculateFee(uint256 amount) internal pure returns (uint256 fee) {
        fee = amount / PERCENTAGE_BASE;
    }

    function _distributeFee(IERC20 token, uint256 fee) internal {
        uint256 collectorFee = (COLLECTOR_PERCENTAGE * fee) / PERCENTAGE_BASE;

        /// @notice Yeah, the commented line below works and is a better option,
        ///         but I'm paranoid, lmao.
        ///         uint256 secondCollectorFee = fee - collectorFee;
        uint256 secondCollectorFee = (SECOND_COLLECTOR_PERCENTAGE * fee) / PERCENTAGE_BASE;

        token.safeTransfer(COLLECTOR, collectorFee);
        token.safeTransfer(SECOND_COLLECTOR, secondCollectorFee);
    }
}