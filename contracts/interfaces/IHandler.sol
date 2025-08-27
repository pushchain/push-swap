// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @dev Interface for Handler contract providing gas oracles
 */
interface IHandler {
    /**
     * @notice Get the PRC20 gas token for a given chain ID
     * @param chainId The source chain identifier
     * @return gasToken Address of the PRC20 gas token
     */
    function gasTokenPRC20ByChainId(
        uint256 chainId
    ) external view returns (address gasToken);

    /**
     * @notice Get the gas price for a given chain ID
     * @param chainId The source chain identifier
     * @return gasPrice Current gas price for the chain
     */
    function gasPriceByChainId(
        uint256 chainId
    ) external view returns (uint256 gasPrice);
}
