import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CAST } from "@swarm/shared/cast";
import type { BotId, Mood } from "@swarm/shared/types";
import type { LifeCue } from "../characters/life";
import { SquadFire } from "./SquadFire";
import { BotCharacter } from "../characters/BotCharacter";
import { Icon } from "../characters/icons";
import { playUi, stopAudio } from "../effects/sound";

// How hard each agent thinks, picked like the squad: − and + around the squad you picked. Their faces
// go from bored to focused as effort rises, and the top level lights the full-squad fire. The values
// are the bot model's reasoning efforts (master.md §25: gpt-6-luna refuses "minimal").
export const EFFORTS = [
  { value: "none", label: "None", mood: "bored" },
  { value: "low", label: "Low", mood: "calm" },
  { value: "medium", label: "Medium", mood: "curious" },
  { value: "high", label: "High", mood: "focused" },
  { value: "xhigh", label: "X-High", mood: "focused" },
] as const satisfies readonly { value: string; label: string; mood: Mood }[];
export type Effort = (typeof EFFORTS)[number]["value"];
const TOP = EFFORTS.length - 1;

export function EffortStepper({
  level,
  onChange,
  count,
  reduced,
  disabled = false,
}: {
  level: number;
  onChange: (level: number) => void;
  count: number;
  reduced: boolean;
  disabled?: boolean;
}) {
  const [cues, setCues] = useState<Partial<Record<BotId, LifeCue>>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      stopAudio("preview");
    },
    [],
  );
  const team = CAST.slice(0, Math.max(1, count));
  const full = level === TOP;
  const change = (next: number) => {
    next = Math.max(0, Math.min(TOP, next));
    if (disabled || next === level) return;
    onChange(next);
    playUi("tick", { botId: team.at(-1)!.id, scope: "preview" });
    if (next === TOP) playUi("ready", { scope: "preview", priority: 3 });
    // More effort: the squad perks up one by one. Less: a relaxed nod down the line.
    timers.current.forEach(clearTimeout);
    timers.current = team.map((bot, i) =>
      setTimeout(
        () =>
          setCues((c) => ({
            ...c,
            [bot.id]: { gesture: next > level ? "bounce" : "nod", serial: performance.now() },
          })),
        reduced ? 0 : i * 90,
      ),
    );
  };
  return (
    <section
      className={`squad-builder squad-selector effort-selector ${full ? "squad-powered" : ""} ${reduced ? "squad-still" : ""}`}
      aria-labelledby="effort-heading"
      data-level={EFFORTS[level].value}
      style={
        {
          "--squad-color": team.at(-1)!.color,
          "--stack-count": team.length,
        } as CSSProperties
      }
    >
      <div className="squad-selector-heading">
        <h2 id="effort-heading">
          Set effort<span>.</span>
        </h2>
        <output className="squad-count" aria-live="polite" aria-atomic="true" aria-label="Effort">
          <strong>{EFFORTS[level].label}</strong>
        </output>
      </div>
      <div className="squad-stepper" role="group" aria-label="Choose effort">
        <button
          type="button"
          className="squad-step squad-remove effort-down"
          data-audio="off"
          onClick={() => change(level - 1)}
          disabled={disabled || level === 0}
          aria-label="Less effort"
        >
          <Icon name="minus" size={20} />
        </button>
        <div className="squad-stack-stage">
          <div className="squad-stack">
            {full && <SquadFire active reduced={reduced} />}
            <AnimatePresence initial={false}>
              {team.map((bot, i) => (
                <motion.div
                  key={bot.id}
                  className="seat agent-seat agent-awake"
                  data-agent={bot.id}
                  data-powered={full}
                  style={{ "--stack-index": i, zIndex: i + 2 } as CSSProperties}
                  initial={reduced ? false : { opacity: 0, x: 24, scale: 0.65, rotate: 12 }}
                  animate={{ opacity: 1, x: 0, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, x: 16, scale: 0.7, rotate: -8 }}
                  transition={{ duration: reduced ? 0 : 0.24, ease: "easeOut" }}
                >
                  <div className="seat-art" data-seat={bot.id}>
                    <div className="agent-body">
                      <BotCharacter id={bot.id} mood={EFFORTS[level].mood} size={64} reduced={reduced} cue={cues[bot.id]} />
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
        <button
          type="button"
          className="squad-step squad-add effort-up"
          data-audio="off"
          onClick={() => change(level + 1)}
          disabled={disabled || level === TOP}
          aria-label="More effort"
        >
          <Icon name="plus" size={20} />
        </button>
      </div>
      <div className="effort-meter" aria-hidden="true">
        {EFFORTS.map((e, i) => (
          <i key={e.value} className={i <= level ? "on" : ""} />
        ))}
      </div>
    </section>
  );
}
