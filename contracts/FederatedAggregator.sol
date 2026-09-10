// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./BlockFLToken.sol";

/// @title FederatedAggregator
/// @notice Điều phối các round Federated Learning trên chuỗi:
///         - đăng ký node biên
///         - nhận hash trọng số cục bộ (Δw) của từng node theo round
///         - chốt global model (hash) khi đủ node báo cáo
///         - phân phối token thưởng theo số mẫu dữ liệu đóng góp
/// @dev Trọng số THẬT được tính FedAvg off-chain và lưu file/IPFS; on-chain chỉ
///      giữ hash keccak256 để truy vết & chống chối bỏ.
contract FederatedAggregator {
    address public owner;
    BlockFLToken public token;

    uint256 public currentRound;
    uint256 public minNodes;          // số node tối thiểu để được phép aggregate
    uint256 public rewardPerRound;    // tổng token phát cho mỗi round (chia theo tỉ lệ mẫu)

    struct Submission {
        bytes32 weightsHash;
        uint256 numSamples;
        bool submitted;
        bool rewarded;
    }

    struct Round {
        bytes32 globalModelHash;
        uint256 totalSamples;
        uint256 submissionCount;
        bool aggregated;
        address[] submitters;
    }

    mapping(address => bool) public isNode;
    address[] public nodes;

    // round => node => submission
    mapping(uint256 => mapping(address => Submission)) public submissions;
    mapping(uint256 => Round) private rounds;

    event NodeRegistered(address indexed node);
    event WeightsSubmitted(uint256 indexed round, address indexed node, bytes32 weightsHash, uint256 numSamples);
    event ModelAggregated(uint256 indexed round, bytes32 globalModelHash, uint256 totalSamples, uint256 submissionCount);
    event RewardDistributed(uint256 indexed round, address indexed node, uint256 amount);
    event RoundAdvanced(uint256 indexed newRound);

    modifier onlyOwner() {
        require(msg.sender == owner, "AGG: not owner");
        _;
    }

    modifier onlyNode() {
        require(isNode[msg.sender], "AGG: not a registered node");
        _;
    }

    constructor(address tokenAddr, uint256 _minNodes, uint256 _rewardPerRound) {
        require(tokenAddr != address(0), "AGG: zero token");
        require(_minNodes > 0, "AGG: minNodes=0");
        owner = msg.sender;
        token = BlockFLToken(tokenAddr);
        minNodes = _minNodes;
        rewardPerRound = _rewardPerRound;
        currentRound = 1;
    }

    // ----------------------------------------------------------------- config

    function setMinNodes(uint256 _minNodes) external onlyOwner {
        require(_minNodes > 0, "AGG: minNodes=0");
        minNodes = _minNodes;
    }

    function setRewardPerRound(uint256 _rewardPerRound) external onlyOwner {
        rewardPerRound = _rewardPerRound;
    }

    // --------------------------------------------------------------- registry

    function registerNode(address node) external onlyOwner {
        require(node != address(0), "AGG: zero node");
        require(!isNode[node], "AGG: already registered");
        isNode[node] = true;
        nodes.push(node);
        emit NodeRegistered(node);
    }

    function nodeCount() external view returns (uint256) {
        return nodes.length;
    }

    // ------------------------------------------------------------ FL workflow

    /// @notice Node nộp hash trọng số cục bộ cho round hiện tại.
    /// @param weightsHash keccak256 của buffer trọng số Δw (tính off-chain)
    /// @param numSamples  số mẫu dữ liệu cục bộ (dùng làm trọng số FedAvg + chia thưởng)
    /// @param round       phải khớp currentRound (chống nộp nhầm round)
    function submitWeights(bytes32 weightsHash, uint256 numSamples, uint256 round) external onlyNode {
        require(round == currentRound, "AGG: wrong round");
        require(weightsHash != bytes32(0), "AGG: empty hash");
        require(numSamples > 0, "AGG: numSamples=0");
        require(!rounds[round].aggregated, "AGG: round closed");

        Submission storage s = submissions[round][msg.sender];
        require(!s.submitted, "AGG: already submitted");

        s.weightsHash = weightsHash;
        s.numSamples = numSamples;
        s.submitted = true;

        Round storage r = rounds[round];
        r.submitters.push(msg.sender);
        r.submissionCount += 1;
        r.totalSamples += numSamples;

        emit WeightsSubmitted(round, msg.sender, weightsHash, numSamples);
    }

    /// @notice Owner chốt global model sau khi tính FedAvg off-chain.
    /// @param round           round cần chốt (== currentRound)
    /// @param globalModelHash keccak256 của global weights mới
    function aggregate(uint256 round, bytes32 globalModelHash) external onlyOwner {
        require(round == currentRound, "AGG: wrong round");
        Round storage r = rounds[round];
        require(!r.aggregated, "AGG: already aggregated");
        require(r.submissionCount >= minNodes, "AGG: not enough submissions");
        require(globalModelHash != bytes32(0), "AGG: empty global hash");

        r.aggregated = true;
        r.globalModelHash = globalModelHash;

        emit ModelAggregated(round, globalModelHash, r.totalSamples, r.submissionCount);
    }

    /// @notice Phát token thưởng cho các node của một round đã aggregate.
    ///         amount_i = rewardPerRound * numSamples_i / totalSamples
    function distributeReward(uint256 round) external onlyOwner {
        Round storage r = rounds[round];
        require(r.aggregated, "AGG: not aggregated");
        require(r.totalSamples > 0, "AGG: no samples");

        uint256 len = r.submitters.length;
        for (uint256 i = 0; i < len; i++) {
            address node = r.submitters[i];
            Submission storage s = submissions[round][node];
            if (s.rewarded) continue;
            s.rewarded = true;
            uint256 amount = (rewardPerRound * s.numSamples) / r.totalSamples;
            if (amount > 0) {
                token.mint(node, amount);
                emit RewardDistributed(round, node, amount);
            }
        }
    }

    /// @notice Mở round tiếp theo (gọi sau khi đã aggregate + distributeReward).
    function advanceRound() external onlyOwner {
        require(rounds[currentRound].aggregated, "AGG: current round not aggregated");
        currentRound += 1;
        emit RoundAdvanced(currentRound);
    }

    // ------------------------------------------------------------------ views

    function getRound(uint256 round)
        external
        view
        returns (
            bytes32 globalModelHash,
            uint256 totalSamples,
            uint256 submissionCount,
            bool aggregated,
            address[] memory submitters
        )
    {
        Round storage r = rounds[round];
        return (r.globalModelHash, r.totalSamples, r.submissionCount, r.aggregated, r.submitters);
    }

    function getSubmission(uint256 round, address node)
        external
        view
        returns (bytes32 weightsHash, uint256 numSamples, bool submitted, bool rewarded)
    {
        Submission storage s = submissions[round][node];
        return (s.weightsHash, s.numSamples, s.submitted, s.rewarded);
    }
}
