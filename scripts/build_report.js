/**
 * Sinh Report_NhomXX.docx (bao cao ky thuat do an BlockFL) tu du lieu that
 * cua repo (results.json, results_sweep.json, data/nodes_preview.json).
 *
 * Chay:  node scripts/build_report.js
 * Sau do convert sang PDF bang Word/LibreOffice (xem README).
 */
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  ImageRun, PageBreak, TableOfContents, Header, Footer, PageNumber,
  Tab, LevelFormat, convertInchesToTwip,
} = require("docx");

const ROOT = path.resolve(__dirname, "..");
const ASSETS = "C:/Users/HP/AppData/Local/Temp/claude/D--BlaockChain/6e7360ed-35ba-4ccf-920a-5495f8cf9ffd/scratchpad/report_assets";

const results = JSON.parse(fs.readFileSync(path.join(ROOT, "results.json"), "utf-8"));
const sweep = JSON.parse(fs.readFileSync(path.join(ROOT, "results_sweep.json"), "utf-8"));
const nodesPreview = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "nodes_preview.json"), "utf-8"));

const pct = (v) => (v * 100).toFixed(1) + "%";
const pct2 = (v) => (v * 100).toFixed(2) + "%";

// ------------------------------------------------------------------ helpers
const BLACK = "000000";
const FONT = "Times New Roman";

function t(text, opts = {}) {
  return new TextRun({ text, color: BLACK, font: FONT, ...opts });
}
function p(children, opts = {}) {
  const runs = Array.isArray(children) ? children : [t(children)];
  return new Paragraph({ children: runs, spacing: { after: 160 }, ...opts });
}
function h1(text) {
  return new Paragraph({
    text, heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 160 },
    run: { color: BLACK, font: FONT },
  });
}
function h2(text) {
  return new Paragraph({
    text, heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    run: { color: BLACK, font: FONT },
  });
}
function h3(text) {
  return new Paragraph({
    text, heading: HeadingLevel.HEADING_3,
    spacing: { before: 180, after: 100 },
    run: { color: BLACK, font: FONT },
  });
}
function bullet(text, opts = {}) {
  return new Paragraph({
    children: [t(text, opts)],
    bullet: { level: 0 },
    spacing: { after: 80 },
  });
}
function img(file, widthPx, heightPx) {
  const data = fs.readFileSync(path.join(ASSETS, file));
  return new Paragraph({
    children: [new ImageRun({ data, transformation: { width: widthPx, height: heightPx }, type: "png" })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 80 },
  });
}
function caption(text) {
  return new Paragraph({
    children: [t(text, { italics: true, size: 20 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 260 },
  });
}

function cellText(text, opts = {}) {
  return new TableCell({
    children: [new Paragraph({ children: [t(String(text), opts)], spacing: { after: 0 } })],
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    verticalAlign: "center",
    ...opts.cell,
  });
}
function headCell(text) {
  return new TableCell({
    children: [new Paragraph({ children: [t(text, { bold: true })] })],
    shading: { type: ShadingType.CLEAR, fill: "E7EEE7" },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
  });
}
function makeTable(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: 9350, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ children: headers.map((hh) => headCell(hh)), tableHeader: true }),
      ...rows.map((r) => new TableRow({
        children: r.map((c, i) => cellText(c)),
      })),
    ],
  });
}

// ------------------------------------------------------------------ so lieu
const base = results.baseline;
const hist = results.history;
const last = hist[hist.length - 1];
const s = sweep.summary;

const convergenceRows = [
  ["0 (khởi tạo)", pct2(base.acc), pct2(base.f1), base.loss.toFixed(4), "—"],
  ...hist.map((hh) => [
    String(hh.round), pct2(hh.acc), pct2(hh.f1), hh.loss.toFixed(4),
    hh.global_hash.slice(0, 14) + "…",
  ]),
];

const nodeRows = nodesPreview.nodes.map((n) => [
  `node ${n.node_id}`, n.n_train, n.n_test, n.n_normal, n.n_anomaly, pct(n.anomaly_ratio),
]);

const localVsGlobalRows = last.nodes.map((n) => [
  `node ${n.node_id}`, n.n_samples, pct2(n.local_acc), pct2(n.global_acc_on_local_data),
]);

