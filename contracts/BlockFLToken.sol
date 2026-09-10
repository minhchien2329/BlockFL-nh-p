// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BlockFLToken
/// @notice Token ERC-20 tối giản dùng để thưởng cho các edge node đóng góp
///         trọng số trung thực trong quá trình Federated Learning.
/// @dev Chỉ `minter` (hợp đồng FederatedAggregator) được phép mint.
contract BlockFLToken {
    string public constant name = "BlockFL Token";
    string public constant symbol = "BFL";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    address public minter;
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event MinterUpdated(address indexed newMinter);

    constructor() {
        owner = msg.sender;
        minter = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "BFL: not owner");
        _;
    }

    /// @notice Gán quyền mint cho hợp đồng aggregator sau khi deploy.
    function setMinter(address newMinter) external onlyOwner {
        require(newMinter != address(0), "BFL: zero minter");
        minter = newMinter;
        emit MinterUpdated(newMinter);
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "BFL: not minter");
        require(to != address(0), "BFL: mint to zero");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "BFL: allowance exceeded");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "BFL: transfer to zero");
        uint256 bal = balanceOf[from];
        require(bal >= amount, "BFL: balance exceeded");
        unchecked {
            balanceOf[from] = bal - amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }
}
