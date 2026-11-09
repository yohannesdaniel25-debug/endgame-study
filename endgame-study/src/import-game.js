// import-game.js — the two ways a game gets into the app: fetching recent
// games from Chess.com's public API, or a pasted PGN.

import { state } from "./state.js";
import { START_FEN } from "./analysis.js";
import { renderBoardOnly } from "./board-ui.js";
import { escapeHtml } from "./utils.js";

export function setupImport() {
  document.getElementById("modeFetchBtn").onclick = () => setImportMode("fetch");
  document.getElementById("modePasteBtn").onclick = () => setImportMode("paste");
  document.getElementById("fetchGamesBtn").onclick = fetchGames;
  document.getElementById("loadPgnBtn").onclick = loadFromPasteBox;
}

function setImportMode(m) {
  document.getElementById("modeFetch").classList.toggle("hidden", m !== "fetch");
  document.getElementById("modePaste").classList.toggle("hidden", m !== "paste");
  document.getElementById("modeFetchBtn").classList.toggle("active", m === "fetch");
  document.getElementById("modePasteBtn").classList.toggle("active", m === "paste");
}

async function fetchGames() {
  const username = document.getElementById("usernameInput").value.trim();
  const count = parseInt(document.getElementById("gameCountInput").value, 10) || 15;
  const status = document.getElementById("fetchStatus");
  const list = document.getElementById("gamesList");
  list.innerHTML = "";
  if (!username) { status.textContent = "Enter a Chess.com username first."; return; }
  status.textContent = "Looking up archives…";
  try {
    const archRes = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`);
    if (!archRes.ok) throw new Error("User not found or Chess.com API unavailable (" + archRes.status + ").");
    const archJson = await archRes.json();
    const archives = archJson.archives || [];
    if (archives.length === 0) { status.textContent = "No games found for that username."; return; }
    let games = [];
    let idx = archives.length - 1;
    while (games.length < count && idx >= 0 && idx > archives.length - 4) {
      status.textContent = "Fetching " + archives[idx].split("/").slice(-2).join("-") + "…";
      const gRes = await fetch(archives[idx]);
      const gJson = await gRes.json();
      games = games.concat((gJson.games || []).slice().reverse());
      idx--;
    }
    games = games.slice(0, count);
    status.textContent = games.length + " recent games loaded.";
    list.innerHTML = "";
    games.forEach((g) => {
      const isWhite = (g.white.username || "").toLowerCase() === username.toLowerCase();
      const oppName = isWhite ? g.black.username : g.white.username;
      const myResult = isWhite ? g.white.result : g.black.result;
      let outcome = "draw";
      if (myResult === "win") outcome = "win";
      else if (["checkmated", "timeout", "resigned", "abandoned", "lose"].includes(myResult)) outcome = "loss";
      const card = document.createElement("div");
      card.className = "game-card";
      const date = g.end_time ? new Date(g.end_time * 1000).toLocaleDateString() : "";
      card.innerHTML = `
        <div class="g-left">
          <div class="g-opp">vs ${escapeHtml(oppName || "?")} <span style="color:var(--ink-faint);font-weight:400;">(${isWhite ? "white" : "black"})</span></div>
          <div class="g-meta">${escapeHtml(g.time_class || "")} · ${date}</div>
        </div>
        <span class="result-pill result-${outcome}">${outcome}</span>
      `;
      card.onclick = () => {
        loadGameFromPgn(g.pgn, isWhite ? "w" : "b", { opponent: oppName || "?", date, result: outcome, timeClass: g.time_class || "" });
      };
      list.appendChild(card);
    });
  } catch (err) {
    status.textContent = "Couldn't fetch games: " + err.message;
  }
}

function loadFromPasteBox() {
  const pgn = document.getElementById("pgnPaste").value.trim();
  const username = document.getElementById("pasteUsername").value.trim().toLowerCase();
  if (!pgn) { alert("Paste a PGN first."); return; }
  const probe = new Chess();
  const ok = probe.load_pgn(pgn, { sloppy: true });
  if (!ok) { alert("That PGN couldn't be parsed. Double check it's a full game PGN."); return; }
  const headers = probe.header();
  let color = "w";
  if (username) {
    if ((headers.Black || "").toLowerCase() === username) color = "b";
    else if ((headers.White || "").toLowerCase() === username) color = "w";
  }
  const opponent = color === "w" ? headers.Black || "opponent" : headers.White || "opponent";
  loadGameFromPgn(pgn, color, { opponent, date: headers.Date || "", result: headers.Result || "", timeClass: headers.TimeControl || "" });
}

function loadGameFromPgn(pgn, color, meta) {
  const probe = new Chess();
  const ok = probe.load_pgn(pgn, { sloppy: true });
  if (!ok) { alert("That game's PGN could not be parsed."); return; }
  state.currentMoves = probe.history({ verbose: true });
  state.myColor = color;
  state.currentGameMeta = meta;
  state.currentAnalysis = [];
  state.currentFens = [START_FEN];
  state.currentPly = 0;
  document.getElementById("analyzePanel").classList.remove("hidden");
  document.getElementById("boardPanel").classList.add("hidden");
  document.getElementById("summaryRow").classList.add("hidden");
  document.getElementById("summaryRow").innerHTML = "";
  renderBoardOnly(START_FEN, state.myColor);
  document.getElementById("analyzePanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
