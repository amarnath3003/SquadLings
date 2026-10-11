import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, useInView } from "motion/react";
import { CAST } from "@swarm/shared/cast";
import type { BotId, Mood } from "@swarm/shared/types";
import { BotCharacter } from "../characters/BotCharacter";
import { MasterCharacter } from "../characters/MasterCharacter";
import { useBotActor, type ActivityName } from "../characters/useBotActor";
import "./squad-story.css";

const JOBS = [
  "Find a stay",
  "Find the good stuff",
  "Pick the cafés",
  "Plan the route",
  "Build the itinerary",
];
const ACTIONS: ActivityName[] = ["read", "scroll", "type", "found", "output"];
const PHASES = [
  "One idea lands with Onyx.",
  "Five little missions, coming right up.",
  "Everybody has a part to play.",
  "Little discoveries, coming together.",
  "One plan. From the whole squad.",
];
const PHASE_AT = [0, 2, 5, 11, 15];
const DURATION = 20;

function Worker({
  id,
  index,
  phase,
  beat,
  paused,
  reduced,
}: {
  id: BotId;
  index: number;
  phase: number;
  beat: number;
  paused: boolean;
  reduced: boolean;
}) {
  const mood: Mood = phase >= 3 ? "found" : phase === 2 ? "focused" : "curious";
  const actor = useBotActor(id, mood, reduced, 1, "landing-mission");
  const activity =
    phase === 2
      ? ACTIONS[(index + beat) % ACTIONS.length]
      : phase >= 3
        ? "finish"
        : null;
  useEffect(() => {
    if (activity && !paused) actor.flourish(activity, { hold: true });
    else actor.clearActivity();
    return () => actor.clearActivity();
  }, [actor, activity, paused]);
  return (
    <BotCharacter
      id={id}
      mood={mood}
      actor={actor}
      size={94}
      reduced={reduced}
      paused={paused}
      seed="landing-mission"
    />
  );
}

