// server/launch.cjs
//
// Self-contained CommonJS launcher used to build the single Windows .exe
// (via @yao-pkg/pkg). It needs NO Node.js installed on the target machine.
//
// What it does when double-clicked at a venue:
//   1. Starts the Nova LAN relay server (serves the app + WebSocket sync).
//   2. Auto-opens the desktop's default browser FULL-SCREEN to the scoreboard.
//   3. Prints (and the console window shows) the phone operator URL + a QR code.
//   4. Persists match state next to the .exe so a restart resumes the match.
//
// Everything runs on the local machine / local Wi-Fi. The internet is never in
// the path, so if venue internet drops mid-tournament nothing breaks.
//
// NOTE: This is CommonJS on purpose — pkg bundles CJS most reliably. The dist/
// front-end assets are embedded into the exe via the "pkg.assets" config in
// package.json and read through require paths that pkg understands.

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const express = require("express");
const { WebSocketServer } = require("ws");
const qrcode = require("qrcode-terminal");

const PORT = Number(process.env.PORT || 4000);

/* ============================================================
   PATH RESOLUTION (packaged exe vs plain node)
   ============================================================ */

// When packaged with pkg, process.pkg is set and __dirname points inside the
// virtual snapshot filesystem. Bundled assets (dist/) are read from there.
// Writable data must live OUTSIDE the snapshot, next to the actual .exe.
const isPackaged = Boolean(process.pkg);

// dist/ is embedded relative to this file inside the snapshot.
const DIST_DIR = path.join(__dirname, "..", "dist");

// Writable location: alongside the exe when packaged, else the project folder.
const EXE_DIR = isPackaged
  ? path.dirname(process.execPath)
  : path.join(__dirname, "..");
const DATA_DIR = path.join(EXE_DIR, "nova-data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

/* ============================================================
   SHARED STORE
   ============================================================ */

/** @type {Record<string, string>} */
let store = {};

function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      if (parsed && typeof parsed === "object") store = parsed;
    }
  } catch (err) {
    console.warn("[nova] Could not read store file, starting empty:", err.message);
    store = {};
  }
}

let persistTimer = null;
function persistStoreSoon() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(store), "utf8");
    } catch (err) {
      console.warn("[nova] Could not persist store:", err.message);
    }
  }, 400);
}

/* ============================================================
   READ EMBEDDED index.html (works inside the pkg snapshot)
   ============================================================ */

function readIndexHtml() {
  try {
    return fs.readFileSync(path.join(DIST_DIR, "index.html"));
  } catch {
    return null;
  }
}

/* ============================================================
   HTTP / REST
   ============================================================ */

const app = express();
app.use(express.json({ limit: "8mb" }));

app.get("/nova/ping", (_req, res) => {
  res.json({ ok: true, service: "nova-lan", ts: Date.now() });
});

app.get("/nova/store", (_req, res) => {
  res.json(store);
});

app.get("/nova/store/:key", (req, res) => {
  const key = req.params.key;
  const value = Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
  res.json({ key, value });
});

app.put("/nova/store/:key", (req, res) => {
  const key = req.params.key;
  const value = req.body && req.body.value != null ? req.body.value : null;
  const originId = req.body && req.body.originId != null ? req.body.originId : null;
  applyStoreChange(key, value, originId);
  res.json({ ok: true });
});

// Serve the embedded front-end.
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}

// SPA fallback for any non-API GET. Reads index.html from the snapshot each
// time (sendFile can't serve from the pkg virtual FS, so we send the buffer).
app.get(/^(?!\/nova\/).*/, (_req, res) => {
  const html = readIndexHtml();
  if (html) {
    res.type("html").send(html);
  } else {
    res
      .status(500)
      .send("Nova: front-end assets not found in the executable bundle.");
  }
});

/* ============================================================
   STORE MUTATION + RELAY
   ============================================================ */

function applyStoreChange(key, value, originId) {
  if (value === null || value === undefined) {
    delete store[key];
  } else {
    store[key] = String(value);
  }
  persistStoreSoon();
  relay({ type: "store-change", key, value: value === undefined ? null : value }, originId);
}

/* ============================================================
   WEBSOCKET RELAY
   ============================================================ */

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/nova/ws" });

