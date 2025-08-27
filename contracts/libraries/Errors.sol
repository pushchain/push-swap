// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @dev Library containing error definitions for PRC20
 */
library PRC20Errors {
    error CallerIsNotUniversalExecutor();
    error ZeroAddress();
    error LowAllowance();
    error InvalidSender();
    error GasFeeTransferFailed();
    error ZerogasToken();
    error ZeroGasPrice();
    error LowBalance();
    error ZeroAmount();
}
