import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  animate,
  motion,
  useMotionValue,
  type MotionStyle,
} from "motion/react";
import { CAST } from "@swarm/shared/cast";
import { estimateRun } from "@swarm/shared/pricing";
import { SquadFire } from "./SquadFire";
import { BotCharacter } from "../characters/BotCharacter";
import { MasterLogo } from "../characters/MasterLogo";
import { Icon } from "../characters/icons";
import {
  playUi,
  playVoice,
  stopAudio,
  voiceSequence,
  scheduleAudio,
} from "../effects/sound";
import { ROLES, type TemplateId } from "../lab/fakeRun";

const HELLOS = [
  "Eyes open. Let's see.",
  "Hey, Plum!",
  "Oh, hello Lime.",
  "Tango. Let's do this.",
  "Blu! We’re all here!",
];
const REPLIES = [
  "You found us.",
  "Room for one more!",
  "Right behind you.",
  "Now that’s a team.",
];

function Flame({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 32"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M13 1C16 9 7 10 10 17c-4-2-4-5-4-5S0 18 2 24c3 11 22 10 21-2-1-7-5-10-5-10s1 8-3 9C20 11 13 1 13 1Z"
        fill="currentColor"
      />
      <path
        d="M12 18c1 5-5 5-3 10 2 4 9 2 8-2 0-3-3-5-3-5s1 4-2 5c2-4 0-8 0-8Z"
        fill="#FFE9A3"
      />
    </svg>
  );
}

