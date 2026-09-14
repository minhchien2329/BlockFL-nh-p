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
| `ai_model/baseline_centralized.py` | Baseline **tập trung** (gom dữ liệu 4 node lại train 1 mô hình, không FL) → `results_baseline_centralized.json`, so sánh với FedAvg |
| `scripts/web3_interface.py` | Cầu nối Web3.py ↔ smart contract |
| `run_demo.py` | Orchestrator chạy nhiều round (có/không blockchain) |
| `scripts/run_sweep.py` | Chạy lại toàn bộ FL trên nhiều lần chia dữ liệu (nhiều seed) → `results_sweep.json` |

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

### 4. Dashboard giám sát (mục 9 – điểm nâng cao)

Sau khi đã `hardhat node` + `deploy` + `run_demo.py`, mở dashboard:

```bash
python dashboard/serve.py
```

Trang `http://127.0.0.1:8000/dashboard/` tự mở, hiển thị real-time (làm mới mỗi 5 giây):

8 trang, mỗi trang một tầng / một câu hỏi:

| Trang | Nội dung |
|---|---|
| **Tổng quan** | thẻ round hiện tại · số node · tổng BFL · accuracy; kết quả trước→sau FL; cấu hình thí nghiệm |
| **Kiến trúc CPS** | sơ đồ 3 tầng IoT → AI → Blockchain, dữ liệu nào đi đâu, một round chạy qua những hàm nào (kèm đường dẫn file) |
| **Dữ liệu IoT** | mức lệch dữ liệu giữa các node (non-IID) · thống kê + mẫu cảm biến từng node |
| **Hội tụ AI** | hội tụ accuracy/F1 · **FedAvg so với từng node tự train** · đường loss (phát hiện overfit) · global model phục vụ từng node · cấu hình |
| **Round on-chain** | lịch sử round đọc thẳng từ contract + **đối chứng hash file ↔ hash on-chain** |
| **Token thưởng** | đóng góp & số dư BFL từng node |
| **Nhật ký sự kiện** | toàn bộ sự kiện on-chain kèm số block + mã giao dịch |
| **Smart Contract** | trạng thái sống của 2 contract · bảng phân quyền hàm · công thức chia thưởng tính lại từ dữ liệu on-chain |

Ngoài ra: nút **Kết nối MetaMask** (xem số dư BFL của ví đang chọn), tự làm mới mỗi 5 giây.
Đổi `--network sepolia` thì mã giao dịch trong nhật ký tự thành link Etherscan.

Dashboard chỉ đọc RPC `http://127.0.0.1:8545` nên **không cần** MetaMask để xem;
ví chỉ dùng cho phần trình diễn kết nối Web3 ở buổi demo.

### 5. Deploy Testnet Sepolia (giai đoạn cuối)

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
| `--seed` | 7 | seed chia dữ liệu — **đổi seed = một bộ dữ liệu cảm biến hoàn toàn khác** |

## So với train tập trung (không Federated Learning)

FedAvg có đáng làm không, hay train tập trung (gom hết dữ liệu về 1 chỗ, bỏ qua riêng tư) vẫn tốt hơn? Chạy baseline tập trung trên cùng seed/tập test để so sánh trực tiếp:

```bash
python ai_model/baseline_centralized.py --seed 4 --epochs 25   # 25 = 5 round x 5 epoch, ngang epoch-tuong-duong voi FedAvg
```

Kết quả đo được (seed 4, cùng tập test với `results.json`):

| | Accuracy | F1 (lớp bất thường) | Loss |
|---|---|---|---|
| Train tập trung (gom hết dữ liệu, không FL) | 99.0% | 98.3% | 0.023 |
| FedAvg (5 round, non-IID) | 98.5% | 97.5% | 0.048 |

FedAvg chỉ kém baseline tập trung khoảng **0.5 điểm % accuracy** — cái giá rất nhỏ phải trả để đổi lấy việc dữ liệu bệnh nhân **không bao giờ rời khỏi node**.

## Kết quả có ổn định không? (nhiều lần chia dữ liệu)

Một con số duy nhất trên một lần chia dữ liệu duy nhất không chứng minh được gì — nó
có thể chỉ là một seed may mắn. Chạy lại toàn bộ quy trình trên nhiều bộ dữ liệu khác nhau:

```bash
python scripts/run_sweep.py                    # 10 seed mặc định, ~6 giây
python scripts/run_sweep.py --seeds 1 2 3      # tự chọn seed
```

Kết quả đo được (10 lần chia dữ liệu × 5 round):

| Chỉ số | Giá trị |
|---|---|
| Accuracy | **95.8% ± 1.8** (thấp nhất 92.5%, cao nhất 98.4%) |
| F1 (lớp bất thường) | **94.2% ± 2.4** |
| FedAvg thắng **mọi** node tự train | **10/10 lần** |
| Cách biệt so với node tốt nhất | trung bình **+1.4 điểm %** |

Ghi ra `results_sweep.json`, dashboard đọc và hiển thị ở trang **Hội tụ AI**. Sweep chạy
`--no-chain` và **không** đụng tới `results.json` / trạng thái on-chain của lần chạy chính.

> Lưu ý về tính tái lập: seed mặc định là 7 và được khoá cứng, nên chạy lại repo cho ra
> **đúng** những con số trong báo cáo — kể cả hash keccak256 của global model.

## Chạy demo trực tiếp từ dashboard

Trang **Tổng quan** có nút **▶ Chạy demo từ đầu**: xoá sạch chain local → deploy lại 2
contract → chạy Federated Learning, khoảng **10 giây**. Chọn được số round và seed ngay
trên giao diện.

Trong lúc chạy, mở trang **Round on-chain** hoặc **Nhật ký sự kiện** — dashboard đọc lại
chuỗi mỗi 5 giây nên từng round và từng sự kiện hiện ra theo thời gian thực.

Nút này cần dashboard mở qua `python dashboard/serve.py` (không phải mở thẳng file HTML),
và hai endpoint điều khiển chỉ nhận kết nối từ máy cục bộ.

## Ánh xạ đề cương → mã nguồn

- **Tầng IoT (3.1):** `data_partition.py` — 4 node, dữ liệu non-IID, tỉ lệ bất thường lệch nhau.
- **Tầng AI (3.2):** `model.py` + `local_train.py` + `fedavg.py` — FedAvg (McMahan 2017), đánh giá hội tụ mỗi round.
- **Tầng Blockchain (3.3):** `FederatedAggregator.sol` — `registerNode`, `submitWeights`, `aggregate`, `distributeReward`; event `WeightsSubmitted / ModelAggregated / RewardDistributed`; token ERC-20 `BlockFLToken`.
- **Kết nối (mục 4):** `web3_interface.py` dùng Web3.py gọi contract trực tiếp từ pipeline huấn luyện.

## Hướng phát triển tiếp

- Dashboard (`dashboard/`) đã có bản đọc on-chain + Ethers.js + MetaMask — có thể nâng lên React nếu cần.
- Phát hiện node gian lận: kiểm tra Δw bất thường trước `aggregate()`.
- Lưu trọng số lên IPFS/Pinata thay vì file local.
- Nhúng mô hình rút gọn (TF Lite) lên ESP32/Raspberry Pi thật.
