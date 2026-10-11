import type { CSSProperties } from "react";
import { CAST, castFor } from "@swarm/shared/cast";
import type { BotId } from "@swarm/shared/types";
import { S } from "../live/store";
import "./roam.css";

// The one "thinking" indicator: a dot per agent in its colour, doing a staggered wave. With reduced
// motion the dots only pulse. `anchor` marks the dots as landing spots for the roaming squad
// (RoamLayer flies each character into its dot, and pops it back out when the plan is ready).

/** The agents of the open run (or the squad you picked, before the server has said). */
export function runSquad(): BotId[] {
  if (S.bots.length) return S.bots.map((b) => b.id as BotId).filter((id) => CAST.some((c) => c.id === id));
  const n = Number((S.run?.options as { bots?: number } | undefined)?.bots) || lastSquad;
  return CAST.slice(0, Math.max(1, Math.min(5, n))).map((c) => c.id);
}

/** The squad size RoamLayer last saw in the composer (a fallback before the run's options arrive). */
export let lastSquad = 3;
export const setLastSquad = (n: number) => void (lastSquad = n);

export function DotWave({ ids, size = 6, gap, anchor = false, className = "" }: { ids?: BotId[]; size?: number; gap?: number; anchor?: boolean; className?: string }) {
  const list = ids ?? runSquad();
  return (
    <span
      className={`dot-wave ${className}`}
      style={{ "--dw-size": `${size}px`, "--dw-gap": `${gap ?? Math.max(3, Math.round(size * 0.55))}px` } as CSSProperties}
      aria-hidden="true"
    >
      {list.map((id, i) => (
        <i key={id} data-roam-dot={anchor ? id : undefined} style={{ "--c": castFor(id).color, "--i": i } as CSSProperties} />
      ))}
    </span>
  );
}
