# BlockFL – Federated Learning tích hợp Blockchain

Đồ án học phần **Cơ sở Blockchain và Ứng dụng** – GVHD: Huỳnh Thế Thiện.

Hệ thống CPS mô phỏng end-to-end:

```
IoT Edge Nodes (giả lập cảm biến vitals, non-IID)
      │  huấn luyện cục bộ (FedAvg local step)
      ▼
Federated Learning (FedAvg off-chain có trọng số theo số mẫu)
      │  keccak256(Δw) + numSamples
      ▼
Smart Contract (FederatedAggregator + BlockFLToken ERC-20)
      • submitWeights → WeightsSubmitted
      • aggregate     → ModelAggregated (chốt global model hash)
      • distributeReward → mint BFL token theo tỉ lệ đóng góp
```

Trọng số **thật** được tính FedAvg off-chain và lưu `ai_model/weights/`; on-chain
chỉ giữ `bytes32` hash để truy vết & chống chối bỏ (đúng chiến lược đề cương).

## Cấu trúc

| Đường dẫn | Vai trò |
|---|---|
| `contracts/BlockFLToken.sol` | Token ERC-20 thưởng (BFL), chỉ aggregator được mint |
| `contracts/FederatedAggregator.sol` | Điều phối round FL: đăng ký node, nhận hash Δw, aggregate, chia thưởng |
| `test/aggregator.test.js` | 6 test Hardhat cho toàn bộ luồng + phân quyền |
| `scripts/deploy.js` | Deploy + đăng ký node + xuất `deployments/<network>.json` (address + ABI) |
| `iot_code/data_partition.py` | Sinh dữ liệu vitals giả lập + chia **non-IID** (Dirichlet) |
| `iot_code/edge_node.py` | Lớp `EdgeNode`: train cục bộ + hash trọng số |
| `ai_model/model.py` | `VitalsMLP` (PyTorch) + tiện ích flatten/eval |
| `ai_model/local_train.py` | Một bước cập nhật cục bộ (SGD, vài epoch) |
| `ai_model/fedavg.py` | FedAvg có trọng số + hash keccak256 + lưu/đọc trọng số |
| `scripts/web3_interface.py` | Cầu nối Web3.py ↔ smart contract |
| `run_demo.py` | Orchestrator chạy nhiều round (có/không blockchain) |

## Yêu cầu

- Node.js ≥ 18, npm
- Python ≥ 3.10 với `numpy`, `torch`, `web3`

```bash
npm install
pip install -r requirements.txt
```

## Chạy

### 1. Kiểm tra nhanh tầng AI (không cần blockchain)

```bash
python run_demo.py --no-chain --rounds 5
```

Kết quả mẫu: global model hội tụ từ `acc≈0.34` → `acc≈0.95`, `f1≈0.92` sau 5 round.

### 2. Test smart contract

```bash
npx hardhat test
```

### 3. Demo end-to-end (blockchain + FL)

```bash
# Terminal A
npx hardhat node

# Terminal B
npx hardhat run scripts/deploy.js --network localhost
python run_demo.py --rounds 5
```

Mỗi round: 4 node `submitWeights(hash, numSamples, round)` → owner `aggregate()` →
`distributeReward()` mint BFL token theo `numSamples_i / totalSamples`. Cuối demo
in số dư token từng node và ghi `results.json`.

### 4. Deploy Testnet Sepolia (giai đoạn cuối)

```bash
cp .env.example .env   # điền SEPOLIA_RPC_URL, PRIVATE_KEY
npx hardhat run scripts/deploy.js --network sepolia
python run_demo.py --network sepolia --rounds 3
```

## Tham số `run_demo.py`

| Cờ | Mặc định | Ý nghĩa |
|---|---|---|
| `--rounds` | 5 | số round FL |
| `--nodes` | 4 | số node (chỉ khi `--no-chain`) |
| `--alpha` | 0.4 | Dirichlet α — nhỏ = non-IID mạnh hơn |
| `--epochs` | 5 | epoch huấn luyện cục bộ / round |
| `--lr` | 0.05 | learning rate SGD |
| `--no-chain` | off | chỉ chạy FL, bỏ qua blockchain |

## Ánh xạ đề cương → mã nguồn

- **Tầng IoT (3.1):** `data_partition.py` — 4 node, dữ liệu non-IID, tỉ lệ bất thường lệch nhau.
- **Tầng AI (3.2):** `model.py` + `local_train.py` + `fedavg.py` — FedAvg (McMahan 2017), đánh giá hội tụ mỗi round.
- **Tầng Blockchain (3.3):** `FederatedAggregator.sol` — `registerNode`, `submitWeights`, `aggregate`, `distributeReward`; event `WeightsSubmitted / ModelAggregated / RewardDistributed`; token ERC-20 `BlockFLToken`.
- **Kết nối (mục 4):** `web3_interface.py` dùng Web3.py gọi contract trực tiếp từ pipeline huấn luyện.

## Hướng phát triển (mục 9 – điểm nâng cao)

- Dashboard React + Ethers.js + MetaMask (thư mục `dashboard/` để trống sẵn).
- Phát hiện node gian lận: kiểm tra Δw bất thường trước `aggregate()`.
- Lưu trọng số lên IPFS/Pinata thay vì file local.
- Nhúng mô hình rút gọn (TF Lite) lên ESP32/Raspberry Pi thật.
