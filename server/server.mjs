// server/server.mjs
//
// Nova LAN relay server.
//
// Purpose:
//   Lets a desktop and any number of phones/tablets on the SAME Wi-Fi/LAN
//   share one live match in real time WITHOUT any internet connection.
//
// What it does:
//   1. Serves the built front-end (../dist) to every device on the network.
//   2. Keeps a shared key-value store that mirrors the browser's localStorage
//      keys used by the app (tournaments, tables, rooms, live match states).
//   3. Relays "broadcast" messages (live scoring pushes) between all connected
//      devices over WebSocket, so scoring updates appear instantly everywhere.
//   4. Persists the shared store to a JSON file so a server restart resumes
//      matches instead of losing them.
//   5. Prints the LAN URL and a QR code on startup so a phone can join fast.
//
// No external services. Everything runs on the local machine / local network.

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, extname, normalize, sep } from "node:path";
import { networkInterfaces } from "node:os";

import express from "express";
import { WebSocketServer } from "ws";
import qrcode from "qrcode-terminal";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 4000);
const DIST_DIR = resolve(__dirname, "..", "dist");
const DATA_DIR = resolve(__dirname, "data");
const DATA_FILE = join(DATA_DIR, "store.json");

/* ============================================================
   SHARED STORE (mirrors the browser localStorage keys)
   ============================================================ */

/** @type {Record<string, string>} */
let store = {};

function loadStore() {
  try {
    if (existsSync(DATA_FILE)) {
      const raw = readFileSync(DATA_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        store = parsed;
      }
    }
  } catch (err) {
    console.warn("[nova] Could not read store file, starting empty:", err.message);
    store = {};
  }
}

let persistTimer = null;
function persistStoreSoon() {
  // Debounce disk writes; scoring can fire many updates per second.
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(DATA_FILE, JSON.stringify(store), "utf8");
    } catch (err) {
      console.warn("[nova] Could not persist store:", err.message);
    }
  }, 400);
}

/* ============================================================
   HTTP / REST
   ============================================================ */

const app = express();
app.use(express.json({ limit: "8mb" }));

// Simple health/discovery endpoint. The front-end pings this to decide
// whether a LAN server is present (network mode) or not (local-only mode).
app.get("/nova/ping", (_req, res) => {
  res.json({ ok: true, service: "nova-lan", ts: Date.now() });
});

// Full snapshot of the shared store (used on first load / reconnect).
app.get("/nova/store", (_req, res) => {
  res.json(store);
});

// Get a single key.
app.get("/nova/store/:key", (req, res) => {
  const key = req.params.key;
  const value = Object.prototype.hasOwnProperty.call(store, key)
    ? store[key]
    : null;
  res.json({ key, value });
});

// Set / remove a single key (value === null removes it), then relay.
app.put("/nova/store/:key", (req, res) => {
  const key = req.params.key;
  const value = req.body?.value ?? null;
  applyStoreChange(key, value, /* originId */ req.body?.originId ?? null);
  res.json({ ok: true });
});

if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  // SPA fallback: any non-API GET returns index.html so client routing works.
  app.get(/^(?!\/nova\/).*/, (_req, res) => {
    res.sendFile(join(DIST_DIR, "index.html"));
  });
} else {
  console.warn(
    "[nova] dist/ not found. Run the front-end build first (npm run build).\n" +
      "       The relay will still run for dev mode (vite on another port)."
  );
}

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

  // Tell every OTHER device the store changed so it can update immediately.
  relay(
    {
      type: "store-change",
      key,
      value: value === undefined ? null : value,
    },
    originId
  );
}

/* ============================================================
   WEBSOCKET RELAY
   ============================================================ */

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/nova/ws" });

let nextClientId = 1;

wss.on("connection", (socket) => {
  socket.novaId = String(nextClientId++);

  // Send the current full store snapshot immediately on connect.
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
      // A device changed a shared key.
      applyStoreChange(msg.key, msg.value ?? null, socket.novaId);
      return;
    }

    if (msg.type === "broadcast") {
      // A live scoring push (mirrors the browser BroadcastChannel message).
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
    if (client.readyState !== 1 /* OPEN */) continue;
    if (originId && client.novaId === originId) continue; // don't echo to sender
    try {
      client.send(data);
    } catch {
      // Ignore individual send failures.
    }
  }
}

function safeSend(socket, obj) {
  try {
    if (socket.readyState === 1) socket.send(JSON.stringify(obj));
  } catch {
    // Ignore.
  }
}

/* ============================================================
   STARTUP
   ============================================================ */

function getLanAddresses() {
  const nets = networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      // IPv4, not internal (skip 127.0.0.1)
      if (net.family === "IPv4" && !net.internal) {
        addrs.push(net.address);
      }
    }
  }
  return addrs;
}

loadStore();

httpServer.listen(PORT, "0.0.0.0", () => {
  const addrs = getLanAddresses();
  const primary = addrs[0] || "localhost";
  const url = `http://${primary}:${PORT}`;

  console.log("\n==============================================");
  console.log("  NOVA — Offline LAN Scoring Server");
  console.log("==============================================");
  console.log("  This machine (operator):  http://localhost:" + PORT);
  if (addrs.length) {
    console.log("  On this Wi-Fi / LAN, open on any device:");
    for (const a of addrs) {
      console.log("    -> http://" + a + ":" + PORT);
    }
  } else {
    console.log("  No LAN IPv4 address detected. Connect the machine to Wi-Fi/LAN.");
  }
  console.log("\n  Scan on a phone (must be on the same Wi-Fi, no internet needed):\n");
  qrcode.generate(url, { small: true });
  console.log("\n  Tip: if a device can't connect, allow Node.js through the");
  console.log("       firewall for Private networks.");
  console.log("==============================================\n");
});
