// engine.js
// Thin wrapper around Stockfish running in a Web Worker, speaking the UCI
// (Universal Chess Interface) text protocol: we send lines like
// "position fen ..." and "go movetime 500", and the worker sends back
// lines like "info ... score cp 34 ... pv e2e4" and "bestmove e2e4".
//
// Note the difference from the single-file version of this app: because
// this page is now served over http:// by a real dev server (not opened
// as a bare file://), the browser is happy to load the engine as an
// ordinary same-origin file. We no longer need to base64-encode it and
// smuggle it in through a Blob URL — that was only a workaround for
// double-clicking a standalone HTML file.

export class Engine {
  constructor() {
    // import.meta.url = the URL of *this* module file, so the worker path
    // resolves correctly no matter where the page that imported us lives.
    const engineUrl = new URL("../engine/stockfish-asm.js", import.meta.url);
    this.worker = new Worker(engineUrl);
    this.ready = false;
    this._readyResolvers = [];
    this._pending = null;
    this.worker.onmessage = (e) => this._onMessage(typeof e.data === "string" ? e.data : "");
    this.worker.postMessage("uci");
  }

  _onMessage(line) {
    if (line === "uciok") {
      this.worker.postMessage("isready");
    } else if (line === "readyok") {
      this.ready = true;
      this._readyResolvers.forEach((r) => r());
      this._readyResolvers = [];
    } else if (this._pending) {
      if (line.startsWith("info")) {
        const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
        // "pv" is the principal variation: the whole line of moves the engine
        // expects, best play for both sides. It's always the last field.
        const pvMatch = line.match(/\spv\s(.+)$/);
        if (scoreMatch) {
          this._pending.lastScoreType = scoreMatch[1];
          this._pending.lastScoreVal = parseInt(scoreMatch[2], 10);
        }
        if (pvMatch) {
          this._pending.lastPv = pvMatch[1].trim().split(/\s+/);
          this._pending.lastBestUci = this._pending.lastPv[0];
        }
      } else if (line.startsWith("bestmove")) {
        const parts = line.split(" ");
        const bestUci = parts[1] && parts[1] !== "(none)" ? parts[1] : (this._pending.lastBestUci || null);
        // Keep the PV only if it starts with the move the engine settled on.
        const lastPv = this._pending.lastPv || [];
        const pv = bestUci && lastPv[0] === bestUci ? lastPv : (bestUci ? [bestUci] : []);
        const result = {
          cpEquiv: this._pending.lastScoreType === "mate"
            ? (this._pending.lastScoreVal >= 0
                ? 30000 - this._pending.lastScoreVal * 10
                : -30000 - this._pending.lastScoreVal * 10)
            : (this._pending.lastScoreVal || 0),
          isMate: this._pending.lastScoreType === "mate",
          mateIn: this._pending.lastScoreType === "mate" ? this._pending.lastScoreVal : null,
          bestUci,
          pv,
        };
        const resolve = this._pending.resolve;
        this._pending = null;
        resolve(result);
      }
    }
  }

  whenReady() {
    if (this.ready) return Promise.resolve();
    return new Promise((res) => this._readyResolvers.push(res));
  }

  // searchMoves (optional): only consider these UCI moves. Used to ask
  // "what's the best move other than this one?". UCI needs searchmoves to
  // come last on the go line, since it takes everything after it.
  async analyze(fen, movetimeMs, searchMoves = null) {
    await this.whenReady();
    return new Promise((resolve) => {
      this._pending = { resolve, lastScoreType: null, lastScoreVal: 0, lastBestUci: null, lastPv: null };
      this.worker.postMessage("position fen " + fen);
      const restrict = searchMoves && searchMoves.length ? " searchmoves " + searchMoves.join(" ") : "";
      this.worker.postMessage("go movetime " + movetimeMs + restrict);
    });
  }
}
