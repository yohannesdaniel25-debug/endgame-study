# Endgame Study

A free, unlimited version of Chess.com's game review feature. Chess.com caps
free game review at once per day and puts the rest behind a paywall — this
runs entirely in your own browser, as many times as you want, for free.

Fetch your recent games straight from Chess.com's public API (or paste a
PGN), and it runs a real Stockfish engine locally to classify every move —
Brilliant, Best, Excellent, Good, Inaccuracy, Mistake, Blunder — with a
plain-language note on *why* a bad move was bad (hanging pieces, missed
forced mates), an eval graph, and a "Patterns" dashboard that remembers every
game you review and shows you which phase of the game and which piece gets
you in trouble most often.

## Running it locally

You need a local static file server — not `file://` — because ES modules
and Web Workers both require a real HTTP origin.

```
npm run dev
```

Then open the URL it prints (defaults to `http://localhost:5173`).

No build step, no bundler, no framework: this intentionally stays plain
HTML/CSS/JS with native ES modules while the project is still small.

## Running the tests

```
npm install
npm test            # run the suite once
npm run test:watch  # re-run automatically whenever a file changes
```

Tests live in `test/` and use [Vitest](https://vitest.dev). They cover the
pure logic in `src/analysis.js`: move classification thresholds (including
the exact boundary values), the win-percentage and accuracy formulas, game
phase detection, and the hanging-piece and sacrifice heuristics on small
hand-built chess positions. `test/setup.js` provides the global `Chess`
object that the browser normally gets from a script tag.

## Project structure

```
index.html          markup only
styles.css           all styling
engine/
  stockfish-asm.js    the actual chess engine (ASM-JS build of Stockfish)
src/
  analysis.js         pure logic: move classification, cp-loss math,
                       hanging-piece / sacrifice heuristics — no DOM code,
                       so this is what gets unit tested
  state.js            one shared object holding "what game is loaded now"
  engine.js            wraps Stockfish running in a Web Worker
  board-ui.js         draws the 8x8 board from a FEN string
  review-ui.js        move list, per-move explanation, eval chart
  analyze.js          the async loop that runs the engine over a whole game
  import-game.js      fetching from Chess.com / loading a pasted PGN
  storage.js          localStorage persistence (review history)
  patterns-ui.js      the aggregate "what am I bad at" dashboard
  app.js              entry point — wires all of the above together
```

The guiding rule for the split: `analysis.js` never touches the DOM, and
nothing outside `board-ui.js` touches the `#board` element directly. Modules
talk to each other through explicit `import`/`export`, not by poking at
global variables.

## Why it's built this way

This started as a single 900-line HTML file (see the very first commit) and
was deliberately restructured to be a learning project as much as a chess
tool. Current state and roadmap:

- [x] Plain JS split into modules with a clear dependency graph
- [x] Real dev workflow (local server instead of double-clicking a file)
- [x] Unit tests on `analysis.js` (Vitest)
- [ ] TypeScript conversion
- [ ] Backend (Node/Express + SQLite or Postgres) so review history survives
      a cleared browser and works across devices
- [ ] Move engine analysis server-side for real Stockfish speed instead of
      the slow ASM-JS build

## Known limitations, on purpose (not bugs)

- Move judgments come from a shallow, time-boxed local search. Treat
  classifications as a strong guide, not gospel, especially near tier
  boundaries.
- "Hanging piece" and "Brilliant" detection are simple heuristics
  (undefended-piece / sacrifice checks), not full tactical-motif
  recognition. They won't catch every fork or pin.
- Chess.com doesn't expose a public "fetch one game by ID" endpoint, so
  game selection works off a recent-games list, with PGN paste as a
  fallback for anything else.

## License

MIT
