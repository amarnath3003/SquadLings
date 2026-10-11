import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CAST } from "@swarm/shared/cast";
import { SquadFire } from "./SquadFire";
import { BotCharacter } from "../characters/BotCharacter";
import { Icon } from "../characters/icons";
import {
  playUi,
  playVoice,
  stopAudio,
  voiceSequence,
  scheduleAudio,
} from "../effects/sound";

// From the character studio (github.com/amarnath3003/squadlings, dashboard/src/launch/SquadSlider.tsx
// at 45f625f). Kept: the stack between − and +, arrivals and departures, greetings, the full-squad
// fire and sounds. Dropped: the copy around it (eyebrow, hint, roster, greeting lines, estimate).
// Added: `min`, since a run needs at least one agent.

export function SquadSlider({
  count,
  onChange,
  min = 0,
  reduced,
  disabled = false,
  launching = false,
}: {
  count: number;
  onChange: (n: number) => void;
  min?: number;
  reduced: boolean;
  disabled?: boolean;
  launching?: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(!document.hidden);
  const [awake, setAwake] = useState(count);
  const [encounter, setEncounter] = useState<{
    index: number;
    serial: number;
  }>();
  const awakeRef = useRef(count);
  const countRef = useRef(count);
  const selectionRef = useRef(count);
  countRef.current = count;

  useEffect(() => {
    let inView = true;
    const update = () => {
      const active = inView && !document.hidden;
      setVisible(active);
      if (!active) {
        // Finish the selection silently; returning must not replay missed greetings.
        awakeRef.current = countRef.current;
        setAwake(countRef.current);
        setEncounter(undefined);
        stopAudio("preview");
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    if (root.current) observer.observe(root.current);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      stopAudio("preview");
    };
  }, []);

  // Keep audio independent of the motion preference; toggling motion cannot restart voices.
  useEffect(() => {
    const previous = selectionRef.current;
    selectionRef.current = count;
    const from = awakeRef.current;
    if (visible && count !== previous) {
      playUi("tick", {
        botId: CAST[Math.max(0, count - 1)].id,
        scope: "preview",
      });
      if (count < previous && from > count) {
        const departing = CAST[from - 1].id;
        playUi("leave", { botId: departing, scope: "preview" });
        playVoice(departing, "sleep", { scope: "preview" });
      }
      if (count > from) {
        const arriving = CAST.slice(from, count);
        voiceSequence(
          arriving.map((bot) => bot.id),
          "greeting",
          "preview",
        );
        arriving.forEach((bot, offset) =>
          scheduleAudio(
            () => {
              playUi("join", { botId: bot.id, scope: "preview" });
              if (bot.id === "bot5")
                playUi("ready", { scope: "preview", priority: 3 });
            },
            offset * 700,
            "preview",
          ),
        );
      }
    }
    return () => stopAudio("preview");
  }, [count, visible]);

  useEffect(() => {
    const from = awakeRef.current;
    setEncounter(undefined);
    if (count <= from || reduced || !visible) {
      awakeRef.current = count;
      setAwake(count);
      return;
    }
    // A jump to five still introduces the cast one at a time. Changing the count cancels this sequence.
    const timers = CAST.slice(from, count).map((_, offset) =>
      setTimeout(() => {
        const index = from + offset;
        awakeRef.current = index + 1;
        setAwake(index + 1);
        setEncounter({ index, serial: performance.now() });
      }, offset * 700),
    );
    timers.push(
      setTimeout(
        () => setEncounter(undefined),
        (count - from - 1) * 700 + 2200,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [count, reduced, visible]);

  const changeCount = (next: number) => {
    next = Math.max(min, Math.min(5, next));
    if (!disabled && next !== count) onChange(next);
  };
  const full = count === 5 && awake === 5;
  const lastColor = count ? CAST[count - 1].color : "#a3a39c";
  return (
    <section
      ref={root}
      className={`squad-builder squad-selector ${full ? "squad-powered" : ""} ${reduced ? "squad-still" : ""}`}
      aria-labelledby="squad-heading"
      data-count={count}
      data-awake={awake}
      data-visible={visible}
      style={
        {
          "--squad-color": count ? lastColor : "var(--event-purple)",
          "--stack-count": Math.max(1, count),
        } as CSSProperties
      }
    >
      <div className="squad-selector-heading">
        <h2 id="squad-heading">
          Pick your squad<span>.</span>
        </h2>
        <output
          className="squad-count"
          aria-live="polite"
          aria-atomic="true"
          aria-label="Squad size"
        >
          <strong>{count}</strong>
          <span>/ 5 agents</span>
        </output>
      </div>
      <div
        className="squad-stepper"
        role="group"
        aria-label="Choose squad size"
      >
        <button
          type="button"
          className="squad-step squad-remove"
          data-audio="off"
          onClick={() => changeCount(count - 1)}
          disabled={disabled || count <= min}
          aria-label="Remove a bot"
        >
          <Icon name="minus" size={20} />
        </button>
        <div className="squad-stack-stage">
          <div className="squad-stack">
            {full && <SquadFire active={visible} reduced={reduced} />}
            {count === 0 && (
              <div className="squad-empty" aria-hidden="true">
                <span /><span />
              </div>
            )}
            <AnimatePresence initial={false}>
              {CAST.slice(0, count).map((bot, i) => {
                const newcomer = encounter?.index === i;
                const neighbor = encounter?.index === i + 1;
                const greeting = newcomer || neighbor;
                return (
                  <motion.div
                    key={bot.id}
                    className="seat agent-seat agent-awake"
                    data-agent={bot.id}
                    data-state="awake"
                    data-powered={full}
                    style={{ "--stack-index": i, zIndex: i + 2 } as CSSProperties}
                    initial={reduced ? false : { opacity: 0, x: 24, scale: 0.65, rotate: 12 }}
                    animate={{ opacity: 1, x: 0, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, x: 16, scale: 0.7, rotate: -8 }}
                    transition={{ duration: reduced ? 0 : 0.24, ease: "easeOut" }}
                  >
                    <div className="seat-art" data-seat={bot.id}>
                      <div className={`agent-body ${launching ? "agent-launching" : ""}`}>
                        <BotCharacter
                          id={bot.id}
                          mood={full ? "focused" : greeting ? "happy" : bot.signature}
                          size={64}
                          reduced={reduced}
                          paused={!visible}
                          attention={newcomer && i > 0 ? -1 : neighbor ? 1 : undefined}
                          cue={greeting ? { gesture: newcomer ? "wave" : "nod", serial: encounter!.serial } : undefined}
                        />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
        <button
          type="button"
          className="squad-step squad-add"
          data-audio="off"
          onClick={() => changeCount(count + 1)}
          disabled={disabled || count === 5}
          aria-label="Add a bot"
        >
          <Icon name="plus" size={20} />
        </button>
      </div>
    </section>
  );
}
