// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHandler} from "./interfaces/IHandler.sol";
import {IPRC20} from "./interfaces/IPRC20.sol";
import {PRC20Errors as Errors} from "./libraries/Errors.sol";

/// @title  PRC20 — Push Chain Synthetic Token (ZRC20-inspired)
/// @notice ERC-20 compatible synthetic token minted/burned by Push Chain protocol.
/// @dev    All imperative functionality is handled by the Handler contract and Universal Executor Module.
contract PRC20 is IPRC20 {
    //*** STATES ***//

    /// @notice The protocol's privileged executor module (auth & fee sink)
    address public immutable UNIVERSAL_EXECUTOR_MODULE;

    /// @notice Source chain this PRC20 mirrors (used for oracle lookups)
    uint256 public immutable SOURCE_CHAIN_ID;

    /// @notice Classification of this synthetic
    TokenType public immutable TOKEN_TYPE;

    /// @notice Handler contract providing gas oracles (gas coin token & gas price)
    address public HANDLER_CONTRACT;

    /// @notice Gas limit used in fee computation; fee = price * GAS_LIMIT + PC_PROTOCOL_FEE
    uint256 public GAS_LIMIT;

    /// @notice Flat fee (absolute units in gas coin PRC20), NOT basis points
    uint256 public PC_PROTOCOL_FEE;

    string private _name;
    string private _symbol;
    uint8 private _decimals;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    //*** MODIFIERS ***//

    /// @notice Restricts to the Universal Executor Module (protocol owner)
    modifier onlyUniversalExecutor() {
        if (msg.sender != UNIVERSAL_EXECUTOR_MODULE)
            revert Errors.CallerIsNotUniversalExecutor();
        _;
    }

    //*** CONSTRUCTOR ***//

    /// @param name_              ERC-20 name
    /// @param symbol_            ERC-20 symbol
    /// @param decimals_          ERC-20 decimals
    /// @param sourceChainId_     Source chain identifier this PRC20 represents
    /// @param tokenType_         Token classification (PC, NATIVE, ERC20)
    /// @param gasLimit_          Protocol gas limit used in fee computation
    /// @param protocolFlatFee_   Absolute flat fee added to fee computation (units: gas coin PRC20)
    /// @param universalExecutor_ Address of Universal Executor Module (auth & fee sink)
    /// @param handler_           Initial handler contract providing gas coin & gas price
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 sourceChainId_,
        TokenType tokenType_,
        uint256 gasLimit_,
        uint256 protocolFlatFee_,
        address universalExecutor_,
        address handler_
    ) {
        if (universalExecutor_ == address(0) || handler_ == address(0))
            revert Errors.ZeroAddress();

        _name = name_;
        _symbol = symbol_;
        _decimals = decimals_;

        SOURCE_CHAIN_ID = sourceChainId_;
        TOKEN_TYPE = tokenType_;
        GAS_LIMIT = gasLimit_;
        PC_PROTOCOL_FEE = protocolFlatFee_;
        UNIVERSAL_EXECUTOR_MODULE = universalExecutor_;
        HANDLER_CONTRACT = handler_;
    }

    //*** VIEW FUNCTIONS ***//

    /// @notice Token name
    function name() external view returns (string memory) {
        return _name;
    }

    /// @notice Token symbol
    function symbol() external view returns (string memory) {
        return _symbol;
    }

    /// @notice Token decimals
    function decimals() external view returns (uint8) {
        return _decimals;
    }

    /// @notice Total supply
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    /// @notice Balance of an account
    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    /// @notice Allowance from owner to spender
    function allowance(
        address owner,
        address spender
    ) external view returns (uint256) {
        return _allowances[owner][spender];
    }

    //*** MUTABLE FUNCTIONS ***//

    /// @notice Transfer tokens
    function transfer(
        address recipient,
        uint256 amount
    ) external returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    /// @notice Approve spender
    function approve(address spender, uint256 amount) external returns (bool) {
        if (spender == address(0)) revert Errors.ZeroAddress();
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /// @notice Transfer tokens using allowance
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool) {
        _transfer(sender, recipient, amount);

        uint256 currentAllowance = _allowances[sender][msg.sender];
        if (currentAllowance < amount) revert Errors.LowAllowance();
        unchecked {
            _allowances[sender][msg.sender] = currentAllowance - amount;
        }
        emit Approval(sender, msg.sender, _allowances[sender][msg.sender]);

        return true;
    }

    /// @notice Burn caller's tokens
    function burn(uint256 amount) external returns (bool) {
        _burn(msg.sender, amount);
        return true;
    }

    //*** BRIDGE ENTRYPOINTS ***//

    /// @notice Mint PRC20 on inbound bridge (lock on source)
    /// @dev Only callable by HANDLER_CONTRACT or UNIVERSAL_EXECUTOR_MODULE
    /// @param to      Recipient on Push EVM
    /// @param amount  Amount to mint
    function deposit(address to, uint256 amount) external returns (bool) {
        if (
            msg.sender != HANDLER_CONTRACT &&
            msg.sender != UNIVERSAL_EXECUTOR_MODULE
        ) revert Errors.InvalidSender();

        _mint(to, amount);
        // Encode the Universal Executor Module as the logical "from" (parity with ZRC20 style)
        emit Deposit(abi.encodePacked(UNIVERSAL_EXECUTOR_MODULE), to, amount);
        return true;
    }

    /// @notice Burn and request outbound unlock on source, charging gas fee in the per-chain gas coin PRC20
    /// @dev Caller (user/app) must have approved this PRC20 (for burn via this function)
    ///      AND approved the gas coin PRC20 to allow this contract to pull `gasFee` to UNIVERSAL_EXECUTOR_MODULE.
    /// @param to      Destination address on source chain (as raw bytes)
    /// @param amount  Amount of this PRC20 to burn
    function withdraw(
        bytes calldata to,
        uint256 amount
    ) external returns (bool) {
        (address gasToken, uint256 gasFee) = withdrawGasFee();

        bool result = IPRC20(gasToken).transferFrom(
            msg.sender,
            UNIVERSAL_EXECUTOR_MODULE,
            gasFee
        );
        if (!result) revert Errors.GasFeeTransferFailed();

        _burn(msg.sender, amount);
        emit Withdrawal(msg.sender, to, amount, gasFee, PC_PROTOCOL_FEE);
        return true;
    }

    //*** GAS FEE QUOTING (VIEW) ***//

    /// @notice Compute gas coin token and fee for a withdraw using current GAS_LIMIT
    /// @return gasToken  PRC20 token used as gas coin for SOURCE_CHAIN_ID
    /// @return gasFee   price * GAS_LIMIT + PC_PROTOCOL_FEE
    function withdrawGasFee()
        public
        view
        returns (address gasToken, uint256 gasFee)
    {
        gasToken = IHandler(HANDLER_CONTRACT).gasTokenPRC20ByChainId(
            SOURCE_CHAIN_ID
        );
        if (gasToken == address(0)) revert Errors.ZerogasToken();

        uint256 price = IHandler(HANDLER_CONTRACT).gasPriceByChainId(
            SOURCE_CHAIN_ID
        );
        if (price == 0) revert Errors.ZeroGasPrice();

        gasFee = price * GAS_LIMIT + PC_PROTOCOL_FEE;
    }

    /// @notice Compute gas coin token and fee for a withdraw given a custom gasLimit
    /// @param gasLimit_  Gas limit to use for the quote
    /// @return gasToken   PRC20 gas coin token
    /// @return gasFee    price * gasLimit_ + PC_PROTOCOL_FEE
    function withdrawGasFeeWithGasLimit(
        uint256 gasLimit_
    ) external view returns (address gasToken, uint256 gasFee) {
        gasToken = IHandler(HANDLER_CONTRACT).gasTokenPRC20ByChainId(
            SOURCE_CHAIN_ID
        );
        if (gasToken == address(0)) revert Errors.ZerogasToken();

        uint256 price = IHandler(HANDLER_CONTRACT).gasPriceByChainId(
            SOURCE_CHAIN_ID
        );
        if (price == 0) revert Errors.ZeroGasPrice();

        gasFee = price * gasLimit_ + PC_PROTOCOL_FEE;
    }

    //*** ADMIN ***//

    /// @notice Update Handler contract (gas coin & price oracle source)
    /// @dev only Universal Executor may update
    function updateHandlerContract(
        address addr
    ) external onlyUniversalExecutor {
        if (addr == address(0)) revert Errors.ZeroAddress();
        HANDLER_CONTRACT = addr;
        emit UpdatedHandlerContract(addr);
    }

    /// @notice Update protocol gas limit used in fee computation
    function updateGasLimit(uint256 gasLimit_) external onlyUniversalExecutor {
        GAS_LIMIT = gasLimit_;
        emit UpdatedGasLimit(gasLimit_);
    }

    /// @notice Update flat protocol fee (absolute units in gas coin PRC20)
    function updateProtocolFlatFee(
        uint256 protocolFlatFee_
    ) external onlyUniversalExecutor {
        PC_PROTOCOL_FEE = protocolFlatFee_;
        emit UpdatedProtocolFlatFee(protocolFlatFee_);
    }

    /// @notice Update token name (optional, parity with ZRC20 mutability)
    function setName(string memory newName) external onlyUniversalExecutor {
        _name = newName;
    }

    /// @notice Update token symbol (optional, parity with ZRC20 mutability)
    function setSymbol(string memory newSymbol) external onlyUniversalExecutor {
        _symbol = newSymbol;
    }

    //*** INTERNAL ERC-20 HELPERS ***//

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal {
        if (sender == address(0) || recipient == address(0))
            revert Errors.ZeroAddress();

        uint256 senderBalance = _balances[sender];
        if (senderBalance < amount) revert Errors.LowBalance();

        unchecked {
            _balances[sender] = senderBalance - amount;
            _balances[recipient] += amount;
        }

        emit Transfer(sender, recipient, amount);
    }

    function _mint(address account, uint256 amount) internal {
        if (account == address(0)) revert Errors.ZeroAddress();
        if (amount == 0) revert Errors.ZeroAmount();

        unchecked {
            _totalSupply += amount;
            _balances[account] += amount;
        }
        emit Transfer(address(0), account, amount);
    }

    function _burn(address account, uint256 amount) internal {
        if (account == address(0)) revert Errors.ZeroAddress();
        if (amount == 0) revert Errors.ZeroAmount();

        uint256 bal = _balances[account];
        if (bal < amount) revert Errors.LowBalance();

        unchecked {
            _balances[account] = bal - amount;
            _totalSupply -= amount;
        }
        emit Transfer(account, address(0), amount);
    }
}
