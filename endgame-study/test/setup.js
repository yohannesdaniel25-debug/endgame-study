// In the browser, index.html loads chess.js with a plain <script> tag, which
// creates a global `Chess` constructor. analysis.js relies on that global.
// Node has no <script> tags, so this setup file recreates the same global
// from the npm copy of chess.js (pinned to the same 0.10.3 version the page
// loads from the CDN, so tests exercise the library the app really uses).

import { Chess } from "chess.js";

globalThis.Chess = Chess;
