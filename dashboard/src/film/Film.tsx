import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CAST } from "@swarm/shared/cast";
import { BotCharacter } from "../characters/BotCharacter";
import { MasterCharacter } from "../characters/MasterCharacter";
import { useBotActor } from "../characters/useBotActor";
import { CircleSequence, ColdOpen } from "./CircleSequence";
import { SquadSlider } from "../launch/SquadSlider";
import {
  DURATION,
  TASK,
  activityAt,
  clamp,
  ease,
  sceneAt,
  workers,
} from "./timeline";
import { playFilmCue, soundCues, renderSoundtrack } from "./audio";
import "./film.css";

declare global {
  interface Window {
    squadFilm?: {
      seek: (seconds: number) => void;
      play: () => void;
      renderSoundtrack: typeof renderSoundtrack;
      duration: number;
    };
  }
}

function WorkingBot({ index, time }: { index: number; time: number }) {
  const bot = CAST[index];
  const done = time >= workers[index].done;
  const actor = useBotActor(
    bot.id,
    done ? "happy" : "focused",
    false,
    1,
    "film",
  );
  const activity = activityAt(time, index);
  useEffect(() => {
    actor.flourish(activity, { hold: true });
    return () => actor.clearActivity();
  }, [actor, activity]);
  return (
    <BotCharacter
      id={bot.id}
      mood={done ? "happy" : "focused"}
      size={76}
      actor={actor}
      seed="film"
    />
  );
}

