import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CAST, ORCHESTRATOR } from "@swarm/shared/cast";
import { estimateRun } from "@swarm/shared/pricing";
import { SquadFire } from "./SquadFire";
import { BotCharacter } from "../characters/BotCharacter";
import { MasterCharacter } from "../characters/MasterCharacter";
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
        ? "Every great team starts with one."
        : `${count === 1 ? "One bright mind" : `${count} bright minds`}. Better together.`;
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
        <div>
          <span className="squad-eyebrow">YOUR CREW, YOUR CALL</span>
          <h2 id="squad-heading">
            Pick your squad<span>.</span>
          </h2>
        </div>
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
      <p id="squad-hint" className="squad-hint">
        A small crew. Big possibilities.
      </p>
      <div
        className="squad-stepper"
        role="group"
        aria-label="Choose squad size"
        aria-describedby="squad-hint"
      >
        <button
          type="button"
          className="squad-step squad-remove"
          data-audio="off"
          onClick={() => changeCount(count - 1)}
          disabled={disabled || count === 0}
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
      <div className="squad-roster">
        <strong>
          {count
            ? CAST.slice(0, count).map((bot) => bot.name).join(" · ")
            : "Your crew starts here"}
        </strong>
        <span>
          {count === 0
            ? "Tap + to meet Plum"
            : count === 5
              ? "All five. Ready for anything."
              : `Next up: ${CAST[count].name} · ${ROLES[template][count]}`}
        </span>
      </div>
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
          <MasterCharacter size={32} reduced={reduced || !visible} shared />
          <span>
            {ORCHESTRATOR.name} has the plan.
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
