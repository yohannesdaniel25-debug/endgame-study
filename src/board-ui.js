// board-ui.js — everything about drawing the chessboard itself.
// This module owns the #board element; nothing outside it should
// reach into that DOM node directly.

import { state } from "./state.js";
import { PIECE_GLYPH } from "./analysis.js";

function expandFenRow(row) {
  const out = [];
  for (const ch of row) {
    if (/[1-8]/.test(ch)) {
      for (let i = 0; i < parseInt(ch, 10); i++) out.push(null);
    } else {
      out.push(ch);
    }
  }
  return out;
}

export function renderBoardOnly(fen, color) {
  const boardEl = document.getElementById("board");
  boardEl.innerHTML = "";
  const rows = fen.split(" ")[0].split("/");
  const rankOrder = color === "w" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const fileOrder = color === "w" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  for (const r of rankOrder) {
    const rowChars = expandFenRow(rows[r]);
    for (const f of fileOrder) {
      const sq = document.createElement("div");
      const isLight = (r + f) % 2 === 0;
      sq.className = "sq " + (isLight ? "light" : "dark");
      const ch = rowChars[f];
      if (ch) {
        const isWhite = ch === ch.toUpperCase();
        const glyph = PIECE_GLYPH[isWhite ? "w" : "b"][ch.toLowerCase()];
        sq.innerHTML = `<span class="${isWhite ? "pc-w" : "pc-b"}">${glyph}</span>`;
      }
      boardEl.appendChild(sq);
    }
  }
}

function highlightSquares(from, to) {
  const files = "abcdefgh";
  const order = state.myColor === "w" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const boardEl = document.getElementById("board");
  const cells = boardEl.children;
  function idxOf(sqName) {
    const file = files.indexOf(sqName[0]);
    const rank = 8 - parseInt(sqName[1], 10);
    return order.indexOf(rank) * 8 + order.indexOf(file);
  }
  const fi = idxOf(from), ti = idxOf(to);
  if (cells[fi]) cells[fi].classList.add("from");
  if (cells[ti]) cells[ti].classList.add("to");
}

export function renderBoardForPly() {
  const fen = state.currentFens[state.currentPly];
  renderBoardOnly(fen, state.myColor);
  if (state.currentPly > 0) {
    const a = state.currentAnalysis[state.currentPly - 1];
    highlightSquares(a.from, a.to);
  }
  document.getElementById("plyBadge").textContent = state.currentPly === 0 ? "start" : "ply " + state.currentPly;
  const turn = fen.split(" ")[1] === "w" ? "White to move" : "Black to move";
  document.getElementById("turnBadge").textContent = turn;
}