export function SquadStory({ reduced }: { reduced: boolean }) {
  const root = useRef<HTMLElement>(null);
  const inView = useInView(root, { amount: 0.25 });
  const [visible, setVisible] = useState(!document.hidden);
  const [paused, setPaused] = useState(reduced);
  const [elapsed, setElapsed] = useState(0);
  const [round, setRound] = useState(0);
  const phase = PHASE_AT.reduce(
    (value, at, index) => (elapsed >= at ? index : value),
    0,
  );
  const running = inView && visible && !paused;
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => { if (media.matches) setPaused(true); };
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(
      () =>
        setElapsed((value) => (value >= DURATION - 0.25 ? 0 : value + 0.25)),
      250,
    );
    return () => clearInterval(timer);
  }, [running, round]);
  const masterState = [
    "classifying",
    "planning",
    "monitoring",
    "receiving",
    "done",
  ][phase];
  function replay() {
    setElapsed(0);
    setRound((value) => value + 1);
    setPaused(false);
  }
  return (
    <section
      ref={root}
      id="playground"
      className="sl-story"
      data-phase={phase}
      data-running={running}
    >
      <div className="sl-container">
        <div className="sl-story-heading">
          <div>
            <span className="sl-eyebrow">WATCH THE LITTLE TEAM AT WORK</span>
            <h2>
              It starts with Onyx.
              <br />
              <span className="sl-italic">It happens together.</span>
            </h2>
          </div>
          <p>
            One task travels out.
            <br />
            Five discoveries come home.
          </p>
        </div>
        <div
          className="sl-story-stage"
          aria-label="Animated illustration of Onyx assigning tasks to five agents and combining their findings"
        >
          <div className="sl-story-caption">
            <span>
              <i /> A LITTLE CHOREOGRAPHY
            </span>
            <span>ILLUSTRATIVE WORKFLOW</span>
          </div>
          <div className="sl-story-request">
            <span>✦</span> Plan a weekend in Kochi for our team.
          </div>
          <div className="sl-story-master">
            <MasterCharacter
              size={120}
              state={masterState}
              reduced={reduced || !running}
              tick={phase === 3 ? Math.floor(elapsed) : round}
            />
            <strong>Onyx</strong>
            <span aria-live="polite">{PHASES[phase]}</span>
          </div>
          <div className="sl-story-routes" aria-hidden="true">
            <svg viewBox="0 0 1000 130" preserveAspectRatio="none">
              {CAST.map((bot, index) => (
                <g key={bot.id}>
                  <path
                    d={`M500 0 C500 75 ${100 + index * 200} 45 ${100 + index * 200} 130`}
                    fill="none"
                    stroke={bot.color}
                    strokeOpacity={phase > 0 ? 0.5 : 0.15}
                    strokeWidth="2"
                    strokeDasharray="4 7"
                  />
                  {(phase === 1 || phase === 3) && !reduced && (
                    <motion.circle
                      key={`${round}-${phase}`}
                      r="7"
                      fill={bot.color}
                      initial={{
                        cx: phase === 1 ? 500 : 100 + index * 200,
                        cy: phase === 1 ? 0 : 130,
                        opacity: 0,
                      }}
                      animate={
                        running
                          ? {
                              cx:
                                phase === 1
                                  ? [500, 500, 100 + index * 200]
                                  : [100 + index * 200, 500, 500],
                              cy: phase === 1 ? [0, 60, 130] : [130, 60, 0],
                              opacity: [0, 1, 1, 0],
                            }
                          : { opacity: 0 }
                      }
                      transition={{
                        duration: 1.45,
                        delay: index * 0.2,
                        repeat: Infinity,
                        repeatDelay: 0.6,
                      }}
                    />
                  )}
                </g>
              ))}
            </svg>
          </div>
          <div className="sl-story-workers">
            {CAST.map((bot, index) => (
              <div
                key={bot.id}
                className="sl-story-worker"
                style={{ "--worker-color": bot.color } as CSSProperties}
                data-working={phase === 2}
                data-done={phase >= 3}
              >
                <span className="sl-story-job">
                  {phase === 0 ? "Waiting for Onyx" : JOBS[index]}
                </span>
                <div className="sl-story-worker-character">
                  <Worker
                    id={bot.id}
                    index={index}
                    phase={phase}
                    beat={Math.floor(elapsed / 2)}
                    paused={!running}
                    reduced={reduced}
                  />
                </div>
                <strong>{bot.name}</strong>
                <div className="sl-story-work">
                  <div className="sl-story-work-top">
                    <i />
                    <i />
                    <i />
                  </div>
                  <span className="sl-story-work-line" />
                  <span className="sl-story-work-line short" />
                  <div className="sl-story-work-block">
                    <span>
                      {phase >= 3 ? "✓" : ["⌂", "✦", "☕", "↗", "≡"][index]}
                    </span>
                  </div>
                  <span className="sl-story-work-line" />
                  <span className="sl-story-work-cursor">↖</span>
                </div>
                <span className="sl-story-worker-status">
                  {phase >= 3
                    ? "Findings sent ↗"
                    : phase === 2
                      ? [
                          "Reading the details",
                          "Exploring a little",
                          "Writing things down",
                          "Connecting the dots",
                          "Pulling it together",
                        ][index]
                      : phase === 1
                        ? "Got my mission!"
                        : "Ready when you are"}
                </span>
              </div>
            ))}
          </div>
          <div className={`sl-story-report ${phase === 4 ? "is-ready" : ""}`}>
            <span>✧</span>
            <div>
              <strong>
                {phase === 4
                  ? "Your weekend, together."
                  : "Five paths. One shared purpose."}
              </strong>
              <p>
                {phase === 4
                  ? "A place to stay. Good food. A few discoveries. One little plan."
                  : "Onyx hands out the work, the squad explores, and every finding comes back."}
              </p>
            </div>
            <span className="sl-story-report-check">
              {phase === 4 ? "✓" : "···"}
            </span>
          </div>
          <div className="sl-story-controls">
            <div className="sl-story-progress">
              {["Think", "Assign", "Explore", "Share", "Deliver"].map(
                (label, index) => (
                  <span
                    key={label}
                    data-current={phase === index}
                    data-complete={phase > index}
                  >
                    <i />
                    {label}
                  </span>
                ),
              )}
            </div>
            <div>
              <button
                type="button"
                onClick={() => setPaused((value) => !value)}
                aria-label={
                  paused ? "Play squad animation" : "Pause squad animation"
                }
              >
                {paused ? "▶ Play" : "Ⅱ Pause"}
              </button>
              <button
                type="button"
                onClick={replay}
                aria-label="Replay squad animation"
              >
                ↻ Replay
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
