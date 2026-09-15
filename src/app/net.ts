// src/app/net.ts
//
// Nova LAN network layer.
//
// Goal:
//   Make the app work OFFLINE across mobile + desktop on the same Wi-Fi/LAN.
//
// How it works:
//   The app already stores everything in localStorage and pushes live updates
//   over a BroadcastChannel. Both of those are per-device only. This module
//   bridges them across devices when a Nova LAN server is present:
//
//     * On startup it pings the server that served the page (same origin).
//       - If reachable  -> NETWORK MODE.
//       - If not        -> LOCAL-ONLY MODE (original single-device behaviour).
//
//     * In network mode it opens a WebSocket to the server and:
//         - pulls a full snapshot of the shared store and writes every key
//           into this device's real localStorage (so all existing synchronous
//           localStorage reads in sync.ts keep working untouched);
//         - listens for "store-change" messages and applies them to
//           localStorage, then notifies local subscribers (so polling/UI
//           refresh picks them up instantly);
//         - forwards local store writes to the server;
//         - relays "broadcast" messages (live scoring pushes) both ways.
//
//   Everything degrades gracefully: if the socket drops, the app keeps using
//   its local cache and reconnects automatically.

type StoreChangeListener = (key: string, value: string | null) => void;
type BroadcastListener = (payload: unknown) => void;

const WS_PATH = "/nova/ws";
const PING_PATH = "/nova/ping";

let networkMode = false;
let ready = false;
let readyResolvers: Array<() => void> = [];

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const storeListeners = new Set<StoreChangeListener>();
const broadcastListeners = new Set<BroadcastListener>();

/*
 * We only mirror keys that belong to Nova. This avoids syncing unrelated
 * localStorage entries (analytics, themes set by libraries, etc.).
 */
function isNovaKey(key: string): boolean {
  return (
    key.startsWith("nova") ||
    key.startsWith("nova-") ||
    key.startsWith("nova_") ||
    key.startsWith("ck-") ||
    key === "ck-tournament" ||
    key === "ck-tables"
  );
}

function baseHttpUrl(): string {
  // Same origin that served the app.
  return `${window.location.protocol}//${window.location.host}`;
}

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${WS_PATH}`;
}

/* ============================================================
   PUBLIC API
   ============================================================ */

export function isNetworkMode(): boolean {
  return networkMode;
}

/** Resolves once the initial connection attempt has completed (either way). */
export function whenReady(): Promise<void> {
  if (ready) return Promise.resolve();
  return new Promise((res) => readyResolvers.push(res));
}

export function onStoreChange(listener: StoreChangeListener): () => void {
  storeListeners.add(listener);
  return () => storeListeners.delete(listener);
}

export function onBroadcast(listener: BroadcastListener): () => void {
  broadcastListeners.add(listener);
  return () => broadcastListeners.delete(listener);
}

/** Called by sync.ts broadcast() to relay a live push over the LAN. */
export function pushBroadcast(payload: unknown): void {
  if (!networkMode) return;
  send({ type: "broadcast", payload });
}

/* ============================================================
   INTERNALS
   ============================================================ */

function send(obj: unknown): void {
  try {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(obj));
    }
  } catch {
    // Ignore transient send errors; reconnect will re-sync via snapshot.
  }
}

function markReady(): void {
  if (ready) return;
  ready = true;
  const resolvers = readyResolvers;
  readyResolvers = [];
  resolvers.forEach((r) => r());
}

/*
 * When we apply a change that CAME FROM the server, we must not send it back.
 * This guard suppresses the localStorage interceptor during remote application.
 */
let applyingRemote = false;

/*
 * Apply a remote store change to THIS device's localStorage without echoing
 * it back to the server, then notify local subscribers.
 */
function applyRemoteStoreChange(key: string, value: string | null): void {
  applyingRemote = true;
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage quota / access errors.
  } finally {
    applyingRemote = false;
  }
  storeListeners.forEach((l) => {
    try {
      l(key, value);
    } catch {
      // Ignore listener errors.
    }
  });
}

/*
 * Patch window.localStorage so that any Nova key written by the existing
 * sync.ts code is automatically forwarded to the LAN server. This lets us add
 * cross-device sync WITHOUT rewriting every setItem/removeItem call site.
 *
 * Writes that originate from a remote change (applyingRemote === true) are not
 * forwarded, preventing echo loops.
 */
function installStorageInterceptor(): void {
  try {
    const ls = window.localStorage;
    const rawSetItem = ls.setItem.bind(ls);
    const rawRemoveItem = ls.removeItem.bind(ls);

    ls.setItem = (key: string, value: string) => {
      rawSetItem(key, value);
      if (!applyingRemote && networkMode && isNovaKey(key)) {
        send({ type: "store-set", key, value });
      }
    };

    ls.removeItem = (key: string) => {
      rawRemoveItem(key);
      if (!applyingRemote && networkMode && isNovaKey(key)) {
        send({ type: "store-set", key, value: null });
      }
    };
  } catch {
    // If localStorage is unavailable, network sync simply won't engage.
  }
}

function applySnapshot(remoteStore: Record<string, string>): void {
  // Write every remote key into local storage.
  for (const key of Object.keys(remoteStore)) {
    try {
      window.localStorage.setItem(key, remoteStore[key]);
    } catch {
      // Ignore.
    }
  }

  /*
   * Also push any Nova keys that exist ONLY locally up to the server, so a
   * device that already had rooms/tournaments contributes them to the shared
   * state on first connect (e.g. the operator that created everything offline).
   */
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !isNovaKey(key)) continue;
      if (Object.prototype.hasOwnProperty.call(remoteStore, key)) continue;
      const value = window.localStorage.getItem(key);
      if (value !== null) {
        send({ type: "store-set", key, value });
      }
    }
  } catch {
    // Ignore.
  }

  // Let the UI know a bulk change happened.
  storeListeners.forEach((l) => {
    try {
      l("*", null);
    } catch {
      // Ignore.
    }
  });
}

function connectSocket(): void {
  try {
    socket = new WebSocket(wsUrl());
  } catch {
    scheduleReconnect();
    return;
  }

  socket.onmessage = (event) => {
    let msg: any;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "snapshot" && msg.store) {
      applySnapshot(msg.store as Record<string, string>);
      return;
    }

    if (msg.type === "store-change") {
      applyRemoteStoreChange(msg.key, msg.value ?? null);
      return;
    }

    if (msg.type === "broadcast") {
      broadcastListeners.forEach((l) => {
        try {
          l(msg.payload);
        } catch {
          // Ignore listener errors.
        }
      });
      return;
    }
  };

  socket.onclose = () => {
    socket = null;
    scheduleReconnect();
  };

  socket.onerror = () => {
    try {
      socket?.close();
    } catch {
      // Ignore.
    }
  };
}

function scheduleReconnect(): void {
  if (!networkMode) return;
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectSocket();
  }, 1500);
}

/* ============================================================
   BOOTSTRAP
   ============================================================ */

async function detectAndConnect(): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${baseHttpUrl()}${PING_PATH}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    if (res.ok) {
      const body = await res.json().catch(() => null);
      if (body && body.service === "nova-lan") {
        networkMode = true;
        connectSocket();
      }
    }
  } catch {
    // No server reachable -> local-only mode. This is expected when the app
    // is opened directly from a file or from the Vite dev server without the
    // relay running.
    networkMode = false;
  } finally {
    markReady();
  }
}

// Kick off detection immediately at module load (browser only).
if (typeof window !== "undefined") {
  installStorageInterceptor();
  void detectAndConnect();
}
