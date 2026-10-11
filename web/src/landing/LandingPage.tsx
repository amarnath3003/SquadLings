import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useMotionValue,
} from "motion/react";
import { CAST } from "@swarm/shared/cast";
import { BotCharacter } from "../characters/BotCharacter";
import { MasterCharacter } from "../characters/MasterCharacter";
import type { BotId, Mood } from "@swarm/shared/types";
import "./landing.css";

const REPO = "https://github.com/amarnath3003/SquadLings";
const COLORS = ["#924FF7", "#04B84C", "#FF8549", "#006AFF", "#A6D8F5"];
const TASKS = [
  {
    label: "A weekend away",
    category: "TRIP PLANNING",
    title: "Less tabs. More takeoffs.",
    prompt: "Plan a weekend in Kochi for our team of four.",
    jobs: [
      "Find a place to stay",
      "Find the good food",
      "Explore Fort Kochi",
      "Figure out the routes",
      "Find something unexpected",
    ],
    result: "Stays, food, routes, and a little adventure. One weekend plan.",
    icon: "plane",
  },
  {
    label: "The perfect deal",
    category: "PRICE COMPARISON",
    title: "Big finds. Little effort.",
    prompt: "Compare noise-cancelling headphones under ₹25,000.",
    jobs: [
      "Compare the specs",
      "Find the offers",
      "Check delivery",
      "Read the returns policy",
      "Cross-check reviews",
    ],
    result: "Specs, offers, delivery, and the fine print. One comparison.",
    icon: "bag",
  },
  {
    label: "A curious question",
    category: "LIVE RESEARCH",
    title: "Five perspectives. Fewer blind spots.",
    prompt: "Research a big question from five different sources.",
    jobs: [
      "Find a primary source",
      "Look for fresh details",
      "Check another angle",
      "Compare the evidence",
      "Spot the missing context",
    ],
    result: "Multiple sources, shared findings, and one answer with links.",
    icon: "search",
  },
  {
    label: "A sneaky bug",
    category: "BROWSER QA",
    title: "Tiny squad. Sharp eyes.",
    prompt: "Explore BuggyMart and find the things that feel broken.",
    jobs: [
      "Inspect the product page",
      "Try the search",
      "Test the cart",
      "Check the checkout",
      "Look for edge cases",
    ],
    result: "Different paths through the same site. One set of findings.",
    icon: "bug",
  },
] as const;
const PHASES = [
  "Ready when you are",
  "Onyx makes a plan",
  "Five browsers. Five little missions.",
  "Sharing the good stuff",
  "One answer, all together.",
];

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h15m-6-6 6 6-6 6"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Spark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 60 60"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M30 0c2 22 8 28 30 30-22 2-28 8-30 30C28 38 22 32 0 30 22 28 28 22 30 0Z" />
    </svg>
  );
}
function Github() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.64-1.33-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.83c.85 0 1.71.11 2.51.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}
function TaskIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    plane: (
      <>
        <path d="m3 14 7-2 4-8 3-1-2 9 6 3v2l-7-1-3 5H9l1-6-7 1Z" />
        <path d="m10 12 4 4" />
      </>
    ),
    bag: (
      <>
        <path d="M5 8h14l2 13H3L5 8Z" />
        <path d="M8 9V6a4 4 0 0 1 8 0v3" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="7" />
        <path d="m15 15 7 7M7 10h6m-3-3v6" />
      </>
    ),
    bug: (
      <>
        <rect x="7" y="7" width="10" height="14" rx="5" />
        <path d="M9 7 7 3m8 4 2-4M3 11h4m10 0h4M2 17h5m10 0h5M12 8v13" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
function Reveal({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      id={id}
      className={className}
      initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.65, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

function HeroScene({ reduced }: { reduced: boolean }) {
  const x = useMotionValue(0),
    y = useMotionValue(0);
  const rotateX = useSpring(y, { stiffness: 100, damping: 25 });
  const rotateY = useSpring(x, { stiffness: 100, damping: 25 });
  const [boop, setBoop] = useState(0);
  return (
    <div
      className="sl-hero-scene"
      onPointerMove={(event) => {
        if (reduced || event.pointerType !== "mouse") return;
        const bounds = event.currentTarget.getBoundingClientRect();
        x.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 8);
        y.set(-((event.clientY - bounds.top) / bounds.height - 0.5) * 8);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      <motion.div className="sl-hero-world" style={{ rotateX, rotateY }}>
        <div className="sl-orbit sl-orbit-one" />
        <div className="sl-orbit sl-orbit-two" />
        <svg
          className="sl-hero-routes"
          viewBox="0 0 600 580"
          aria-hidden="true"
        >
          <path
            d="M300 275Q130 170 140 135M300 275Q410 110 450 150M300 275Q525 325 480 410M300 275Q260 500 240 475M300 275Q70 330 80 325"
            fill="none"
            stroke="#f4f1e8"
            strokeOpacity=".35"
            strokeWidth="1.5"
            strokeDasharray="5 9"
          />
        </svg>
        <div className="sl-floating-task">
          <span className="sl-mini-spark">✦</span> One task. A whole little
          team.<span className="sl-task-enter">↵</span>
        </div>
        <div className="sl-hero-onyx">
          <button
            onClick={() => setBoop((v) => v + 1)}
            aria-label="Say hello to Onyx"
          >
            <MasterCharacter
              size={148}
              state={boop % 2 ? "receiving" : "monitoring"}
              tick={boop}
              reduced={reduced}
            />
          </button>
          <span className="sl-name-tag">
            Onyx <i>the coordinator</i>
          </span>
        </div>
        {CAST.map((bot, i) => (
          <div
            className={`sl-hero-bot sl-hero-bot-${i + 1}`}
            key={bot.id}
            style={
              {
                "--bot-color": bot.color,
                "--float-delay": `${-i * 1.3}s`,
              } as CSSProperties
            }
          >
            <BotCharacter
              id={bot.id}
              mood={bot.signature}
              size={i === 4 ? 85 : 108}
              reduced={reduced}
              interactive
              seed="landing-hero"
            />
            <span className="sl-name-tag">
              {bot.name}
              <span className="sl-tiny-dot" />
            </span>
          </div>
        ))}
        <div className="sl-mini-browser sl-browser-one">
          <div className="sl-browser-bar">
            <span />
            <span />
            <span />
            <small>finding the good stuff</small>
          </div>
          <div className="sl-mini-browser-body">
            <span className="sl-mini-line" />
            <span className="sl-mini-line short" />
            <div className="sl-mini-columns">
              <i />
              <i />
              <i />
            </div>
            <div className="sl-mini-check">
              ✓ <span>Looks promising.</span>
            </div>
          </div>
          <svg
            className="sl-tiny-cursor"
            viewBox="0 0 24 30"
            aria-hidden="true"
          >
            <path
              d="M2 2v24l7-7 5 10 5-3-5-9h9Z"
              fill="#04B84C"
              stroke="#0b0b0d"
              strokeWidth="2"
            />
          </svg>
        </div>
        <div className="sl-found-sticker">
          <Spark />
          <span>Found it!</span>
        </div>
        <div className="sl-result-sticker">
          <span>5 little minds</span>
          <strong>
            1 big answer <Arrow />
          </strong>
        </div>
        <Spark className="sl-scene-spark spark-purple" />
        <Spark className="sl-scene-spark spark-orange" />
        <span className="sl-scene-caption">
          A little chaotic. Very coordinated.
        </span>
      </motion.div>
    </div>
  );
}

function Playground({
  task,
  setTask,
  reduced,
}: {
  task: number;
  setTask: (value: number) => void;
  reduced: boolean;
}) {
  const [step, setStep] = useState(0);
  const [round, setRound] = useState(0);
  const running = step > 0 && step < 4;
  useEffect(() => {
    setStep(0);
  }, [task]);
  useEffect(() => {
    if (!round) return;
    setStep(1);
    const timers = [2, 3, 4].map((phase, i) =>
      setTimeout(() => setStep(phase), (i + 1) * 2300),
    );
    return () => timers.forEach(clearTimeout);
  }, [round, task]);
  const current = TASKS[task];
  return (
    <section className="sl-playground" id="playground">
      <div className="sl-container">
        <Reveal className="sl-section-head">
          <div>
            <span className="sl-eyebrow">A LITTLE SHOW, A LOT OF TELL</span>
            <h2>
              Big ask?
              <br />
              They’re <span className="sl-italic">on it.</span>
            </h2>
          </div>
          <p>
            One prompt kicks off a whole team.
            <br />
            Take the squad for a little spin.
          </p>
        </Reveal>
        <Reveal>
          <div
            className="sl-preview-tabs"
            role="tablist"
            aria-label="Choose a preview task"
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? TASKS.length - 1
                    : (task +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        TASKS.length) %
                      TASKS.length;
              setTask(next);
              setRound(0);
              setStep(0);
              event.currentTarget
                .querySelectorAll<HTMLButtonElement>("[role=tab]")
                [next]?.focus();
            }}
          >
            {TASKS.map((item, i) => (
              <button
                role="tab"
                tabIndex={task === i ? 0 : -1}
                aria-selected={task === i}
                aria-controls="squad-preview"
                id={`preview-tab-${i}`}
                key={item.label}
                onClick={() => {
                  setTask(i);
                  setRound(0);
                  setStep(0);
                }}
              >
                <TaskIcon name={item.icon} />
                {item.label}
              </button>
            ))}
          </div>
          <div
            className="sl-demo-board"
            id="squad-preview"
            role="tabpanel"
            aria-labelledby={`preview-tab-${task}`}
          >
            <div className="sl-demo-chrome">
              <div className="sl-window-dots">
                <i />
                <i />
                <i />
              </div>
              <span>squadlings / a little preview</span>
              <span className="sl-demo-label">SCRIPTED · NO API CALLS</span>
            </div>
            <div className="sl-demo-prompt">
              <span className="sl-prompt-spark">✦</span>
              <p>{current.prompt}</p>
              <button
                onClick={() => setRound((n) => n + 1)}
                disabled={running}
                aria-label={
                  step === 4
                    ? "Replay the squad preview"
                    : "Run the squad preview"
                }
              >
                {step === 4 ? <span>↻</span> : <Arrow />}
              </button>
            </div>
            <div className="sl-demo-coordinator">
              <MasterCharacter
                size={64}
                state={
                  step === 0
                    ? "idle"
                    : step === 1
                      ? "planning"
                      : step === 4
                        ? "done"
                        : "monitoring"
                }
                reduced={reduced}
                tick={round}
              />
              <div>
                <span className="sl-demo-onyx-name">
                  ONYX <span>THE CALM CONDUCTOR</span>
                </span>
                <h3 aria-live="polite">{PHASES[step]}</h3>
              </div>
              <span
                className={`sl-preview-status ${running ? "is-running" : ""}`}
              >
                {step === 0
                  ? "Hit send to start"
                  : step === 4
                    ? "That’s teamwork."
                    : "Little minds at work"}
              </span>
            </div>
            <div className="sl-demo-browsers">
              {CAST.map((bot, i) => {
                const mood: Mood =
                  step === 4
                    ? "found"
                    : step === 2
                      ? "focused"
                      : step === 3
                        ? "happy"
                        : "curious";
                return (
                  <div
                    className={`sl-demo-browser ${running && step > 1 ? "is-working" : ""} ${step === 4 ? "is-done" : ""}`}
                    key={bot.id}
                    style={
                      {
                        "--bot-color": bot.color,
                        "--work-delay": `${i * -0.55}s`,
                      } as CSSProperties
                    }
                  >
                    <div className="sl-demo-browser-title">
                      <span style={{ background: bot.color }} />
                      {bot.name}
                      <span className="sl-browser-maximize">↗</span>
                    </div>
                    <div className="sl-demo-page">
                      <div className="sl-demo-url">
                        <span />a small part of the big picture
                      </div>
                      <div className="sl-skeleton-title" />
                      <div className="sl-skeleton-line" />
                      <div className="sl-skeleton-line half" />
                      <div className="sl-skeleton-photo">
                        <TaskIcon name={current.icon} />
                      </div>
                      <div className="sl-skeleton-line" />
                      <div className="sl-skeleton-line half" />
                      <div className="sl-scan-line" />
                      <span className="sl-demo-cursor">↖</span>
                    </div>
                    <div className="sl-demo-job">
                      <span>
                        {step === 4 ? "✓ Findings shared" : current.jobs[i]}
                      </span>
                      <BotCharacter
                        id={bot.id}
                        mood={mood}
                        size={48}
                        reduced={reduced}
                        seed="landing-preview"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div
              className={`sl-demo-result ${step === 4 ? "is-visible" : ""}`}
              aria-live="polite"
            >
              <span className="sl-result-check">✓</span>
              <p>
                {step === 4
                  ? current.result
                  : "Different paths. Shared discoveries. One place to bring it all together."}
              </p>
              <span>
                {step === 4 ? "SQUAD COMPLETE" : "ONE SQUAD. MANY MINDS."}
              </span>
            </div>
            <div className="sl-demo-steps">
              {["Plan", "Explore", "Share", "Deliver"].map((name, i) => (
                <div className={step > i ? "is-active" : ""} key={name}>
                  <span>{step > i + 1 ? "✓" : `0${i + 1}`}</span>
                  {name}
                  <i />
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Film({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      className="sl-film"
      ref={dialog}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-label="The SquadLings launch film"
    >
      <button
        className="sl-film-close"
        onClick={onClose}
        aria-label="Close film"
      >
        ✕
      </button>
      <video
        src="/media/squadlings-intro.mp4"
        controls
        autoPlay
        playsInline
        aria-label="SquadLings, one task and five agents"
      />
      <div>
        <strong>A little film about a big idea.</strong>
        <span>SquadLings · 52 seconds</span>
      </div>
    </dialog>
  );
}

export default function LandingPage() {
  const reduced = Boolean(useReducedMotion());
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });
  const [task, setTask] = useState(0);
  const [film, setFilm] = useState(false);
  const [selectedBot, setSelectedBot] = useState<BotId>("bot1");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [menu, setMenu] = useState(false);
  const selected = CAST.find((bot) => bot.id === selectedBot)!;
  useEffect(() => {
    document.title = "SquadLings — One squad. Many minds.";
  }, []);
  async function copySetup() {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(
        `git clone ${REPO}.git\ncd SquadLings\nnpm install\nnpm --prefix web install\nnpx playwright install chromium\ncp .env.example .env`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
      setCopyError(
        "Copy is unavailable in this browser. Select the commands below instead.",
      );
    }
  }
  return (
    <div className="sl-page">
      <a className="sl-skip" href="#sl-main">
        Skip to content
      </a>
      <motion.div
        className="sl-scroll-progress"
        style={{ scaleX: reduced ? 0 : scaleX }}
      />
      <header className="sl-nav">
        <div className="sl-container sl-nav-inner">
          <a className="sl-wordmark" href="#" aria-label="SquadLings home">
            <span className="sl-brand-face">⌃⌃</span>SquadLings
            <span className="sl-brand-star">✳</span>
          </a>
          <nav className={menu ? "is-open" : ""} aria-label="Main navigation">
            <a href="#playground" onClick={() => setMenu(false)}>
              The idea
            </a>
            <a href="#squad" onClick={() => setMenu(false)}>
              The little team
            </a>
            <a href="#possibilities" onClick={() => setMenu(false)}>
              The possibilities
            </a>
          </nav>
          <a
            className="sl-nav-github"
            href={REPO}
            target="_blank"
            rel="noreferrer"
          >
            <Github />
            <span>Star on GitHub</span>
            <Arrow diagonal />
          </a>
          <button
            className="sl-menu-toggle"
            aria-expanded={menu}
            aria-label="Toggle navigation"
            onClick={() => setMenu(!menu)}
          >
            {menu ? "✕" : "☰"}
          </button>
        </div>
      </header>
      <main id="sl-main" tabIndex={-1}>
        <section className="sl-hero sl-container">
          <div className="sl-hero-copy">
            <motion.div
              initial={{ opacity: 0, y: reduced ? 0 : 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0 : 0.6 }}
            >
              <span className="sl-eyebrow">
                <i /> SMALL CHARACTERS. SERIOUS COMPUTER USE.
              </span>
              <h1>
                One task.
                <br />A whole
                <br />
                <span className="sl-hero-last">
                  little squad.
                  <svg
                    viewBox="0 0 450 28"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 19Q190-5 444 10M36 26Q215 4 416 19"
                      stroke="currentColor"
                      fill="none"
                      strokeWidth="5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </h1>
              <p>
                Big plans, endless tabs, too much to do?
                <br />
                Meet five AI browser agents and the little mind that brings them
                all together.
              </p>
              <div className="sl-hero-actions">
                <a href="#playground" className="sl-button sl-button-white">
                  Meet your squad <Arrow />
                </a>
                <button
                  className="sl-film-button"
                  onClick={() => setFilm(true)}
                >
                  <span className="sl-play-icon">▶</span>
                  <span>
                    Watch the story<small>52 seconds of little magic</small>
                  </span>
                </button>
              </div>
              <div className="sl-hero-footnote">
                <div>
                  {COLORS.map((color) => (
                    <span key={color} style={{ background: color }} />
                  ))}
                </div>
                <span>
                  One squad. Many minds. <strong>Your call.</strong>
                </span>
              </div>
            </motion.div>
          </div>
          <HeroScene reduced={reduced} />
          <a className="sl-scroll-cue" href="#playground">
            <span>SCROLL FOR THE GOOD STUFF</span>
            <span>↓</span>
          </a>
        </section>
        <div className="sl-marquee" aria-hidden="true">
          <div>
            {[0, 1].map((repeat) => (
              <span key={repeat}>
                A LITTLE CURIOUS <Spark /> A LOT CAPABLE <Spark /> BETTER
                TOGETHER <Spark /> A LITTLE CURIOUS <Spark /> A LOT CAPABLE{" "}
                <Spark /> BETTER TOGETHER <Spark />
              </span>
            ))}
          </div>
        </div>
        <Playground task={task} setTask={setTask} reduced={reduced} />
        <section className="sl-how sl-container" id="how-it-works">
          <Reveal className="sl-how-intro">
            <span className="sl-eyebrow">THE BEAUTIFULLY SIMPLE BIT</span>
            <h2>
              You bring the <span className="sl-outline">what.</span>
              <br />
              They figure out the <span className="sl-purple">how.</span>
            </h2>
          </Reveal>
          <div className="sl-how-grid">
            {[
              {
                title: "Say the big thing.",
                text: "Research a trip. Compare your options. Explore a site. Give Onyx the goal in your own words.",
                number: "01",
                id: "bot1",
              },
              {
                title: "Watch little things happen.",
                text: "Onyx splits the task. Up to five agents browse, click, type, and share what they find, all at once.",
                number: "02",
                id: "bot2",
              },
              {
                title: "Get it all together.",
                text: "The squad’s discoveries come back to Onyx. You get one answer with sources, instead of a pile of tabs.",
                number: "03",
                id: "bot3",
              },
            ].map((item, i) => (
              <Reveal className="sl-how-step" key={item.number}>
                <div className="sl-step-number" style={{ color: COLORS[i] }}>
                  {item.number}
                  <Spark />
                </div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <span className="sl-step-line" />
              </Reveal>
            ))}
          </div>
        </section>
        <section className="sl-cast" id="squad">
          <div className="sl-container">
            <Reveal className="sl-section-head">
              <div>
                <span className="sl-eyebrow">
                  ACTUAL PERSONALITIES INCLUDED
                </span>
                <h2>
                  A team with
                  <br />
                  <span className="sl-italic">a little character.</span>
                </h2>
              </div>
              <p>
                Curious, skeptical, cheerful.
                <br />
                Six different vibes. One shared goal.
              </p>
            </Reveal>
            <Reveal className="sl-onyx-card">
              <div className="sl-onyx-portrait">
                <MasterCharacter
                  size={160}
                  state="monitoring"
                  reduced={reduced}
                />
                <span>THE CALM IN THE CHAOS</span>
              </div>
              <div className="sl-onyx-bio">
                <span className="sl-eyebrow">MEET THE COORDINATOR</span>
                <h3>
                  Onyx<span>⌃⌃</span>
                </h3>
                <p>
                  The one who sees the big picture. Onyx makes the plan, keeps
                  the squad in sync, and brings every little discovery into one
                  clear answer.
                </p>
                <blockquote>“One thing at a time. All together.”</blockquote>
              </div>
              <div className="sl-onyx-stamp">
                BIG
                <br />
                SQUAD
                <br />
                ENERGY
                <Spark />
              </div>
            </Reveal>
            <div className="sl-cast-grid">
              {CAST.map((bot, i) => (
                <Reveal className="sl-cast-cell" key={bot.id}>
                  <button
                    className={`sl-cast-card ${selectedBot === bot.id ? "is-selected" : ""}`}
                    style={{ "--bot-color": bot.color } as CSSProperties}
                    onClick={() => setSelectedBot(bot.id)}
                    aria-pressed={selectedBot === bot.id}
                  >
                    <span className="sl-cast-number">
                      0{i + 1}
                      <Arrow diagonal />
                    </span>
                    <div className="sl-cast-portrait">
                      <BotCharacter
                        id={bot.id}
                        mood={selectedBot === bot.id ? "happy" : bot.signature}
                        size={130}
                        reduced={reduced}
                        seed="landing-cast"
                      />
                    </div>
                    <h3>{bot.name}</h3>
                    <p>{bot.personality}</p>
                    <span className="sl-cast-card-hint">A LITTLE HELLO ↗</span>
                  </button>
                </Reveal>
              ))}
            </div>
            <div className="sl-cast-quote" aria-live="polite">
              <span style={{ background: selected.color }} />
              <strong>{selected.name} says</strong>
              <p>“{selected.line}”</p>
              <span className="sl-cast-quote-note">
                Click a character. Make a friend.
              </span>
            </div>
          </div>
        </section>
        <section className="sl-control">
          <div className="sl-container sl-control-layout">
            <Reveal className="sl-control-copy">
              <span className="sl-eyebrow">
                AUTONOMOUS. NEVER OUT OF YOUR HANDS.
              </span>
              <h2>
                Your browser.
                <br />
                Your rules.
                <Spark />
              </h2>
              <p>
                They can take the wheel.
                <br />
                You always keep the keys.
              </p>
              <div className="sl-control-points">
                <div>
                  <span>↗</span>
                  <section>
                    <h3>Every move, in view.</h3>
                    <p>
                      Live browser streams and visible cursors. You see the work
                      as it happens.
                    </p>
                  </section>
                </div>
                <div>
                  <span>↖</span>
                  <section>
                    <h3>Jump in. Steer. Hand back.</h3>
                    <p>
                      Chat with Onyx mid-run, or take over an agent’s browser
                      for a human check.
                    </p>
                  </section>
                </div>
                <div>
                  <span>⌂</span>
                  <section>
                    <h3>A little closer to home.</h3>
                    <p>
                      Agents and browser sessions run on your machine. Site
                      access is checked in the browser layer.
                    </p>
                  </section>
                </div>
              </div>
            </Reveal>
            <Reveal className="sl-control-visual">
              <div className="sl-control-window">
                <div className="sl-control-top">
                  <div className="sl-window-dots">
                    <i />
                    <i />
                    <i />
                  </div>
                  <span>you’re in good company</span>
                </div>
                <div className="sl-control-content">
                  <span className="sl-control-site-label">
                    YOUR BROWSER, LIVE
                  </span>
                  <div className="sl-control-skeleton">
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="sl-control-bot">
                    <BotCharacter
                      id="bot4"
                      mood="focused"
                      size={105}
                      reduced={reduced}
                      seed="landing-control"
                    />
                    <span>On it.</span>
                  </div>
                  <div className="sl-control-cursor">
                    <svg viewBox="0 0 40 48" aria-hidden="true">
                      <path
                        d="M3 3v37l10-11 9 17 8-4-9-16h16Z"
                        fill="#0b0b0d"
                        stroke="#f5f1e9"
                        strokeWidth="2"
                      />
                    </svg>
                    <span>You’re in control</span>
                  </div>
                </div>
                <div className="sl-control-bottom">
                  <span>
                    <i />
                    Human takeover
                  </span>
                  <span>YOUR CALL. ALWAYS.</span>
                </div>
              </div>
              <div className="sl-control-sticker">
                a helpful hand,
                <br />
                <strong>never a black box.</strong>
                <svg viewBox="0 0 95 42" aria-hidden="true">
                  <path
                    d="M2 4q60 70 87 3m-17 3 17-3 2 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </Reveal>
          </div>
        </section>
        <section className="sl-possibilities sl-container" id="possibilities">
          <Reveal className="sl-section-head">
            <div>
              <span className="sl-eyebrow">
                FOR YOUR NEXT “CAN SOMEONE JUST…”
              </span>
              <h2>
                Little squad.
                <br />
                <span className="sl-outline">Big possibilities.</span>
              </h2>
            </div>
            <p>
              Anything that starts with a browser
              <br />
              and a slightly-too-long to-do list.
            </p>
          </Reveal>
          <div className="sl-use-grid">
            {TASKS.map((item, i) => (
              <Reveal key={item.category}>
                <button
                  className={`sl-use-card sl-use-card-${i}`}
                  onClick={() => {
                    setTask(i);
                    document
                      .getElementById("playground")
                      ?.scrollIntoView({
                        behavior: reduced ? "instant" : "smooth",
                      });
                  }}
                >
                  <div className="sl-use-card-top">
                    <span>{item.category}</span>
                    <Arrow diagonal />
                  </div>
                  <h3>{item.title}</h3>
                  <p>“{item.prompt}”</p>
                  <div className="sl-use-bottom">
                    <span>
                      TAKE THIS ONE FOR A SPIN <Arrow />
                    </span>
                    <TaskIcon name={item.icon} />
                  </div>
                  <Spark className="sl-use-spark" />
                </button>
              </Reveal>
            ))}
          </div>
        </section>
        <section className="sl-build" id="build">
          <div className="sl-container sl-build-layout">
            <Reveal>
              <span className="sl-eyebrow">SMALL TEAM. OPEN CODE.</span>
              <h2>
                Good things
                <br />
                come in
                <br />
                <span className="sl-green">little repos.</span>
              </h2>
              <p>
                Built with OpenAI’s Agents API, MCP, and real Playwright
                browsers. A React frontend with characters that have a life of
                their own.
              </p>
              <div className="sl-tech-pills">
                {[
                  "OpenAI Agents API",
                  "MCP",
                  "Playwright",
                  "React",
                  "TypeScript",
                  "Motion",
                ].map((name) => (
                  <span key={name}>{name}</span>
                ))}
              </div>
              <a
                className="sl-text-link"
                href={REPO + "#-quick-start"}
                target="_blank"
                rel="noreferrer"
              >
                Get the full setup guide <Arrow diagonal />
              </a>
            </Reveal>
            <Reveal className="sl-terminal">
              <div className="sl-terminal-top">
                <div className="sl-window-dots">
                  <i />
                  <i />
                  <i />
                </div>
                <span>your next little project</span>
                <button onClick={copySetup} aria-label="Copy setup commands">
                  {copied ? "Copied ✓" : "Copy ↗"}
                </button>
              </div>
              <div className="sl-terminal-body">
                <p role="status">{copyError}</p>
                <p className="sl-terminal-comment">
                  # let’s get the squad together
                </p>
                <code>
                  <span>$</span> git clone {REPO}.git
                </code>
                <code>
                  <span>$</span> cd SquadLings
                </code>
                <code>
                  <span>$</span> npm install
                </code>
                <code>
                  <span>$</span> npm --prefix web install
                </code>
                <code>
                  <span>$</span> npx playwright install chromium
                </code>
                <code>
                  <span>$</span> cp .env.example .env
                </code>
                <p className="sl-terminal-comment">
                  # add your OpenAI key to .env, then:
                </p>
                <code>
                  <span>$</span> npm run ui
                  <span className="sl-terminal-caret" />
                </code>
                <div className="sl-terminal-note">
                  <span>✦</span>Node 22.18+ · Agents API access · cloudflared
                </div>
              </div>
              <div className="sl-terminal-bot">
                <BotCharacter
                  id="bot2"
                  mood="found"
                  size={82}
                  reduced={reduced}
                  seed="landing-terminal"
                />
              </div>
            </Reveal>
          </div>
        </section>
        <section className="sl-finale">
          <div className="sl-container">
            <Reveal>
              <span className="sl-eyebrow">GO ON. THINK A LITTLE BIGGER.</span>
              <h2>
                Your next big idea
                <br />
                could use a little
                <br />
                <span>company.</span>
              </h2>
              <a
                className="sl-button sl-button-black"
                href={REPO}
                target="_blank"
                rel="noreferrer"
              >
                <Github />
                Build with SquadLings
                <Arrow diagonal />
              </a>
              <div className="sl-finale-cast">
                <MasterCharacter size={104} state="done" reduced={reduced} />
                {CAST.map((bot, i) => (
                  <div
                    key={bot.id}
                    style={
                      { "--float-delay": `${-i * 0.45}s` } as CSSProperties
                    }
                  >
                    <BotCharacter
                      id={bot.id}
                      mood="happy"
                      size={84}
                      reduced={reduced}
                      seed="landing-finale"
                    />
                  </div>
                ))}
              </div>
            </Reveal>
            <Spark className="sl-finale-spark one" />
            <Spark className="sl-finale-spark two" />
            <span className="sl-finale-note">One squad. Many minds.</span>
          </div>
        </section>
      </main>
      <footer className="sl-footer sl-container">
        <div>
          <a className="sl-wordmark" href="#">
            <span className="sl-brand-face">⌃⌃</span>SquadLings
          </a>
          <p>Made in one night. With a whole lot of little ideas.</p>
        </div>
        <div className="sl-footer-event">
          <span>BUILT AT</span>
          <strong>OpenAI DevDay Exchange</strong>
          <span>Kochi, India · 10–11 October 2026</span>
        </div>
        <div className="sl-footer-links">
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub <Arrow diagonal />
          </a>
          <a
            href={REPO + "/blob/main/README.md"}
            target="_blank"
            rel="noreferrer"
          >
            Read the README <Arrow diagonal />
          </a>
          <span>
            By{" "}
            <a
              href="https://github.com/vijayanand1505"
              target="_blank"
              rel="noreferrer"
            >
              Vijay Anand
            </a>{" "}
            &{" "}
            <a
              href="https://github.com/amarnath3003"
              target="_blank"
              rel="noreferrer"
            >
              D Amarnath
            </a>
          </span>
        </div>
      </footer>
      {film && <Film onClose={() => setFilm(false)} />}
    </div>
  );
}
