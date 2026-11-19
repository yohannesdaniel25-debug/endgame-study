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

// Pieces of `victim` (knight or bigger) that the other side could win right
// now if it were their turn: either undefended, or attacked by something
// cheaper. When it isn't actually the attacker's turn we flip the side to
// move — a "what if they could move again" check, standard for spotting threats.
export function threatsAgainst(fen, victim) {
  const attacker = victim === "w" ? "b" : "w";
  const parts = fen.split(" ");
  if (parts[1] !== attacker) { parts[1] = attacker; parts[3] = "-"; }
  const base = parts.join(" ");
  const c = new Chess();
  if (!c.load(base)) return [];
  const found = new Map();
  for (const m of c.moves({ verbose: true })) {
    if (!m.captured || m.captured === "k") continue;
    const val = PIECE_VAL[m.captured] || 0;
    if (val < 3) continue;
    const c2 = new Chess();
    c2.load(base);
    c2.move({ from: m.from, to: m.to, promotion: m.promotion });
    const defended = c2.moves({ verbose: true }).some((r) => r.to === m.to && r.captured);
    const gain = defended ? val - (PIECE_VAL[m.piece] || 0) : val;
    if (gain <= 0) continue;
    const prev = found.get(m.to);
    if (!prev || gain > prev.gain) {
      found.set(m.to, { square: m.to, piece: m.captured, by: m.piece, from: m.from, gain });
    }
  }
  return [...found.values()];
}

// Is this move a real piece sacrifice? After the move (fenAfter, opponent to
// move), the opponent must be able to win a knight-or-bigger outright, for
// more than the mover just captured. That rules out even trades (a defended
// piece taken by an equal piece) and ordinary recaptures.
// Returns the piece being offered ({ square, piece, gain, ... }) or null.
export function detectSacrifice(mv, fenAfter) {
  const mover = fenAfter.split(" ")[1] === "w" ? "b" : "w";
  const justWon = PIECE_VAL[mv.captured] || 0;
  let offered = null;
  for (const t of threatsAgainst(fenAfter, mover)) {
    if (t.gain > justWon && (!offered || t.gain > offered.gain)) offered = t;
  }
  return offered;
}

// Brilliant = a sound piece sacrifice that changes the outcome compared with
// the best NON-sacrificing move:
//   "equalizes": every other move leaves the mover losing; the sac holds level
//   "wins":      every other move keeps it about even; the sac is winning
// Evals are centipawns from the mover's point of view (100 = one pawn).
// Tune these numbers to make Brilliant rarer or more common.
export const BRILLIANT = {
  MAX_CP_LOSS: 20,   // the sac itself must be (near-)best
  LOSING: -150,      // alternative at or below this = losing
  EQUALIZED: -50,    // sac at or above this = back to level
  EVEN_HIGH: 100,    // alternative between LOSING and this = "about even"
  WINNING: 200,      // sac at or above this = winning
};

export function brilliantKind({ cpLoss, altEval, sacEval }) {
  if (altEval == null || cpLoss > BRILLIANT.MAX_CP_LOSS) return null;
  if (altEval <= BRILLIANT.LOSING && sacEval >= BRILLIANT.EQUALIZED) return "equalizes";
  if (altEval > BRILLIANT.LOSING && altEval <= BRILLIANT.EVEN_HIGH && sacEval >= BRILLIANT.WINNING) return "wins";
  return null;
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
