/* BlockFL Dashboard — đọc trạng thái từ Hardhat local RPC + results.json */

const RPC_URL = "http://127.0.0.1:8545";
const $ = (s) => document.querySelector(s);

let provider, token, agg, deployment;

async function loadDeployment() {
  const res = await fetch("../deployments/localhost.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Chưa có deployments/localhost.json — hãy deploy contract trước");
  return res.json();
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
    renderPreview(await r.json());
  } catch { /* chưa export */ }
}

function renderPreview(pv) {
  const feats = pv.features;
  const box = $("#data-grid");
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

async function refresh() {
  const currentRound = Number(await agg.currentRound());
  const nodes = deployment.nodes;

  // --- thẻ tổng quan ---
  $("#c-round").textContent = currentRound;
  $("#c-nodes").textContent = nodes.length;

  const balances = await Promise.all(nodes.map((a) => token.balanceOf(a)));
  const totalToken = balances.reduce((s, b) => s + b, 0n);
  $("#c-token").textContent = (+ethers.formatUnits(totalToken, 18)).toFixed(1) + " BFL";

  // --- lịch sử round on-chain (tải song song, đổi DOM 1 lần) ---
  const roundIdx = [];
  for (let r = 1; r < Math.max(currentRound, 1); r++) roundIdx.push(r);
  const roundData = await Promise.all(roundIdx.map((r) => agg.getRound(r)));
  const lastSamples = {};
  await Promise.all(
    roundIdx.map(async (r, k) => {
      const submitters = roundData[k][4];
      const subs = await Promise.all(submitters.map((s) => agg.getSubmission(r, s)));
      submitters.forEach((s, j) => (lastSamples[s] = Number(subs[j][1])));
    })
  );
  const rowsHtml = roundIdx.map((r, k) => {
    const [ghash, totalSamples, count, aggregated] = roundData[k];
    return `<tr><td>${r}</td><td>${count}</td><td>${totalSamples}</td>
      <td>${aggregated ? '<span class="badge ok">✓ xong</span>' : '<span class="badge wait">chờ</span>'}</td>
      <td class="hash">${hx(ghash)}</td></tr>`;
  });
  $("#rounds tbody").innerHTML = rowsHtml.join("") ||
    `<tr><td colspan="5" class="hint">Chưa có round nào hoàn tất. Chạy <code>python run_demo.py</code>.</td></tr>`;

  // --- bảng node ---
  const maxBal = balances.reduce((m, b) => (b > m ? b : m), 1n);
  $("#nodes tbody").innerHTML = nodes.map((addr, i) => {
    const bal = +ethers.formatUnits(balances[i], 18);
    const pct = maxBal > 0n ? Number((balances[i] * 100n) / maxBal) : 0;
    return `<tr><td>node ${i}</td><td class="mono">${short(addr)}</td>
      <td>${lastSamples[addr] ?? "–"}</td>
      <td><b>${bal.toFixed(2)}</b></td>
      <td><div class="bar"><i style="width:${pct}%"></i></div></td></tr>`;
  }).join("");

  // --- sự kiện ---
  await renderEvents();

  // --- biểu đồ hội tụ ---
  const results = await loadResults();
  if (results && results.history?.length) {
    const hist = results.history;
    const acc = hist[hist.length - 1].acc;
    $("#c-acc").textContent = (acc * 100).toFixed(1) + "%";
    drawChart(hist, results.baseline);
  } else {
    $("#c-acc").textContent = "–";
  }
}

async function renderEvents() {
  const box = $("#events");
  const logs = [];
  const pull = async (name, fmt) => {
    const evs = await agg.queryFilter(name, 0, "latest");
    for (const e of evs) logs.push({ block: e.blockNumber, name, text: fmt(e.args) });
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
  const evIcon = {
    WeightsSubmitted: "📤",
    ModelAggregated: "⚙️",
    RewardDistributed: "🪙",
    NodeRegistered: "🆕",
  };

  logs.sort((x, y) => y.block - x.block);
  box.innerHTML = logs.slice(0, 40).map((l) =>
    `<div class="ev ${evClass[l.name] || ""}">
      <span>${evIcon[l.name] || "•"}</span>
      <span class="t">${l.name}</span><span class="d">${l.text}</span>
    </div>`).join("")
    || `<div class="hint">Chưa có sự kiện nào.</div>`;
}

// Vẽ biểu đồ đường bằng SVG thuần (không phụ thuộc thư viện ngoài)
function drawChart(hist, baseline) {
  const W = 720, H = 240, PL = 44, PR = 16, PT = 16, PB = 30;
  const xs = [0, ...hist.map((h) => h.round)];
  const acc = [baseline?.acc ?? hist[0].acc, ...hist.map((h) => h.acc)].map((v) => v * 100);
  const f1 = [baseline?.f1 ?? hist[0].f1, ...hist.map((h) => h.f1)].map((v) => v * 100);
  const maxX = Math.max(...xs) || 1;
  const X = (i) => PL + (xs[i] / maxX) * (W - PL - PR);
  const Y = (v) => PT + (1 - v / 100) * (H - PT - PB);
  const path = (arr) => arr.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(" ");
  const dots = (arr, c) => arr.map((v, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3" fill="${c}"/>`).join("");
  const cAcc = "#2f6cb3", cF1 = "#2ea373", cGrid = "#e3ecf5", cLbl = "#8fa0bd";
  const grid = [0, 25, 50, 75, 100].map((g) =>
    `<line x1="${PL}" y1="${Y(g)}" x2="${W - PR}" y2="${Y(g)}" stroke="${cGrid}"/>
     <text x="${PL - 8}" y="${Y(g) + 4}" fill="${cLbl}" font-size="11" text-anchor="end">${g}</text>`).join("");
  const xlabels = xs.map((x, i) =>
    `<text x="${X(i)}" y="${H - 8}" fill="${cLbl}" font-size="11" text-anchor="middle">${x}</text>`).join("");

  $("#chart").innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" font-family="sans-serif">
      ${grid}
      <path d="${path(acc)}" fill="none" stroke="${cAcc}" stroke-width="2.5"/>
      <path d="${path(f1)}" fill="none" stroke="${cF1}" stroke-width="2.5"/>
      ${dots(acc, cAcc)}${dots(f1, cF1)}
      ${xlabels}
    </svg>
    <p class="hint">Trục X = round huấn luyện (0 = model khởi tạo ngẫu nhiên)</p>`;
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

async function boot() {
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
