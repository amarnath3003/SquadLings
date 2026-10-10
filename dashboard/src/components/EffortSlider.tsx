import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { CAST } from "@swarm/shared/cast";
import { BotCharacter } from "../characters/BotCharacter";
import "../styles/effort.css";

export const EFFORTS = ["none", "low", "med", "high", "xhigh"] as const;
export type Effort = (typeof EFFORTS)[number];
const CAPTIONS = [
  "Just hanging out.",
  "A little spark.",
  "Finding their rhythm.",
  "Now we’re moving!",
  "Maximum enthusiasm!",
];

export function EffortSlider({ reduced }: { reduced: boolean }) {
  const [value, onChange] = useState<Effort>("med");
  const [visible, setVisible] = useState(!document.hidden);
  const root = useRef<HTMLElement>(null);
  const id = useId();
  const index = EFFORTS.indexOf(value);
  useEffect(() => {
    let inView = true;
    const update = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    if (root.current) observer.observe(root.current);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return (
    <section ref={root} className={`effort-selector ${reduced ? "effort-still" : ""}`}
      data-effort={value} data-visible={visible} aria-labelledby={`${id}-title`}>
      <div className="effort-heading">
        <div>
          <span className="squad-eyebrow">A LITTLE EXTRA ENTHUSIASM</span>
          <h2 id={`${id}-title`}>Set the effort<span>.</span></h2>
        </div>
        <output className="effort-value">{value}</output>
      </div>
      <p className="effort-hint">Same little dots. A whole lot more energy.</p>
      <div className="effort-dots" aria-hidden="true">
        {CAST.map((bot, i) => (
          <div key={bot.id} className="effort-bounce" style={{
            "--effort-phase": i,
          } as CSSProperties}>
            <BotCharacter id={bot.id} size={64}
              mood={index === 0 ? "calm" : index < 2 ? bot.signature : index < 4 ? "focused" : "happy"}
              reduced={reduced || index === 0} paused={!visible} />
          </div>
        ))}
      </div>
      <p id={`${id}-hint`} className="effort-caption">{CAPTIONS[index]}</p>
      <input
        id={id}
        aria-label="Effort"
        type="range"
        min={0}
        max={4}
        step={1}
        value={index}
        aria-valuetext={value}
        aria-describedby={`${id}-hint`}
        onChange={(event) => onChange(EFFORTS[Number(event.target.value)])}
      />
      <div className="effort-stops" aria-label="Effort presets">
        {EFFORTS.map((effort) => (
          <button key={effort} type="button" aria-pressed={value === effort}
            onClick={() => onChange(effort)}>{effort}</button>
        ))}
      </div>
    </section>
  );
}
