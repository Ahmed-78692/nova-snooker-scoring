
  # Snooker Scoring App

  This is a code bundle for Snooker Scoring App. The original project is available at https://www.figma.com/design/2yJ1QeCcEXp30dLeYR5FfG/Snooker-Scoring-App.

  ## Running the code

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
  