function WorkScene({ time }: { time: number }) {
  const completed = workers.filter((w) => time >= w.done).length;
  const reportCount = workers.filter((w) => time >= w.report + 1).length;
  const followup = time >= 24 && time < 27;
  const state = time >= 30.5 ? "merging" : followup ? "planning" : "monitoring";
  return (
    <div className="film-work" style={{ opacity: ease((time - 20) / 0.4) }}>
      <div className="film-heading">
        <h1>In sync.</h1>
      </div>
      <svg className="film-network" viewBox="0 0 1600 900" aria-hidden="true">
        {workers.map((w, i) => {
          const x = w.x + 175,
            y = w.y + 92;
          const path = `M800 470 Q${x} 470 ${x} ${y}`;
          const report = clamp((time - w.report) / 1.1);
          const dispatch = clamp((time - 14.4 - i * 0.22) / 1.1);
          const follow = i === 1 ? clamp((time - 24) / 1.25) : 0;
          return (
            <g key={i}>
              <path
                d={path}
                fill="none"
                stroke={CAST[i].color}
                strokeOpacity=".22"
                strokeWidth="2"
              />
              {[
                dispatch,
                follow,
                report > 0 && report < 1 ? 1 - report : 0,
              ].map((p, k) =>
                p > 0 && p < 1 ? (
                  <g
                    key={k}
                    transform={`translate(${(1 - p) * (1 - p) * 800 + 2 * (1 - p) * p * x + p * p * x}, ${(1 - p) * (1 - p) * 470 + 2 * (1 - p) * p * 470 + p * p * y})`}
                  >
                    <circle r="12" fill={CAST[i].color} />
                    <path d="M-4 0h8M0-4v8" stroke="#000" strokeWidth="2" />
                  </g>
                ) : null,
              )}
            </g>
          );
        })}
      </svg>
      <div className="film-onyx">
        <div className="film-onyx-label">ONYX / ORCHESTRATOR</div>
        <MasterCharacter size={140} state={state} tick={reportCount} />
        <strong>
          {time >= 30.5
            ? "Every piece, one plan."
            : followup
              ? "Lime, add a rainy-day backup."
              : reportCount
                ? "Got it. Keep going, team."
                : "A little order. A clear way forward."}
        </strong>
        <span>
          {completed} / 5 complete <i /> {reportCount} reports received
        </span>
      </div>
      {workers.map((w, i) => {
        const done = time >= w.done;
        const progress = clamp((time - 14.5 - i * 0.18) / (w.done - 14.5));
        const status = done
          ? "Complete"
          : i === 1 && followup
            ? "New task from Onyx"
            : time > w.report && time < w.report + 1.5
              ? "Reporting to Onyx"
              : "Working";
        return (
          <article
            key={i}
            className={`film-task-window ${done ? "film-task-done" : ""}`}
            data-worker={i}
            data-complete={done}
            style={
              {
                left: w.x,
                top: w.y,
                "--worker": CAST[i].color,
                opacity: ease((time - 14 - i * 0.12) / 0.5),
              } as CSSProperties
            }
          >
            <div className="film-window-bar">
              <span>
                <i />
                <i />
                <i />
              </span>
              <small>{w.page}</small>
              <b>{done ? "✓" : "↗"}</b>
            </div>
            <div className="film-worker-row">
              <WorkingBot index={i} time={time} />
              <div>
                <span className="film-worker-name">{CAST[i].name}</span>
                <h2>{w.role}</h2>
                <span className="film-worker-status">{status}</span>
              </div>
            </div>
            <div className="film-browser-copy">
              {w.lines[Math.min(2, Math.floor(progress * 3))]}
            </div>
            <div className="film-progress">
              <span style={{ width: `${progress * 100}%` }} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function WorkCloseup({ time }: { time: number }) {
  const shot = time < 16.5 ? 0 : time < 18.5 ? 1 : 2;
  const index = [0, 3, 1][shot];
  const lines = [
    ["Looks closer.", "Misses less."],
    ["Gets moving.", "Keeps going."],
    ["Finds a way.", "Then another."],
  ][shot];
  const local = time - [14, 16.5, 18.5][shot];
  const bot = CAST[index];
  return (
    <div
      key={shot}
      className="film-closeup"
      style={{
        opacity: ease(local / 0.25),
        transform: `scale(${1 + 0.035 * clamp(local / 2)})`,
      }}
    >
      <div className="film-closeup-character">
        <HeroBot index={index} time={time} />
      </div>
      <div className="film-closeup-copy">
        <span style={{ color: bot.color }}>
          {bot.name} / {workers[index].role}
        </span>
        <h1>
          {lines[0]}
          <br />
          {lines[1]}
        </h1>
        <div className="film-closeup-browser">
          <i style={{ background: bot.color }} />
          <span>{workers[index].lines[shot]}</span>
          <b>↗</b>
        </div>
      </div>
    </div>
  );
}

function HeroBot({ index, time }: { index: number; time: number }) {
  const bot = CAST[index];
  const actor = useBotActor(bot.id, "focused", false, 1, "film-hero");
  const activity = time < 16.5 ? "read" : time < 18.5 ? "type" : "found";
  useEffect(() => {
    actor.flourish(activity, { hold: true });
    return () => actor.clearActivity();
  }, [actor, activity]);
  return (
    <BotCharacter
      id={bot.id}
      mood="focused"
      size={330}
      actor={actor}
      seed="film-hero"
    />
  );
}

function Results({ time }: { time: number }) {
  return (
    <div
      className="film-results"
      style={{
        opacity: ease((time - 31.5) / 0.7) * (1 - ease((time - 38) / 0.4)),
        transform: `translateY(${(1 - ease((time - 31.5) / 0.7)) * 30}px)`,
      }}
    >
      <div className="film-result-title">
        <MasterCharacter state="done" size={94} />
        <h1>Consider it done.</h1>
        <p>Five minds. One weekend worth looking forward to.</p>
      </div>
      <div className="film-itinerary">
        <div className="film-itinerary-top">
          <span>KOCHI / TEAM WEEKEND</span>
          <b>✓ Plan ready</b>
        </div>
        <div className="film-days">
          <div>
            <span>01 / SATURDAY</span>
            <h2>Explore & connect.</h2>
            <p>Settle into Fort Kochi</p>
            <p>Art lanes, cafés & a shared lunch</p>
            <p>Sunset walk along the waterfront</p>
          </div>
          <div>
            <span>02 / SUNDAY</span>
            <h2>Slow down, together.</h2>
            <p>A relaxed breakfast with the team</p>
            <p>Local galleries if the rain rolls in</p>
            <p>One easy route back home</p>
          </div>
        </div>
        <div className="film-deliverables">
          {[
            "Stay shortlist",
            "Food picks",
            "Local discoveries",
            "Grouped routes",
            "Shared itinerary",
          ].map((label, i) => (
            <span key={label}>
              <i style={{ background: CAST[i].color }} />
              {label}
            </span>
          ))}
        </div>
        <small>
          Illustrative itinerary · verify availability before making plans
        </small>
      </div>
    </div>
  );
}

export default function Film() {
  const params = new URLSearchParams(location.search);
  const capture = params.has("capture");
  const initial = Math.max(0, Math.min(DURATION, Number(params.get("t")) || 0));
  const [time, setTime] = useState(initial);
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState(true);
  const [scale, setScale] = useState(
    Math.min(innerWidth / 1600, innerHeight / 900),
  );
  const timeRef = useRef(time);
  const audioRef = useRef<AudioContext>();
  const lastCue = useRef(initial);
  const seek = (seconds: number) => {
    setPlaying(false);
    timeRef.current = Math.max(0, Math.min(DURATION, seconds));
    setTime(timeRef.current);
    lastCue.current = timeRef.current;
  };
  useEffect(() => {
    const resize = () =>
      setScale(Math.min(innerWidth / 1600, innerHeight / 900));
    addEventListener("resize", resize);
    return () => removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    window.squadFilm = {
      seek,
      play: () => setPlaying(true),
      renderSoundtrack,
      duration: DURATION,
    };
    return () => {
      delete window.squadFilm;
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const start = performance.now() - timeRef.current * 1000;
    const tick = (now: number) => {
      const next = Math.min(DURATION, (now - start) / 1000);
      if (sound && audioRef.current) {
        soundCues
          .filter((cue) => cue.at > lastCue.current && cue.at <= next)
          .forEach((cue) => playFilmCue(audioRef.current!, cue));
      }
      lastCue.current = next;
      timeRef.current = next;
      setTime(next);
      if (next < DURATION) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, sound]);
  useEffect(
    () => () => {
      void audioRef.current?.close();
    },
    [],
  );
  const start = async () => {
    if (timeRef.current >= DURATION) seek(0);
    if (sound) {
      audioRef.current ??= new AudioContext();
      await audioRef.current.resume();
    }
    setPlaying(true);
  };
  const scene = sceneAt(time);
  const count = Math.max(0, Math.min(5, Math.floor((time - 6.1) / 0.48) + 1));
  const intro = time < 13.1;
  const work = time >= 20 && time < 31.5;
  const closeup = time >= 13.1 && time < 20;
  const results = time >= 31.5 && time < 41.1;
  const ending = time >= 41.1;
  return (
    <main className="film-shell">
      <div
        className="film-stage"
        style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
        data-scene={scene}
        data-time={time.toFixed(3)}
      >
        {intro && (
          <section
            className="film-intro"
            style={{
              opacity:
                ease((time - 2.15) / 0.4) * (1 - ease((time - 9.95) / 0.4)),
            }}
          >
            <div className="film-heading">
              <h1>{time < 6 ? "One task." : "Your squad."}</h1>
            </div>
            <div className="film-input">
              <span className="film-input-spark">✳</span>
              <span>
                {TASK.slice(
                  0,
                  Math.floor(clamp((time - 2.55) / 3.1) * TASK.length),
                )}
                <i className="film-caret" />
              </span>
              <span
                className={time >= 9.45 ? "film-go film-go-pressed" : "film-go"}
              >
                Go ↗
              </span>
            </div>
            <div
              className="film-picker"
              data-add={
                time >= 6.1 && time <= 8.2 && (time - 6.1) % 0.48 < 0.13
              }
              style={{
                opacity: ease((time - 5.8) / 0.5),
                transform: `translateY(${(1 - ease((time - 5.8) / 0.5)) * 24}px)`,
              }}
            >
              <SquadSlider
                count={count}
                onChange={() => {}}
                template="trip_planner"
                reduced={false}
                launching={time >= 9.5}
                disabled
              />
              <div className="film-selected-count">
                <strong>{count}</strong> {count === 1 ? "mind" : "minds"}.{" "}
                {count === 5 ? "Ready." : "Coming together."}
              </div>
            </div>
            {time >= 5.95 && time < 9.85 && (
              <svg
                className="film-demo-pointer"
                viewBox="0 0 24 30"
                style={{
                  left: 1070 + 155 * ease((time - 8.8) / 0.6),
                  top:
                    575 -
                    175 * ease((time - 8.8) / 0.6) +
                    60 * (1 - ease((time - 5.95) / 0.15)),
                }}
              >
                <path
                  d="M2 2v23l6-6 5 10 5-3-5-9h9Z"
                  fill="white"
                  stroke="black"
                  strokeWidth="2"
                />
              </svg>
            )}
          </section>
        )}
        {closeup && <WorkCloseup time={time} />}
        {work && <WorkScene time={time} />}
        {results && <Results time={time} />}
        {ending && (
          <section className="film-ending">
            <h1>
              SquadLink<span className="film-brand-dot">●</span>
            </h1>
            <p>One squad. Many minds.</p>
            <div
              className="film-sleep-line"
              style={{
                opacity: ease((time - 41.4) / 0.6),
                transform: `scale(${0.92 + 0.08 * ease((time - 41.2) / 1)})`,
              }}
            >
              <div className="film-sleep-onyx">
                <MasterCharacter
                  state={time < 43.5 ? "done" : "idle"}
                  resting={time >= 43.5}
                  size={110}
                />
                {time >= 43.5 && (
                  <span className="sleep-notes">
                    <i>z</i>
                    <i>z</i>
                    <i>z</i>
                  </span>
                )}
              </div>
              {CAST.map((bot) => (
                <BotCharacter
                  key={bot.id}
                  id={bot.id}
                  mood="happy"
                  size={105}
                  resting={time >= 43.5}
                  seed="film-end"
                />
              ))}
            </div>
            <span
              className="film-rest-caption"
              style={{ opacity: ease((time - 44) / 0.7) }}
            >
              Big task. Little team. Done.
            </span>
          </section>
        )}
        {time >= 10 && time < 14 && (
          <CircleSequence elapsed={time - 10} returning={false} />
        )}
        {time >= 38 && time < 42 && (
          <CircleSequence elapsed={time - 38} returning />
        )}
        {time < 2.6 && <ColdOpen time={time} />}
        {time >= 14 && time < 38 && (
          <small className="film-demo-note">Simulated workflow</small>
        )}
      </div>
      {!capture && (
        <nav className="film-controls" aria-label="Film playback">
          <button onClick={() => (playing ? setPlaying(false) : void start())}>
            {playing ? "Pause" : time >= DURATION ? "Replay" : "Play film"}
          </button>
          <button onClick={() => seek(0)}>Restart</button>
          <label>
            <input
              type="checkbox"
              checked={sound}
              onChange={(e) => setSound(e.target.checked)}
            />{" "}
            Sound
          </label>
          <input
            aria-label="Film position"
            type="range"
            min="0"
            max={DURATION}
            step=".1"
            value={time}
            onChange={(e) => seek(Number(e.target.value))}
          />
          <output>
            {time.toFixed(1)} / {DURATION}s
          </output>
        </nav>
      )}
    </main>
  );
}
