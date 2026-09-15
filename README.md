
  # Snooker Scoring App

  This is a code bundle for Snooker Scoring App. The original project is available at https://www.figma.com/design/2yJ1QeCcEXp30dLeYR5FfG/Snooker-Scoring-App.

  ## Download (Windows, no install, offline)

  Grab the ready-to-run Windows app from the
  **[Releases page](https://github.com/Ahmed-78692/nova-snooker-scoring/releases/latest)**:
  download `NovaScoring.exe` and double-click it. No Node.js, no installation,
  no internet required. Full venue instructions are in
  [VENUE-SETUP.md](./VENUE-SETUP.md).

  ## Running the code (for developers)

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Running offline across devices (mobile + desktop)

  To share a live match between a desktop and phones/tablets on the same
  Wi-Fi / LAN with **no internet**, run:

  ```bash
  npm run offline
  ```

  This builds the app and starts a local server that serves it to every device
  on the network and syncs scoring in real time. See [OFFLINE.md](./OFFLINE.md)
  for full instructions (QR code, views, firewall, ports).
  