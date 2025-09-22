# Cross-Chain Uniswap V3 Integration Guide

## Overview

This guide covers how to generate UniversalPayloads for Uniswap V3 operations that can be signed on any chain and executed on Push Chain through the Universal Executor Account (UEA_EVM) system.

## 🏗️ Cross-Chain Architecture

```
User (Any Chain) → Signs UniversalPayload → UEA_EVM (Push Chain) → Verifies Signature → .call(recipient, calldata) → Uniswap V3 Contracts
```

### Flow:
1. **User** generates UniversalPayload with Uniswap V3 calldata on any chain
2. **User** signs the UniversalPayload with their private key using EIP-712
3. **UEA_EVM** on Push Chain verifies the EIP-712 signature
4. **UEA_EVM** executes the calldata on Uniswap V3 contracts using `.call()`

## 📋 UniversalPayload Structure

### Core Payload Structure
```solidity
struct UniversalPayload {
    address to;                    // Target contract address to call
    uint256 value;                 // Native token amount to send
    bytes data;                    // Call data for the function execution
    uint256 gasLimit;              // Maximum gas to be used for this tx
    uint256 maxFeePerGas;          // Maximum fee per gas unit
    uint256 maxPriorityFeePerGas;  // Maximum priority fee per gas unit
    uint256 nonce;                 // Nonce (managed by UEA)
    uint256 deadline;              // Timestamp after which this payload is invalid
    VerificationType vType;        // Type of verification (signedVerification or universalTxVerification)
}
```

### UniversalAccountId Structure
```solidity
struct UniversalAccountId {
    string chainNamespace;         // Chain namespace (e.g., "eip155")
    string chainId;                // Chain ID of the source chain
    bytes owner;                   // Owner's public key or address in bytes
}
```

## 🔧 Uniswap V3 Operation Payloads

### 1. Pool Creation
Create new liquidity pools for any token pair.

**UniversalPayload Generation:**
```javascript
// Encode factory.createPool() call
const factory = new ethers.Contract(factoryAddress, factoryABI);
const calldata = factory.interface.encodeFunctionData('createPool', [
    tokenA,    // First token address
    tokenB,    // Second token address
    fee        // Fee tier: 500 (0.05%), 3000 (0.3%), or 10000 (1%) - choose based on expected volatility
]);

const universalPayload = {
    to: factoryAddress,                                       // Target contract address
    value: "0x0",                                            // ETH value to send (0 for most operations)
    data: calldata,                                          // Encoded function call data
    gasLimit: 500000,                                        // Maximum gas to use (adjust based on operation complexity)
    maxFeePerGas: ethers.utils.parseUnits("20", "gwei"),     // Maximum fee per gas unit (adjust based on network congestion)
    maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei"), // Maximum priority fee (adjust for faster inclusion)
    nonce: 0,                                                // Will be set by UEA automatically
    deadline: Math.floor(Date.now() / 1000) + 3600,         // Unix timestamp after which payload expires
    vType: 0                                                 // 0 for signedVerification, 1 for universalTxVerification
};
```

### 2. Pool Initialization
Initialize pool with initial price.

**UniversalPayload Generation:**
```javascript
// Encode pool.initialize() call
const pool = new ethers.Contract(poolAddress, poolABI);
const calldata = pool.interface.encodeFunctionData('initialize', [
    sqrtPriceX96  // Initial sqrt price in X96 format - calculate from desired token ratio (e.g., 1:2 ratio)
]);

const universalPayload = {
    to: poolAddress,                                          // Target pool contract address
    value: "0x0",                                            // ETH value to send (0 for most operations)
    data: calldata,                                          // Encoded function call data
    gasLimit: 300000,                                        // Maximum gas to use (adjust based on operation complexity)
    maxFeePerGas: ethers.utils.parseUnits("20", "gwei"),     // Maximum fee per gas unit (adjust based on network congestion)
    maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei"), // Maximum priority fee (adjust for faster inclusion)
    nonce: 0,                                                // Will be set by UEA automatically
    deadline: Math.floor(Date.now() / 1000) + 3600,         // Unix timestamp after which payload expires
    vType: 0                                                 // 0 for signedVerification, 1 for universalTxVerification
};
```

### 3. Add Liquidity
Add liquidity to existing pools with specific tick ranges.

