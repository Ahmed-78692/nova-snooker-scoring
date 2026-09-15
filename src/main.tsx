
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import { whenReady } from "./app/net.ts";
  import "./styles/index.css";

  const root = createRoot(document.getElementById("root")!);

  /*
   * In LAN network mode we wait for the initial store snapshot from the
   * server (or the failed-connection signal) before the first render, so a
   * freshly-joined phone shows the current match immediately instead of an
   * empty screen. whenReady() resolves quickly either way (there is a short
   * timeout on the server ping), so single-device / offline use is unaffected.
   */
  whenReady().finally(() => {
    root.render(<App />);
  });
