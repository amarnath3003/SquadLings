import { useEffect, useRef, useState } from "react";
import { Composer } from "./home/Composer";
import { SoundControls } from "./components/SoundControls";
import { useUiSounds } from "./effects/useUiSounds";
import { Thread } from "./chat/Thread";
import { Wall } from "./wall/Wall";
import { S, working, effects, goHome, loadRun, phase, runActive, touchLayout, useLive } from "./live/store";
import { focusBot, post, showHint } from "./live/actions";
import { connect } from "./live/connection";
import { newChat, toggleHistory } from "./live/history";
import { Activity, ClosedBar, History, PEN, TopBar } from "./shell/Shell";
import { MasterCharacter } from "./characters/MasterCharacter";
import { StudioFx } from "./studio/StudioFx";
import { MasterCard } from "./studio/components/MasterCard";
import { RoamLayer } from "./roam/RoamLayer";

// Our dashboard (ui/) on the character studio's React components, with the same markup and stylesheet
// (styles/classic.css) so it looks the same as :8787. Three layouts on one set of elements (home /
// center / side, from phase()), so moving between them animates. `?run=<id>` opens a chat from disk.

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return reduced;
}

function tunnelTitle() {
  const t = S.tunnel;
  if (t.state === "ready") return `Tools online: OpenAI reaches the agents' tools through ${t.source ?? "the tunnel"}`;
  if (t.state === "failed") return `Tools offline: ${t.error ?? ""}`;
  return "Tools starting: opening the tunnel OpenAI uses to reach the agents' tools";
}

/** Onyx's state (characters/MasterCharacter.tsx MASTER_LINES) from the run: planning, watching, needs you, done. */
function onyxState() {
  const r = S.view === "run" ? S.run : null;
  if (!r) return "idle";
  if (r.status === "failed") return "failed";
  if (S.bots.some((b) => b.human && !b.control) && runActive()) return "needs you";
  if (r.masterBusy) return r.planned && !S.bots.some((b) => b.status === "working") ? "merging" : "planning";
  if (S.bots.some((b) => b.status === "working" || b.status === "starting")) return "monitoring";
  return r.answered ? "done" : "idle";
}

/** Stop: Onyx's turn is cancelled and the agents at work stop; the chat stays open. */
async function haltOnyx() {
  if (!S.run) return;
  try {
    const r = await post<{ halted: boolean }>(`/api/runs/${S.run.id}/halt`);
    if (!r.halted) showHint("Nothing to stop right now.");
  } catch (err) {
    showHint(err instanceof Error ? err.message : String(err), true);
  }
}

/** A tab in the background shows that something needs you, or that the answer is in. */
let attentionFlag = "";
effects.attention = (kind) => {
  if (!document.hidden) return;
  attentionFlag = kind;
  document.title = kind === "needs" ? "(!) An agent needs you · SquadLings" : "✓ Answer ready · SquadLings";
};
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && attentionFlag) (attentionFlag = ""), (document.title = "SquadLings");
});

const WIDTH_KEY = "squadlings.chatWidth";
function setChatWidth(w: number) {
  document.documentElement.style.setProperty("--chat-w", `${Math.round(Math.max(320, Math.min(w - 52, window.innerWidth * 0.55)))}px`);
}
const chatWidth = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue("--chat-w"));

/** Drag (or arrow keys) to resize the chat beside the wall. */
function Splitter({ onDrag }: { onDrag: (on: boolean) => void }) {
  const drag = useRef(false);
  return (
    <div
      id="splitter"
      className={drag.current ? "drag" : ""}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the chat"
      tabIndex={0}
      onPointerDown={(ev) => {
        ev.currentTarget.setPointerCapture(ev.pointerId);
        drag.current = true;
        ev.currentTarget.classList.add("drag");
        onDrag(true);
      }}
      onPointerMove={(ev) => drag.current && setChatWidth(ev.clientX)}
      onPointerUp={(ev) => {
        drag.current = false;
        ev.currentTarget.classList.remove("drag");
        ev.currentTarget.releasePointerCapture(ev.pointerId);
        onDrag(false);
        try {
          localStorage.setItem(WIDTH_KEY, String(chatWidth()));
        } catch {
          // storage off: the width just isn't remembered
        }
      }}
      onKeyDown={(ev) => {
        const w = chatWidth();
        if (ev.key === "ArrowLeft") document.documentElement.style.setProperty("--chat-w", `${Math.max(320, w - 30)}px`);
        if (ev.key === "ArrowRight") document.documentElement.style.setProperty("--chat-w", `${w + 30}px`);
      }}
    />
  );
}

