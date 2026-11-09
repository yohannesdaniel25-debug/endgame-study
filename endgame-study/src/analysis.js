// analysis.js
// Pure logic: no DOM access, no network calls, no globals mutated.
// Everything here takes plain inputs and returns plain outputs, which is
// exactly what makes it easy to unit test (see /test/analysis.test.js).
//
// This file depends on the global `Chess` constructor, which comes from
// chess.js (loaded as a plain <script> tag in index.html, before this
// module runs). That's the one non-obvious dependency to know about.

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const PIECE_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const PIECE_GLYPH = {
  w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
  b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
};

export const TAG_LABEL = {
  brilliant: "Brilliant", best: "Best", excellent: "Excellent", good: "Good",
  inaccuracy: "Inaccuracy", mistake: "Mistake", blunder: "Blunder",
};

export const TAG_COLOR_VAR = {
  brilliant: "--c-brilliant", best: "--c-best", excellent: "--c-excellent",
  good: "--c-good", inaccuracy: "--c-inaccuracy", mistake: "--c-mistake", blunder: "--c-blunder",
};

export function pieceName(p) {
  return { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" }[p] || p;
}

export function uciOfMove(mv) {
  return mv.from + mv.to + (mv.promotion || "");
}

export function uciToSan(fen, uci) {
  if (!uci) return null;
  try {
    const c = new Chess(fen);
    const from = uci.slice(0, 2), to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    const res = c.move({ from, to, promotion });
    return res ? res.san : null;
  } catch (e) {
    return null;
  }
}

// After a move (fenAfter = position with the opponent to move), find a piece
// of the mover's that the opponent can capture with no legal recapture.
export function detectHanging(fenAfter) {
  const c = new Chess(fenAfter);
  const oppMoves = c.moves({ verbose: true }).filter(m => m.flags.includes("c") || m.flags.includes("e"));
  let worst = null;
  for (const om of oppMoves) {
    const capturedType = om.captured;
    if (!capturedType) continue;
    const val = PIECE_VAL[capturedType] || 0;
    if (val < 3) continue; // ignore pawns here, too noisy to be a useful note
    const c2 = new Chess(fenAfter);
    c2.move({ from: om.from, to: om.to, promotion: om.promotion });
    const recap = c2.moves({ verbose: true }).some(m2 =>
      (m2.flags.includes("c") || m2.flags.includes("e")) && m2.to === om.to);
    if (!recap) {
      if (!worst || val > worst.val) worst = { val, square: om.to, piece: capturedType };
    }
  }
  return worst;
}

// Rough "is this a sacrifice that still holds together" heuristic, used to
// upgrade a Best move to Brilliant. Deliberately conservative.
export function detectSacrifice(mv, fenAfter, moverEvalAfter) {
  const movedVal = PIECE_VAL[mv.piece] || 0;
  if (movedVal < 3) return false;
  const c = new Chess(fenAfter);
  const oppCaptures = c.moves({ verbose: true }).filter(m =>
    (m.flags.includes("c") || m.flags.includes("e")) && m.to === mv.to);
  if (oppCaptures.length === 0) return false;
  if (movedVal < 2) return false;
  return moverEvalAfter >= -60;
}

export function winPercent(cp) {
  const clipped = Math.max(-2000, Math.min(2000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clipped)) - 1);
}

export function moveAccuracy(wpBefore, wpAfter) {
  const diff = Math.max(0, wpBefore - wpAfter);
  const acc = 103.1668 * Math.exp(-0.04354 * diff) - 3.1668;
  return Math.max(0, Math.min(100, acc));
}

export function classify(cpLoss, playedIsBest) {
  if (playedIsBest && cpLoss <= 6) return "best";
  if (cpLoss <= 20) return "excellent";
  if (cpLoss <= 55) return "good";
  if (cpLoss <= 110) return "inaccuracy";
  if (cpLoss <= 280) return "mistake";
  return "blunder";
}

export function phaseOf(ply, totalPlies) {
  if (ply <= 20) return "opening";
  if (ply <= Math.max(20, totalPlies - 20)) return "middlegame";
  return "endgame";
}
