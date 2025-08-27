# Smart Account Uniswap V3 Integration Guide

## Overview

Smart accounts on Push Chain act as proxies that forward calldata to Uniswap V3 contracts using `.call()`. This guide covers how to interact with Uniswap V3 through smart account forwarding.

## 🏗️ Architecture

```
User (EOA) → Calldata → Smart Account → .call(recipient, calldata) → Uniswap V3 Contracts
```

### Components:
- **User (EOA)**: Sends transaction with recipient address and calldata
- **Smart Account**: Forwards calldata to recipient using `.call()`
- **Uniswap V3 Contracts**: Execute the actual operations

## 🔧 Smart Account Implementation

### Basic Smart Account Structure:
```solidity
contract UniswapSmartAccount {
    address public immutable owner;
    
    constructor(address _owner) {
        owner = _owner;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }
    
    /// @notice Execute any contract call
    /// @param target Contract address to call
    /// @param data Calldata to send
    function execute(address target, bytes calldata data) external onlyOwner {
        (bool success, bytes memory result) = target.call(data);
        require(success, "Call failed");
    }
    
    /// @notice Emergency withdraw tokens
    function emergencyWithdraw(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).transfer(owner, balance);
        }
    }
    
    /// @notice Emergency withdraw ETH
    function emergencyWithdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            payable(owner).transfer(balance);
        }
    }
    
    // Receive function to accept ETH
    receive() external payable {}
}
```

## 📋 Available Functionalities

### 1. Pool Creation
Create new liquidity pools for any token pair.

**User Call:**
```javascript
// Encode factory.createPool() call
const calldata = factory.interface.encodeFunctionData('createPool', [
    tokenA, 
    tokenB, 
    fee
]);

// Smart account forwards to factory
await smartAccount.execute(factory.address, calldata);
```

### 2. Pool Initialization
Initialize pool with initial price.

**User Call:**
```javascript
// Encode pool.initialize() call
const calldata = pool.interface.encodeFunctionData('initialize', [
    sqrtPriceX96
]);

// Smart account forwards to pool
await smartAccount.execute(pool.address, calldata);
```

### 3. Add Liquidity
Add liquidity to existing pools with specific tick ranges.

**User Call:**
```javascript
// Encode positionManager.mint() call
const mintParams = {
    token0: token0Address,
    token1: token1Address,
    fee: 3000,
    tickLower: -887220,
    tickUpper: 887220,
    amount0Desired: amount0,
    amount1Desired: amount1,
    amount0Min: 0,
    amount1Min: 0,
    recipient: userAddress,
    deadline: deadline
};

const calldata = positionManager.interface.encodeFunctionData('mint', [mintParams]);

// Smart account forwards to position manager
await smartAccount.execute(positionManager.address, calldata);
```

### 4. Remove Liquidity
Remove liquidity from positions.

**User Call:**
```javascript
// Encode positionManager.decreaseLiquidity() call
const decreaseParams = {
    tokenId: tokenId,
    liquidity: liquidity,
    amount0Min: amount0Min,
    amount1Min: amount1Min,
    deadline: deadline
};

const calldata = positionManager.interface.encodeFunctionData('decreaseLiquidity', [decreaseParams]);

// Smart account forwards to position manager
await smartAccount.execute(positionManager.address, calldata);
```

### 5. Single-Hop Swaps
Execute token swaps with slippage protection.

**User Call:**
```javascript
// Encode swapRouter.exactInputSingle() call
const swapParams = {
    tokenIn: tokenInAddress,
    tokenOut: tokenOutAddress,
    fee: 3000,
    recipient: userAddress,
    deadline: deadline,
    amountIn: amountIn,
    amountOutMinimum: amountOutMinimum,
    sqrtPriceLimitX96: 0
};

const calldata = swapRouter.interface.encodeFunctionData('exactInputSingle', [swapParams]);

// Smart account forwards to swap router
await smartAccount.execute(swapRouter.address, calldata);
```

### 6. Multi-Hop Swaps
Execute swaps through multiple pools.