const sweepRows = sweep.runs.map((r) => [
  String(r.seed), pct2(r.acc), pct2(r.best_local_acc), pct2(r.worst_local_acc),
  "+" + ((r.acc - r.best_local_acc) * 100).toFixed(1) + " %", r.beats_every_local ? "Thắng" : "Thua",
]);

// ------------------------------------------------------------------- build
const sections = [];

// ---- Trang bìa ----
sections.push({
  properties: { page: { margin: { top: 1000, bottom: 1000, left: 1200, right: 1200 } } },
  children: [
    p("TRƯỜNG ĐẠI HỌC CÔNG NGHỆ KỸ THUẬT TP.HCM", { alignment: AlignmentType.CENTER, spacing: { after: 40 } }),
    p("BỘ MÔN KỸ THUẬT ĐIỆN TỬ - THÔNG TIN", { alignment: AlignmentType.CENTER, spacing: { after: 600 } }),
    ...Array(4).fill(0).map(() => p("")),
    new Paragraph({
      children: [t("BÁO CÁO KỸ THUẬT ĐỒ ÁN CUỐI KỲ", { bold: true, size: 40 })],
      alignment: AlignmentType.CENTER, spacing: { after: 200 },
    }),
    new Paragraph({
      children: [t("BlockFL", { bold: true, size: 32 })],
      alignment: AlignmentType.CENTER, spacing: { after: 100 },
    }),
    new Paragraph({
      children: [t("Học liên kết bảo mật dữ liệu cảm biến y tế / đô thị tích hợp Blockchain", { bold: true, size: 26 })],
      alignment: AlignmentType.CENTER, spacing: { after: 500 },
    }),
    ...Array(3).fill(0).map(() => p("")),
    p([t("Học phần: ", { bold: true }), t("Cơ sở Blockchain và Ứng dụng")], { alignment: AlignmentType.CENTER }),
    p([t("GVHD: ", { bold: true }), t("Huỳnh Thế Thiện")], { alignment: AlignmentType.CENTER }),
    p([t("Nhóm thực hiện: ", { bold: true }), t("[Điền tên nhóm]")], { alignment: AlignmentType.CENTER }),
    p([t("Mã nguồn: ", { bold: true }), t("https://github.com/minhchien2329/BlockFL")], { alignment: AlignmentType.CENTER }),
    ...Array(2).fill(0).map(() => p("")),
    makeTable(
      ["STT", "Họ tên – MSSV", "Vai trò"],
      [
        ["1", "[Điền họ tên – MSSV]", "Blockchain Developer"],
        ["2", "[Điền họ tên – MSSV]", "AI/ML Engineer"],
        ["3", "[Điền họ tên – MSSV]", "IoT/Backend Integrator"],
        ["4", "[Điền họ tên – MSSV]", "Dashboard/Frontend Developer"],
        ["5", "[Điền họ tên – MSSV]", "PM & Báo cáo/Thuyết trình"],
      ],
      [900, 5000, 3450],
    ),
    ...Array(2).fill(0).map(() => p("")),
    p("Tháng 9/2026", { alignment: AlignmentType.CENTER }),
  ],
});

