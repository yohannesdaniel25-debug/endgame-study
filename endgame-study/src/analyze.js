// analyze.js — orchestrates the engine + pure analysis functions into the
// full-game review pipeline. This is the async loop: one engine call per
// position, ~N+1 calls for an N-move game.

import { state } from "./state.js";
import { Engine } from "./engine.js";
import {
  START_FEN, uciOfMove, uciToSan, detectHanging, detectSacrifice,
  winPercent, moveAccuracy, classify,
} from "./analysis.js";
import { renderAll, renderSummary } from "./review-ui.js";
import { saveGameToHistory } from "./storage.js";

function getEngine() {
  if (!state.engine) state.engine = new Engine();
  return state.engine;
}

export function setupAnalyze() {
  document.getElementById("analyzeBtn").onclick = runAnalysis;
}

async function runAnalysis() {
  if (state.currentMoves.length === 0) return;
  const btn = document.getElementById("analyzeBtn");
  btn.disabled = true;
  const movetime = parseInt(document.getElementById("speedSelect").value, 10);
  const eng = getEngine();
  const progWrap = document.getElementById("progressWrap");
  const progFill = document.getElementById("progressFill");
  const progLabel = document.getElementById("progressLabel");
  progWrap.classList.add("on");

  let fen = START_FEN;
  state.currentFens = [START_FEN];
  state.currentAnalysis = [];
  let prev = await eng.analyze(fen, movetime);

  for (let i = 0; i < state.currentMoves.length; i++) {
    const mv = state.currentMoves[i];
    const scratch = new Chess(fen);
    scratch.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
    const fenAfter = scratch.fen();

    const after = await eng.analyze(fenAfter, movetime);
    const moverEvalBefore = prev.cpEquiv;
    const moverEvalAfter = -after.cpEquiv;
    const cpLoss = Math.max(0, moverEvalBefore - moverEvalAfter);
    const playedUci = uciOfMove(mv);
    const playedIsBest = prev.bestUci && playedUci === prev.bestUci;
    let cls = classify(cpLoss, playedIsBest);

    let missedMate = false;
    if (prev.isMate && prev.mateIn > 0 && cls !== "best") {
      missedMate = true;
      if (cls !== "blunder" && cls !== "mistake") cls = "mistake";
    }
    if (cls === "best" && detectSacrifice(mv, fenAfter, moverEvalAfter)) cls = "brilliant";

    const hanging = ["inaccuracy", "mistake", "blunder"].includes(cls) ? detectHanging(fenAfter) : null;
    const bestSan = !playedIsBest && prev.bestUci ? uciToSan(fen, prev.bestUci) : null;

    const wpBefore = winPercent(moverEvalBefore);
    const wpAfter = winPercent(moverEvalAfter);
    const accuracy = moveAccuracy(wpBefore, wpAfter);

    state.currentAnalysis.push({
      ply: i, san: mv.san, color: mv.color, piece: mv.piece,
      from: mv.from, to: mv.to,
      cpBefore: moverEvalBefore, cpAfter: moverEvalAfter, cpLoss,
      classification: cls, bestSan, missedMate, hanging, accuracy,
      whiteEval: mv.color === "w" ? moverEvalAfter : -moverEvalAfter,
    });

    fen = fenAfter;
    state.currentFens.push(fen);
    prev = after;

    const pct = Math.round(((i + 1) / state.currentMoves.length) * 100);
    progFill.style.width = pct + "%";
    progLabel.textContent = i + 1 + " / " + state.currentMoves.length;
    await new Promise((r) => setTimeout(r, 0)); // yield so the UI can repaint
  }

  progWrap.classList.remove("on");
  btn.disabled = false;
  document.getElementById("boardPanel").classList.remove("hidden");
  state.currentPly = 0;
  renderAll();
  renderSummary();
  saveGameToHistory();
  document.getElementById("boardPanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
