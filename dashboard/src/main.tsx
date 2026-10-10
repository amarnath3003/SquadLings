import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DEVDAY_COLORS } from "@swarm/shared/cast";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/life.css";
import "./styles/sound.css";
import "./styles/squad.css";

for (const [name, color] of Object.entries(DEVDAY_COLORS)) {
  document.documentElement.style.setProperty(`--event-${name}`, color);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