export default function App() {
  useUiSounds();
  useLive();
  const reduced = useReducedMotion();
  const [dragging, setDragging] = useState(false);
  const [round, setRound] = useState(0); // a new chat gets a fresh bar

  useEffect(() => {
    try {
      const saved = localStorage.getItem(WIDTH_KEY);
      if (saved) document.documentElement.style.setProperty("--chat-w", `${saved}px`);
    } catch {
      // storage off
    }
    connect();
    // ?run=<id>: open a chat from disk, read-only.
    const id = new URLSearchParams(location.search).get("run");
    if (id)
      void fetch(`/api/runs/${encodeURIComponent(id)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data) => loadRun(data.run, data.events, true))
        .catch((err) => console.error("Couldn't open that chat", err));
  }, []);

  // Esc closes the Chats panel, then the focused agent; "/" goes to the box; 1–5 focus an agent.
  // (While you control a browser, keys go to it: the wall handles that.)
  useEffect(() => {
    const keys = (ev: KeyboardEvent) => {
      if (S.ui.control) return;
      const typing = (ev.target as Element).closest?.("input, textarea, select, [contenteditable]");
      if (ev.key === "Escape" && S.historyOpen) return void toggleHistory(false);
      if (typing) return;
      if (ev.key === "Escape" && S.ui.focus) return void focusBot(null);
      if (ev.key === "/") return void (ev.preventDefault(), document.getElementById("input")?.focus());
      if (/^[1-5]$/.test(ev.key) && !ev.metaKey && !ev.ctrlKey && !ev.altKey && phase() === "side") {
        const b = S.bots.find((x) => x.index === Number(ev.key));
        if (b && (b.assignments > 0 || b.status === "working")) focusBot(S.ui.focus === b.id ? null : b.id);
      }
    };
    const outside = (ev: MouseEvent) => {
      if (S.historyOpen && !(ev.target as Element).closest?.("#history, #rail-chats")) toggleHistory(false);
    };
    document.addEventListener("keydown", keys);
    document.addEventListener("mousedown", outside);
    return () => {
      document.removeEventListener("keydown", keys);
      document.removeEventListener("mousedown", outside);
    };
  }, []);

  const p = phase();
  const closed = S.view === "run" && !runActive();
  const o = S.run?.options as { masterModel?: string; botModel?: string; bots?: number } | undefined;
  const fresh = () => (setRound((r) => r + 1), void newChat());
  const composer = S.config ? <Composer key={round} config={S.config} reduced={reduced} /> : null;
  return (
    <div id="app" className={`${p}${S.ui.chatHidden && p === "side" ? " chat-hidden" : ""}${dragging ? " dragging" : ""}`}>
      <nav id="rail" aria-label="Chats">
        <button id="rail-home" className="rail-btn logo-btn" type="button" title="SquadLings" onClick={() => (toggleHistory(false), goHome())}>
          {/* The studio's brand face: a white ball with ^ ^ (as in public/favicon.svg). */}
          <svg className="brand-ball" width="22" height="22" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="30" fill="currentColor" />
            <path d="M18 33l5-7 5 7M36 33l5-7 5 7" fill="none" stroke="var(--bg)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button id="rail-new" className="rail-btn" type="button" title="New chat" aria-label="New chat" onClick={fresh}>
          {PEN}
        </button>
        <button id="rail-chats" className="rail-btn" type="button" title="Chats" aria-label="Chats" aria-expanded={S.historyOpen} onClick={() => toggleHistory()}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <span className="rail-spacer" />
        <span id="tunnel" className={`tunnel-dot ${S.tunnel.state}`} title={tunnelTitle()} />
      </nav>

      <History />

      <div id="shell">
        <TopBar extra={<SoundControls />} />

        <main id="main">
          <aside id="chat" aria-label="Chat with Onyx">
            <div className="chat-head">
              <div className="master-id">
                <span id="master-mark" className={`onyx-mark${S.run?.masterBusy ? " busy" : ""}`} aria-hidden="true">
                  <MasterCharacter state={onyxState()} size={30} reduced={reduced} />
                </span>
                <div>
                  <b>Onyx</b>
                  <small id="master-sub">{o ? `${o.masterModel} · leads ${o.bots} agent${o.bots === 1 ? "" : "s"} on ${o.botModel}` : "Your one line to the squad"}</small>
                </div>
              </div>
              <div className="chat-head-actions">
                {runActive() && S.view === "run" && (S.run?.masterBusy || working().length > 0) ? (
                  <button id="end-onyx" className="head-btn" type="button" title="Stop Onyx and the agents now. The chat stays open: send a message to carry on." onClick={() => void haltOnyx()}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
                    </svg>
                    Stop
                  </button>
                ) : null}
                <button id="hide-chat" className="icon-btn" type="button" title="Hide the chat (the agents get the whole screen; click Onyx to bring it back)" aria-label="Hide the chat" onClick={() => ((S.ui.chatHidden = true), touchLayout())}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3.5" y="4.5" width="17" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
                    <path d="M9.5 4.5v15M15.5 9.5l-2.5 2.5 2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>

            {p === "side" && S.run?.planned ? (
              <div className="onyx-pin">
                <MasterCard reduced={reduced} count={S.bots.length} />
              </div>
            ) : null}

            <section id="home" aria-label="New chat">
              <h1>What should the squad do?</h1>
              <p className="sub">Onyx researches your task and splits it between up to five agents. You watch them work in their own browsers and chat with Onyx.</p>
              <div id="home-slot">
                {p === "home" &&
                  (composer ?? (
                    <div className="hint">
                      <span>{S.banner ? "Can't reach the dashboard server. Start it with npm run ui." : "Connecting…"}</span>
                    </div>
                  ))}
              </div>
            </section>

            <Thread />
            <Activity />
            <div id="chat-slot">{p !== "home" && !closed ? composer : null}</div>
            {closed ? <ClosedBar /> : null}
            <p id="footnote" className="footnote">
              Agents browse real sites in their own browsers. They never sign in, pay or solve CAPTCHAs; those steps are left for you.
            </p>
          </aside>

          <button
            id="chat-rail"
            className="chat-rail"
            type="button"
            hidden={!(p === "side" && S.ui.chatHidden)}
            title="Open the chat with Onyx"
            onClick={() => ((S.ui.chatHidden = false), (S.ui.unread = 0), touchLayout())}
          >
            <span className="onyx-mark small" aria-hidden="true">
              <MasterCharacter state={onyxState()} size={28} reduced={reduced} />
            </span>
            <span>Onyx</span>
            <span id="unread" className="unread" hidden={!S.ui.unread}>
              {S.ui.unread}
            </span>
          </button>
          <Splitter onDrag={setDragging} />
          <Wall />
        </main>
      </div>
      <StudioFx />
      <RoamLayer reduced={reduced} />
      <div id="banner" role="status" hidden={!S.banner}>
        {S.banner}
      </div>
    </div>
  );
}