**UniversalPayload Generation:**
```javascript
// Encode positionManager.mint() call
const positionManager = new ethers.Contract(positionManagerAddress, positionManagerABI);
const mintParams = {
    token0: token0Address,                                    // First token address
    token1: token1Address,                                    // Second token address
    fee: 3000,                                                // Fee tier: 500 (0.05%), 3000 (0.3%), or 10000 (1%)
    tickLower: -887220,                                       // Lower tick boundary - choose based on price range
    tickUpper: 887220,                                        // Upper tick boundary - choose based on price range
    amount0Desired: amount0,                                  // Amount of token0 to add (in wei)
    amount1Desired: amount1,                                  // Amount of token1 to add (in wei)
    amount0Min: 0,                                            // Minimum amount of token0 to receive (slippage protection)
    amount1Min: 0,                                            // Minimum amount of token1 to receive (slippage protection)
    recipient: userAddress,                                   // Address to receive the position NFT
    deadline: Math.floor(Date.now() / 1000) + 3600           // Unix timestamp after which transaction reverts
};

const calldata = positionManager.interface.encodeFunctionData('mint', [mintParams]);

const universalPayload = {
    to: positionManagerAddress,                               // Target position manager contract address
    value: "0x0",                                            // ETH value to send (0 for most operations)
    data: calldata,                                          // Encoded function call data
    gasLimit: 800000,                                        // Maximum gas to use (higher for complex operations like minting)
    maxFeePerGas: ethers.utils.parseUnits("20", "gwei"),     // Maximum fee per gas unit (adjust based on network congestion)
    maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei"), // Maximum priority fee (adjust for faster inclusion)
    nonce: 0,                                                // Will be set by UEA automatically
    deadline: Math.floor(Date.now() / 1000) + 3600,         // Unix timestamp after which payload expires
    vType: 0                                                 // 0 for signedVerification, 1 for universalTxVerification
};
```

### 4. Remove Liquidity
Remove liquidity from positions.

**UniversalPayload Generation:**
```javascript
// Encode positionManager.decreaseLiquidity() call
const decreaseParams = {
    tokenId: tokenId,                                         // NFT token ID of the position
    liquidity: liquidity,                                     // Amount of liquidity to remove (in wei)
    amount0Min: amount0Min,                                   // Minimum amount of token0 to receive (slippage protection)
    amount1Min: amount1Min,                                   // Minimum amount of token1 to receive (slippage protection)
    deadline: Math.floor(Date.now() / 1000) + 3600           // Unix timestamp after which transaction reverts
};

const calldata = positionManager.interface.encodeFunctionData('decreaseLiquidity', [decreaseParams]);

const universalPayload = {
    to: positionManagerAddress,                               // Target position manager contract address
    value: "0x0",                                            // ETH value to send (0 for most operations)
    data: calldata,                                          // Encoded function call data
    gasLimit: 400000,                                        // Maximum gas to use (adjust based on operation complexity)
    maxFeePerGas: ethers.utils.parseUnits("20", "gwei"),     // Maximum fee per gas unit (adjust based on network congestion)
    maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei"), // Maximum priority fee (adjust for faster inclusion)
    nonce: 0,                                                // Will be set by UEA automatically
    deadline: Math.floor(Date.now() / 1000) + 3600,         // Unix timestamp after which payload expires
    vType: 0                                                 // 0 for signedVerification, 1 for universalTxVerification
};
```

### 5. Single-Hop Swaps
Execute token swaps with slippage protection.

**UniversalPayload Generation:**
```javascript
// Encode swapRouter.exactInputSingle() call
const swapRouter = new ethers.Contract(swapRouterAddress, swapRouterABI);
const swapParams = {
    tokenIn: tokenInAddress,                                  // Address of token being sold
    tokenOut: tokenOutAddress,                                // Address of token being bought
    fee: 3000,                                                // Fee tier: 500 (0.05%), 3000 (0.3%), or 10000 (1%) - choose pool with best liquidity
    recipient: userAddress,                                   // Address to receive the output tokens
    deadline: Math.floor(Date.now() / 1000) + 300,           // Unix timestamp after which transaction reverts
    amountIn: amountIn,                                       // Amount of input tokens to swap (in wei)
    amountOutMinimum: amountOutMinimum,                       // Minimum amount of output tokens to receive (slippage protection)
    sqrtPriceLimitX96: 0                                      // Price limit - 0 for no limit, or set specific price to prevent MEV
};

const calldata = swapRouter.interface.encodeFunctionData('exactInputSingle', [swapParams]);

const universalPayload = {
    to: swapRouterAddress,                                    // Target swap router contract address
    value: "0x0",                                            // ETH value to send (0 for most operations)
    data: calldata,                                          // Encoded function call data
    gasLimit: 300000,                                        // Maximum gas to use (adjust based on operation complexity)
    maxFeePerGas: ethers.utils.parseUnits("20", "gwei"),     // Maximum fee per gas unit (adjust based on network congestion)
    maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei"), // Maximum priority fee (adjust for faster inclusion)
    nonce: 0,                                                // Will be set by UEA automatically
    deadline: Math.floor(Date.now() / 1000) + 300,           // Unix timestamp after which payload expires
    vType: 0                                                 // 0 for signedVerification, 1 for universalTxVerification
};
```

### 6. Multi-Hop Swaps
Execute swaps through multiple pools.

