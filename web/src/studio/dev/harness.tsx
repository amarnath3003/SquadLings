// Dev-only harness (not in the build): the real App (which mounts StudioFx and so the event adapter), plus
// helpers to drive the studio from recorded events without a server.
// Open /src/studio/dev/harness.html on the Vite dev server (SQUADLINGS_API → a mock server, e.g.
// scripts/dev-mock-ui.ts). `window.__studio.play(events)` replays recorded server events live, with their
// original gaps; `?run=<id>` opens a closed chat as App does.
import React from "react";
import ReactDOM from "react-dom/client";
import App from "../../App";
import { S, apply, loadRun, type ServerEvent } from "../../live/store";
import { useDashboard } from "../store";
import { DEVDAY_COLORS } from "@swarm/shared/cast";
import "../../styles/tokens.css";
import "../../styles/theme.css";
import "../../styles/characters.css";
import "../../styles/life.css";
import "../../styles/sound.css";
import "../../styles/squad.css";
import "../../styles/classic.css";
import "../../styles/picker.css";

for (const [name, color] of Object.entries(DEVDAY_COLORS)) document.documentElement.style.setProperty(`--event-${name}`, color);

/** Plays recorded events as a live run (a fresh run id, ts shifted to now, the original gaps × 1/speed). */
async function play(events: ServerEvent[], speed = 1) {
  const runId = `harness-${Date.now().toString(36)}`;
  const t0 = events[0].ts;
  const start = Date.now();
  loadRun({ id: runId, status: "starting", startedAt: start }, [], false);
  for (const [i, e] of events.entries()) {
    const at = (e.ts - t0) / speed;
    const wait = start + at - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    apply({ ...e, id: `${runId}-${i}`, runId, ts: start + at });
  }
}
/** Opens recorded events as a closed chat (the replay path). */
function replay(events: ServerEvent[]) {
  const runId = `harness-past-${Date.now().toString(36)}`;
  loadRun({ id: runId, status: "ended", startedAt: events[0].ts, endedAt: events.at(-1)!.ts }, events.map((e, i) => ({ ...e, id: `${runId}-${i}`, runId })), true);
}
Object.assign(window, { __studio: { play, replay, S, store: useDashboard } });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
