import {
  playUi,
  voiceSequence,
  stopAudio,
  scheduleAudio,
} from "../effects/sound";
import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { CAST } from "@swarm/shared/cast";
import { estimateRun } from "@swarm/shared/pricing";
import { BotCharacter } from "../characters/BotCharacter";
import { MasterLogo } from "../characters/MasterLogo";
import { Icon } from "../characters/icons";
import { ROLES, type TemplateId } from "../lab/fakeRun";
function SeatCharacter({
  id,
  offset,
  reduced,
  index,
  launching = false,
}: {
  id: (typeof CAST)[number]["id"];
  offset: { x: number; y: number };
  reduced: boolean;
  index: number;
  launching?: boolean;
}) {
  const present = useIsPresent(),
    bot = CAST[index];
  return (
    <motion.div
      initial={{
        opacity: 0,
        scale: reduced ? 1 : 0.5,
        x: reduced ? 0 : offset.x,
        y: reduced ? 0 : offset.y,
      }}
      animate={{
        opacity: launching ? 0 : 1,
        scale: launching && !reduced ? 0.9 : 1,
        x: 0,
        y: 0,
      }}
      exit={{
        opacity: 0,
        scale: reduced ? 1 : 0.5,
        x: reduced ? 0 : offset.x,
        y: reduced ? 0 : offset.y,
      }}
      transition={{ duration: reduced ? 0.15 : 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <BotCharacter
        id={id}
        mood={present ? bot.signature : "content"}
        size={76}
        reduced={reduced}
        interactive
      />
    </motion.div>
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
  const changeCount = (next: number) => {
    if (disabled || next === count) return;
    stopAudio("preview");
    const added = next > count,
      changed = CAST.slice(Math.min(count, next), Math.max(count, next));
    changed.forEach((bot, i) =>
      scheduleAudio(
        () => {
          playUi(added ? "join" : "leave", { botId: bot.id, scope: "preview" });
        },
        i * 700,
        "preview",
      ),
    );
    voiceSequence(
      changed.map((bot) => bot.id),
      added ? "greeting" : "frustration",
      "preview",
    );
    onChange(next);
  };
  const root = useRef<HTMLElement>(null),
    [offsets, setOffsets] = useState<Record<string, { x: number; y: number }>>(
      {},
    );
  useLayoutEffect(() => {
    const measure = () => {
      const master = root.current
        ?.querySelector(".master-seat .master-logo")
        ?.getBoundingClientRect();
      if (!master) return;
      const next: Record<string, { x: number; y: number }> = {};
      root.current
        ?.querySelectorAll<HTMLElement>("[data-seat]")
        .forEach((element) => {
          const rect = element.getBoundingClientRect();
          next[element.dataset.seat!] = {
            x: master.x + master.width / 2 - rect.x - rect.width / 2,
            y: master.y + master.height / 2 - rect.y - rect.height / 2,
          };
        });
      setOffsets(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  return (
    <section
      ref={root}
      className="squad-builder"
      aria-labelledby="squad-heading"
    >
      <div className="section-label">
        <span id="squad-heading">ASSEMBLE YOUR SQUAD</span>
        <span className="muted">01 — 05</span>
      </div>
      <div className="lineup">
        <div className="master-seat">
          <MasterLogo size={60} reduced={reduced} shared />
          <strong>Master</strong>
          <span>The planner</span>
        </div>
        <div className="lineup-divider" />
        {CAST.map((bot, i) => (
          <div
            key={bot.id}
            className={`seat ${i >= count ? "seat-empty" : ""}`}
          >
            <div className="seat-art" data-seat={bot.id}>
              <AnimatePresence mode="sync">
                {i < count ? (
                  <SeatCharacter
                    key={bot.id}
                    id={bot.id}
                    index={i}
                    reduced={reduced}
                    launching={launching}
                    offset={offsets[bot.id] ?? { x: -90 * (i + 1), y: 0 }}
                  />
                ) : (
                  <motion.div
                    key="empty"
                    className="empty-seat"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <Icon name="plus" size={17} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <strong>{bot.name}</strong>
            <motion.span
              key={template}
              initial={{ rotateX: reduced ? 0 : 80, opacity: 0 }}
              animate={{ rotateX: 0, opacity: 1 }}
              transition={{ duration: 0.2, delay: reduced ? 0 : i * 0.04 }}
            >
              {ROLES[template][i]}
            </motion.span>
          </div>
        ))}
      </div>
      <div className="slider-row">
        <button
          className="round-button"
          data-audio="off"
          onClick={() => changeCount(Math.max(1, count - 1))}
          disabled={disabled || count === 1}
          aria-label="Remove a bot"
        >
          <Icon name="minus" size={16} />
        </button>
        <div className="range-wrap">
          <input
            aria-label="Squad size"
            type="range"
            min="1"
            max="5"
            step="1"
            value={count}
            disabled={disabled}
            aria-valuetext={`${count} bots: ${CAST.slice(0, count)
              .map((b) => b.name)
              .join(", ")}`}
            data-audio="off"
            onChange={(e) => changeCount(Number(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "PageUp" || e.key === "PageDown") {
                e.preventDefault();
                changeCount(
                  Math.max(
                    1,
                    Math.min(5, count + (e.key === "PageUp" ? 1 : -1)),
                  ),
                );
              }
            }}
            style={{ accentColor: CAST[count - 1].color }}
          />
          <div className="range-ticks">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
        </div>
        <button
          className="round-button"
          data-audio="off"
          onClick={() => changeCount(Math.min(5, count + 1))}
          disabled={disabled || count === 5}
          aria-label="Add a bot"
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
      <div className="squad-summary">
        <span>
          <strong>
            {count} little {count === 1 ? "teammate" : "teammates"}
          </strong>
          <span className="summary-names">
            {" "}
            ·{" "}
            {CAST.slice(0, count)
              .map((b) => b.name)
              .join(", ")}
          </span>
        </span>
        <span title="Spec planning estimate only. The Lab costs $0.">
          est. ${estimateRun(count).toFixed(2)} / real run
        </span>
      </div>
    </section>
  );
}
