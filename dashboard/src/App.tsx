import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { CAST } from "@swarm/shared/cast";
import type { BotId, Mood } from "@swarm/shared/types";
import { BotCharacter } from "./characters/BotCharacter";
import { Icon } from "./characters/icons";
import { SquadSlider } from "./launch/SquadSlider";
import { MasterCard } from "./components/MasterCard";
import { BotTile } from "./components/BotTile";
import { Gallery } from "./lab/Gallery";
import { EventControls, BoardPanel } from "./lab/CharacterLab";
import { useLab } from "./lab/useLab";
import type { TemplateId } from "./lab/fakeRun";
import { useDashboard } from "./store";
import { EffectsCanvas } from "./effects/EffectsCanvas";
import { Flights, fly } from "./effects/Flights";
import { center } from "./director/geometry";
import { playUi, playVoice, stopAudio } from "./effects/sound";
import { MOOD_VOICE } from "./effects/audio/catalogue";
import { useUiSounds } from "./effects/useUiSounds";
import { SoundControls } from "./components/SoundControls";
import { Timeline } from "./components/Timeline";
import { ResultDialog } from "./components/ResultDialog";
import { LivingStage } from "./components/LivingStage";
import { PerformanceMeter } from "./components/PerformanceMeter";

type Tab = "studio" | "run" | "faces" | "guide";
export default function App() {
  useUiSounds();
  const isLab = import.meta.env.DEV && location.pathname === "/lab";
  const [tab, setTab] = useState<Tab>("studio"),
    [count, setCount] = useState(0),
    [template, setTemplate] = useState<TemplateId>("trip_planner"),
    [selected, setSelected] = useState<BotId>("bot1"),
    [seed, setSeed] = useState("little-team"),
    [speed, setSpeed] = useState(1),
    [forceReduced, setForceReduced] = useState(false),
    [load, setLoad] = useState(false),
    [mobile, setMobile] = useState(false),
    [bench, setBench] = useState(false),
    [launching, setLaunching] = useState(false),
    [focus, setFocus] = useState<BotId>(),
    [particles, setParticles] = useState(0),
    [previewMood, setPreviewMood] = useState<Mood>(),
    [previewKey, setPreviewKey] = useState(0);
  const [systemReduced, setSystemReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)"),
      change = () => setSystemReduced(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const reduced = systemReduced || forceReduced;
  const lab = useLab(reduced, speed),
    botKey = useDashboard((s) =>
      CAST.filter((bot) => s.state.bots[bot.id])
        .map((bot) => bot.id)
        .join(","),
    ),
    pending = useDashboard(
      (s) =>
        s.state.approvals.filter((approval) => approval.status === "pending")
          .length,
    ),
    findings = useDashboard((s) => s.state.board.length),
    status = useDashboard((s) => s.state.run.status),
    result = useDashboard((s) => s.state.result);
  const cast = CAST.find((c) => c.id === selected)!;
  const onParticles = useCallback((n: number) => setParticles(n), []);
  const handleFocus = useCallback(
    (id: BotId) => setFocus((current) => (current === id ? undefined : id)),
    [],
  );
  useEffect(() => {
    document.documentElement.dataset.hidden = String(document.hidden);
    const change = () => {
      document.documentElement.dataset.hidden = String(document.hidden);
    };
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  useEffect(() => {
    document.title = pending
      ? `(${pending}) Needs you · SquadLings`
      : `SquadLings · ${tab === "faces" ? "Face gallery" : "Character Studio"}`;
  }, [pending, tab]);
  useEffect(() => {
    if (!previewMood) return;
    const timer = setTimeout(() => setPreviewMood(undefined), 1500);
    return () => clearTimeout(timer);
  }, [previewMood, previewKey]);
  const handoff = useRef<ReturnType<typeof setTimeout>>();
  const builderRequested = useRef(false);
  const buildSquad = () => {
    builderRequested.current = true;
    setTab("studio");
  };
  useEffect(() => () => clearTimeout(handoff.current), []);
  const start = () => {
    if (launching || count === 0) return;
    stopAudio("room");
    stopAudio("preview");
    const begin = () => {
      setLaunching(false);
      setTab("run");
      setFocus(undefined);
      lab.start(seed.trim() || "little-team", count, template, mobile, bench);
    };
    if (tab !== "studio" || reduced) {
      begin();
      return;
    }
    const to = center(document.querySelector(".master-seat .master-logo"));
    if (!to) {
      begin();
      return;
    }
    setLaunching(true);
    CAST.slice(0, count).forEach((bot, index) => {
      const from = center(document.querySelector(`[data-seat="${bot.id}"]`));
      if (from)
        fly({
          id: `launch-${bot.id}`,
          botId: bot.id,
          kind: "character",
          from,
          to,
          color: bot.color,
          duration: 240,
          delay: index * 90,
        });
    });
    handoff.current = setTimeout(begin, 600);
  };
  useEffect(() => {
    stopAudio("room");
    stopAudio("preview");
    if (tab === "studio" && builderRequested.current) {
      builderRequested.current = false;
      document.querySelector<HTMLInputElement>(".squad-range input")?.focus();
    }
  }, [tab]);
  const botIds = useMemo(
    () => (botKey ? (botKey.split(",") as BotId[]) : []),
    [botKey],
  );
  return (
    <LayoutGroup>
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href="/" aria-label="SquadLings home">
            <span className="brand-face">
              <svg width="24" height="24" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="30" fill="currentColor" />
                <path
                  d="M18 33l5-7 5 7M36 33l5-7 5 7"
                  fill="none"
                  stroke="var(--paper)"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            SquadLings<span className="brand-period">.</span>
          </a>
          <span className="sidebar-caption">
            A LITTLE TEAM. A LOT OF POSSIBILITY.
          </span>
          <nav aria-label="Studio navigation">
            {(
              [
                ["studio", "spark", "Character studio"],
                ["run", "grid", "Squad in action"],
                ["faces", "eye", "Face gallery"],
                ["guide", "sliders", "Motion notes"],
              ] as const
            ).map(([id, icon, label]) => (
              <button
                key={id}
                className={`nav-item ${tab === id ? "active" : ""}`}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => setTab(id)}
              >
                <Icon name={icon} size={18} />
                {label}
                {tab === id && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="mini-lineup">
              {CAST.map((c) => (
                <span key={c.id} style={{ background: c.color }} />
              ))}
            </div>
            <p>Built with a little character.</p>
            <span>DEVDAY EXCHANGE · KOCHI 2026</span>
            <a
              href="https://devday.openai.com/"
              target="_blank"
              rel="noreferrer"
            >
              Inspired by OpenAI DevDay <Icon name="arrow" size={13} />
            </a>
            {import.meta.env.DEV && (
              <a href={isLab ? "/" : "/lab"}>
                {isLab ? "Back to studio" : "Open Character Lab"}{" "}
                <Icon name="code" size={13} />
              </a>
            )}
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumbs">
              <span>SquadLings</span>
              <span>/</span>
              <strong>
                {isLab
                  ? "Character Lab"
                  : tab === "studio"
                    ? "Character studio"
                    : tab === "run"
                      ? "Squad in action"
                      : tab === "faces"
                        ? "Face gallery"
                        : "Motion notes"}
              </strong>
            </div>
            <div className="topbar-actions">
              <span className="local-badge">
                <i /> Local playground
              </span>
              <SoundControls />
              <button
                className="motion-toggle"
                aria-pressed={reduced}
                onClick={() => setForceReduced(!forceReduced)}
                title={
                  systemReduced
                    ? "Your operating system has reduced motion enabled."
                    : "Reduce animation"
                }
              >
                <Icon name="moon" size={15} />
                <span>Reduced motion</span>
                <i className={reduced ? "on" : ""} />
              </button>
            </div>
          </header>
          <main>
            {tab === "studio" && (
              <div className="studio">
                <div className="page-intro">
                  <div>
                    <span className="eyebrow">
                      <span /> MEET THE SQUAD
                    </span>
                    <h1>
                      Little circles.
                      <br />
                      Big personalities<span className="heading-period">.</span>
                    </h1>
                    <p>
                      Five curious teammates. One shared mission.
                      <br />
                      They breathe, wonder, play, and look out for each other.
                      Come spend a little time with them.
                    </p>
                  </div>
                  <div className="intro-note">
                    <span className="note-star">
                      <Icon name="spark" size={28} />
                    </span>
                    <p>
                      A little skeptical.
                      <br />A little impatient.
                      <br />
                      <strong>A lot better together.</strong>
                    </p>
                    <svg
                      width="82"
                      height="37"
                      viewBox="0 0 82 37"
                      aria-hidden="true"
                    >
                      <path
                        d="M78 3C58 40 30 8 5 25m0 0 13 3M5 25l7-12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.3"
                      />
                    </svg>
                  </div>
                </div>
                <LivingStage
                  selected={selected}
                  onSelect={(id) => {
                    setSelected(id);
                    setPreviewMood(undefined);
                  }}
                  reduced={reduced}
                />
                <div className="studio-bottom">
                  <div>
                    <SquadSlider
                      count={count}
                      onChange={setCount}
                      template={template}
                      reduced={reduced}
                      disabled={lab.playing || launching}
                      launching={launching}
                    />
                    <div className="launch-toolbar">
                      <div className="template-options" aria-label="Scenario">
                        {(
                          [
                            ["trip_planner", "plane", "Trip Planner"],
                            ["qa_swarm", "bug", "QA Swarm"],
                            ["auto", "spark", "Auto"],
                          ] as const
                        ).map(([id, icon, label]) => (
                          <button
                            key={id}
                            onClick={() => setTemplate(id)}
                            className={template === id ? "selected" : ""}
                            disabled={lab.playing}
                          >
                            <Icon name={icon} size={14} />
                            {label}
                          </button>
                        ))}
                      </div>
                      <button
                        className="primary-button"
                        data-audio="off"
                        onClick={start}
                        disabled={lab.playing || launching || count === 0}
                      >
                        <Icon name="play" size={15} /> Play a sample run{" "}
                        <Icon name="arrow" size={16} />
                      </button>
                    </div>
                    <p className="demo-disclaimer">
                      A simulated run, just for the characters. No API calls, no
                      real browsing, no cost.
                    </p>
                  </div>
                  <section
                    className="personality-card"
                    style={
                      { "--selected-color": cast.color } as React.CSSProperties
                    }
                  >
                    <div className="section-label">
                      <span>A LITTLE CLOSER</span>
                      <span>0{CAST.indexOf(cast) + 1} / 05</span>
                    </div>
                    <div className="personality-preview">
                      <BotCharacter
                        key={selected}
                        id={selected}
                        mood={previewMood ?? cast.signature}
                        size={95}
                        reduced={reduced}
                        interactive
                      />
                      <span className="personality-quote">“{cast.line}”</span>
                    </div>
                    <div className="personality-name">
                      <h2>{cast.name}</h2>
                      <span>{cast.personality}</span>
                    </div>
                    <p>Try a feeling. Every expression tells a little story.</p>
                    <div className="feeling-controls">
                      {(
                        [
                          ["curious", "eye", "Curious"],
                          ["found", "spark", "Found it"],
                          ["happy", "heart", "Happy"],
                          ["worried", "ask", "Unsure"],
                        ] as const
                      ).map(([m, icon, label]) => (
                        <button
                          key={m}
                          data-audio="off"
                          className={previewMood === m ? "active" : ""}
                          onClick={() => {
                            stopAudio("preview");
                            playUi("select", { scope: "preview" });
                            playVoice(selected, MOOD_VOICE[m], {
                              scope: "preview",
                            });
                            setPreviewMood(m);
                            setPreviewKey((k) => k + 1);
                          }}
                        >
                          <Icon name={icon} size={14} />
                          {label}
                        </button>
                      ))}
                    </div>
                    <span className="local-preview-note">
                      Press, release, and make their day. Try a little boop.
                    </span>
                  </section>
                </div>
                <div className="palette-footer">
                  <span>THE DEVDAY PALETTE</span>
                  <div>
                    {CAST.map((c) => (
                      <span
                        key={c.id}
                        title={`${c.name}: ${c.color}${c.id === "bot5" ? " (local Sky extension)" : " (official event token)"}`}
                      >
                        <i style={{ background: c.color }} />
                        {c.color}
                      </span>
                    ))}
                  </div>
                  <a
                    href="https://devday.openai.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Colour source <Icon name="arrow" size={12} />
                  </a>
                </div>
              </div>
            )}
            {tab === "run" && (
              <div className="run-screen">
                <div className="run-heading">
                  <div>
                    <span className="eyebrow">SIMULATED SQUAD SESSION</span>
                    <h1>A little teamwork.</h1>
                    <p>
                      Every move has a reason. Every finding comes back to the
                      Master.
                    </p>
                  </div>
                  <div className="run-controls">
                    <span className="run-status">
                      <i />
                      {lab.playing
                        ? "Playing"
                        : lab.hasRun
                          ? status
                          : count
                            ? "Ready to play"
                            : "Pick your team"}
                    </span>
                    {lab.playing ? (
                      <button
                        className="outline-button"
                        data-audio="off"
                        onClick={lab.stop}
                      >
                        <Icon name="stop" size={14} />
                        Stop sample
                      </button>
                    ) : (
                      <button
                        className="primary-button"
                        data-audio="off"
                        onClick={() => (count ? start() : buildSquad())}
                      >
                        <Icon name="play" size={14} />
                        {count === 0
                          ? "Build your squad"
                          : lab.hasRun
                            ? "Replay sample"
                            : "Play sample run"}
                      </button>
                    )}
                    <button
                      className="icon-button"
                      data-audio="reset"
                      onClick={lab.reset}
                      aria-label="Reset playground"
                    >
                      <Icon name="retry" size={18} />
                    </button>
                  </div>
                </div>
                <div className="run-settings">
                  <label>
                    Seed{" "}
                    <input
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                      maxLength={60}
                      disabled={lab.playing}
                    />
                  </label>
                  <label>
                    Speed{" "}
                    <select
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                    >
                      <option value={1}>1×</option>
                      <option value={2}>2×</option>
                      <option value={4}>4×</option>
                    </select>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={load}
                      onChange={(e) => setLoad(e.target.checked)}
                    />
                    8 fps load streams
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={mobile}
                      onChange={(e) => setMobile(e.target.checked)}
                      disabled={lab.playing}
                    />
                    Mobile Tango (next run)
                  </label>
                  {isLab && (
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={bench}
                        disabled={lab.playing}
                        onChange={(event) => setBench(event.target.checked)}
                      />
                      Leave last bot on bench
                    </label>
                  )}
                  <PerformanceMeter particles={particles} load={load} />
                </div>
                <div className="run-layout">
                  <div
                    className={`tile-grid count-${botIds.length} ${focus ? "has-focus" : ""}`}
                  >
                    {botIds.map((id) => (
                      <BotTile
                        key={id}
                        id={id}
                        reduced={reduced}
                        speed={speed}
                        load={load}
                        focused={focus === id}
                        onFocus={handleFocus}
                        seed={seed}
                      />
                    ))}
                    {botIds.length !== 4 && (
                      <MasterCard reduced={reduced} count={count} />
                    )}
                    <div
                      className={`empty-run ${botIds.length ? "hidden" : ""}`}
                    >
                      <div className="empty-run-faces">
                        {CAST.slice(0, count).map((c) => (
                          <BotCharacter
                            key={c.id}
                            id={c.id}
                            mood={c.signature}
                            size={58}
                            reduced={reduced}
                          />
                        ))}
                      </div>
                      <h2>
                        {count
                          ? "Your squad is ready."
                          : "Your squad is still asleep."}
                      </h2>
                      <p>
                        {count
                          ? "Play the sample, or send a character an event."
                          : "Wake a teammate with the slider in Character studio."}
                      </p>
                      <button
                        className="primary-button"
                        data-audio="off"
                        onClick={() => (count ? start() : buildSquad())}
                      >
                        <Icon name="play" size={14} />
                        {count ? "Let’s see them in action" : "Wake your squad"}
                      </button>
                    </div>
                  </div>
                  <aside className="run-sidebar">
                    {botIds.length === 4 && (
                      <MasterCard reduced={reduced} count={count} />
                    )}
                    <EventControls
                      id={selected}
                      onSelect={setSelected}
                      lab={lab}
                      template={template}
                      mobile={mobile}
                    />
                    <BoardPanel lab={lab} />
                  </aside>
                </div>
                <Timeline />
              </div>
            )}
            {tab === "faces" && <Gallery reduced={reduced} />}
            {tab === "guide" && (
              <div className="guide">
                <span className="eyebrow">A LITTLE METHOD TO THE MOTION</span>
                <h1>Personality, with purpose.</h1>
                <p>
                  Actions come from events. Character comes from how they move.
                </p>
                <div className="guide-grid">
                  {CAST.map((c) => (
                    <section key={c.id}>
                      <BotCharacter
                        id={c.id}
                        mood={c.signature}
                        size={64}
                        reduced={reduced}
                      />
                      <h2>{c.name}</h2>
                      <span>{c.personality}</span>
                      <p>
                        {c.id === "bot1"
                          ? "A considered glide. A tiny double-check at the end."
                          : c.id === "bot2"
                            ? "Eager arrivals and a spin when there’s something to share."
                            : c.id === "bot3"
                              ? "Slow breaths and a calm, smooth glide. Never in a rush."
                              : c.id === "bot4"
                                ? "Snappy moves, a little lean, and the biggest click squish."
                                : "A floaty glide, a happy sway, and an extra hop at the finish."}
                      </p>
                    </section>
                  ))}
                </div>
                <div className="guide-notes">
                  <section>
                    <Icon name="pointer" />
                    <h3>Every click lands.</h3>
                    <p>
                      The pointer tip is the hotspot. Cursor moves follow event
                      coordinates and settle within the supplied 350 ms window.
                    </p>
                  </section>
                  <section>
                    <Icon name="moon" />
                    <h3>A quieter kind of charm.</h3>
                    <p>
                      Reduced motion keeps faces and status updates, with
                      fade-jumps instead of glides, hops, flights, or particles.
                    </p>
                  </section>
                  <section>
                    <Icon name="spark" />
                    <h3>Colour with a source.</h3>
                    <p>
                      Four accents come from the official DevDay event
                      stylesheet. Sky is our sticker-inspired extension.
                    </p>
                    <a
                      href="https://devday.openai.com/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Official DevDay site <Icon name="arrow" size={12} />
                    </a>
                  </section>
                </div>
              </div>
            )}
          </main>
          <footer className="page-footer">
            <span>SquadLings · Made for the joy of making.</span>
            <span>
              CHARACTER STUDIO <i /> V0.1
            </span>
          </footer>
        </div>
        <EffectsCanvas reduced={reduced} onCount={onParticles} />
        <Flights reduced={reduced} speed={speed} />
        <AnimatePresence>
          {lab.resultOpen && result && (
            <ResultDialog
              ids={botIds}
              reduced={reduced}
              findings={findings}
              onClose={() => lab.setResultOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}