**UniversalPayload Generation:**
```javascript
// Encode swapRouter.exactInput() call
const multiHopParams = {
    path: encodedPath,                                        // Encoded path through multiple pools (e.g., tokenA -> tokenB -> tokenC)
    recipient: userAddress,                                   // Address to receive the output tokens
    deadline: Math.floor(Date.now() / 1000) + 300,           // Unix timestamp after which transaction reverts
    amountIn: amountIn,                                       // Amount of input tokens to swap (in wei)
    amountOutMinimum: amountOutMinimum                        // Minimum amount of output tokens to receive (slippage protection)
};

const calldata = swapRouter.interface.encodeFunctionData('exactInput', [multiHopParams]);

const universalPayload = {
    to: swapRouterAddress,                                    // Target swap router contract address
    value: "0x0",                                            // ETH value to send (0 for most operations)
    data: calldata,                                          // Encoded function call data
    gasLimit: 400000,                                        // Maximum gas to use (higher for multi-hop swaps)
    maxFeePerGas: ethers.utils.parseUnits("20", "gwei"),     // Maximum fee per gas unit (adjust based on network congestion)
    maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei"), // Maximum priority fee (adjust for faster inclusion)
    nonce: 0,                                                // Will be set by UEA automatically
    deadline: Math.floor(Date.now() / 1000) + 300,           // Unix timestamp after which payload expires
    vType: 0                                                 // 0 for signedVerification, 1 for universalTxVerification
};
```

### 7. WPC Management
Handle WPC deposits and withdrawals.

**UniversalPayload Generation (Deposit):**
```javascript
// Encode WPC deposit call
const WPC = new ethers.Contract(WPCAddress, WPCABI);
const calldata = WPC.interface.encodeFunctionData('deposit');

const universalPayload = {
    to: WPCAddress,                                         // Target WPC contract address
    value: amount,                                           // ETH amount to deposit (in wei)
    data: calldata,                                          // Encoded function call data
    gasLimit: 100000,                                        // Maximum gas to use (lower for simple operations)
    maxFeePerGas: ethers.utils.parseUnits("20", "gwei"),     // Maximum fee per gas unit (adjust based on network congestion)
    maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei"), // Maximum priority fee (adjust for faster inclusion)
    nonce: 0,                                                // Will be set by UEA automatically
    deadline: Math.floor(Date.now() / 1000) + 3600,         // Unix timestamp after which payload expires
    vType: 0                                                 // 0 for signedVerification, 1 for universalTxVerification
};
```

**UniversalPayload Generation (Withdraw):**
```javascript
// Encode WPC withdraw call
const calldata = WPC.interface.encodeFunctionData('withdraw', [
    amount  // Amount of WPC to convert back to PC (in wei)
]);

const universalPayload = {
    to: WPCAddress,                                         // Target WPC contract address
    value: "0x0",                                            // ETH value to send (0 for withdraw operations)
    data: calldata,                                          // Encoded function call data
    gasLimit: 100000,                                        // Maximum gas to use (lower for simple operations)
    maxFeePerGas: ethers.utils.parseUnits("20", "gwei"),     // Maximum fee per gas unit (adjust based on network congestion)
    maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei"), // Maximum priority fee (adjust for faster inclusion)
    nonce: 0,                                                // Will be set by UEA automatically
    deadline: Math.floor(Date.now() / 1000) + 3600,         // Unix timestamp after which payload expires
    vType: 0                                                 // 0 for signedVerification, 1 for universalTxVerification
};
```

### 8. Token Approvals
Approve tokens for contracts.

**UniversalPayload Generation:**
```javascript
// Encode token.approve() call
const token = new ethers.Contract(tokenAddress, erc20ABI);
const calldata = token.interface.encodeFunctionData('approve', [
    spenderAddress,  // Contract address to approve (e.g., swapRouter, positionManager)
    amount           // Amount to approve (use MaxUint256 for unlimited approval)
]);

const universalPayload = {
    to: tokenAddress,                                         // Target token contract address
    value: "0x0",                                            // ETH value to send (0 for token operations)
    data: calldata,                                          // Encoded function call data
    gasLimit: 100000,                                        // Maximum gas to use (lower for simple operations)
    maxFeePerGas: ethers.utils.parseUnits("20", "gwei"),     // Maximum fee per gas unit (adjust based on network congestion)
    maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei"), // Maximum priority fee (adjust for faster inclusion)
    nonce: 0,                                                // Will be set by UEA automatically
    deadline: Math.floor(Date.now() / 1000) + 3600,         // Unix timestamp after which payload expires
    vType: 0                                                 // 0 for signedVerification, 1 for universalTxVerification
};
```

### 9. Token Transfers
Transfer tokens.

