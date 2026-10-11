import { useEffect, useState } from "react";
import { S, clip, runActive } from "../live/store";
import { MasterCharacter } from "../characters/MasterCharacter";
import { DotWave, runSquad } from "./DotWave";

// The one "Onyx is working" indicator, inside the thread right after the last message (like a chat
// typing indicator): a small Onyx, the squad as coloured dots in a wave, and what Onyx is doing. The
// roaming characters shrink into these dots when you send, and pop back out when the plan is ready
// (RoamLayer). While it shows, the Activity line above the box stays empty (shell/Shell.tsx).

/** Onyx is starting up or thinking in the open live run. */
export function thinkingShown() {
  const r = S.view === "run" ? S.run : null;
  return Boolean(r && runActive() && (r.status === "starting" || r.masterBusy));
}

function useReduced() {
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(m.matches);
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  return reduced;
}

/** Rendered by the thread (which already re-renders on every change and keeps to the bottom). */
export function ThinkingRow() {
  const reduced = useReduced();
  if (!thinkingShown()) return null;
  const r = S.run!;
  const doing = r.status === "starting" ? (r.step ?? "Starting") : `${r.masterDoing ?? "Thinking"}`;
  return (
    <div id="thinking-row" className="thinking-row" role="status" aria-label={`Onyx: ${doing}`}>
      <span className="thinking-onyx" aria-hidden="true">
        <MasterCharacter state="planning" size={26} reduced={reduced} />
      </span>
      <DotWave ids={runSquad()} size={10} gap={7} anchor className="thinking-dots" />
      <span className="thinking-text" title={doing}>
        {clip(doing, 90)}
      </span>
    </div>
  );
}