let nextClientId = 1;

wss.on("connection", (socket) => {
  socket.novaId = String(nextClientId++);
  safeSend(socket, { type: "snapshot", store, clientId: socket.novaId });

  socket.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "store-set") {
      applyStoreChange(msg.key, msg.value != null ? msg.value : null, socket.novaId);
      return;
    }
    if (msg.type === "broadcast") {
      relay({ type: "broadcast", payload: msg.payload }, socket.novaId);
      return;
    }
    if (msg.type === "ping") {
      safeSend(socket, { type: "pong", ts: Date.now() });
    }
  });
});

function relay(message, originId) {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState !== 1) continue;
    if (originId && client.novaId === originId) continue;
    try {
      client.send(data);
    } catch {
      /* ignore */
    }
  }
}

function safeSend(socket, obj) {
  try {
    if (socket.readyState === 1) socket.send(JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

/* ============================================================
   NETWORK / BROWSER HELPERS
   ============================================================ */

function getLanAddresses() {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) addrs.push(net.address);
    }
  }
  return addrs;
}

// Open the desktop's default browser. On Windows we launch a NEW browser
// window in "app"/kiosk style when possible for a clean scoreboard display.
function openScoreboard(url) {
  try {
    if (process.platform === "win32") {
      // Prefer Chrome/Edge in app mode (borderless) for a kiosk-like board.
      const appArg = `--app=${url}`;
      const candidates = [
        process.env["ProgramFiles"] + "\\Google\\Chrome\\Application\\chrome.exe",
        process.env["ProgramFiles(x86)"] + "\\Google\\Chrome\\Application\\chrome.exe",
        process.env["LOCALAPPDATA"] + "\\Google\\Chrome\\Application\\chrome.exe",
        process.env["ProgramFiles(x86)"] + "\\Microsoft\\Edge\\Application\\msedge.exe",
        process.env["ProgramFiles"] + "\\Microsoft\\Edge\\Application\\msedge.exe",
      ];
      const browser = candidates.find((p) => {
        try {
          return p && fs.existsSync(p);
        } catch {
          return false;
        }
      });
      if (browser) {
        spawn(browser, [appArg, "--start-fullscreen"], { detached: true, stdio: "ignore" }).unref();
        return;
      }
      // Fallback: default browser via the shell.
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
      return;
    }
    // macOS / Linux fallback.
    const opener = process.platform === "darwin" ? "open" : "xdg-open";
    spawn(opener, [url], { detached: true, stdio: "ignore" }).unref();
  } catch {
    // If auto-open fails, the console still shows the URL to open manually.
  }
}

/* ============================================================
   STARTUP
   ============================================================ */

loadStore();

httpServer.listen(PORT, "0.0.0.0", () => {
  const addrs = getLanAddresses();
  const primary = addrs[0] || "localhost";
  const localUrl = `http://localhost:${PORT}`;
  const lanUrl = `http://${primary}:${PORT}`;

  // The desktop shows the scoreboard (audience view); the phone operates it.
  const scoreboardUrl = `${localUrl}/?view=audience`;
  const operatorUrl = `${lanUrl}/`;

  console.log("\n==================================================");
  console.log("   NOVA — Offline Scoring (no internet required)");
  console.log("==================================================");
  console.log("   Scoreboard (this screen):  " + scoreboardUrl);
  if (addrs.length) {
    console.log("\n   OPERATOR PHONE — connect to the SAME Wi-Fi, then open:");
    for (const a of addrs) console.log("      http://" + a + ":" + PORT + "/");
  } else {
    console.log("\n   No Wi-Fi/LAN address found. Connect this PC to the venue Wi-Fi.");
  }
  console.log("\n   Scan on the operator phone (same Wi-Fi):\n");
  qrcode.generate(operatorUrl, { small: true });
  console.log("\n   Keep this window open during the tournament.");
  console.log("   If the phone can't connect, allow this app through the");
  console.log("   Windows firewall for Private networks.");
  console.log("==================================================\n");

  // Auto-open the scoreboard full-screen on the desktop.
  setTimeout(() => openScoreboard(scoreboardUrl), 800);
});