**UniversalPayload Generation:**
```javascript
// Encode token.transfer() call
const calldata = token.interface.encodeFunctionData('transfer', [
    recipientAddress,  // Address to receive the tokens
    amount            // Amount of tokens to transfer (in wei)
]);

const universalPayload = {
    to: tokenAddress,                                         // Target token contract address
    value: "0x0",                                            // ETH value to send (0 for token operations)
    data: calldata,                                          // Encoded function call data
    gasLimit: 100000,                                        // Maximum gas to use (lower for simple operations)
    maxFeePerGas: ethers.utils.parseUnits("20", "gwei"),     // Maximum fee per gas unit (adjust based on network congestion)
    maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei"), // Maximum priority fee (adjust for faster inclusion)
    nonce: 0,                                                // Will be set by UEA automatically
    deadline: Math.floor(Date.now() / 1000) + 3600,         // Unix timestamp after which payload expires
    vType: 0                                                 // 0 for signedVerification, 1 for universalTxVerification
};
```

## 🔐 EIP-712 Payload Signing and Verification

### Step 1: Get UEA Domain Separator
```javascript
async function getUEADomainSeparator(ueaAddress, chainId) {
    const domainSeparator = await ueaContract.domainSeparator();
    return domainSeparator;
}
```

### Step 2: Generate Payload Hash
```javascript
async function generatePayloadHash(ueaAddress, universalPayload) {
    // Get current nonce from UEA
    const currentNonce = await ueaContract.nonce();
    
    // Update payload with current nonce
    universalPayload.nonce = currentNonce;
    
    // Get domain separator
    const domainSeparator = await ueaContract.domainSeparator();
    
    // Create struct hash
    const structHash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
            ['bytes32', 'address', 'uint256', 'bytes32', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint8'],
            [
                '0x1d8b43e5066bd20bfdacf7b8f4790c0309403b18434e3699ce3c5e57502ed8c4', // UNIVERSAL_PAYLOAD_TYPEHASH
                universalPayload.to,
                universalPayload.value,
                ethers.utils.keccak256(universalPayload.data),
                universalPayload.gasLimit,
                universalPayload.maxFeePerGas,
                universalPayload.maxPriorityFeePerGas,
                universalPayload.nonce,
                universalPayload.deadline,
                universalPayload.vType
            ]
        )
    );
    
    // Create final hash
    const payloadHash = ethers.utils.keccak256(
        ethers.utils.solidityPack(
            ['string', 'bytes32', 'bytes32'],
            ['\x19\x01', domainSeparator, structHash]
        )
    );
    
    return payloadHash;
}
```

### Step 3: Sign Payload
```javascript
async function signUniversalPayload(ueaAddress, universalPayload, privateKey) {
    const payloadHash = await generatePayloadHash(ueaAddress, universalPayload);
    const signature = ethers.utils.signMessage(ethers.utils.arrayify(payloadHash), privateKey);
    return signature;
}
```

### Step 4: Execute on UEA_EVM
```javascript
async function executeUniversalPayload(ueaAddress, universalPayload, signature) {
    const uea = new ethers.Contract(ueaAddress, ueaABI, pushChainSigner);
    
    await uea.executePayload(universalPayload, signature);
}
```

## 📦 Complete Example: Swap WPC to pUSDC

```javascript
// 1. Generate swap UniversalPayload
const swapRouter = new ethers.Contract(swapRouterAddress, swapRouterABI);
const swapParams = {
    tokenIn: WPCAddress,
    tokenOut: pusdcAddress,
    fee: 500,
    recipient: userAddress,
    deadline: Math.floor(Date.now() / 1000) + 300,
    amountIn: ethers.utils.parseEther('1'),
    amountOutMinimum: ethers.utils.parseUnits('1.9', 6),
    sqrtPriceLimitX96: 0
};

const calldata = swapRouter.interface.encodeFunctionData('exactInputSingle', [swapParams]);

const universalPayload = {
    to: swapRouterAddress,                                    // Target swap router contract address
    value: "0x0",                                            // ETH value to send (0 for most operations)
    data: calldata,                                          // Encoded function call data
    gasLimit: 300000,                                        // Maximum gas to use (adjust based on operation complexity)
    maxFeePerGas: ethers.utils.parseUnits("20", "gwei"),     // Maximum fee per gas unit (adjust based on network congestion)
    maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei"), // Maximum priority fee (adjust for faster inclusion)
    nonce: 0,                                                // Will be set by UEA automatically
    deadline: Math.floor(Date.now() / 1000) + 300,           // Unix timestamp after which payload expires
    vType: 0                                                 // 0 for signedVerification, 1 for universalTxVerification
};

// 2. Sign UniversalPayload
const signature = await signUniversalPayload(ueaAddress, universalPayload, userPrivateKey);

// 3. Execute on UEA_EVM
await executeUniversalPayload(ueaAddress, universalPayload, signature);
```
