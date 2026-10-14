// analysis.test.js
//
// A unit test calls one function with a chosen input and asserts (expects)
// a specific output. Vocabulary used below:
//   describe(name, fn)  groups related tests under a heading
//   it(name, fn)        one test case; the name should read like a sentence
//   expect(x).toBe(y)   fails the test unless x === y
//   toBeCloseTo(y, n)   for decimals, since 0.1 + 0.2 !== 0.3 in floating point
//
// Good tests focus on three kinds of input: a normal case, the edges (the
// exact numbers where behavior flips), and invalid or unusual input.

import { describe, it, expect } from "vitest";
import {
  START_FEN,
  TAG_LABEL,
  TAG_COLOR_VAR,
  pieceName,
  uciOfMove,
  uciToSan,
  detectHanging,
  detectSacrifice,
  winPercent,
  moveAccuracy,
  classify,
  phaseOf,
} from "../src/analysis.js";

/* ------------------------------------------------------------------ */
describe("classify", () => {
  // classify() turns "centipawns lost" (100 cp = one pawn) into a label.
  // The thresholds are: best <= 6 (only if it was the engine's move),
  // excellent <= 20, good <= 55, inaccuracy <= 110, mistake <= 280,
  // anything bigger is a blunder.

  it("calls the engine's own move with tiny loss 'best'", () => {
    expect(classify(0, true)).toBe("best");
  });

  it("never calls a move 'best' unless it matched the engine's move", () => {
    // Zero loss, but a different move than the engine's top choice.
    expect(classify(0, false)).toBe("excellent");
  });

  it("treats the 'best' cutoff of 6 cp as inclusive, 7 cp as not best", () => {
    expect(classify(6, true)).toBe("best");
    expect(classify(7, true)).toBe("excellent");
  });

  // Boundary testing: for each threshold, test the last value inside the
  // band and the first value outside it. Off-by-one bugs (< vs <=) hide here.
  it.each([
    [20, "excellent"],
    [21, "good"],
    [55, "good"],
    [56, "inaccuracy"],
    [110, "inaccuracy"],
    [111, "mistake"],
    [280, "mistake"],
    [281, "blunder"],
  ])("cpLoss %i is a %s", (cpLoss, expected) => {
    expect(classify(cpLoss, false)).toBe(expected);
  });

  it("calls a huge loss a blunder", () => {
    expect(classify(30000, false)).toBe("blunder");
  });

  it("only ever returns a label the UI knows how to display", () => {
    // Guards against a typo in classify() that would break the UI lookup.
    for (let cp = 0; cp <= 400; cp++) {
      expect(TAG_LABEL).toHaveProperty(classify(cp, false));
      expect(TAG_LABEL).toHaveProperty(classify(cp, true));
    }
  });
});

