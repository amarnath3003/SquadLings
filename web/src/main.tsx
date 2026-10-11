import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
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

const LandingPage = lazy(() => import("./landing/LandingPage"));
const BackendGate = lazy(() =>
  import("./BackendGate").then((module) => ({ default: module.BackendGate })),
);
const landing =
  import.meta.env.VITE_REMOTE_BACKEND === "true" &&
  location.pathname !== "/app";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense
      fallback={
        <div style={{ padding: 32 }}>Getting the little team together…</div>
      }
    >
      {landing ? <LandingPage /> : <BackendGate />}
    </Suspense>
  </React.StrictMode>,
);
