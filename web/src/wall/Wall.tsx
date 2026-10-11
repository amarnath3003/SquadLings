import { useCallback, useEffect, useState } from "react";
import type { BotId } from "@swarm/shared/types";
import { CAST } from "@swarm/shared/cast";
import { S, phase, useLive } from "../live/store";
import { focusBot } from "../live/actions";
import { useDashboard } from "../studio/store";
import { BotTile } from "../studio/components/BotTile";
import { useTakeoverKeys } from "./takeover";
import "../styles/studio-run.css";
import "../styles/squad-wall.css";

// The agents' browsers, as the studio's run screen ("Squad in action") on real runs: a BotTile per agent
// with work (the studio store, fed from our events). Onyx's card is pinned in the chat (chat/OnyxCard).
// Focus is ours (S.ui.focus): the focused tile takes the whole row. Takeover input: wall/takeover.ts.

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return reduced;
}

function Counts() {
  const c = { working: 0, finished: 0, standby: 0, failed: 0 };
  for (const b of S.bots) {
    if (b.status === "working" || b.status === "starting") c.working++;
    else if (b.status === "finished") c.finished++;
    else if (b.status === "failed") c.failed++;
    else if (!b.assignments) c.standby++;
  }
  const parts: [number, string][] = [[c.working, "working"], [c.finished, "done"], [c.failed, "failed"], [c.standby, "standing by"]];
  return (
    <>
      {parts
        .filter(([n]) => n)
        .map(([n, label]) => (
          <span key={label}>
            <b>{n}</b> {label}
          </span>
        ))}
    </>
  );
}

export function Wall() {
  useLive();
  useTakeoverKeys();
  const reduced = useReducedMotion();
  // The agents on the studio's stage (its adapter adds them when they get work), in cast order.
  const botKey = useDashboard((s) =>
    CAST.filter((c) => s.state.bots[c.id])
      .map((c) => c.id)
      .join(","),
  );
  const botIds = (botKey ? botKey.split(",") : []) as BotId[];
  const handleFocus = useCallback((id: BotId) => focusBot(S.ui.focus === id ? null : id), []);

  const side = phase() === "side";
  if (S.ui.focus && !S.botById.has(S.ui.focus)) S.ui.focus = null;
  const focus = side ? S.ui.focus : null;
  const n = botIds.length;
  const seed = S.run?.id ?? "squadlings";

  return (
    <section id="wall" aria-label="The agents' browsers">
      <div className="wall-head">
        <span className="title">Squad</span>
        <span className="counts" id="counts">
          {side && <Counts />}
        </span>
        <span className="spacer" />
        <span id="wall-hint">{side ? (focus ? "1–5 switch agents" : "Click a browser to focus it") : ""}</span>
        <button id="to-grid" className="btn small ghost" type="button" hidden={!focus} onClick={() => focusBot(null)}>
          All agents <kbd>Esc</kbd>
        </button>
      </div>
      <div id="area" className="studio-area">
        {side && (
          <div
            className={`tile-grid count-${n} ${focus ? "has-focus" : ""}`}
            onClick={(ev) => {
              // As classic: a click on an agent's browser focuses it (its ⛶ button toggles).
              const tile = (ev.target as Element).closest<HTMLElement>(".tile-viewport")?.closest<HTMLElement>("[data-tile]");
              const id = tile?.dataset.tile;
              if (id && S.ui.focus !== id) focusBot(id);
            }}
          >
            {botIds.map((id) => (
              <BotTile key={id} id={id} reduced={reduced} speed={1} load focused={focus === id} onFocus={handleFocus} seed={seed} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
