import { memo, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ORCHESTRATOR } from "@swarm/shared/cast";
import type { Mood } from "@swarm/shared/types";
import { FACES } from "./faces";

export const MASTER_LINES: Record<string, string> = {
  idle: ORCHESTRATOR.line,
  classifying: "First, let’s make sense of this.",
  planning: "A little order. A clear way forward.",
  monitoring: "You explore. I’ll keep us together.",
  receiving: "Got it. Nicely done.",
  "needs you": "Your call. We’ll wait.",
  merging: "Every piece has its place.",
  done: "Look at what we made.",
  failed: "Take a breath. We can try again.",
};
const MOODS: Record<string, Mood> = {
  idle: "happy",
  classifying: "curious",
  planning: "focused",
  monitoring: "suspicious",
  receiving: "found",
  "needs you": "worried",
  merging: "focused",
  done: "happy",
  failed: "failed",
};

// The reference's paired white carets are the resting look. Extra details
// appear only for an active reaction; they never become part of the base face.
function ReactionDetail({ state }: { state: string }) {
  if (state === "needs you") return <ellipse cx="32" cy="43" rx="2.5" ry="3" />;
  const mouths: Record<string, string> = {
    receiving: "M27 42Q32 47 37 42",
    done: "M25 41Q32 51 39 41",
    failed: "M27 46Q32 41 37 46",
  };
  return mouths[state] ? <path d={mouths[state]} /> : null;
}

export const MasterCharacter = memo(function MasterCharacter({
  state = "idle",
  reduced = false,
  size = 48,
  tick = 0,
  shared = false,
}: {
  state?: string;
  reduced?: boolean;
  size?: number;
  tick?: number;
  shared?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const lastTick = useRef(tick);
  const [awake, setAwake] = useState(false);
  const [receiving, setReceiving] = useState(false);

  useEffect(() => {
    let inView = false;
    const update = () => setAwake(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    observer.observe(root.current!);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    const freshReport = tick > lastTick.current;
    lastTick.current = tick;
    setReceiving(awake && freshReport);
    if (!awake || !freshReport) return;
    const timer = setTimeout(() => setReceiving(false), 700);
    return () => clearTimeout(timer);
  }, [tick, awake, state]);

  // Approval and terminal states keep priority over an incoming report.
  const face =
    receiving && !["needs you", "done", "failed"].includes(state)
      ? "receiving"
      : state;
  return (
    <motion.div
      ref={root}
      layoutId={shared && !reduced ? "master-character" : undefined}
      className="master-character"
      data-state={face}
      data-active={awake && !reduced}
      style={{ width: size, height: size }}
      title={`${ORCHESTRATOR.name} · ${ORCHESTRATOR.personality}. ${MASTER_LINES[face] ?? ORCHESTRATOR.line}`}
    >
      <svg
        className="onyx-art"
        viewBox="0 0 64 64"
        role="img"
        aria-label={`${ORCHESTRATOR.name}, ${face}`}
      >
        <g
          className="onyx-body"
          key={face === "receiving" ? `receiving-${tick}` : face}
        >
          <circle
            data-onyx-body
            cx="32"
            cy="32"
            r="30"
            fill={ORCHESTRATOR.color}
          />
          <g className="onyx-face">
            <g className="onyx-symbols">{FACES[MOODS[face] ?? "happy"]}</g>
            <g
              data-onyx-reaction
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <ReactionDetail state={face} />
            </g>
          </g>
        </g>
      </svg>
    </motion.div>
  );
});
