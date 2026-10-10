import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { BotId } from "@swarm/shared/types";
import { castFor } from "@swarm/shared/cast";
import { BotCharacter } from "../characters/BotCharacter";
import { Icon } from "../characters/icons";
import { useDashboard } from "../store";
import { playUi } from "../effects/sound";
export function ResultDialog({
  ids,
  reduced,
  findings,
  onClose,
}: {
  ids: BotId[];
  reduced: boolean;
  findings: number;
  onClose: () => void;
}) {
  const root = useRef<HTMLElement>(null),
    bots = useDashboard((s) => s.state.bots);
  const close = () => {
    playUi("close");
    onClose();
  };
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      document.body.style.overflow = previous;
      document
        .querySelector<HTMLButtonElement>(".run-controls .primary-button")
        ?.focus();
    };
  }, []);
  return (
    <div className="result-backdrop">
      <motion.section
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-title"
        className="result-drawer"
        initial={{ opacity: 0, y: reduced ? 0 : 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduced ? 0 : 30 }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
          if (event.key === "Tab") {
            const buttons = Array.from(
              root.current!.querySelectorAll<HTMLButtonElement>("button"),
            );
            const first = buttons[0],
              last = buttons.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <button
          className="icon-button result-close"
          aria-label="Close sample result"
          data-audio="off"
          onClick={close}
        >
          <Icon name="x" />
        </button>
        <span className="eyebrow">THAT’S A LITTLE TEAMWORK</span>
        <div className="team-photo">
          {ids.map((id, index) => (
            <motion.div
              key={id}
              initial={{ y: reduced ? 0 : -12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: reduced ? 0 : index * 0.1 }}
            >
              <BotCharacter
                id={id}
                mood={
                  bots[id]?.status === "failed"
                    ? "failed"
                    : bots[id]?.status === "out_of_budget"
                      ? "content"
                      : "happy"
                }
                size={68}
                reduced={reduced}
              />
            </motion.div>
          ))}
        </div>
        <h2 id="result-title">
          Better together<span>.</span>
        </h2>
        <p>
          The squad finished its simulated run. Example findings were shared and
          reports came back to the Master.
        </p>
        <div className="result-facts">
          <span>{ids.length} teammates</span>
          <span>{findings} shared findings</span>
          <span>$0 API cost</span>
        </div>
        <button className="primary-button" data-audio="off" onClick={close}>
          Back to the squad <Icon name="arrow" size={16} />
        </button>
        <small>
          This is a Character Lab demonstration. No real task was performed.
        </small>
      </motion.section>
    </div>
  );
}
