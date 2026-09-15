# Nova Scoring — Venue Setup (Windows, Offline)

A one-page guide for running the scoring system at a venue (gymkhana).
**No internet needed. No installation needed.**

You need:
- The **Windows desktop** at the table (this shows the live scoreboard).
- **One phone** (the operator uses this to score).
- Both connected to the **same Wi-Fi / router** (the venue's own network is fine;
  it does **not** need internet).

---

## Setup (about 1 minute)

1. **Copy** `NovaScoring.exe` onto the desktop (e.g. the Desktop or a folder).
2. **Double-click** `NovaScoring.exe`.
   - A small black window opens and the **scoreboard opens automatically**
     full-screen in the browser.
   - If Windows shows a firewall prompt, click **Allow access** and make sure
     **Private networks** is ticked. (This lets the phone connect.)
3. Look at the black window. It shows an address for the phone, like:
   ```
   OPERATOR PHONE — open on the SAME Wi-Fi:
       http://192.168.1.42:4000/
   ```
   and a **QR code**.
4. On the **operator phone** (same Wi-Fi), either **scan the QR code** or type
   that `http://...:4000/` address into the phone's browser.
5. Score from the phone — the desktop scoreboard updates live.

That's it. Keep the black window open during the tournament.

---

## If the internet drops mid-tournament

Nothing happens — it keeps working. The desktop and phone talk to each other
directly over the local Wi-Fi, so the scoreboard never goes blank and scoring
continues normally.

---

## If the phone can't connect

Try these in order:
1. **Same Wi-Fi?** The phone must be on the *same* network as the desktop, on
   Wi-Fi (not mobile data).
2. **Firewall:** allow `NovaScoring.exe` through Windows Firewall for
   **Private networks** (Control Panel → Windows Defender Firewall →
   Allow an app). This is the most common fix.
3. **Right address?** If several addresses were listed, try each one.
4. **Guest Wi-Fi blocks it.** Avoid "Guest" networks — they often stop devices
   from talking to each other. Use the main Wi-Fi, or a dedicated router at the
   table.

> Tip for reliability: use a **dedicated Wi-Fi router at the table** that both
> the desktop and phone join. It needs power, not internet. This guarantees the
> two devices can always reach each other.

---

## Stopping / restarting

- **Stop:** close the black window (or press `Ctrl + C` in it).
- **Restart:** double-click `NovaScoring.exe` again. The current match is
  restored automatically (it is saved in a `nova-data` folder next to the exe).

---

## Views (optional)

The desktop opens the **scoreboard** automatically. If you need to open a view
manually in a browser, use these (replace the address with the one shown):

- Scoreboard / audience: `http://<address>:4000/?view=audience`
- Operator / scoring:     `http://<address>:4000/`
- Player view:            `http://<address>:4000/?view=player&table=table-1`
- OBS overlay (stream):   `http://<address>:4000/?view=obs&table=table-1`

---

## For the distributor (how this .exe is built)

From the project folder on a machine with Node.js 18+:

```bash
npm install
npm run package:exe
```

This produces `release/NovaScoring.exe` (Windows x64, self-contained — the
target machine does **not** need Node.js). The front-end and server are both
embedded inside the single file.
