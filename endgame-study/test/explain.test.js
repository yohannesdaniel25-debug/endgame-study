// explain.test.js — checks that explainMove() says the right *kind* of thing
// for positions where the reason is unambiguous.

import { describe, it, expect } from "vitest";
import { explainMove, formatLine, describeTrade, playLine, threatsAgainst } from "../src/explain.js";

// Play SAN moves from the start and return what explainMove() needs for the
// last one.
function setup(sans) {
  const c = new Chess();
  let fenBefore, mv;
  for (const san of sans) {
    fenBefore = c.fen();
    mv = c.move(san);
    if (!mv) throw new Error("illegal move in test: " + san);
  }
  return { fenBefore, fenAfter: c.fen(), mv };
}
const text = (r) => r.reasons.join(" ");

describe("formatLine", () => {
  it("numbers a line that starts with Black", () => {
    const { fenAfter } = setup(["e4", "e5", "Nf3", "Qh4"]);
    const { moves } = playLine(fenAfter, ["f3h4", "g8f6"]);
    expect(formatLine(fenAfter, moves)).toBe("3.Nxh4 Nf6");
  });

  it("uses '...' when the line starts with Black", () => {
    const { fenAfter } = setup(["e4"]);
    const { moves } = playLine(fenAfter, ["e7e5", "g1f3"]);
    expect(formatLine(fenAfter, moves)).toBe("1...e5 2.Nf3");
  });
});

describe("describeTrade", () => {
  it("cancels out equal trades", () => {
    expect(describeTrade({ gained: ["n"], lost: ["n"] })).toBe(null);
  });
  it("names the exchange", () => {
    expect(describeTrade({ gained: ["b"], lost: ["r"] })).toMatch(/loses the exchange/);
  });
  it("counts duplicates", () => {
    expect(describeTrade({ gained: ["p", "p"], lost: [] })).toBe("wins two pawns");
  });
});

describe("threatsAgainst", () => {
  it("sees a bishop attacked by a pawn", () => {
    const { fenAfter } = setup(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
    const t = threatsAgainst(fenAfter, "w");
    expect(t.some((x) => x.square === "b5" && x.piece === "b")).toBe(true);
  });
});

describe("explainMove", () => {
  it("explains a hung queen through the engine's refutation", () => {
    const { fenBefore, fenAfter, mv } = setup(["e4", "e5", "Nf3", "Qh4"]);
    const r = explainMove({
      fenBefore, fenAfter, mv, classification: "blunder",
      bestPv: ["b8c6"], replyPv: ["f3h4"],
      actualReply: { from: "f3", to: "h4", san: "Nxh4" },
    });
    expect(text(r)).toMatch(/runs into <b>Nxh4<\/b>.*Black loses a queen/);
    expect(text(r)).toMatch(/puts the queen on h4/);
    expect(text(r)).toMatch(/White found it/);
    expect(text(r)).toMatch(/Better was <b>Nc6<\/b>/);
  });

  it("notices when the opponent missed the refutation", () => {
    const { fenBefore, fenAfter, mv } = setup(["e4", "e5", "Nf3", "Qh4"]);
    const r = explainMove({
      fenBefore, fenAfter, mv, classification: "blunder",
      bestPv: ["b8c6"], replyPv: ["f3h4"],
      actualReply: { from: "d2", to: "d4", san: "d4" },
    });
    expect(text(r)).toMatch(/White missed it and played <b>d4<\/b>/);
  });

  it("explains allowing mate", () => {
    const { fenBefore, fenAfter, mv } = setup(["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6"]);
    const r = explainMove({
      fenBefore, fenAfter, mv, classification: "blunder",
      bestPv: ["g7g6"], replyPv: ["h5f7"],
      after: { isMate: true, mateIn: 1 },
    });
    expect(text(r)).toMatch(/allows a forced checkmate: White mates in 1 with 4.Qxf7#/);
  });

  it("explains moving an attacked piece to safety", () => {
    const { fenBefore, fenAfter, mv } = setup(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4"]);
    const r = explainMove({
      fenBefore, fenAfter, mv, classification: "best",
      bestPv: ["b5a4"], replyPv: ["g8f6"],
    });
    expect(text(r)).toMatch(/moves the attacked bishop out of danger/);
  });

  it("spots a knight fork with check", () => {
    const fenBefore = "r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1";
    const c = new Chess(fenBefore);
    const mv = c.move("Nc7+");
    const r = explainMove({
      fenBefore, fenAfter: c.fen(), mv, classification: "best",
      bestPv: ["b5c7"], replyPv: ["e8d7", "c7a8"],
    });
    expect(text(r)).toMatch(/fork: check.*rook on a8/);
    expect(text(r)).toMatch(/wins material.*White wins a rook/);
  });

  it("explains why a brilliant sacrifice is brilliant", () => {
    const fenBefore = "4k3/8/3p4/8/8/2N5/8/4K3 w - - 0 1";
    const c = new Chess(fenBefore);
    const mv = c.move("Ne4");
    const r = explainMove({
      fenBefore, fenAfter: c.fen(), mv, classification: "brilliant",
      bestPv: ["c3e4"], replyPv: [],
      brilliance: { kind: "wins", offered: { square: "e4", piece: "n" }, altEval: 10, sacEval: 320 },
    });
    expect(text(r)).toMatch(/sacrifices the knight on e4 to win: .*\(\+0\.10\).*\(\+3\.20\)/);
  });

  it("calls checkmate checkmate", () => {
    const { fenBefore, fenAfter, mv } = setup(["f3", "e5", "g4", "Qh4#"]);
    const r = explainMove({ fenBefore, fenAfter, mv, classification: "best", bestPv: ["d8h4"] });
    expect(r.reasons).toEqual(["<b>Qh4#</b> is checkmate."]);
  });

  it("gives a positional reason when no material is lost", () => {
    const { fenBefore, fenAfter, mv } = setup(["e4", "e5", "Ke2"]);
    const r = explainMove({
      fenBefore, fenAfter, mv, classification: "inaccuracy",
      bestPv: ["g1f3"], replyPv: ["g8f6"],
    });
    expect(text(r)).toMatch(/gives up the right to castle/);
    expect(text(r)).toMatch(/Better was <b>Nf3<\/b>/);
  });
});
