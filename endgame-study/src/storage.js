// storage.js — the only module allowed to touch localStorage directly.
// Keeping that in one place means when this becomes a real backend later
// (see the README roadmap), this is the one file that needs to change.

import { state } from "./state.js";
import { phaseOf } from "./analysis.js";

const HISTORY_KEY = "endgameStudyHistory_v1";

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

export function saveHistoryList(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

export function saveGameToHistory() {
  const counts = { brilliant: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  const byPhase = { opening: 0, middlegame: 0, endgame: 0 };
  const byPiece = {};
  let accSum = 0;
  state.currentAnalysis.forEach((a) => {
    counts[a.classification]++;
    accSum += a.accuracy;
    if (a.color === state.myColor && (a.classification === "mistake" || a.classification === "blunder")) {
      byPhase[phaseOf(a.ply, state.currentAnalysis.length)]++;
      byPiece[a.piece] = (byPiece[a.piece] || 0) + 1;
    }
  });
  const entry = {
    id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    when: Date.now(),
    opponent: state.currentGameMeta.opponent || "?",
    date: state.currentGameMeta.date || "",
    result: state.currentGameMeta.result || "",
    timeClass: state.currentGameMeta.timeClass || "",
    myColor: state.myColor,
    accuracy: state.currentAnalysis.length ? accSum / state.currentAnalysis.length : 0,
    counts, byPhase, byPiece,
    plies: state.currentAnalysis.length,
  };
  const list = loadHistory();
  list.push(entry);
  saveHistoryList(list);
}
