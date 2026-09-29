// state.js
// One shared, mutable object instead of loose global variables scattered
// across files. Every module that needs to read or change "what game are
// we looking at right now" imports this same object.
//
// This is a deliberately simple pattern, not a framework. Once you get to
// React (or a state library like Zustand), you'll see the same underlying
// problem — "how do far-apart pieces of UI share state?" — solved with more
// machinery. Understanding the plain version first makes the framework
// version click faster.

import { START_FEN } from "./analysis.js";

export const state = {
  engine: null,
  currentMoves: [],        // chess.js verbose move objects for the loaded game
  currentAnalysis: [],     // one entry per ply, filled in by analyze.js
  currentFens: [START_FEN],
  currentPly: 0,           // 0 = starting position
  myColor: "w",
  currentGameMeta: { opponent: "", date: "", result: "", timeClass: "" },
};
