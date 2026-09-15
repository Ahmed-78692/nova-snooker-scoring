# Running Nova Offline (Mobile + Desktop on the Same Network)

Nova can run fully **offline** — no internet required. One machine (the
"operator", usually a laptop/desktop) runs a small local server. Every phone,
tablet, or other computer on the **same Wi-Fi / LAN** connects to it and shares
the same live match, tournament, tables, and scoreboards in real time.

## Why this is needed

The app stores everything in the browser (`localStorage`) and pushes live
updates over a `BroadcastChannel`. Both of those work **only inside one browser
on one device** — they never cross between a phone and a desktop.

To share a match across devices, something on the network has to relay it. Nova
now includes a lightweight local server (`server/server.mjs`) that does exactly
that, and it runs entirely on your LAN with no external services.

## One-time setup

Install [Node.js](https://nodejs.org) (v18 or newer) on the operator machine,
then, in this folder:

```bash
npm install
```

## Start it (offline)

```bash
npm run offline
```

This builds the app and starts the LAN server. On startup it prints something
like:

```
==============================================
  NOVA — Offline LAN Scoring Server
==============================================
  This machine (operator):  http://localhost:4000
  On this Wi-Fi / LAN, open on any device:
    -> http://192.168.0.123:4000
  Scan on a phone (must be on the same Wi-Fi, no internet needed):
  [QR CODE]
==============================================
```

- On the **operator machine**, open `http://localhost:4000`.
- On a **phone / tablet / another PC**, either:
  - scan the QR code, or
  - type the `http://<ip>:<port>` address shown (e.g. `http://192.168.0.123:4000`).

All devices now share the same live state. Score on any device (operator/remote)
and the audience / player / OBS views update everywhere within a moment.

> Tip: After the first build you can skip rebuilding with just `npm run server`.

## The different views (add to the URL)

- Operator / remote scoring: `http://<ip>:4000/`
- Audience: `http://<ip>:4000/?view=audience`
- Player view: `http://<ip>:4000/?view=player&table=table-1`
- OBS overlay: `http://<ip>:4000/?view=obs&table=table-1`

## Firewall

The first time you start the server, Windows (or your OS) may ask whether to
allow Node.js through the firewall. **Allow it for Private networks** so other
devices on your Wi-Fi can connect. Without this, phones may fail to load the page.

## Changing the port

Default port is `4000`. To use another port:

```bash
# PowerShell
$env:PORT=8080; npm run offline

# macOS / Linux
PORT=8080 npm run offline
```

## Data & restarts

Shared state is persisted to `server/data/store.json`, so if the server
restarts, matches and tournaments resume instead of being lost. To wipe all
data, stop the server and delete that file.

## How it works (technical)

- `server/server.mjs` — Express + WebSocket relay. Serves the built app from
  `dist/`, keeps a shared key-value store mirroring the app's Nova storage keys,
  relays live scoring pushes over WebSocket, and persists to disk.
- `src/app/net.ts` — On load, pings `/nova/ping`.
  - If a server answers → **network mode**: opens a WebSocket, pulls a full
    snapshot into the device's `localStorage`, and forwards any local Nova
    storage writes and broadcasts to the server (which relays them to every
    other device).
  - If nothing answers → **local-only mode**: original single-device behaviour
    (works exactly as before).
- `src/app/sync.ts` is unchanged in behaviour; its `broadcast()` now also relays
  over the LAN, and `listenBroadcast()` also receives remote pushes.

Because network sync is layered on top, opening the app **without** the server
(e.g. `npm run dev` alone, or a file open) still works as a normal
single-device app.

## Developing across devices (optional)

`npm run dev` binds Vite to your LAN and proxies `/nova` to the server on port
`4000`. To test cross-device in dev, run the server and the dev server together:

```bash
# terminal 1
npm run server
# terminal 2
npm run dev
```

Then open the Vite "Network" URL on other devices.