/* ------------------------------------------------------------------ */
describe("winPercent", () => {
  // Converts an evaluation in centipawns into a 0 to 100 win chance using a
  // logistic (S-shaped) curve. Equal position = 50%.

  it("is exactly 50% for an equal position", () => {
    expect(winPercent(0)).toBe(50);
  });

  it("gives about 59% for being a pawn (100 cp) up", () => {
    // By hand: 50 + 50 * (2 / (1 + e^(-0.368)) - 1) = 59.1
    expect(winPercent(100)).toBeCloseTo(59.1, 1);
  });

  it("is symmetric: +x and -x always add up to 100%", () => {
    for (const cp of [10, 75, 300, 900, 1500]) {
      expect(winPercent(cp) + winPercent(-cp)).toBeCloseTo(100, 10);
    }
  });

  it("never decreases as the evaluation improves", () => {
    let previous = winPercent(-2000);
    for (let cp = -1900; cp <= 2000; cp += 100) {
      const current = winPercent(cp);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it("clamps extreme values, so a mate score cannot overflow the curve", () => {
    // The engine reports forced mates as roughly +-30000 cp.
    expect(winPercent(30000)).toBe(winPercent(2000));
    expect(winPercent(-30000)).toBe(winPercent(-2000));
  });

  it("stays strictly between 0 and 100", () => {
    expect(winPercent(30000)).toBeLessThan(100);
    expect(winPercent(-30000)).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
describe("moveAccuracy", () => {
  // Takes win% before and after a move. Losing no win% scores 100; losing
  // a lot scores near 0.

  it("is 100 when the move costs nothing", () => {
    expect(moveAccuracy(60, 60)).toBeCloseTo(100, 6);
  });

  it("is still 100 when the move improves the position (no negative loss)", () => {
    // Engine noise can make 'after' look better than 'before'. The result
    // must still be capped at 100. (Note: the source clamps this twice, with
    // Math.max(0, ...) on the loss and Math.min(100, ...) on the score. Either
    // one alone gives the same output, so this test checks the behavior
    // rather than one particular line.)
    expect(moveAccuracy(50, 55)).toBeCloseTo(100, 6);
  });


  it("never goes below 0, even for a catastrophic drop", () => {
    // By hand: 103.1668 * e^(-4.354) - 3.1668 is about -1.84, clamped to 0.
    expect(moveAccuracy(100, 0)).toBe(0);
  });

  it("never exceeds 100", () => {
    expect(moveAccuracy(0, 100)).toBeLessThanOrEqual(100);
  });

  it("scores a bigger win% drop lower than a smaller one", () => {
    expect(moveAccuracy(60, 55)).toBeGreaterThan(moveAccuracy(60, 40));
  });

  it("gives a mild score for a mild loss (5 points of win%)", () => {
    // By hand: 103.1668 * e^(-0.2177) - 3.1668 is about 79.8
    expect(moveAccuracy(60, 55)).toBeCloseTo(79.8, 0);
  });

  it("gives a score around 91.4 for a small wp drop", () => {
    expect(moveAccuracy(72,70)).toBeCloseTo(91.4,0)
  });
  
});

/* ------------------------------------------------------------------ */
describe("phaseOf", () => {
  // Rule in the source: first 20 plies = opening, last 20 plies = endgame,
  // everything in between = middlegame. (A ply is one player's move.)

  it("labels the first 20 plies as opening", () => {
    expect(phaseOf(0, 80)).toBe("opening");
    expect(phaseOf(20, 80)).toBe("opening");
  });

  it("switches to middlegame right after ply 20", () => {
    expect(phaseOf(21, 80)).toBe("middlegame");
  });

  it("labels the last 20 plies as endgame", () => {
    expect(phaseOf(60, 80)).toBe("middlegame");
    expect(phaseOf(61, 80)).toBe("endgame");
    expect(phaseOf(80, 80)).toBe("endgame");
  });

  it("handles a short game: after the opening, the rest counts as endgame", () => {
    // With only 30 plies, total - 20 = 10, which is less than 20, so the
    // middlegame band is empty. Worth knowing as a design decision: a short
    // game has no middlegame under this rule.
    expect(phaseOf(21, 30)).toBe("endgame");
  });
});

/* ------------------------------------------------------------------ */
describe("pieceName", () => {
  it("expands piece letters into words", () => {
    expect(pieceName("p")).toBe("pawn");
    expect(pieceName("n")).toBe("knight");
    expect(pieceName("b")).toBe("bishop");
    expect(pieceName("r")).toBe("rook");
    expect(pieceName("q")).toBe("queen");
    expect(pieceName("k")).toBe("king");
  });

  it("falls back to the input for an unknown letter instead of crashing", () => {
    expect(pieceName("x")).toBe("x");
  });
});

/* ------------------------------------------------------------------ */
describe("uciOfMove", () => {
  it("joins from-square and to-square", () => {
    expect(uciOfMove({ from: "e2", to: "e4" })).toBe("e2e4");
  });

  it("appends the promotion piece when there is one", () => {
    expect(uciOfMove({ from: "a7", to: "a8", promotion: "q" })).toBe("a7a8q");
  });
});

/* ------------------------------------------------------------------ */
describe("uciToSan", () => {
  // UCI is the engine's format ("g1f3"); SAN is what humans read ("Nf3").

  it("converts a pawn move from the starting position", () => {
    expect(uciToSan(START_FEN, "e2e4")).toBe("e4");
  });

  it("converts a knight move from the starting position", () => {
    expect(uciToSan(START_FEN, "g1f3")).toBe("Nf3");
  });

  it("converts a promotion", () => {
    // White pawn a7, white king a1, black king h2: a8=Q is legal, no check.
    expect(uciToSan("8/P7/8/8/8/8/7k/K7 w - - 0 1", "a7a8q")).toBe("a8=Q");
  });

  it("returns null for an illegal move", () => {
    expect(uciToSan(START_FEN, "e2e5")).toBeNull();
  });

  it("returns null when there is no move to convert", () => {
    expect(uciToSan(START_FEN, null)).toBeNull();
    expect(uciToSan(START_FEN, undefined)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
describe("detectHanging", () => {
  // detectHanging(fen) receives the position AFTER a move, so the opponent
  // is to move. It looks for a piece worth 3+ points the opponent can
  // capture with no recapture. Pawns are deliberately ignored.

  it("finds an undefended knight that a pawn can capture", () => {
    // Black pawn d6 attacks the white knight on e5. Nothing defends it.
    const fen = "4k3/8/3p4/4N3/8/8/8/4K3 b - - 0 1";
    expect(detectHanging(fen)).toEqual({ val: 3, square: "e5", piece: "n" });
  });

  it("does not flag a knight that is defended (a recapture exists)", () => {
    // Same as above, plus a white pawn on d4 that recaptures on e5.
    const fen = "4k3/8/3p4/4N3/3P4/8/8/4K3 b - - 0 1";
    expect(detectHanging(fen)).toBeNull();
  });

  it("ignores hanging pawns, which would be too noisy to mention", () => {
    const fen = "4k3/8/3p4/4P3/8/8/8/4K3 b - - 0 1";
    expect(detectHanging(fen)).toBeNull();
  });

  it("returns null when the opponent has no captures at all", () => {
    expect(detectHanging(START_FEN)).toBeNull();
  });

  it("reports the most valuable hanging piece when several are loose", () => {
    // Black pawn d6 attacks both the queen on c5 and the knight on e5. The
    // white pawn on d5 blocks the queen from guarding the knight, so both
    // are loose and the queen (9 points) should win.
    const fen = "4k3/8/3p4/2QPN3/8/8/8/4K3 b - - 0 1";
    expect(detectHanging(fen)).toEqual({ val: 9, square: "c5", piece: "q" });
  });
});

/* ------------------------------------------------------------------ */
describe("detectSacrifice", () => {
  // detectSacrifice(mv, fenAfter, moverEvalAfter) is used to upgrade a
  // 'best' move to 'brilliant'. mv needs .piece and .to; fenAfter has the
  // opponent to move; moverEvalAfter is the mover's evaluation in cp.

  const knightOnE5 = { piece: "n", to: "e5" };
  const attackedKnightFen = "4k3/8/3p4/4N3/8/8/8/4K3 b - - 0 1"; // d6 pawn can take e5

  it("flags a minor piece that can be captured while the mover is still fine", () => {
    expect(detectSacrifice(knightOnE5, attackedKnightFen, 0)).toBe(true);
  });

  it("does not flag a pawn move, since pawns are too cheap to count", () => {
    expect(detectSacrifice({ piece: "p", to: "e5" }, attackedKnightFen, 0)).toBe(false);
  });

  it("does not flag a piece that nobody can capture", () => {
    const safeFen = "4k3/8/8/4N3/8/8/8/4K3 b - - 0 1";
    expect(detectSacrifice(knightOnE5, safeFen, 0)).toBe(false);
  });

  it("requires the mover's eval to be at least -60 cp (boundary)", () => {
    expect(detectSacrifice(knightOnE5, attackedKnightFen, -60)).toBe(true);
    expect(detectSacrifice(knightOnE5, attackedKnightFen, -61)).toBe(false);
  });

  // A test you know will not pass yet. 'todo' records the gap without
  // turning the whole suite red. This is a real limitation: the function
  // checks that the piece CAN be captured, but never whether it is
  // defended, so an even trade could be mislabelled 'brilliant'.
  it.todo("does not call a defended piece a sacrifice (an even trade is not brilliant)");
});

/* ------------------------------------------------------------------ */
describe("constants", () => {
  it("START_FEN is a valid position and round-trips through chess.js", () => {
    expect(new Chess(START_FEN).fen()).toBe(START_FEN);
  });

  it("every classification label has a matching color variable", () => {
    // The UI looks up both tables with the same keys; they must stay in sync.
    expect(Object.keys(TAG_COLOR_VAR).sort()).toEqual(Object.keys(TAG_LABEL).sort());
  });
});
