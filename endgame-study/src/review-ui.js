// review-ui.js — the panels that explain the analyzed game: move list,
// per-move explanation, eval chart, and the summary stat chips.

import { state } from "./state.js";
import { TAG_LABEL, TAG_COLOR_VAR, pieceName } from "./analysis.js";
import { renderBoardForPly } from "./board-ui.js";

export function renderMoveList() {
  const el = document.getElementById("moveList");
  el.innerHTML = "";
  for (let i = 0; i < state.currentAnalysis.length; i += 2) {
    const row = document.createElement("div");
    row.className = "mv-row";
    const num = document.createElement("div");
    num.className = "mv-num";
    num.textContent = Math.floor(i / 2) + 1 + ".";
    row.appendChild(num);
    for (let k = 0; k < 2; k++) {
      const idx = i + k;
      const cell = document.createElement("div");
      if (idx < state.currentAnalysis.length) {
        const a = state.currentAnalysis[idx];
        const span = document.createElement("span");
        span.className = "mv-san" + (state.currentPly === idx + 1 ? " sel" : "");
        const dot = document.createElement("span");
        dot.className = "mv-dot";
        dot.style.background = `var(${TAG_COLOR_VAR[a.classification]})`;
        span.appendChild(dot);
        span.appendChild(document.createTextNode(a.san));
        span.onclick = () => { state.currentPly = idx + 1; renderAll(); };
        cell.appendChild(span);
      }
      row.appendChild(cell);
    }
    el.appendChild(row);
  }
}

export function renderExplain() {
  const moveEl = document.getElementById("explainMove");
  const textEl = document.getElementById("explainText");
  const bestEl = document.getElementById("bestLine");
  if (state.currentPly === 0) {
    moveEl.textContent = "Starting position";
    textEl.innerHTML = "Step through the game to see how each move was judged.";
    bestEl.textContent = "";
    return;
  }
  const a = state.currentAnalysis[state.currentPly - 1];
  const tag = `<span class="classify-tag tag-${a.classification}">${TAG_LABEL[a.classification]}</span>`;
  moveEl.innerHTML = `${Math.ceil(state.currentPly / 2)}${a.color === "w" ? "." : "..."} ${a.san} ${tag}`;

  let msg = "";
  if (a.classification === "brilliant") {
    msg = `A striking move — it gives up material but the engine still likes your position afterwards. That's the kind of sacrifice worth remembering.`;
  } else if (a.classification === "best") {
    msg = `The engine's top choice here. Lost roughly ${(a.cpLoss / 100).toFixed(2)} pawns of evaluation, essentially nothing.`;
  } else if (a.classification === "excellent" || a.classification === "good") {
    msg = `A solid move, close to the engine's preference (${(a.cpLoss / 100).toFixed(2)} pawns behind the top line).`;
  } else {
    msg = `This move cost about <b>${(a.cpLoss / 100).toFixed(2)} pawns</b> of evaluation` +
      (a.bestSan ? ` compared to <b>${a.bestSan}</b>` : "") + ".";
    if (a.missedMate) msg += ` The engine had a forced checkmate here and this move let it slip.`;
    if (a.hanging) msg += ` It also looks like it leaves your <b>${pieceName(a.hanging.piece)}</b> on <b>${a.hanging.square}</b> hanging — the opponent can win it back with nothing in return.`;
  }
  textEl.innerHTML = msg;
  bestEl.textContent = a.bestSan ? "Engine preferred: " + a.bestSan : "";
}

export function renderEvalChart() {
  const canvas = document.getElementById("evalChart");
  const ctx = canvas.getContext("2d");
  const w = (canvas.width = canvas.clientWidth * 2);
  const h = (canvas.height = 140 * 2);
  ctx.clearRect(0, 0, w, h);
  if (state.currentAnalysis.length === 0) return;
  const n = state.currentAnalysis.length;
  const clamp = (v) => Math.max(-900, Math.min(900, v));
  const mid = h / 2;
  ctx.strokeStyle = "#3A4438"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, mid);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1 || 1)) * w;
    const v = clamp(state.currentAnalysis[i].whiteEval);
    ctx.lineTo(x, mid - (v / 900) * (mid - 8));
  }
  ctx.lineTo(w, mid); ctx.closePath();
  ctx.fillStyle = "rgba(241,231,208,.10)"; ctx.fill();
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1 || 1)) * w;
    const v = clamp(state.currentAnalysis[i].whiteEval);
    const y = mid - (v / 900) * (mid - 8);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "#DCD3B9"; ctx.lineWidth = 3; ctx.stroke();
  for (let i = 0; i < n; i++) {
    const cls = state.currentAnalysis[i].classification;
    if (cls === "blunder" || cls === "mistake" || cls === "brilliant") {
      const x = (i / (n - 1 || 1)) * w;
      const v = clamp(state.currentAnalysis[i].whiteEval);
      const y = mid - (v / 900) * (mid - 8);
      ctx.beginPath();
      ctx.arc(x, y, cls === "brilliant" ? 7 : 6, 0, Math.PI * 2);
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(TAG_COLOR_VAR[cls]);
      ctx.fill();
    }
  }
  if (state.currentPly > 0) {
    const x = ((state.currentPly - 1) / (n - 1 || 1)) * w;
    ctx.strokeStyle = "#C9A24B"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
}

export function renderSummary() {
  const counts = { brilliant: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  let accSum = 0;
  state.currentAnalysis.forEach((a) => { counts[a.classification]++; accSum += a.accuracy; });
  const avgAcc = state.currentAnalysis.length ? accSum / state.currentAnalysis.length : 0;
  const row = document.getElementById("summaryRow");
  row.classList.remove("hidden");
  row.innerHTML = "";
  [
    ["Accuracy", avgAcc.toFixed(1) + "%"],
    ["Blunders", counts.blunder],
    ["Mistakes", counts.mistake],
    ["Inaccuracies", counts.inaccuracy],
    ["Brilliant", counts.brilliant],
    ["Best moves", counts.best],
  ].forEach(([k, v]) => {
    const c = document.createElement("div");
    c.className = "stat-chip";
    c.innerHTML = `<div class="v">${v}</div><div class="k">${k}</div>`;
    row.appendChild(c);
  });
}

export function renderAll() {
  renderBoardForPly();
  renderMoveList();
  renderExplain();
  renderEvalChart();
}

export function setupBoardNav() {
  document.getElementById("btnFirst").onclick = () => { state.currentPly = 0; renderAll(); };
  document.getElementById("btnPrev").onclick = () => { state.currentPly = Math.max(0, state.currentPly - 1); renderAll(); };
  document.getElementById("btnNext").onclick = () => { state.currentPly = Math.min(state.currentAnalysis.length, state.currentPly + 1); renderAll(); };
  document.getElementById("btnLast").onclick = () => { state.currentPly = state.currentAnalysis.length; renderAll(); };
  document.addEventListener("keydown", (e) => {
    if (document.getElementById("boardPanel").classList.contains("hidden")) return;
    if (e.key === "ArrowLeft") { state.currentPly = Math.max(0, state.currentPly - 1); renderAll(); }
    if (e.key === "ArrowRight") { state.currentPly = Math.min(state.currentAnalysis.length, state.currentPly + 1); renderAll(); }
  });
  window.addEventListener("resize", () => { if (state.currentAnalysis.length) renderEvalChart(); });
}