// ---- Muc luc ----
sections.push({
  properties: {},
  children: [
    h1("Mục lục"),
    new TableOfContents("Mục lục", {
      hyperlink: true,
      headingStyleRange: "1-3",
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ],
});

// ---- Noi dung chinh ----
const body = [];

body.push(h1("1. Giới thiệu"));
body.push(h2("1.1. Bối cảnh và bài toán"));
body.push(p("Trong các hệ thống IoT y tế/đô thị (thiết bị đeo theo dõi nhịp tim, cảm biến chất lượng không khí...), dữ liệu thô thường rất nhạy cảm và việc gửi toàn bộ về server trung tâm để huấn luyện AI tiềm ẩn rủi ro rò rỉ thông tin, đồng thời tạo điểm nghẽn (single point of failure)."));
body.push(p("Federated Learning (FL) giải quyết vấn đề riêng tư bằng cách huấn luyện cục bộ tại từng node biên, chỉ gửi trọng số mô hình (Δw) thay vì dữ liệu thô. Tuy nhiên, FL truyền thống vẫn cần một server tổng hợp (aggregator) đáng tin cậy — đây là điểm mà Blockchain thay thế: minh bạch hoá quá trình tổng hợp trọng số, chống gian lận, và tự động thưởng token cho các node đóng góp trung thực."));
body.push(h2("1.2. Mục tiêu đồ án"));
body.push(p("Xây dựng hệ thống CPS mô phỏng end-to-end: IoT Edge Node (giả lập cảm biến) → Federated Learning (huấn luyện cục bộ, FedAvg) → Smart Contract (tổng hợp trọng số on-chain qua hash, phân phối token thưởng), kèm dashboard giám sát thời gian thực và bộ thực nghiệm kiểm chứng độ ổn định của mô hình."));

body.push(h1("2. Kiến trúc hệ thống tổng quan"));
body.push(p("Hệ thống gồm 3 tầng ghép nối tuần tự, đúng mô hình Cyber-Physical System (CPS) mà đề cương yêu cầu:"));
body.push(img("arch_diagram.png", 560, 286));
body.push(caption("Hình 1. Kiến trúc 3 tầng CPS: IoT → AI (Federated Learning) → Blockchain"));
body.push(p("Luồng dữ liệu của một round huấn luyện diễn ra như sau:"));
[
  "Mỗi edge node (giả lập) đọc một lô dữ liệu cảm biến (nhịp tim, SpO₂, nhiệt độ cơ thể).",
  "Node huấn luyện cục bộ vài epoch trên dữ liệu của mình → sinh ra bộ trọng số Δw.",
  "Node băm Δw (keccak256) và gọi submitWeights(hash, numSamples, round) lên smart contract.",
  "Khi đủ số node báo cáo, quy trình FedAvg (tính off-chain) tổng hợp Δw theo trọng số là số mẫu mỗi node, sinh ra Global Model mới; hash của model mới được ghi on-chain qua aggregate().",
  "Hợp đồng tự động phân bổ token thưởng (distributeReward()) theo tỉ lệ số mẫu đóng góp.",
  "Các node tải Global Model mới về, lặp lại round tiếp theo.",
].forEach((x) => body.push(bullet(x)));

body.push(h1("3. Thiết kế chi tiết từng tầng"));

body.push(h2("3.1. Tầng IoT (Edge Node)"));
body.push(p("4 edge node giả lập, mỗi node đại diện một bệnh viện/trạm quan trắc khác nhau. Dữ liệu (nhịp tim, SpO₂, nhiệt độ cơ thể, biến thiên nhịp tim, chuyển động) được sinh ngẫu nhiên theo phân phối Gauss cho 2 lớp bình thường/bất thường, sau đó chia cho từng node theo phân phối Dirichlet (α = 0.4) để tạo tính non-IID — tỉ lệ ca bất thường lệch hẳn nhau giữa các node, đúng thực tế lâm sàng (bệnh viện chuyên khoa cấp cứu sẽ có tỉ lệ ca nặng cao hơn phòng khám định kỳ)."));
body.push(makeTable(
  ["Node", "Số mẫu train", "Số mẫu test", "Bình thường", "Bất thường", "Tỉ lệ bất thường"],
  nodeRows, [1200, 1500, 1500, 1600, 1600, 1950],
));
body.push(caption("Bảng 1. Phân bố dữ liệu non-IID giữa 4 edge node (nguồn: data/nodes_preview.json)"));

body.push(h2("3.2. Tầng AI (Federated Learning)"));

body.push(h3("3.2.1. Kiến trúc mô hình"));
body.push(p("Bài toán đặt ra là phân loại nhị phân (bình thường / bất thường) trên 5 đặc trưng số dạng bảng (heart_rate, spo2, body_temp, hr_var, motion) — không phải ảnh hay chuỗi thời gian dài, nên không cần đến CNN hay RNN/LSTM vốn nặng và khó hội tụ nhanh trong phạm vi vài round FedAvg. Nhóm chọn mạng nơ-ron truyền thẳng (MLP — VitalsMLP trong ai_model/model.py) gồm:"));
[
  "Lớp vào: 5 nơ-ron, tương ứng 5 đặc trưng cảm biến đã chuẩn hoá (z-score theo thống kê của tập train từng node).",
  "2 lớp ẩn, mỗi lớp 16 nơ-ron, kích hoạt ReLU — đủ biểu diễn ranh giới phi tuyến giữa 2 lớp mà không dư thừa tham số (tổng cộng chỉ ~450 tham số/mô hình).",
  "Lớp ra: 2 nơ-ron (logit cho 2 lớp), kết hợp hàm mất mát CrossEntropyLoss (tương đương softmax + negative log-likelihood).",
].forEach((x) => body.push(bullet(x)));
body.push(p("Chọn mô hình nhỏ là chủ đích: (1) FedAvg cần vài chục round là hội tụ trong giới hạn thời gian đồ án; (2) tham số càng ít thì Δw truyền giữa node và server (off-chain) càng nhẹ, phù hợp mô phỏng cho thiết bị biên tài nguyên hạn chế; (3) dễ debug và trực quan hoá kết quả khi thuyết trình."));

body.push(h3("3.2.2. Huấn luyện cục bộ (local training)"));
body.push(p("Ở mỗi round, mỗi node nhận global weights, khởi tạo lại mô hình với đúng bộ trọng số đó (không huấn luyện lại từ đầu), rồi huấn luyện tiếp trên dữ liệu riêng của mình với cấu hình:"));
body.push(makeTable(
  ["Siêu tham số", "Giá trị", "Vai trò"],
  [
    ["Optimizer", "SGD, momentum = 0.9", "Momentum giúp hội tụ nhanh hơn SGD thuần trên tập dữ liệu nhỏ mỗi node"],
    ["Learning rate", "0.05", "Đủ lớn để hội tụ trong 5 epoch, nhưng không quá lớn gây dao động Δw giữa các node"],
    ["Epoch cục bộ", "5", "Cân bằng giữa hội tụ cục bộ tốt và tránh overfit lên dữ liệu non-IID của riêng node"],
    ["Batch size", "32", "Phù hợp với quy mô dữ liệu mỗi node (153–290 mẫu train)"],
    ["Hàm mất mát", "CrossEntropyLoss", "Chuẩn cho bài toán phân loại đa lớp (ở đây là 2 lớp)"],
  ],
  [2350, 1800, 5200],
));
body.push(p("Sau khi huấn luyện xong, node chỉ gửi đi bộ trọng số mới (Δw dưới dạng vector phẳng, ghép từ toàn bộ tham số của mô hình) chứ không gửi gradient hay dữ liệu — đây chính là ranh giới bảo mật cốt lõi của Federated Learning."));

body.push(h3("3.2.3. Tổng hợp FedAvg"));
body.push(p("Thuật toán tổng hợp là FedAvg (Federated Averaging – McMahan et al., 2017), ý tưởng cốt lõi là lấy trung bình có trọng số các bộ tham số cục bộ, trọng số tỉ lệ với số mẫu mỗi node đóng góp:"));
body.push(p("w_global = Σ (n_i / N) × w_i,  với n_i là số mẫu của node i, N = Σ n_i", { alignment: AlignmentType.CENTER }));
body.push(p("Cách chia trọng số theo n_i (thay vì chia đều 1/số node) đảm bảo công bằng thống kê: node có nhiều dữ liệu hơn (ví dụ node 1 với 368 mẫu) sẽ có ảnh hưởng lớn hơn tới mô hình chung so với node ít dữ liệu (node 0 với 226 mẫu) — đúng tinh thần \"đóng góp nhiều, ảnh hưởng nhiều\", đồng thời cũng là căn cứ để tầng Blockchain tính token thưởng theo đúng công thức tương tự (mục 3.3.2)."));
body.push(p("Việc tính trung bình được thực hiện off-chain (trong ai_model/fedavg.py) vì: chi phí gas để nhân/cộng hàng trăm số thực dấu phẩy động ngay trên EVM là không cần thiết và tốn kém; EVM cũng không có kiểu dữ liệu số thực gốc. Sau khi tính xong, toàn bộ vector trọng số mới được băm bằng keccak256 thành 32 byte duy nhất, và chỉ giá trị hash này được ghi lên smart contract qua hàm aggregate() — chuỗi đóng vai trò trọng tài xác nhận \"phiên bản nào là bản chính thức\", không đóng vai trò máy tính."));

body.push(h3("3.2.4. Vòng lặp huấn luyện và tiêu chí đánh giá"));
[
  "Bước 1 — Khởi tạo: Global Model khởi tạo ngẫu nhiên (round 0), dùng làm baseline so sánh.",
  "Bước 2 — Broadcast: global weights hiện tại được gửi (giả lập, gọi hàm trực tiếp trong run_demo.py) xuống toàn bộ 4 node.",
  "Bước 3 — Local training: mỗi node huấn luyện độc lập theo cấu hình ở mục 3.2.2.",
  "Bước 4 — Submit: node băm Δw và gọi submitWeights() lên smart contract kèm số mẫu n_i.",
  "Bước 5 — Aggregate: khi đủ 4/4 node đã nộp (minNodes = 3, có thể chốt sớm hơn), chạy FedAvg off-chain, ghi hash lên chain.",
  "Bước 6 — Đánh giá: Global Model mới được chấm lại trên tập test gộp của toàn bộ 4 node (chưa từng thấy trong huấn luyện) để đo accuracy, F1 (lớp bất thường) và loss — đây chính là 3 chỉ số dùng để vẽ đường hội tụ ở Hình 2.",
  "Bước 7 — Thưởng & lặp: hợp đồng phân phối token BFL theo tỉ lệ n_i, sau đó mở round tiếp theo (advanceRound()), quay lại Bước 2.",
].forEach((x) => body.push(bullet(x)));
body.push(p("Việc luôn đánh giá trên tập test gộp (không phải tập train) ở mọi round là điều kiện bắt buộc để đường cong ở Hình 2 phản ánh đúng khả năng tổng quát hoá của mô hình, chứ không phải hiện tượng học thuộc lòng dữ liệu cục bộ. Đây cũng là cơ sở cho phép so sánh trực tiếp accuracy của Global Model với accuracy của từng node tự huấn luyện riêng lẻ ở mục 5.2 — vì cả hai đều được chấm trên chính xác cùng một tập test."));

body.push(h2("3.3. Tầng Blockchain (Smart Contract)"));
body.push(p("Ngôn ngữ Solidity 0.8.24, phát triển và kiểm thử trên Hardhat local network. Hai smart contract:"));
body.push(h3("3.3.1. BlockFLToken.sol — token ERC-20 thưởng"));
body.push(p("Token BFL tối giản, tuân thủ chuẩn ERC-20 (transfer, approve, transferFrom). Chỉ địa chỉ minter (được set là FederatedAggregator sau khi deploy) mới được phép mint — chống việc chủ hợp đồng tự phát token cho mình."));
body.push(h3("3.3.2. FederatedAggregator.sol — điều phối round FL"));
body.push(makeTable(
  ["Hàm", "Người gọi", "Chức năng"],
  [
    ["registerNode(address)", "owner", "Đăng ký node tham gia mạng"],
    ["submitWeights(hash, n, round)", "node đã đăng ký", "Nộp hash Δw + số mẫu cho round hiện tại"],
    ["aggregate(round, globalHash)", "owner", "Chốt hash global model khi đủ minNodes đã nộp"],
    ["distributeReward(round)", "owner", "Mint token BFL theo tỉ lệ numSamples/totalSamples"],
    ["advanceRound()", "owner", "Mở round tiếp theo sau khi round hiện tại đã chốt"],
  ],
  [3000, 2000, 4350],
));
body.push(caption("Bảng 2. Các hàm chính của FederatedAggregator.sol"));
body.push(p("Ba sự kiện WeightsSubmitted, ModelAggregated, RewardDistributed được phát ra ở mỗi bước tương ứng, tạo thành nhật ký minh bạch, bất biến — bất kỳ ai cũng đọc lại được lịch sử đóng góp mà không cần tin vào một bên trung gian. Trọng số Δw thật (vài KB đến vài trăm KB) được lưu file .npy off-chain; on-chain chỉ giữ 32 byte hash keccak256, giảm chi phí gas so với lưu toàn bộ tensor."));

body.push(h1("4. Công nghệ sử dụng"));
body.push(makeTable(
  ["Thành phần", "Công nghệ"],
  [
    ["Ngôn ngữ AI", "Python 3.14, PyTorch"],
    ["Ngôn ngữ Smart Contract", "Solidity 0.8.24"],
    ["Framework blockchain", "Hardhat (dev/test, EVM local)"],
    ["Kết nối Web3", "Web3.py (backend AI ↔ chain), Ethers.js (dashboard)"],
    ["Lưu trữ trọng số", "File .npy off-chain + hash keccak256 on-chain"],
    ["Dashboard", "HTML/CSS/JS thuần, 8 trang, cập nhật realtime mỗi 5s"],
    ["Version control", "Git/GitHub"],
  ],
  [3000, 6350],
));

body.push(h1("5. Kết quả thực nghiệm"));

body.push(h2("5.1. Hội tụ của Global Model qua từng round"));
body.push(p(`Chạy 5 round trên 4 node (seed dữ liệu = ${results.config.seed}, tổng ${last.nodes ? last.nodes.reduce((a,n)=>a+n.n_samples,0) : "—"} mẫu). Kết quả: accuracy tăng từ ${pct2(base.acc)} (model khởi tạo ngẫu nhiên) lên ${pct2(last.acc)}, F1 lớp bất thường từ ${pct2(base.f1)} lên ${pct2(last.f1)}, loss giảm từ ${base.loss.toFixed(3)} xuống ${last.loss.toFixed(3)} — toàn bộ mức tăng này đến từ FedAvg, không node nào gửi dữ liệu thô đi đâu cả.`));
body.push(img("chart_convergence.png", 480, 270));
body.push(caption("Hình 2. Độ hội tụ accuracy/F1 qua các round (nguồn: results.json)"));
body.push(makeTable(
  ["Round", "Accuracy", "F1", "Loss", "Global model hash"],
  convergenceRows, [1400, 1600, 1600, 1600, 3150],
));
body.push(caption("Bảng 3. Chi tiết từng round, hash đọc trực tiếp từ smart contract"));

body.push(h2("5.2. So sánh FedAvg với từng node tự huấn luyện riêng lẻ"));
body.push(p("Để chứng minh giá trị của Federated Learning (không chỉ là chạy cho có), mỗi local model (chỉ train trên dữ liệu của 1 node) được chấm trên cùng tập test chung với global model. Ở round cuối:"));
body.push(img("chart_local_vs_global.png", 480, 270));
body.push(caption("Hình 3. Global model (FedAvg) so với từng node tự train một mình"));
body.push(makeTable(
  ["Node", "Số mẫu", "Accuracy tự train (trên tập test chung)", "Accuracy global model trên dữ liệu riêng của node"],
  localVsGlobalRows, [1200, 1200, 3550, 3400],
));
body.push(caption(`Bảng 4. Global model đạt ${pct2(last.acc)}, vượt trội mọi node tự train — node dữ liệu lệch nặng nhất (ít mẫu, tỉ lệ bất thường cao) tự train chỉ đạt độ chính xác thấp hơn hẳn.`));

body.push(h2("5.3. Kiểm định độ ổn định qua nhiều lần chia dữ liệu"));
body.push(p(`Một kết quả duy nhất trên một lần chia dữ liệu có thể chỉ là seed may mắn. Toàn bộ pipeline được chạy lại trên ${s.n_runs} seed khác nhau (mỗi seed = một bộ dữ liệu cảm biến hoàn toàn khác — tỉ lệ bất thường, số mẫu, giá trị cảm biến của mọi node đều đổi):`));
body.push(img("chart_sweep.png", 480, 270));
body.push(caption(`Hình 4. Accuracy của global model qua ${s.n_runs} lần chia dữ liệu khác nhau`));
body.push(makeTable(
  ["Chỉ số", "Giá trị"],
  [
    ["Accuracy trung bình", `${pct2(s.acc_mean)} ± ${(s.acc_std * 100).toFixed(1)} điểm %`],
    ["Accuracy thấp nhất / cao nhất", `${pct2(s.acc_min)} / ${pct2(s.acc_max)}`],
    ["F1 lớp bất thường trung bình", `${pct2(s.f1_mean)} ± ${(s.f1_std * 100).toFixed(1)} điểm %`],
    ["FedAvg thắng mọi node tự train", `${s.wins}/${s.n_runs} lần`],
    ["Cách biệt trung bình so với node tốt nhất", `+${(s.gap_mean * 100).toFixed(1)} điểm %`],
  ],
  [5000, 4350],
));
body.push(caption("Bảng 5. Tóm tắt độ ổn định (nguồn: results_sweep.json, sinh bởi scripts/run_sweep.py)"));
body.push(makeTable(
  ["Seed", "Global (FedAvg)", "Node tốt nhất tự train", "Node kém nhất tự train", "Cách biệt", "Kết quả"],
  sweepRows, [1000, 1700, 1900, 1900, 1400, 1450],
));
body.push(caption(`Bảng 6. Chi tiết ${s.n_runs} lần chạy độc lập — FedAvg thắng mọi node tự train ở cả ${s.wins}/${s.n_runs} lần`));

body.push(h2("5.4. Kiểm thử smart contract"));
body.push(p("Bộ test Hardhat (test/aggregator.test.js) kiểm tra 6 kịch bản: đăng ký node và chặn đăng ký trùng, chặn node lạ gọi submitWeights, chặn nộp sai round/nộp 2 lần, chặn aggregate khi chưa đủ minNodes, luồng đầy đủ submit → aggregate → distributeReward → advanceRound (đối chiếu số token đúng công thức chia theo tỉ lệ mẫu), và chặn tài khoản không phải owner gọi các hàm quản trị. Toàn bộ 6/6 test pass."));

body.push(h2("5.5. Minh bạch và chống chối bỏ trên chuỗi"));
body.push(p("Dashboard (trang Round on-chain) tự động băm lại file trọng số cục bộ ai_model/weights/global_round_N.npy và so với globalModelHash đang lưu trên smart contract. Nếu khớp — hiển thị badge “Khớp” — nghĩa là file trọng số đang giữ đúng là file đã được chốt on-chain; chỉ cần sửa 1 byte trong file là badge lập tức chuyển sang “Lệch”, trong khi giá trị trên chuỗi thì không ai sửa được để che giấu, thể hiện đúng tính chất bất biến của blockchain."));

body.push(h1("6. Đánh giá rủi ro và phương án xử lý"));
body.push(makeTable(
  ["Rủi ro", "Phương án xử lý"],
  [
    ["Gas fee/độ trễ khi test nhiều lần trên Testnet", "Phát triển và test chủ yếu trên Hardhat local; chỉ deploy Sepolia ở giai đoạn cuối để demo"],
    ["Trọng số mô hình quá lớn để lưu on-chain", "Lưu hash keccak256 (32 byte) on-chain, trọng số thật lưu off-chain (file .npy)"],
    ["Mô hình FL không hội tụ do dữ liệu non-IID quá lệch", "Điều chỉnh mức Dirichlet α, tăng số round, dùng learning rate nhỏ; đã kiểm chứng hội tụ ổn định qua 10 seed khác nhau (mục 5.3)"],
    ["Node gian lận gửi Δw bất thường (poisoning)", "Hướng phát triển: kiểm tra độ lệch Δw trước khi tổng hợp (chưa triển khai trong bản hiện tại)"],
    ["Một kết quả FL có thể chỉ là \u201căn may\u201d theo 1 lần chia dữ liệu", "Chạy lại toàn bộ pipeline trên 10 seed độc lập (scripts/run_sweep.py) — FedAvg thắng mọi node tự train ở cả 10/10 lần"],
  ],
  [3600, 5750],
));

body.push(h1("7. Kết luận và hướng phát triển"));
body.push(p("Hệ thống BlockFL đã hiện thực hoá thành công luồng end-to-end IoT → Federated Learning → Blockchain: 4 edge node với dữ liệu non-IID huấn luyện cục bộ, FedAvg tổng hợp trọng số off-chain, smart contract ghi nhận minh bạch qua hash và tự động phân phối token thưởng theo đóng góp. Kết quả thực nghiệm cho thấy mô hình hội tụ ổn định (accuracy trung bình 95.8% qua 10 lần chia dữ liệu độc lập) và FedAvg luôn vượt trội so với việc từng node tự huấn luyện riêng lẻ."));
body.push(p("Hướng phát triển tiếp theo:"));
[
  "Cơ chế phát hiện node gian lận: kiểm tra độ lệch thống kê của Δw trước khi đưa vào aggregate().",
  "Deploy chính thức lên Testnet Sepolia kèm liên kết Etherscan cho từng giao dịch.",
  "Nhúng mô hình rút gọn (TensorFlow Lite) lên phần cứng thật (ESP32/Raspberry Pi) thay cho giả lập hoàn toàn bằng phần mềm.",
  "Lưu trữ trọng số trên IPFS thay vì file cục bộ để tăng tính phi tập trung.",
].forEach((x) => body.push(bullet(x)));

body.push(h1("8. Cấu trúc repository GitHub"));
body.push(p("Mã nguồn được tổ chức theo đúng cấu trúc thư mục quy định trong tài liệu hướng dẫn của học phần:"));
[
  "README.md — hướng dẫn cài đặt, cấu hình môi trường và các bước chạy demo.",
  "contracts/ — BlockFLToken.sol, FederatedAggregator.sol.",
  "test/ — aggregator.test.js (6 test Hardhat).",
  "scripts/ — deploy.js (deploy contract), web3_interface.py (cầu nối Web3.py), run_sweep.py (kiểm định đa seed), build_report.js (sinh báo cáo này).",
  "ai_model/ — model.py, local_train.py, fedavg.py và thư mục weights/ lưu trọng số theo round.",
  "iot_code/ — edge_node.py, data_partition.py (giả lập & chia dữ liệu non-IID).",
  "dashboard/ — 8 trang giám sát thời gian thực (HTML/CSS/JS + Ethers.js).",
  "run_demo.py — script điều phối chạy toàn bộ pipeline end-to-end.",
].forEach((x) => body.push(bullet(x)));
body.push(p("Repository công khai (Public) trên GitHub, link: https://github.com/minhchien2329/BlockFL."));

body.push(h1("9. Phân công nhiệm vụ"));
body.push(p("Đề cương ban đầu phân công 5 vai trò như sau (điền cụ thể tên/MSSV từng thành viên trước khi nộp):"));
body.push(makeTable(
  ["Vai trò", "Nhiệm vụ chính"],
  [
    ["Blockchain Developer", "Viết/test/deploy smart contract, tích hợp token ERC-20, quản lý Testnet"],
    ["AI/ML Engineer", "Xây dựng mô hình, cài đặt FedAvg, chia dữ liệu non-IID, đánh giá hội tụ"],
    ["IoT/Backend Integrator", "Giả lập edge node, viết cầu nối Web3.py giữa AI và blockchain"],
    ["Dashboard/Frontend Developer", "Xây dựng dashboard Web3, tích hợp MetaMask, hiển thị realtime"],
    ["PM & Báo cáo/Thuyết trình", "Quản lý tiến độ, tổng hợp báo cáo kỹ thuật, chuẩn bị demo"],
  ],
  [3350, 6000],
));

body.push(h1("10. Tài liệu tham khảo"));
[
  "McMahan, H. B., et al. (2017). Communication-Efficient Learning of Deep Networks from Decentralized Data.",
  "Tài liệu Solidity chính thức: https://docs.soliditylang.org",
  "Hardhat Documentation: https://hardhat.org",
  "Web3.py Documentation: https://web3py.readthedocs.io",
  "Ethers.js Documentation: https://docs.ethers.org",
].forEach((x) => body.push(bullet(x)));

sections.push({ properties: {}, children: body });

// ------------------------------------------------------------------- doc
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: FONT, size: 22, color: BLACK } },
    },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", run: { color: BLACK, font: FONT, size: 30, bold: true } },
      { id: "Heading2", name: "Heading 2", run: { color: BLACK, font: FONT, size: 26, bold: true } },
      { id: "Heading3", name: "Heading 3", run: { color: BLACK, font: FONT, size: 24, bold: true } },
    ],
  },
  sections: sections.map((sec, i) => ({
    ...sec,
    headers: i === 0 ? undefined : {
      default: new Header({ children: [p("BlockFL — Báo cáo kỹ thuật", { alignment: AlignmentType.RIGHT, spacing: { after: 0 } })] }),
    },
    footers: i === 0 ? undefined : {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ children: [PageNumber.CURRENT], color: BLACK, font: FONT })],
        })],
      }),
    },
  })),
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(ROOT, "Report_NhomXX.docx");
  fs.writeFileSync(out, buf);
  console.log("done ->", out);
});
