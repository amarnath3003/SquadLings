import { useEffect, useRef, useState } from "react";
import { CAST } from "@swarm/shared/cast";
import { FilmWorld } from "./FilmWorld";
import { CircleSequence, ColdOpen } from "./CircleSequence";
import { SquadSlider } from "../launch/SquadSlider";
import { DURATION, TASK, clamp, ease, sceneAt } from "./timeline";
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
              <span className="film-input-spark">+</span>
              <span className="film-input-text">
                {TASK.slice(
                  0,
                  Math.floor(clamp((time - 2.55) / 3.1) * TASK.length),
                )}
                <i className="film-caret" />
              </span>
              <span className="film-input-count">
                <span>
                  {CAST.map((bot, i) => (
                    <i
                      key={bot.id}
                      style={{ background: i < count ? bot.color : "#34343a" }}
                    />
                  ))}
                </span>
                {count} agents
              </span>
              <span
                aria-label="Send task"
                className={time >= 9.45 ? "film-go film-go-pressed" : "film-go"}
              >
                ↑
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
                  left: 1070 + 214 * ease((time - 8.8) / 0.6),
                  top:
                    625 -
                    225 * ease((time - 8.8) / 0.6) +
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
        {time >= 13.1 && <FilmWorld time={time} />}
        {time >= 10 && time < 14 && <CircleSequence elapsed={time - 10} />}
        {time < 2.6 && <ColdOpen time={time} />}
        {time >= 14 && time < 42 && (
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
