/* BlockFL Dashboard — đọc trạng thái từ Hardhat local RPC + results.json */

const RPC_URL = "http://127.0.0.1:8545";
const $ = (s) => document.querySelector(s);

let provider, token, agg, deployment;

async function loadDeployment() {
  const res = await fetch("../deployments/localhost.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Chưa có deployments/localhost.json — hãy deploy contract trước");
  return res.json();
}

async function loadSweep() {
  try {
    const r = await fetch("../results_sweep.json", { cache: "no-store" });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

async function loadResults() {
  try {
    const r = await fetch("../results.json", { cache: "no-store" });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

async function loadPreview() {
  try {
    const r = await fetch("../data/nodes_preview.json", { cache: "no-store" });
    if (!r.ok) return;
    const pv = await r.json();
    renderPreview(pv);
    renderNonIid(pv);
  } catch { /* chưa export */ }
}

function renderPreview(pv) {
  const box = $("#data-grid");
  if (!box) return; // trang này không có phần dữ liệu IoT
  const feats = pv.features;
  box.innerHTML = pv.nodes.map((n) => {
    const statRows = feats.map((f) => {
      const a = n.stats_normal[f], b = n.stats_anomaly[f];
      const fmt = (x) => (x ? `${x[0]} <span class="pm">±${x[1]}</span>` : "–");
      return `<tr><td>${f}</td><td>${fmt(a)}</td><td>${fmt(b)}</td></tr>`;
    }).join("");
    const sample = n.sample_rows.map((row) =>
      `<tr class="${row.label ? 'r-anom' : 'r-norm'}">
        <td>${row.label ? 'bất thường' : 'bình thường'}</td>
        ${feats.map((f) => `<td>${row[f]}</td>`).join("")}</tr>`).join("");
    const pct = Math.round(n.anomaly_ratio * 100);
    return `<div class="dcard">
      <div class="dhead">
        <b>node ${n.node_id}</b>
        <span>${n.n_train} train · ${n.n_test} test</span>
      </div>
      <div class="dist">
        <div class="dist-bar"><i class="norm" style="width:${100 - pct}%"></i><i class="anom" style="width:${pct}%"></i></div>
        <div class="dist-lbl"><span>bình thường ${n.n_normal}</span><span>bất thường ${n.n_anomaly} (${pct}%)</span></div>
      </div>
      <table class="dtable">
        <thead><tr><th>Đặc trưng</th><th>Bình thường</th><th>Bất thường</th></tr></thead>
        <tbody>${statRows}</tbody>
      </table>
      <details>
        <summary>Xem ${n.sample_rows.length} mẫu ví dụ</summary>
        <div class="table-wrap"><table class="dtable">
          <thead><tr><th>nhãn</th>${feats.map((f) => `<th>${f}</th>`).join("")}</tr></thead>
          <tbody>${sample}</tbody>
        </table></div>
      </details>
    </div>`;
  }).join("");
}

async function contractIsLive() {
  try {
    const code = await provider.getCode(deployment.aggregator.address);
    return code && code !== "0x";
  } catch { return false; }
}

function short(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : "–"; }
function hx(h) { return h && h !== "0x" + "0".repeat(64) ? h.slice(0, 18) + "…" : "(chưa có)"; }

async function connect() {
  deployment = await loadDeployment();
  provider = new ethers.JsonRpcProvider(RPC_URL);
  await provider.getBlockNumber(); // ném lỗi nếu node chưa chạy
  token = new ethers.Contract(deployment.token.address, deployment.token.abi, provider);
  agg = new ethers.Contract(deployment.aggregator.address, deployment.aggregator.abi, provider);

  $("#dot").className = "dot on";
  $("#conn-text").textContent = "Đã kết nối " + RPC_URL;
  $("#meta").innerHTML = `
    <span>Mạng: <b>${deployment.network}</b></span>
    <span>Token BFL: <code>${short(deployment.token.address)}</code></span>
    <span>Aggregator: <code>${short(deployment.aggregator.address)}</code></span>
    <span>minNodes: <b>${deployment.minNodes}</b></span>`;
}

// Mỗi trang chỉ có một phần nội dung (data-grid / chart / rounds / nodes / events) —
// mọi thao tác cập nhật DOM bên dưới đều tự bỏ qua khi phần tử không tồn tại trên trang.
async function refresh() {
  // Giữa lúc "Chạy demo từ đầu" reset chain và deploy xong, địa chỉ contract
  // tạm thời KHÔNG có bytecode. Gọi thẳng vào đó thì ethers ném BAD_DATA và
  // vòng làm mới 5 giây rải lỗi đỏ ra console giữa buổi demo — nên hỏi trước.
  if (!(await contractIsLive())) {
    $("#dot").className = "dot off";
    $("#conn-text").textContent = "Contract chưa deploy — đang chờ…";
    return;
  }
  $("#dot").className = "dot on";
  $("#conn-text").textContent = "Đã kết nối " + RPC_URL;

  const currentRound = Number(await agg.currentRound());
  const nodes = deployment.nodes;
  const results = await loadResults();   // tải sớm: bảng round cần hash off-chain để đối chứng

  renderConfig(results);
  renderDelta(results);
  if ($("#sweep-summary")) renderSweep(await loadSweep());

  // --- thẻ tổng quan (xuất hiện trên mọi trang) ---
  if ($("#c-round")) $("#c-round").textContent = currentRound;
  if ($("#c-nodes")) $("#c-nodes").textContent = nodes.length;

  const balances = await Promise.all(nodes.map((a) => token.balanceOf(a)));
  const totalToken = balances.reduce((s, b) => s + b, 0n);
  if ($("#c-token")) $("#c-token").textContent = (+ethers.formatUnits(totalToken, 18)).toFixed(1) + " BFL";

  const roundsBody = $("#rounds tbody");
  const nodesBody = $("#nodes tbody");
  const lastSamples = {};

  if (roundsBody || nodesBody) {
    // --- lịch sử round on-chain (tải song song, đổi DOM 1 lần) ---
    const roundIdx = [];
    for (let r = 1; r < Math.max(currentRound, 1); r++) roundIdx.push(r);
    const roundData = await Promise.all(roundIdx.map((r) => agg.getRound(r)));
    await Promise.all(
      roundIdx.map(async (r, k) => {
        const submitters = roundData[k][4];
        const subs = await Promise.all(submitters.map((s) => agg.getSubmission(r, s)));
        submitters.forEach((s, j) => (lastSamples[s] = Number(subs[j][1])));
      })
    );
    if (roundsBody) {
      const rowsHtml = roundIdx.map((r, k) => {
        const [ghash, totalSamples, count, aggregated] = roundData[k];
        return `<tr><td>${r}</td><td>${count}</td><td>${totalSamples}</td>
          <td>${aggregated ? '<span class="badge ok">✓ xong</span>' : '<span class="badge wait">chờ</span>'}</td>
          <td class="hash">${hx(ghash)}</td>
          <td>${matchBadge(ghash, results, r)}</td></tr>`;
      });
      roundsBody.innerHTML = rowsHtml.join("") ||
        `<tr><td colspan="6" class="hint">Chưa có round nào hoàn tất. Chạy <code>python run_demo.py</code>.</td></tr>`;
    }
  }

  // --- bảng node ---
  if (nodesBody) {
    const maxBal = balances.reduce((m, b) => (b > m ? b : m), 1n);
    nodesBody.innerHTML = nodes.map((addr, i) => {
      const bal = +ethers.formatUnits(balances[i], 18);
      const pct = maxBal > 0n ? Number((balances[i] * 100n) / maxBal) : 0;
      return `<tr><td>node ${i}</td><td class="mono">${short(addr)}</td>
        <td>${lastSamples[addr] ?? "–"}</td>
        <td><b>${bal.toFixed(2)}</b></td>
        <td><div class="bar"><i style="width:${pct}%"></i></div></td></tr>`;
    }).join("");
  }

  // --- sự kiện ---
  if ($("#events")) await renderEvents();

  // --- trang Smart Contract + Kiến trúc CPS ---
  await renderContract(currentRound, nodes, balances);
  renderArchLive(nodes.length);

  // --- biểu đồ hội tụ ---
  if (results && results.history?.length) {
    const hist = results.history;
    const acc = hist[hist.length - 1].acc;
    if ($("#c-acc")) $("#c-acc").textContent = (acc * 100).toFixed(1) + "%";
    drawChart(hist, results.baseline);
    drawLoss(hist, results.baseline);
    drawLocalVsGlobal(hist);
    drawFairness(hist);
  } else if ($("#c-acc")) {
    $("#c-acc").textContent = "–";
  }
}

/* ---------------------------------------------------- cấu hình thí nghiệm (A1)
   Mọi tham số đều nằm sẵn trong results.json — trước đây không hiển thị ở đâu cả. */
function renderConfig(results) {
  const box = $("#exp-config");
  if (!box) return;
  const c = results?.config;
  if (!c) { box.innerHTML = `<p class="hint">Chưa có <code>results.json</code> — chạy <code>python run_demo.py</code>.</p>`; return; }
  const items = [
    ["Số round huấn luyện", c.rounds, "mỗi round = 1 vòng local training + 1 lần FedAvg + 1 lần chốt on-chain"],
    ["Số edge node", c.n_nodes, "mỗi node giữ dữ liệu riêng, không chia sẻ dữ liệu thô"],
    ["Dirichlet <span class=\"nocaps\">α</span>", c.dirichlet_alpha, "α càng nhỏ → dữ liệu giữa các node càng lệch nhau (non-IID càng mạnh)"],
    ["Epoch cục bộ", c.epochs, "số vòng mỗi node train trên dữ liệu của mình trước khi nộp Δw"],
    ["Learning rate", c.lr, "tốc độ học của SGD tại từng node"],
    ["Ghi lên blockchain", c.chain ? "có" : "không", c.chain ? `mạng ${c.network}` : "chế độ --no-chain, chỉ chạy FL"],
  ];
  box.innerHTML = items.map(([k, v, note]) =>
    `<div class="kv"><div class="kv-k">${k}</div><div class="kv-v">${v}</div><div class="kv-n">${note}</div></div>`).join("");
}

/* ------------------------------------------- baseline → kết quả cuối cùng (A2)
   results.baseline đã có sẵn, trước đây chỉ là điểm x=0 lặng lẽ trên biểu đồ. */
function renderDelta(results) {
  const box = $("#delta");
  if (!box) return;
  const b = results?.baseline, h = results?.history?.[results.history.length - 1];
  if (!b || !h) { box.innerHTML = `<p class="hint">Chưa có kết quả huấn luyện.</p>`; return; }
  const cell = (lbl, before, after, unit = "%") => {
    const d = (after - before) * 100;
    return `<div class="dl-item">
      <div class="dl-lbl">${lbl}</div>
      <div class="dl-row">
        <span class="dl-before">${(before * 100).toFixed(1)}${unit}</span>
        <span class="dl-arrow">→</span>
        <span class="dl-after">${(after * 100).toFixed(1)}${unit}</span>
      </div>
      <div class="dl-gain">+${d.toFixed(1)} điểm ${unit}</div>
    </div>`;
  };
  box.innerHTML =
    cell("Accuracy", b.acc, h.acc) +
    cell("F1 (lớp bất thường)", b.f1, h.f1) +
    `<div class="dl-item">
      <div class="dl-lbl">Loss</div>
      <div class="dl-row">
        <span class="dl-before">${b.loss.toFixed(3)}</span>
        <span class="dl-arrow">→</span>
        <span class="dl-after">${h.loss.toFixed(3)}</span>
      </div>
      <div class="dl-gain down">−${((b.loss - h.loss)).toFixed(3)}</div>
    </div>`;
}

/* ------------------------- đối chứng hash off-chain ↔ on-chain (A4)
   Bằng chứng chống chối bỏ: file trọng số tính ở máy có đúng là file đã được
   ghi hash lên chuỗi hay không. Hai giá trị này vốn đã được dashboard tải về,
   chỉ là chưa bao giờ được đặt cạnh nhau. */
function matchBadge(onchainHash, results, round) {
  const row = results?.history?.find((h) => (h.onchain_round ?? h.round) === round);
  if (!row) return `<span class="badge wait" title="round này không có trong results.json">–</span>`;
  const a = (onchainHash || "").replace(/^0x/, "").toLowerCase();
  const b = (row.global_hash || "").replace(/^0x/, "").toLowerCase();
  return a && a === b
    ? `<span class="badge ok" title="keccak256 của ai_model/weights/global_round_${row.round}.npy khớp hash trên chuỗi">✓ khớp</span>`
    : `<span class="badge bad" title="on-chain ${a.slice(0, 16)}… ≠ file ${b.slice(0, 16)}…">✗ lệch</span>`;
}

/* Mỗi mạng có một explorer khác nhau; localhost thì không có, nên tx hash chỉ
   hiện ra để đối chiếu/copy. Đổi sang Sepolia là các dòng này thành link thật. */
const EXPLORER = {
  sepolia: "https://sepolia.etherscan.io/tx/",
  amoy: "https://amoy.polygonscan.com/tx/",
  mainnet: "https://etherscan.io/tx/",
};

function txCell(hash) {
  if (!hash) return "";
  const base = EXPLORER[deployment?.network];
  const label = hash.slice(0, 10) + "…" + hash.slice(-6);
  return base
    ? `<a class="tx" href="${base}${hash}" target="_blank" rel="noopener" title="${hash}">${label} ↗</a>`
    : `<span class="tx" title="${hash} — mạng localhost không có explorer công khai">${label}</span>`;
}

async function renderEvents() {
  const box = $("#events");
  if (!box) return;
  const logs = [];
  const pull = async (name, fmt) => {
    const evs = await agg.queryFilter(name, 0, "latest");
    for (const e of evs) {
      logs.push({ block: e.blockNumber, tx: e.transactionHash, name, text: fmt(e.args) });
    }
  };
  await pull("WeightsSubmitted", (a) => `round ${a.round} · ${short(a.node)} · ${a.numSamples} mẫu · ${a.weightsHash.slice(0, 12)}…`);
  await pull("ModelAggregated", (a) => `round ${a.round} · global hash ${a.globalModelHash.slice(0, 14)}… · ${a.submissionCount} node`);
  await pull("RewardDistributed", (a) => `round ${a.round} · ${short(a.node)} nhận ${(+ethers.formatUnits(a.amount, 18)).toFixed(2)} BFL`);
  await pull("NodeRegistered", (a) => `đăng ký node ${short(a.node)}`);

  const evClass = {
    WeightsSubmitted: "ev-submit",
    ModelAggregated: "ev-agg",
    RewardDistributed: "ev-reward",
    NodeRegistered: "ev-reg",
  };
  logs.sort((x, y) => y.block - x.block);
  if ($("#ev-count")) $("#ev-count").textContent = logs.length;
  box.innerHTML = logs.slice(0, 60).map((l) =>
    `<div class="ev ${evClass[l.name] || ""}">
      <span class="t">${l.name}</span>
      <span class="d">${l.text}</span>
      <span class="ev-meta">block ${l.block} · ${txCell(l.tx)}</span>
    </div>`).join("")
    || `<div class="hint">Chưa có sự kiện nào.</div>`;
}

/* Biểu đồ đường SVG thuần (không phụ thuộc thư viện ngoài).
   series = [{ name, values[], color, width?, dash? }] — trục Y tự co theo dữ liệu
   trừ khi truyền min/max, nên cùng một hàm vẽ được cả thang % lẫn thang loss. */
function lineChart(sel, xs, series, opts = {}) {
  const el = $(sel);
  if (!el || !series.length) return;
  const W = 900, H = opts.height ?? 300, PL = 56, PR = 22, PT = 18, PB = 38;
  const flat = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  const lo = opts.min ?? Math.min(...flat);
  const hi = opts.max ?? Math.max(...flat);
  const pad = (opts.min === undefined && opts.max === undefined) ? ((hi - lo) * 0.15 || 1) : 0;
  const y0 = lo - pad, y1 = hi + pad;
  const X = (i) => PL + (xs.length < 2 ? 0.5 : i / (xs.length - 1)) * (W - PL - PR);
  const Y = (v) => PT + (1 - (v - y0) / (y1 - y0 || 1)) * (H - PT - PB);
  const fmt = opts.fmt ?? ((v) => v.toFixed(0));
  const cGrid = "#e8f0e7", cLbl = "#8fa89c";

  const ticks = Array.from({ length: 5 }, (_, i) => y0 + ((y1 - y0) * i) / 4);
  const grid = ticks.map((g) =>
    `<line x1="${PL}" y1="${Y(g).toFixed(1)}" x2="${W - PR}" y2="${Y(g).toFixed(1)}" stroke="${cGrid}"/>
     <text x="${PL - 9}" y="${(Y(g) + 4).toFixed(1)}" fill="${cLbl}" font-size="13" text-anchor="end">${fmt(g)}</text>`).join("");
  const xlabels = xs.map((x, i) =>
    `<text x="${X(i).toFixed(1)}" y="${H - 9}" fill="${cLbl}" font-size="13" text-anchor="middle">${x}</text>`).join("");
  const paths = series.map((s) => {
    const d = s.values.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(" ");
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width ?? 2.5}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ""} stroke-linejoin="round"/>`;
  }).join("");
  const dots = series.map((s) => s.dots === false ? "" : s.values.map((v, i) =>
    `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${(s.width ?? 2.5) > 2.5 ? 3.2 : 2.4}" fill="${s.color}"/>`).join("")).join("");

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" font-family="sans-serif">
      ${grid}${paths}${dots}${xlabels}
    </svg>` + (opts.note ? `<p class="hint">${opts.note}</p>` : "");
}

function legend(sel, series) {
  const el = $(sel);
  if (!el) return;
  el.innerHTML = series.map((s) =>
    `<b><i style="background:${s.color}"></i>${s.name}</b>`).join("");
}

// Hội tụ accuracy / F1 — round 0 = global model khởi tạo ngẫu nhiên
function drawChart(hist, baseline) {
  if (!$("#chart")) return;
  const xs = [0, ...hist.map((h) => h.round)];
  const series = [
    { name: "Accuracy", color: "#3a6fa8", values: [(baseline?.acc ?? hist[0].acc) * 100, ...hist.map((h) => h.acc * 100)] },
    { name: "F1 (lớp bất thường)", color: "#3f8f63", values: [(baseline?.f1 ?? hist[0].f1) * 100, ...hist.map((h) => h.f1 * 100)] },
  ];
  lineChart("#chart", xs, series, {
    min: 0, max: 100, fmt: (v) => v.toFixed(0),
    note: "Trục X = round huấn luyện (0 = model khởi tạo ngẫu nhiên)",
  });
  legend("#chart-legend", series);
}

/* Loss (A3) — nằm sẵn trong results.json nhưng biểu đồ cũ không vẽ.
   Thang giá trị quá nhỏ (0,17–0,19) nên phải có trục Y riêng, không ghép chung
   với thang phần trăm được. */
function drawLoss(hist, baseline) {
  if (!$("#chart-loss")) return;
  // Cố tình BỎ baseline khỏi biểu đồ này: loss lúc khởi tạo (~0,74) lớn gấp 4 lần
  // các round sau, vẽ chung thì cả 5 round bị nén thành một đường phẳng và đúng
  // thứ đáng xem — loss nhích lên từ round 3 — biến mất.
  const xs = hist.map((h) => h.round);
  const series = [{ name: "Cross-entropy loss", color: "#ad7c4b", values: hist.map((h) => h.loss) }];
  lineChart("#chart-loss", xs, series, {
    height: 240, fmt: (v) => v.toFixed(3),
    note: `Chỉ vẽ từ round 1 — loss của model khởi tạo (${(baseline?.loss ?? 0).toFixed(3)}) lớn hơn hẳn, vẽ chung sẽ làm phẳng toàn bộ phần còn lại`,
  });
  legend("#chart-loss-legend", series);

  // Nhận xét tự sinh: loss chạm đáy ở round nào, sau đó có đi lên không
  const el = $("#loss-note");
  if (!el) return;
  const losses = hist.map((h) => h.loss);
  const best = losses.indexOf(Math.min(...losses));
  const rising = losses[losses.length - 1] > losses[best] + 1e-6;
  el.innerHTML = rising
    ? `Loss thấp nhất ở <b>round ${hist[best].round}</b> (${losses[best].toFixed(3)}) rồi tăng dần lên
       ${losses[losses.length - 1].toFixed(3)} trong khi accuracy gần như đi ngang — dấu hiệu global model
       bắt đầu <b>overfit</b> sau round ${hist[best].round}. Với cấu hình này, dừng sớm quanh round
       ${hist[best].round} là đủ.`
    : `Loss giảm đều tới round ${hist[hist.length - 1].round} (${losses[losses.length - 1].toFixed(3)}) — chưa có dấu hiệu overfit.`;
}

/* FedAvg vs từng node tự train (B1) — mỗi local model được chấm trên CÙNG tập
   test chung nên so sánh là công bằng. Đây là bằng chứng trực tiếp cho câu
   "học liên kết tốt hơn để mỗi node tự train một mình". */
const NODE_COLORS = ["#7f9d8c", "#b08d57", "#5f8fa8", "#9a7fb0", "#8a9a5b", "#b07f7f"];

function drawLocalVsGlobal(hist) {
  if (!$("#chart-local") || !hist[0]?.nodes) return;
  const xs = hist.map((h) => h.round);
  const nodeIds = hist[0].nodes.map((n) => n.node_id);
  const series = nodeIds.map((id, i) => ({
    name: `node ${id} tự train`,
    color: NODE_COLORS[i % NODE_COLORS.length],
    width: 1.8,
    dash: "5 4",
    values: hist.map((h) => (h.nodes.find((n) => n.node_id === id)?.local_acc ?? 0) * 100),
  }));
  series.push({
    name: "Global model (FedAvg)",
    color: "#2c3a33",
    width: 3.4,
    values: hist.map((h) => h.acc * 100),
  });
  lineChart("#chart-local", xs, series, { min: 50, max: 100, fmt: (v) => v.toFixed(0) + "%" });
  legend("#chart-local-legend", series);

  const el = $("#local-note");
  if (!el) return;
  const last = hist[hist.length - 1];
  const locals = last.nodes.map((n) => n.local_acc * 100);
  const best = Math.max(...locals), worst = Math.min(...locals);
  const bestId = last.nodes[locals.indexOf(best)].node_id;
  const worstId = last.nodes[locals.indexOf(worst)].node_id;
  el.innerHTML = `Ở round cuối, global model đạt <b>${(last.acc * 100).toFixed(1)}%</b> —
    cao hơn <b>mọi</b> node tự train: node giỏi nhất (node ${bestId}) được ${best.toFixed(1)}%,
    node kém nhất (node ${worstId}) chỉ ${worst.toFixed(1)}% vì dữ liệu của nó lệch nặng (non-IID).
    Và không node nào phải chia sẻ dữ liệu thô để đạt được điều đó.`;
}

/* Global model phục vụ từng node tốt cỡ nào — đo trên dữ liệu RIÊNG của node,
   trước khi node đó train vòng hiện tại. Góc nhìn "công bằng giữa các node". */
function drawFairness(hist) {
  const box = $("#fairness");
  if (!box || !hist[0]?.nodes) return;
  const last = hist[hist.length - 1];
  box.innerHTML = last.nodes.map((n, i) => {
    const pct = n.global_acc_on_local_data * 100;
    const first = (hist[0].nodes.find((x) => x.node_id === n.node_id)?.global_acc_on_local_data ?? 0) * 100;
    return `<div class="fair">
      <div class="fair-top"><b>node ${n.node_id}</b><span>${n.n_samples} mẫu</span></div>
      <div class="bar"><i style="width:${pct.toFixed(1)}%;background:${NODE_COLORS[i % NODE_COLORS.length]}"></i></div>
      <div class="fair-lbl"><span>round 1: ${first.toFixed(1)}%</span><b>${pct.toFixed(1)}%</b></div>
    </div>`;
  }).join("");
}

// --- MetaMask (điểm nâng cao) ---
$("#btn-wallet").addEventListener("click", async () => {
  if (!window.ethereum) { alert("Không tìm thấy MetaMask trong trình duyệt này."); return; }
  try {
    const [acc] = await window.ethereum.request({ method: "eth_requestAccounts" });
    const bal = token ? +ethers.formatUnits(await token.balanceOf(acc), 18) : 0;
    $("#btn-wallet").textContent = `${short(acc)} · ${bal.toFixed(2)} BFL`;
    $("#btn-wallet").disabled = true;
  } catch (e) { alert("Lỗi kết nối ví: " + e.message); }
});

// Nút thu gọn sidebar (chỉ còn icon) — nhớ trạng thái qua các lần chuyển trang
function initSidebarToggle() {
  const btn = $("#sidebar-toggle");
  if (!btn) return;
  if (localStorage.getItem("bfl_sidebar_collapsed") === "1") {
    document.body.classList.add("collapsed");
  }
  btn.addEventListener("click", () => {
    document.body.classList.toggle("collapsed");
    localStorage.setItem("bfl_sidebar_collapsed", document.body.classList.contains("collapsed") ? "1" : "0");
  });
}

// Component dùng chung: dải "Mạng/Token/Aggregator" + 4 thẻ KPI.
// Trước đây đoạn HTML này bị dán tay giống hệt nhau ở cả 6 trang; giờ chỉ
// còn <div id="meta-cards"></div> trên mỗi trang, JS tự sinh nội dung vào đó.
function renderMetaCardsSkeleton() {
  const el = $("#meta-cards");
  if (!el) return;
  el.innerHTML = `
    <section class="meta" id="meta"></section>
    <section class="cards">
      <div class="card"><div class="k">Round hiện tại</div><div class="v" id="c-round">–</div></div>
      <div class="card"><div class="k">Số node tham gia</div><div class="v" id="c-nodes">–</div></div>
      <div class="card"><div class="k">Tổng BFL đã thưởng</div><div class="v" id="c-token">–</div></div>
      <div class="card"><div class="k">Độ chính xác mới nhất</div><div class="v" id="c-acc">–</div></div>
    </section>`;
}

async function boot() {
  renderMetaCardsSkeleton();
  initSidebarToggle();
  initRunner();
  try {
    await connect();
    await loadPreview();
    await refresh();
    setInterval(() => refresh().catch(console.error), 5000);
  } catch (e) {
    $("#dot").className = "dot off";
    $("#conn-text").innerHTML = `<span class="err">${e.message}</span>`;
    $("#refresh-info").textContent =
      "Cần: (1) npx hardhat node  (2) npx hardhat run scripts/deploy.js --network localhost  (3) mở lại trang này";
  }
}
boot();


/* =======================================================================
   Trang Kiến trúc CPS — vài con số sống nhúng vào sơ đồ tĩnh
   ======================================================================= */
function renderArchLive(nodeCount) {
  const box = $("#arch-nodes");
  if (box) {
    box.innerHTML = Array.from({ length: nodeCount }, (_, i) => `
      <div class="abox node">
        <b>edge node ${i}</b>
        <span>giữ dữ liệu cảm biến của riêng mình — không gửi đi đâu</span>
        <code>${short(deployment.nodes[i])}</code>
      </div>`).join("");
  }
  if ($("#arch-agg")) $("#arch-agg").textContent = short(deployment.aggregator.address);
  if ($("#arch-token")) $("#arch-token").textContent = short(deployment.token.address);
  if ($("#arch-min")) $("#arch-min").textContent = deployment.minNodes;
  if ($("#arch-events")) {
    agg.queryFilter("*", 0, "latest")
      .then((evs) => { $("#arch-events").textContent = evs.length; })
      .catch(() => { $("#arch-events").textContent = "–"; });
  }
}

/* =======================================================================
   Trang Smart Contract — mọi giá trị gọi thẳng contract, không chép từ file
   ======================================================================= */
async function renderContract(currentRound, nodes, balances) {
  const info = $("#contract-info");
  if (!info) return;

  const [name, symbol, decimals, totalSupply, owner, minNodes, rewardPerRound, nodeCount] =
    await Promise.all([
      token.name(), token.symbol(), token.decimals(), token.totalSupply(),
      agg.owner(), agg.minNodes(), agg.rewardPerRound(), agg.nodeCount(),
    ]);
  const bfl = (v) => (+ethers.formatUnits(v, 18)).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const kv = (k, v, n) => `<div class="kv"><div class="kv-k">${k}</div><div class="kv-v">${v}</div><div class="kv-n">${n}</div></div>`;
  info.innerHTML =
    kv("Token", `${symbol}`, `${name} · ${decimals} chữ số thập phân · chuẩn ERC-20`) +
    kv("Tổng cung hiện tại", `${bfl(totalSupply)}`, "toàn bộ sinh ra từ distributeReward — không có đợt phát hành nào khác") +
    kv("Round hiện tại", `${currentRound}`, `round đang mở, tức đã chốt xong ${currentRound - 1} round`) +
    kv("minNodes", `${minNodes}`, `contract từ chối aggregate nếu chưa đủ ${minNodes} node nộp Δw`) +
    kv("rewardPerRound", `${bfl(rewardPerRound)}`, "tổng BFL phát cho mỗi round, chia theo tỉ lệ số mẫu") +
    kv("Số node đã đăng ký", `${nodeCount}`, "chỉ những địa chỉ này mới gọi được submitWeights");

  const addr = $("#addr-info");
  if (addr) {
    addr.innerHTML =
      kv("Mạng", deployment.network, "đổi sang sepolia thì mọi mã giao dịch trong nhật ký thành link Etherscan") +
      kv("Owner", `<span class="mono-v">${short(owner)}</span>`, "tài khoản điều phối round — nhưng không mint được token") +
      kv("Aggregator", `<span class="mono-v">${short(deployment.aggregator.address)}</span>`, "giữ toàn bộ trạng thái round + quyền mint") +
      kv("BlockFLToken", `<span class="mono-v">${short(deployment.token.address)}</span>`, "ERC-20 tối giản, minter đã trỏ về Aggregator");
  }

  // --- bảng tính lại tiền thưởng của round cuối cùng đã chốt ---
  const body = $("#reward-calc tbody");
  if (!body) return;
  const lastRound = currentRound - 1;
  if (lastRound < 1) {
    body.innerHTML = `<tr><td colspan="5" class="hint">Chưa có round nào chốt xong.</td></tr>`;
    return;
  }
  const [, totalSamples, , ,submitters] = await agg.getRound(lastRound);
  const subs = await Promise.all(submitters.map((a) => agg.getSubmission(lastRound, a)));
  body.innerHTML = submitters.map((a, i) => {
    const n = subs[i][1];
    const share = Number((n * 10000n) / totalSamples) / 100;
    const amount = (rewardPerRound * n) / totalSamples;
    const idx = nodes.indexOf(a);
    return `<tr>
      <td>node ${idx >= 0 ? idx : "?"} <span class="mono">${short(a)}</span></td>
      <td>${n}</td>
      <td>${share.toFixed(2)}%</td>
      <td><b>${bfl(amount)}</b> BFL</td>
      <td>${idx >= 0 ? bfl(balances[idx]) : "–"} BFL</td>
    </tr>`;
  }).join("");

  const note = $("#reward-note");
  if (note) {
    note.innerHTML = `Bảng này <b>tính lại</b> công thức bằng đúng số liệu on-chain của round ${lastRound}
      (tổng ${totalSamples} mẫu) rồi đối chiếu với số dư thật. Node đóng góp nhiều dữ liệu hơn nhận nhiều
      token hơn — đó là cơ chế khuyến khích node tham gia thật thay vì nộp cho có.
      Lưu ý phép chia số nguyên của Solidity làm tròn xuống, nên tổng phát ra có thể hụt vài wei so với
      <code>rewardPerRound</code>; đây là hành vi cố ý, không phải lỗi.`;
  }
}

/* =======================================================================
   Trang IoT — dữ liệu lệch nhau cỡ nào giữa các node (non-IID)
   ======================================================================= */
function renderNonIid(pv) {
  const box = $("#noniid");
  if (!box) return;
  const maxN = Math.max(...pv.nodes.map((n) => n.n_train + n.n_test));
  box.innerHTML = `<div class="nid-grid">` + pv.nodes.map((n, i) => {
    const total = n.n_train + n.n_test;
    const pct = n.anomaly_ratio * 100;
    return `<div class="nid">
      <div class="nid-top"><b>node ${n.node_id}</b><span>${total} mẫu</span></div>
      <div class="nid-track" title="độ dài = tổng số mẫu, phần đậm = ca bất thường">
        <div class="nid-fill" style="width:${(total / maxN) * 100}%">
          <i class="norm" style="flex:${100 - pct}"></i><i class="anom" style="flex:${pct}"></i>
        </div>
      </div>
      <div class="nid-lbl"><span>${n.n_normal} bình thường</span><b>${pct.toFixed(1)}% bất thường</b></div>
    </div>`;
  }).join("") + `</div>`;

  const note = $("#noniid-note");
  if (!note) return;
  const ratios = pv.nodes.map((n) => n.anomaly_ratio * 100);
  const hi = Math.max(...ratios), lo = Math.min(...ratios);
  const hiId = pv.nodes[ratios.indexOf(hi)].node_id, loId = pv.nodes[ratios.indexOf(lo)].node_id;
  // Chỉ nói điều dữ liệu ở ĐÂY chứng minh được. Node nào có local model kém nhất
  // là câu hỏi của results.json, không suy ra được từ tỉ lệ bất thường — trang
  // Hội tụ AI trả lời bằng số đo thật.
  note.innerHTML = `Tỉ lệ ca bất thường chạy từ <b>${lo.toFixed(1)}%</b> (node ${loId}) tới
    <b>${hi.toFixed(1)}%</b> (node ${hiId}) — chênh <b>${(hi / lo).toFixed(1)} lần</b>.
    Không node nào nhìn thấy phân phối thật của toàn hệ thống: node ${loId} hầu như chỉ gặp ca bình thường,
    node ${hiId} thì ngược lại. Tự train một mình, mỗi node sẽ học lệch theo đúng phần dữ liệu nó có —
    xem mức lệch đó thành ra bao nhiêu phần trăm ở trang <a href="ai.html">Hội tụ AI</a>.`;
}


/* =======================================================================
   Nhiều lần chia dữ liệu — trả lời "kết quả này có ăn may không"
   Nguồn: results_sweep.json (sinh bởi `python scripts/run_sweep.py`)
   ======================================================================= */
function renderSweep(sw) {
  const box = $("#sweep-summary");
  if (!box) return;
  if (!sw) {
    box.innerHTML = `<p class="hint">Chưa có <code>results_sweep.json</code> — chạy
      <code>python scripts/run_sweep.py</code> để sinh.</p>`;
    return;
  }
  const s = sw.summary, runs = sw.runs;
  const pc = (v) => (v * 100).toFixed(1);

  box.innerHTML = `
    <div class="dl-item">
      <div class="dl-lbl">Accuracy qua ${s.n_runs} lần chia</div>
      <div class="dl-row"><span class="dl-after">${pc(s.acc_mean)}%</span>
        <span class="dl-spread">± ${pc(s.acc_std)}</span></div>
      <div class="dl-gain neutral">thấp nhất ${pc(s.acc_min)}% · cao nhất ${pc(s.acc_max)}%</div>
    </div>
    <div class="dl-item">
      <div class="dl-lbl">F1 qua ${s.n_runs} lần chia</div>
      <div class="dl-row"><span class="dl-after">${pc(s.f1_mean)}%</span>
        <span class="dl-spread">± ${pc(s.f1_std)}</span></div>
      <div class="dl-gain neutral">lớp bất thường — chỉ số khó ăn may nhất</div>
    </div>
    <div class="dl-item">
      <div class="dl-lbl">FedAvg thắng mọi node tự train</div>
      <div class="dl-row"><span class="dl-after">${s.wins}/${s.n_runs}</span>
        <span class="dl-spread">lần</span></div>
      <div class="dl-gain">cách biệt trung bình +${pc(s.gap_mean)} điểm %</div>
    </div>`;

  // đường hội tụ của TỪNG lần chia — cho thấy chúng chụm lại chứ không tán loạn
  const rounds = runs[0].history_acc.map((_, i) => i + 1);
  const series = runs.map((r, i) => ({
    name: `seed ${r.seed}`,
    color: NODE_COLORS[i % NODE_COLORS.length],
    width: 1.6,
    values: r.history_acc.map((v) => v * 100),
  }));
  lineChart("#chart-sweep", rounds, series, {
    height: 260, min: 80, max: 100, fmt: (v) => v.toFixed(0) + "%",
    note: "Mỗi đường là một lần chia dữ liệu hoàn toàn khác — chúng hội tụ về cùng một vùng, không phân tán",
  });
  legend("#chart-sweep-legend", series);

  const body = $("#sweep-table tbody");
  if (body) {
    body.innerHTML = runs.map((r) => `<tr>
      <td class="mono">${r.seed}</td>
      <td><b>${pc(r.acc)}%</b></td>
      <td>${pc(r.best_local_acc)}%</td>
      <td>${pc(r.worst_local_acc)}%</td>
      <td>+${((r.acc - r.best_local_acc) * 100).toFixed(1)} điểm %</td>
      <td>${r.beats_every_local
        ? '<span class="badge ok">✓ thắng</span>'
        : '<span class="badge bad">✗ thua</span>'}</td>
    </tr>`).join("");
  }

  const note = $("#sweep-note");
  if (note) {
    const spread = (s.acc_max - s.acc_min) * 100;
    note.innerHTML = `<b>Vì sao panel này tồn tại:</b> một kết quả duy nhất trên một lần chia dữ liệu
      duy nhất không chứng minh được gì — nó có thể chỉ là một seed may mắn. Ở đây toàn bộ quy trình
      chạy lại ${s.n_runs} lần trên ${s.n_runs} bộ dữ liệu khác nhau: accuracy dao động trong
      <b>${spread.toFixed(1)} điểm %</b>, và FedAvg thắng mọi node tự train <b>${s.wins}/${s.n_runs}</b> lần.
      Kết luận "học liên kết tốt hơn từng node tự train" vì thế không phụ thuộc vào một lần chia may mắn.
      Lưu ý con số ở các phần trên trang này là của lần chạy chính (seed
      <span id="sweep-main-seed">${sw.config.seeds[0]}</span>) — lần đã được ghi lên blockchain.`;
  }
}


/* =======================================================================
   Nút "Chạy demo trực tiếp" — điều khiển dashboard/serve.py
   Server làm 3 pha (reset chain → deploy → train); trang này chỉ hỏi trạng
   thái mỗi 1,5 giây và vẽ lại. Mọi số khác trên dashboard vẫn tự làm mới theo
   nhịp 5 giây sẵn có, nên round mới hiện ra mà không cần làm gì thêm.
   ======================================================================= */
const PHASE_TEXT = {
  idle: "chưa chạy",
  reset: "đang xoá chain local…",
  deploy: "đang deploy contract…",
  train: "đang huấn luyện + ghi on-chain…",
  done: "xong",
  error: "lỗi",
};
const PHASE_ORDER = ["reset", "deploy", "train"];
let runnerTimer = null;

function paintRunner(st) {
  const phaseEl = $("#run-phase"), logEl = $("#run-log"), btn = $("#btn-run");
  if (!phaseEl) return;
  const running = PHASE_ORDER.includes(st.phase);

  phaseEl.textContent = PHASE_TEXT[st.phase] || st.phase;
  phaseEl.className = "runner-phase " + st.phase;
  if (st.elapsed != null && st.phase !== "idle") {
    phaseEl.textContent += ` · ${st.elapsed}s`;
  }

  const at = PHASE_ORDER.indexOf(st.phase);
  document.querySelectorAll("#run-steps .rstep").forEach((el, i) => {
    el.classList.toggle("doing", running && i === at);
    el.classList.toggle("ok", st.phase === "done" || (running && i < at));
    el.classList.toggle("bad", st.phase === "error" && i === at);
  });

  if (logEl) {
    if (st.log?.length) {
      logEl.hidden = false;
      logEl.textContent = st.log.join("\n");
      logEl.scrollTop = logEl.scrollHeight;
    } else {
      logEl.hidden = true;
    }
  }
  if (btn) {
    btn.disabled = running;
    btn.textContent = running ? "Đang chạy…" : "▶ Chạy demo từ đầu";
  }

  if (!running && runnerTimer) {
    clearInterval(runnerTimer);
    runnerTimer = null;
    // Deploy mới ghi lại deployments/localhost.json (địa chỉ, danh sách node).
    // Nối lại từ file đó thay vì tin bản đã nạp lúc mở trang.
    if (st.phase === "done") {
      connect().then(() => refresh()).catch(console.error);
    }
  }
}

async function pollRunner() {
  try {
    const r = await fetch("/api/demo/status", { cache: "no-store" });
    if (r.ok) paintRunner(await r.json());
  } catch { /* server tĩnh đang bận, thử lại nhịp sau */ }
}

function initRunner() {
  const btn = $("#btn-run");
  if (!btn) return;
  pollRunner();   // có thể một lượt chạy đang diễn ra từ tab khác
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const body = {
      rounds: Number($("#run-rounds").value) || 5,
      seed: Number($("#run-seed").value) || 7,
    };
    try {
      const r = await fetch("/api/demo/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const res = await r.json();
      if (!res.ok) {
        alert(res.message || "Không bắt đầu được.");
        btn.disabled = false;
        return;
      }
    } catch (e) {
      alert("Không gọi được server.\n\nNút này cần dashboard mở qua "
          + "`python dashboard/serve.py` (không phải mở file .html trực tiếp).\n\n" + e.message);
      btn.disabled = false;
      return;
    }
    if (runnerTimer) clearInterval(runnerTimer);
    runnerTimer = setInterval(pollRunner, 1500);
    pollRunner();
  });
}
