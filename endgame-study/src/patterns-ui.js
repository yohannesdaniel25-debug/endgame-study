// patterns-ui.js — the "what do I keep getting wrong" dashboard, built
// entirely from what storage.js has saved across past reviewed games.

import { loadHistory, clearHistory } from "./storage.js";
import { escapeHtml } from "./utils.js";

export function setupPatterns() {
  document.getElementById("clearHistoryBtn").onclick = () => {
    if (confirm("Clear all saved review history? This can't be undone.")) {
      clearHistory();
      renderPatterns();
    }
  };
}

export function renderPatterns() {
  const list = loadHistory();
  const empty = document.getElementById("patternsEmpty");
  const body = document.getElementById("patternsBody");
  const phasePanel = document.getElementById("phasePanel");
  const piecePanel = document.getElementById("pieceChart").closest(".panel");
  const trendPanel = document.getElementById("trendPanel");
  const historyPanel = document.getElementById("historyPanel");

  if (list.length === 0) {
    empty.classList.remove("hidden");
    body.classList.add("hidden");
    [phasePanel, piecePanel, trendPanel, historyPanel].forEach((p) => p.classList.add("hidden"));
    return;
  }
  empty.classList.add("hidden");
  body.classList.remove("hidden");
  [phasePanel, piecePanel, trendPanel, historyPanel].forEach((p) => p.classList.remove("hidden"));

  const totalGames = list.length;
  const avgAcc = list.reduce((s, g) => s + g.accuracy, 0) / totalGames;
  const totalBlunders = list.reduce((s, g) => s + g.counts.blunder, 0);
  const totalMistakes = list.reduce((s, g) => s + g.counts.mistake, 0);
  const totalMoves = list.reduce((s, g) => s + g.plies, 0);
  const blunderRate = totalMoves ? (totalBlunders / totalMoves) * 100 : 0;

  const statGrid = document.getElementById("statGrid");
  statGrid.innerHTML = "";
  [
    ["Games reviewed", totalGames],
    ["Average accuracy", avgAcc.toFixed(1) + "%"],
    ["Blunder rate", blunderRate.toFixed(1) + "% of moves"],
    ["Total mistakes+blunders", totalMistakes + totalBlunders],
  ].forEach(([k, v]) => {
    const d = document.createElement("div");
    d.className = "big-stat";
    d.innerHTML = `<div class="v">${v}</div><div class="k">${k}</div>`;
    statGrid.appendChild(d);
  });

  const phaseTotals = { opening: 0, middlegame: 0, endgame: 0 };
  list.forEach((g) => { for (const k in g.byPhase) phaseTotals[k] += g.byPhase[k]; });
  renderBarChart("phaseChart", phaseTotals, { opening: "Opening", middlegame: "Middlegame", endgame: "Endgame" });

  const pieceTotals = {};
  list.forEach((g) => { for (const k in g.byPiece) pieceTotals[k] = (pieceTotals[k] || 0) + g.byPiece[k]; });
  const pieceLabels = { p: "Pawn", n: "Knight", b: "Bishop", r: "Rook", q: "Queen", k: "King" };
  renderBarChart("pieceChart", pieceTotals, pieceLabels);

  const worstPhase = Object.entries(phaseTotals).sort((a, b) => b[1] - a[1])[0];
  const worstPiece = Object.entries(pieceTotals).sort((a, b) => b[1] - a[1])[0];
  const insight = document.getElementById("insightBox");
  if (worstPhase && worstPhase[1] > 0) {
    const phaseLabel = { opening: "the opening", middlegame: "the middlegame", endgame: "the endgame" }[worstPhase[0]];
    const pieceLabel = worstPiece && worstPiece[1] > 0 ? pieceLabels[worstPiece[0]].toLowerCase() : null;
    insight.innerHTML = `Across ${totalGames} reviewed game${totalGames === 1 ? "" : "s"}, most of your mistakes and blunders happen in <b>${phaseLabel}</b>` +
      (pieceLabel ? `, and your <b>${pieceLabel}</b> is the piece most often involved.` : ".") +
      ` That's a reasonable place to spend your next study session.`;
  } else {
    insight.innerHTML = `No mistakes or blunders logged yet in your reviewed games — nicely played, or you haven't reviewed enough games for a pattern to show yet.`;
  }

  renderTrendChart(list);

  const histList = document.getElementById("historyList");
  histList.innerHTML = "";
  list.slice().reverse().forEach((g) => {
    const card = document.createElement("div");
    card.className = "game-card";
    card.style.cursor = "default";
    card.innerHTML = `
      <div class="g-left">
        <div class="g-opp">vs ${escapeHtml(g.opponent)} <span style="color:var(--ink-faint);font-weight:400;">(${g.myColor === "w" ? "white" : "black"})</span></div>
        <div class="g-meta">${escapeHtml(g.timeClass || "")} · ${new Date(g.when).toLocaleDateString()} · ${g.accuracy.toFixed(1)}% accuracy</div>
      </div>
      <span class="result-pill">${g.counts.blunder} blunder${g.counts.blunder === 1 ? "" : "s"}</span>
    `;
    histList.appendChild(card);
  });
}

function renderBarChart(elId, totals, labels) {
  const el = document.getElementById(elId);
  el.innerHTML = "";
  const max = Math.max(1, ...Object.values(totals));
  Object.keys(labels).forEach((k) => {
    const v = totals[k] || 0;
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div>${labels[k]}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(v / max) * 100}%;"></div></div>
      <div>${v}</div>
    `;
    el.appendChild(row);
  });
}

function renderTrendChart(list) {
  const canvas = document.getElementById("trendChart");
  const ctx = canvas.getContext("2d");
  const w = (canvas.width = canvas.clientWidth * 2);
  const h = (canvas.height = 150 * 2);
  ctx.clearRect(0, 0, w, h);
  const n = list.length;
  if (n === 0) return;
  const pad = 16;
  ctx.strokeStyle = "#3A4438"; ctx.lineWidth = 1;
  for (let gy = 0; gy <= 100; gy += 25) {
    const y = h - pad - (gy / 100) * (h - 2 * pad);
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
  }
  ctx.beginPath();
  list.forEach((g, i) => {
    const x = n === 1 ? w / 2 : pad + (i / (n - 1)) * (w - 2 * pad);
    const y = h - pad - (g.accuracy / 100) * (h - 2 * pad);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#C9A24B"; ctx.lineWidth = 3; ctx.stroke();
  list.forEach((g, i) => {
    const x = n === 1 ? w / 2 : pad + (i / (n - 1)) * (w - 2 * pad);
    const y = h - pad - (g.accuracy / 100) * (h - 2 * pad);
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#EFE7D0"; ctx.fill();
  });
}
