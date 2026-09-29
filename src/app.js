// app.js — the entry point. index.html loads only this one module; every
// other file gets pulled in through the import chain below. This is the
// one place that's allowed to know about *all* the other modules — every
// other module should only know about the few things it directly needs.

import { setupImport } from "./import-game.js";
import { setupAnalyze } from "./analyze.js";
import { setupBoardNav } from "./review-ui.js";
import { setupPatterns, renderPatterns } from "./patterns-ui.js";

function switchTab(which) {
  document.getElementById("tabReview").classList.toggle("hidden", which !== "review");
  document.getElementById("tabPatterns").classList.toggle("hidden", which !== "patterns");
  document.getElementById("tabReviewBtn").classList.toggle("active", which === "review");
  document.getElementById("tabPatternsBtn").classList.toggle("active", which === "patterns");
  if (which === "patterns") renderPatterns();
}

function main() {
  document.getElementById("tabReviewBtn").onclick = () => switchTab("review");
  document.getElementById("tabPatternsBtn").onclick = () => switchTab("patterns");

  setupImport();
  setupAnalyze();
  setupBoardNav();
  setupPatterns();

  renderPatterns(); // in case there's already saved history to show
}

main();
