// explain.js — turns raw engine output into plain-English reasons.
//
// The engine only gives us numbers plus a "principal variation" (PV): the
// line of moves it expects with best play. The *why* behind a verdict is
// almost always hidden in that line — e.g. "after your move, Black plays
// Bxf2+ and wins a piece". This module replays those lines with chess.js and
// describes what happens in them, along with a few simple threat checks.
//
// Pure logic like analysis.js: no DOM, no engine calls. Depends on the
// global `Chess` from chess.js.

import { PIECE_VAL, pieceName, uciOfMove, threatsAgainst } from "./analysis.js";

export { threatsAgainst };

const SIDE = { w: "White", b: "Black" };
const other = (c) => (c === "w" ? "b" : "w");
const NUM_WORD = ["", "a", "two", "three", "four", "five", "six", "seven", "eight"];

function loadChess(fen) {
  const c = new Chess();
  return c.load(fen) ? c : null;
}

function playUci(c, uci) {
  return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

// Replay up to `maxPlies` moves of a UCI line from `fen`. If the cut-off
// lands in the middle of a trade (the next move is a capture), keep going so
// the material count isn't misleading. Stops at the first illegal move.
export function playLine(fen, uciMoves = [], maxPlies = 6) {
  const c = loadChess(fen);
  const moves = [];
  if (!c) return { moves };
  for (let i = 0; i < uciMoves.length && i < 12; i++) {
    const u = uciMoves[i];
    if (i >= maxPlies) {
      const next = c.moves({ verbose: true }).find((m) => m.from === u.slice(0, 2) && m.to === u.slice(2, 4));
      if (!next || !next.captured) break;
    }
    const res = playUci(c, u);
    if (!res) break;
    moves.push(res);
  }
  return { moves };
}

// "12...Bxf2+ 13.Kxf2 Ng4+"
export function formatLine(fen, moves) {
  const parts = fen.split(" ");
  let turn = parts[1];
  let num = parseInt(parts[5], 10) || 1;
  return moves.map((m, i) => {
    let s;
    if (turn === "w") s = `${num}.${m.san}`;
    else s = i === 0 ? `${num}...${m.san}` : m.san;
    if (turn === "b") num++;
    turn = other(turn);
    return s;
  }).join(" ");
}

// Which pieces did `color` win and lose over a line of moves?
export function tally(moves, color) {
  const gained = [], lost = [];
  let promoted = false;
  for (const m of moves) {
    if (m.captured) (m.color === color ? gained : lost).push(m.captured);
    if (m.promotion && m.color === color) promoted = true;
  }
  const val = (list) => list.reduce((s, p) => s + (PIECE_VAL[p] || 0), 0);
  return { gained, lost, promoted, net: val(gained) - val(lost) };
}

function listPieces(list) {
  const counts = {};
  list.forEach((p) => { counts[p] = (counts[p] || 0) + 1; });
  const items = Object.keys(counts)
    .sort((a, b) => PIECE_VAL[b] - PIECE_VAL[a])
    .map((p) => `${NUM_WORD[counts[p]] || counts[p]} ${pieceName(p)}${counts[p] > 1 ? "s" : ""}`);
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

// "wins a knight", "loses the exchange", "gives up a rook for only a bishop"
export function describeTrade({ gained, lost }) {
  const g = [...gained], l = [...lost];
  for (const p of [...g]) {
    const j = l.indexOf(p);
    if (j >= 0) { l.splice(j, 1); g.splice(g.indexOf(p), 1); }
  }
  const val = (list) => list.reduce((s, p) => s + (PIECE_VAL[p] || 0), 0);
  if (!g.length && !l.length) return null;
  if (!l.length) return `wins ${listPieces(g)}`;
  if (!g.length) return `loses ${listPieces(l)}`;
  const minor = (x) => x.length === 1 && (x[0] === "n" || x[0] === "b");
  if (l.length === 1 && l[0] === "r" && minor(g)) return "loses the exchange (a rook for a minor piece)";
  if (g.length === 1 && g[0] === "r" && minor(l)) return "wins the exchange (a rook for a minor piece)";
  const net = val(g) - val(l);
  if (net > 0) return `wins ${listPieces(g)} for ${listPieces(l)}`;
  if (net < 0) return `gives up ${listPieces(l)} for only ${listPieces(g)}`;
  return `trades ${listPieces(l)} for ${listPieces(g)}`;
}

// Mover-perspective eval as text: "+1.25", "-2.10", or a forced mate.
function fmtEval(cp) {
  if (cp >= 20000) return "forced mate";
  if (cp <= -20000) return "getting mated";
  return (cp >= 0 ? "+" : "") + (cp / 100).toFixed(2);
}

function moveFacts(mv) {
  const parts = [];
  if (mv.flags.includes("k")) parts.push("castles kingside");
  if (mv.flags.includes("q")) parts.push("castles queenside");
  if (mv.captured) parts.push(`takes a ${pieceName(mv.captured)}`);
  if (mv.promotion) parts.push(`promotes to a ${pieceName(mv.promotion)}`);
  if (mv.san.includes("+")) parts.push("gives check");
  if (!parts.length) return null;
  const last = parts.pop();
  return `<b>${mv.san}</b> ${parts.length ? parts.join(", ") + " and " : ""}${last}.`;
}

function positionalNotes(fenBefore, mv, ply) {
  const notes = [];
  const me = SIDE[mv.color], them = SIDE[other(mv.color)];
  const castling = fenBefore.split(" ")[2] || "-";
  const canCastle = (mv.color === "w" ? /[KQ]/ : /[kq]/).test(castling);
  const castled = mv.flags.includes("k") || mv.flags.includes("q");
  if (mv.piece === "k" && !castled && canCastle) {
    notes.push(`Moving the king gives up the right to castle, so ${me}'s king stays stuck in the center.`);
  }
  const home = mv.color === "w" ? "1" : "8";
  if (mv.piece === "r" && canCastle && mv.from[1] === home && (mv.from[0] === "a" || mv.from[0] === "h")) {
    notes.push(`Moving this rook gives up castling on the ${mv.from[0] === "h" ? "kingside" : "queenside"}.`);
  }
  if (mv.piece === "q" && ply < 14) {
    notes.push(`Bringing the queen out this early lets ${them} develop pieces while attacking it, gaining time.`);
  }
  if (mv.piece === "n" && (mv.to[0] === "a" || mv.to[0] === "h")) {
    notes.push(`A knight on the edge of the board controls far fewer squares than one in the center.`);
  }
  if (mv.piece === "p") {
    const c = loadChess(fenBefore);
    const board = c ? c.board() : [];
    let kingSq = null;
    board.forEach((row, r) => row.forEach((sq, f) => {
      if (sq && sq.type === "k" && sq.color === mv.color) kingSq = "abcdefgh"[f] + (8 - r);
    }));
    if (kingSq && kingSq[1] === home && "abcfgh".includes(kingSq[0])) {
      const df = Math.abs("abcdefgh".indexOf(mv.from[0]) - "abcdefgh".indexOf(kingSq[0]));
      if (df <= 1) notes.push(`It pushes one of the pawns sheltering ${me}'s king, opening lines toward it.`);
    }
  }
  return notes;
}

// Main entry point. Returns { reasons: [html sentences], bestLine, replyLine }.
// All interpolated text is SAN, square names or fixed words, so it's safe as HTML.
export function explainMove({
  fenBefore, fenAfter, mv, classification,
  bestPv = [], replyPv = [], before = {}, after = {},
  actualReply = null, ply = 0, brilliance = null,
}) {
  const me = SIDE[mv.color], them = SIDE[other(mv.color)];
  const bad = ["inaccuracy", "mistake", "blunder"].includes(classification);
  const playedIsBest = bestPv[0] === uciOfMove(mv);
  const reasons = [];

  const rep = playLine(fenAfter, replyPv);
  const replyLine = rep.moves.length ? formatLine(fenAfter, rep.moves) : null;
  const repTally = tally(rep.moves, mv.color);
  const best = playLine(fenBefore, bestPv);
  const bestLine = best.moves.length ? formatLine(fenBefore, best.moves) : null;
  const bestSan = best.moves[0] ? best.moves[0].san : null;
  const bestTally = tally(best.moves, mv.color);

  if (mv.san.includes("#")) {
    return { reasons: [`<b>${mv.san}</b> is checkmate.`], bestLine, replyLine };
  }

  const fact = moveFacts(mv);
  if (fact) reasons.push(fact);

  // --- forced mates trump everything else ---
  let mateNote = false;
  if (after.isMate && after.mateIn > 0) {
    reasons.push(`This allows a forced checkmate: ${them} mates in ${after.mateIn}${replyLine ? ` with ${replyLine}` : ""}.`);
    mateNote = true;
  } else if (before.isMate && before.mateIn > 0 && !(after.isMate && after.mateIn < 0)) {
    reasons.push(`${me} had a forced checkmate in ${before.mateIn} and let it slip${bestLine ? `: ${bestLine}` : ""}.`);
    mateNote = true;
  } else if (after.isMate && after.mateIn < 0) {
    reasons.push(`${me} now has a forced checkmate in ${-after.mateIn}${replyLine ? `: ${replyLine}` : ""}.`);
    mateNote = true;
  }

  // Threat bookkeeping (by square) before and after the move.
  const onMeBefore = threatsAgainst(fenBefore, mv.color);
  const onMeAfter = threatsAgainst(fenAfter, mv.color);
  const onThemBefore = threatsAgainst(fenBefore, other(mv.color));
  const onThemAfter = threatsAgainst(fenAfter, other(mv.color));
  const hasSq = (list, sq) => list.some((t) => t.square === sq);

  if (classification === "brilliant" && brilliance) {
    const off = brilliance.offered;
    const what = off ? `the ${pieceName(off.piece)} on ${off.square}` : "material";
    if (brilliance.kind === "equalizes") {
      reasons.push(`It sacrifices ${what} to save the game: every other move leaves ${me} losing (${fmtEval(brilliance.altEval)}), but this one gets back to level (${fmtEval(brilliance.sacEval)}).`);
    } else {
      reasons.push(`It sacrifices ${what} to win: every other move keeps the game about even (${fmtEval(brilliance.altEval)}), but this one gives ${me} a winning position (${fmtEval(brilliance.sacEval)}).`);
    }
  }

  if (!bad) {
    // What did the move fix?
    for (const t of onMeBefore) {
      const nowAt = t.square === mv.from ? mv.to : t.square;
      if (hasSq(onMeAfter, nowAt)) continue;
      if (t.square === mv.from) reasons.push(`It moves the attacked ${pieceName(t.piece)} out of danger.`);
      else if (mv.to === t.from) reasons.push(`It removes the ${pieceName(t.by)} that was attacking the ${pieceName(t.piece)} on ${t.square}.`);
      else reasons.push(`It deals with the threat to the ${pieceName(t.piece)} on ${t.square}.`);
      break;
    }
    // What does the move threaten?
    const fresh = onThemAfter.filter((t) => !hasSq(onThemBefore, t.square) && t.from === mv.to);
    const named = (t) => `${pieceName(t.piece)} on ${t.square}`;
    if (mv.san.includes("+") && fresh.length) {
      reasons.push(`It's a fork: check, and at the same time it attacks the ${named(fresh[0])}.`);
    } else if (fresh.length >= 2) {
      reasons.push(`It's a fork: it attacks the ${named(fresh[0])} and the ${named(fresh[1])} at once.`);
    } else if (fresh.length === 1) {
      reasons.push(`It attacks the ${named(fresh[0])}.`);
    }
    // What does the expected line win or cost?
    const trade = describeTrade(repTally);
    if (!mateNote && trade && repTally.net >= 1) {
      reasons.push(`It wins material: in the expected line ${replyLine}, ${me} ${trade}.`);
    } else if (!mateNote && trade && repTally.net <= -1) {
      if (classification === "brilliant") {
        reasons.push(`In the expected line (${replyLine}) ${me} ${trade}, and the attack makes up for it.`);
      } else {
        reasons.push(`${me} ${trade} in the expected line (${replyLine}), but every alternative was at least as bad.`);
      }
    }
    if (!playedIsBest && bestSan && classification !== "best" && classification !== "brilliant") {
      reasons.push(`<b>${bestSan}</b> was slightly more precise${bestLine ? `: ${bestLine}` : ""}.`);
    }
    if (reasons.length === 0 && replyLine) {
      reasons.push(`A steady move that keeps the balance. Expected continuation: ${replyLine}.`);
    }
    return { reasons, bestLine, replyLine };
  }

  // --- bad moves: what goes wrong? ---
  const replySan = rep.moves[0] ? rep.moves[0].san : null;
  const losesMaterial = repTally.net <= -1;
  if (!mateNote && losesMaterial) {
    reasons.push(`It runs into <b>${replySan}</b>: after ${replyLine}, ${me} ${describeTrade(repTally)}.`);
    const ignored = onMeBefore.find((t) => t.square !== mv.from && hasSq(onMeAfter, t.square));
    const exposed = onMeAfter.find((t) => !hasSq(onMeBefore, t.square === mv.to ? mv.from : t.square));
    if (ignored) {
      reasons.push(`The ${pieceName(ignored.piece)} on ${ignored.square} was already under attack, and this move doesn't address that.`);
    } else if (exposed && exposed.square === mv.to) {
      reasons.push(`It puts the ${pieceName(exposed.piece)} on ${exposed.square}, where it can simply be taken.`);
    } else if (exposed) {
      reasons.push(`It leaves the ${pieceName(exposed.piece)} on ${exposed.square} exposed to the ${pieceName(exposed.by)} on ${exposed.from}.`);
    }
  } else if (!mateNote) {
    if (replySan && replySan.includes("+")) {
      reasons.push(`It lets ${them} start with <b>${replySan}</b>, and the checks keep coming: ${replyLine}.`);
    }
    const notes = positionalNotes(fenBefore, mv, ply);
    notes.forEach((n) => reasons.push(n));
    if (!notes.length && !(replySan && replySan.includes("+"))) {
      reasons.push(`Nothing is lost right away, but ${them}'s best reply <b>${replySan || "?"}</b> leaves them with clearly better piece activity${replyLine ? ` (${replyLine})` : ""}.`);
    }
  }

  // Did the opponent actually punish it?
  if ((losesMaterial || (after.isMate && after.mateIn > 0)) && actualReply && replyPv[0]) {
    if (uciOfMove(actualReply) === replyPv[0]) reasons.push(`${them} found it.`);
    else reasons.push(`${them} missed it and played <b>${actualReply.san}</b> instead.`);
  }

  // What should have been played?
  if (!playedIsBest && bestSan) {
    const bestTrade = describeTrade(bestTally);
    if (bestTrade && bestTally.net >= 1 && bestTally.net > repTally.net) {
      reasons.push(`<b>${bestSan}</b> was the move: it ${bestTrade} (${bestLine}).`);
    } else if (!mateNote || !(before.isMate && before.mateIn > 0)) {
      reasons.push(`Better was <b>${bestSan}</b>${bestLine ? `, with the idea ${bestLine}` : ""}.`);
    }
  }

  return { reasons, bestLine, replyLine };
}
