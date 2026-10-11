import React from "react";
import ReactDOM from "react-dom/client";
import { BackendGate } from "./BackendGate";
import { DEVDAY_COLORS } from "@swarm/shared/cast";
import "./styles/tokens.css";
import "./styles/theme.css";
import "./styles/characters.css";
import "./styles/life.css";
import "./styles/sound.css";
import "./styles/squad.css";
import "./styles/classic.css";
import "./styles/picker.css";
import "./styles/chrome.css";

for (const [name, color] of Object.entries(DEVDAY_COLORS)) {
  document.documentElement.style.setProperty(`--event-${name}`, color);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BackendGate />
  </React.StrictMode>,
);