**User Call:**
```javascript
// Encode swapRouter.exactInput() call
const multiHopParams = {
    path: encodedPath,
    recipient: userAddress,
    deadline: deadline,
    amountIn: amountIn,
    amountOutMinimum: amountOutMinimum
};

const calldata = swapRouter.interface.encodeFunctionData('exactInput', [multiHopParams]);

// Smart account forwards to swap router
await smartAccount.execute(swapRouter.address, calldata);
```

### 7. WPUSH Management
Handle WPUSH deposits and withdrawals.

**User Call (Deposit):**
```javascript
// Encode WPUSH deposit call
const calldata = wpush.interface.encodeFunctionData('deposit');

// Smart account forwards to WPUSH with ETH value
await smartAccount.execute(wpush.address, calldata, { value: amount });
```

**User Call (Withdraw):**
```javascript
// Encode WPUSH withdraw call
const calldata = wpush.interface.encodeFunctionData('withdraw', [amount]);

// Smart account forwards to WPUSH
await smartAccount.execute(wpush.address, calldata);
```

### 8. Token Approvals
Approve tokens for contracts.

**User Call:**
```javascript
// Encode token.approve() call
const calldata = token.interface.encodeFunctionData('approve', [
    spenderAddress, 
    amount
]);

// Smart account forwards to token
await smartAccount.execute(token.address, calldata);
```

### 9. Token Transfers
Transfer tokens.

**User Call:**
```javascript
// Encode token.transfer() call
const calldata = token.interface.encodeFunctionData('transfer', [
    recipientAddress, 
    amount
]);

// Smart account forwards to token
await smartAccount.execute(token.address, calldata);
```

## 📦 Calldata Encoding Examples

### JavaScript/TypeScript:
```javascript
// Example: Create pool
const factory = new ethers.Contract(factoryAddress, factoryABI, signer);
const calldata = factory.interface.encodeFunctionData('createPool', [
    '0x...', // tokenA
    '0x...', // tokenB
    3000     // fee
]);

// Example: Swap tokens
const swapRouter = new ethers.Contract(swapRouterAddress, swapRouterABI, signer);
const calldata = swapRouter.interface.encodeFunctionData('exactInputSingle', [{
    tokenIn: '0x...',
    tokenOut: '0x...',
    fee: 3000,
    recipient: userAddress,
    deadline: Math.floor(Date.now() / 1000) + 300,
    amountIn: ethers.utils.parseEther('1'),
    amountOutMinimum: ethers.utils.parseEther('0.99'),
    sqrtPriceLimitX96: 0
}]);

// Example: WPUSH deposit
const wpush = new ethers.Contract(wpushAddress, wpushABI, signer);
const calldata = wpush.interface.encodeFunctionData('deposit');
```

## 🎯 Use Cases

1. **DeFi Protocols**: Automated trading strategies
2. **Cross-Chain Bridges**: Liquidity management
3. **Yield Farming**: Position management
4. **Arbitrage Bots**: Multi-hop swaps
5. **Portfolio Management**: Automated rebalancing

## 🔒 Security Considerations

1. **Access Control**: Only owner can execute operations
2. **Slippage Protection**: Always use amountOutMinimum
3. **Deadline Checks**: Prevent stale transactions
4. **Emergency Functions**: Allow token recovery
5. **Input Validation**: Validate all parameters before encoding

## 📊 Gas Optimization

1. **Batch Operations**: Combine multiple operations in one transaction
2. **Efficient Encoding**: Minimize calldata size
3. **Reuse Contracts**: Cache contract instances
4. **Optimized Approvals**: Use MaxUint256 for approvals

## 🚀 Deployment

### Deploy Smart Account:
```javascript
const SmartAccountFactory = await ethers.getContractFactory('UniswapSmartAccount');
const smartAccount = await SmartAccountFactory.deploy(userAddress);
await smartAccount.deployed();
```

### Usage:
```javascript
// User provides recipient address and calldata
await smartAccount.execute(recipientAddress, calldata);
```

This architecture provides a simple and efficient way for smart accounts to interact with Uniswap V3 on Push Chain! 🚀