export function SquadSlider({
  count,
  onChange,
  template,
  reduced,
  disabled = false,
  launching = false,
}: {
  count: number;
  onChange: (n: number) => void;
  template: TemplateId;
  reduced: boolean;
  disabled?: boolean;
  launching?: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(!document.hidden);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const thumb = useMotionValue(`${((count + 0.5) / 6) * 100}%`);
  const endDrag = () => {
    draggingRef.current = false;
    setDragging(false);
  };
  const moveThumb = (input: HTMLInputElement, clientX: number) => {
    const box = input.parentElement!.getBoundingClientRect();
    thumb.set(
      `${Math.max(100 / 12, Math.min(1100 / 12, ((clientX - box.x) / box.width) * 100))}%`,
    );
  };
  useEffect(() => {
    if (dragging) return;
    const playback = animate(thumb, `${((count + 0.5) / 6) * 100}%`, {
      duration: reduced ? 0 : 0.18,
      ease: "easeOut",
    });
    return () => playback.stop();
  }, [count, dragging, reduced, thumb]);
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
    // A jump to five still introduces the cast one at a time. Re-scrubbing cancels this sequence.
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
    next = Math.max(0, Math.min(5, next));
    if (!disabled && next !== count) onChange(next);
  };
  const full = count === 5 && awake === 5;
  const lastColor = count ? CAST[count - 1].color : "#a3a39c";
  const message = full
    ? "Full squad. Let’s make it happen."
    : encounter
      ? `${CAST[encounter.index].name}: “${HELLOS[encounter.index]}”`
      : count === 0
        ? "A little nudge. A new teammate."
        : `${count === 1 ? "One bright mind" : `${count} bright minds`}. Better together.`;
  return (
    <section
      ref={root}
      className={`squad-builder squad-selector ${full ? "squad-powered" : ""} ${reduced ? "squad-still" : ""}`}
      aria-labelledby="squad-heading"
      data-awake={awake}
      data-visible={visible}
      data-dragging={dragging}
      style={
        {
          "--squad-color": lastColor,
          "--squad-fill": `${count * 20}%`,
        } as CSSProperties
      }
    >
      <div className="squad-selector-heading">
        <div>
          <span className="squad-eyebrow">BUILD YOUR LITTLE TEAM</span>
          <h2 id="squad-heading">
            Wake your squad<span>.</span>
          </h2>
        </div>
        <div className="squad-count-controls">
          <button
            className="squad-step"
            data-audio="off"
            onClick={() => changeCount(count - 1)}
            disabled={disabled || count === 0}
            aria-label="Remove a bot"
          >
            <Icon name="minus" size={14} />
          </button>
          <output className="squad-count" aria-live="polite" aria-atomic="true">
            <strong>{count}</strong>
            <span>/ 5</span>
          </output>
          <button
            className="squad-step"
            data-audio="off"
            onClick={() => changeCount(count + 1)}
            disabled={disabled || count === 5}
            aria-label="Add a bot"
          >
            <Icon name="plus" size={14} />
          </button>
        </div>
      </div>
      <p id="squad-hint" className="squad-hint">
        Drag a circle along the line to wake your team.
      </p>
      <motion.div
        className="squad-circle-slider squad-range"
        style={{ "--drag-position": thumb } as MotionStyle}
      >
        <div className="squad-rail" aria-hidden="true">
          <span />
        </div>
        {full && (
          <SquadFire active={visible} reduced={reduced} position={thumb} />
        )}
        <div className="lineup squad-lineup">
          <div
            className={`zero-seat ${count === 0 ? "zero-selected" : ""}`}
            aria-hidden="true"
          >
            <span>
              <Icon name="minus" size={13} />
            </span>
            <small>None</small>
          </div>
          {CAST.map((bot, i) => {
            const active = i < awake && i < count;
            const newcomer = active && encounter?.index === i;
            const neighbor = active && encounter?.index === i + 1;
            const greeting = newcomer || neighbor;
            return (
              <div
                key={bot.id}
                className={`seat agent-seat ${active ? "agent-awake" : "seat-empty"} ${newcomer ? "agent-waking" : ""} ${i === count - 1 ? "agent-thumb" : ""} ${greeting ? "agent-greeting" : ""}`}
                data-agent={bot.id}
                data-state={active ? "awake" : i < count ? "queued" : "asleep"}
                data-powered={full}
                style={
                  {
                    "--agent-color": bot.color,
                    "--slot-position": `${((i + 1.5) / 6) * 100}%`,
                  } as CSSProperties
                }
              >
                <div className="seat-art" data-seat={bot.id}>
                  <span className="dormant-orb" aria-hidden="true" />
                  <div
                    className={`agent-body ${launching ? "agent-launching" : ""}`}
                    aria-hidden={!active}
                  >
                    <BotCharacter
                      id={bot.id}
                      mood={
                        full ? "focused" : greeting ? "happy" : bot.signature
                      }
                      size={64}
                      reduced={reduced}
                      paused={!active || !visible}
                      attention={
                        newcomer && i > 0 ? -1 : neighbor ? 1 : undefined
                      }
                      cue={
                        greeting
                          ? {
                              gesture: newcomer ? "wave" : "nod",
                              serial: encounter!.serial,
                            }
                          : undefined
                      }
                    />
                  </div>
                  {i === count - 1 && (
                    <span className="agent-drag-hint" aria-hidden="true">
                      ↔ drag
                    </span>
                  )}
                  {newcomer && (
                    <span className="wake-ring" aria-hidden="true" />
                  )}
                  {neighbor && !full && (
                    <span className="neighbor-reply" aria-hidden="true">
                      {REPLIES[i]}
                    </span>
                  )}
                </div>
                <strong>{bot.name}</strong>
                <span className="agent-role">
                  {full ? "Fired up" : active ? ROLES[template][i] : "Sleeping"}
                </span>
              </div>
            );
          })}
        </div>
        <input
          aria-label="Squad size"
          aria-describedby="squad-hint"
          type="range"
          min="0"
          max="5"
          step="1"
          value={count}
          disabled={disabled}
          aria-valuetext={
            count
              ? `${count} agents: ${CAST.slice(0, count)
                  .map((b) => b.name)
                  .join(", ")}${full ? ". Full squad, fired up." : ""}`
              : "No agents. Slide right to wake Plum."
          }
          data-audio="off"
          onPointerDown={(e) => {
            draggingRef.current = true;
            setDragging(true);
            moveThumb(e.currentTarget, e.clientX);
          }}
          onPointerMove={(e) => {
            if (draggingRef.current) moveThumb(e.currentTarget, e.clientX);
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onBlur={endDrag}
          onChange={(e) => changeCount(Number(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "PageUp" || e.key === "PageDown") {
              e.preventDefault();
              changeCount(count + (e.key === "PageUp" ? 1 : -1));
            }
          }}
        />
      </motion.div>
      <div className="assembly-message" data-encounter={encounter?.index}>
        {full ? (
          <Flame className="squad-fire-icon" />
        ) : (
          <Icon name="spark" size={13} />
        )}
        <span>{message}</span>
      </div>
      <div className="squad-summary">
        <div className="master-seat">
          <MasterLogo size={24} reduced={reduced || !visible} shared />
          <span>
            Master has the plan.
            <br />
            <strong>You pick the team.</strong>
          </span>
        </div>
        <span title="Spec planning estimate only. The Lab costs $0.">
          {count ? (
            <>est. ${estimateRun(count).toFixed(2)} / real run</>
          ) : (
            "No agents selected"
          )}
        </span>
      </div>
    </section>
  );
}
