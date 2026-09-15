# Test Nova on a Laptop + Phones (Same Wi-Fi, Offline)

This guide is for a **helper running the app on their own laptop** so that
phones/tablets on the same Wi-Fi can connect and score a match together.
No internet is required once it's running.

> Works best on a **personal / home laptop**. Corporate-managed laptops often
> block incoming connections (firewall/VPN), which stops phones connecting.

---

## 1. Install the tools (one time)

- **Node.js** (v18 or newer): https://nodejs.org → download the "LTS" installer,
  run it, click through with defaults.
- **Git**: https://git-scm.com/downloads → install with defaults.

To confirm they installed, open a terminal (PowerShell on Windows, Terminal on
macOS) and run:

```bash
node --version
git --version
```

Both should print a version number.

---

## 2. Get the app (one time)

```bash
git clone https://github.com/Ahmed-78692/nova-snooker-scoring.git
cd nova-snooker-scoring
npm install
```

`npm install` downloads dependencies and may take a couple of minutes.

---

## 3. Start it

```bash
npm run offline
```

This builds the app and starts the local server. It will print something like:

```
==============================================
  NOVA — Offline LAN Scoring Server
==============================================
  This machine (operator):  http://localhost:4000
  On this Wi-Fi / LAN, open on any device:
    -> http://192.168.1.42:4000
  Scan on a phone (must be on the same Wi-Fi, no internet needed):
  [ QR CODE ]
==============================================
```

**Leave this terminal open** — closing it stops the server.

---

## 4. Open it

- **On the laptop:** open a browser to `http://localhost:4000`
- **On each phone/tablet (same Wi-Fi):** either
  - scan the QR code shown in the terminal, or
  - type the address it printed, e.g. `http://192.168.1.42:4000`

Everyone now shares the same live match. Score on one device and the others
update within about a second.

### Handy view URLs (add to the address)
- Operator / scoring: `http://<laptop-ip>:4000/`
- Audience: `http://<laptop-ip>:4000/?view=audience`
- Player view: `http://<laptop-ip>:4000/?view=player&table=table-1`
- OBS overlay: `http://<laptop-ip>:4000/?view=obs&table=table-1`

---

## 5. If a phone can't connect

Work through these in order:

1. **Same Wi-Fi?** The phone must be on the *same* network as the laptop, and on
   Wi-Fi (not mobile data). The first three number groups of their IPs should
   match (e.g. laptop `192.168.1.42`, phone `192.168.1.57`).
2. **Firewall prompt.** The first time you run it, the OS may ask to allow
   Node.js through the firewall — choose **Allow**, and allow **Private networks**.
   - Windows: Control Panel → Windows Defender Firewall → Allow an app → make
     sure Node.js is ticked for Private.
   - macOS: System Settings → Network → Firewall → allow incoming for node.
3. **Router "client isolation" / "AP isolation".** Some routers (and most guest
   networks) stop devices from seeing each other. Turn this off in the router
   settings, or don't use the "Guest" Wi-Fi.
4. **Right IP.** If several addresses were printed, try each one. To re-check the
   laptop's IP: `ipconfig` (Windows) or `ifconfig` / `ipconfig getifaddr en0`
   (macOS).

---

## 6. Stopping / restarting

- **Stop:** press `Ctrl + C` in the terminal.
- **Start again later:** `cd nova-snooker-scoring` then `npm run server`
  (no rebuild needed if the code hasn't changed).
- **Get the latest code:** `git pull` then `npm install` then `npm run offline`.

---

## Notes

- Match data is saved to `server/data/store.json` on the laptop, so a restart
  resumes the current match.
- There is currently **no login** — anyone on the Wi-Fi who opens the URL can
  view and score.
