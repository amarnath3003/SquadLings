// The shell around the chat and the wall, ported from ui/app.js "Top bar, the Master's line, the
// composer", "Chats" and "Sending": the top bar, the Master's activity line, the Chats panel, the closed
// bar, the chat rail and the banner. Same markup as classic, so classic.css applies.
import { useEffect, useState } from "react";
import { S, clip, clock, colorVars, money, mmss, phase, runActive, working } from "../live/store";
import { post, showHint } from "../live/actions";
import { newChat, openChat, toggleHistory } from "../live/history";
import { thinkingShown } from "../roam/ThinkingRow";

function runPhaseLabel(): [string, string] | null {
  const r = S.run;
  if (!r || S.view === "home") return null;
  if (r.past && r.status === "interrupted") return ["Interrupted", "done"];
  if (r.status === "starting") return ["Starting", "busy"];
  if (r.status === "ending") return ["Ending", "busy"];
  if (r.status === "ended") return ["Ended", "done"];
  if (r.status === "failed") return ["Failed", "err"];
  const n = working().length;
  if (n) return [`Working · ${n} agent${n === 1 ? "" : "s"}`, "live"];
  if (r.masterBusy) return [r.planned ? "Onyx thinking" : "Planning", "busy"];
  if (r.answered) return ["Answered", "ok"];
  return ["Ready", "idle"];
}

function Timer() {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const r = S.run!;
  return (
    <span id="run-timer" className="stat mono" title="Time since the chat started">
      {mmss((r.endedAt ?? Date.now()) - (r.startedAt ?? Date.now()))}
    </span>
  );
}

async function endChat() {
  if (!S.run || !confirm("End this chat? The agents stop and their browsers close. You can reopen it from Chats to read it.")) return;
  try {
    await post(`/api/runs/${S.run.id}/stop`);
  } catch (err) {
    showHint(err instanceof Error ? err.message : String(err), true);
  }
}

/** The run's title, status, timer, cost and End chat; on home, whether the tools are online. */
export function TopBar({ extra }: { extra?: React.ReactNode }) {
  const r = S.view === "run" ? S.run : null;
  const p = runPhaseLabel();
  const t = S.tunnel;
  const byAgent = r?.byAgent as Record<string, number> | undefined;
  return (
    <header id="top">
      <div id="run-title" className="run-title" title={r?.task ?? ""}>
        {r ? clip(r.task, 140) : ""}
      </div>
      <div className="top-right">
        {p ? (
          <span id="run-status" className={`pill ${p[1]}`}>
            {p[0]}
          </span>
        ) : null}
        {r ? <Timer /> : null}
        {r && r.cost !== undefined ? (
          <span id="run-cost" className="stat mono" title={`Model tokens so far (estimated from each session's usage)${byAgent ? `\n${Object.entries(byAgent).map(([a, c]) => `${a}: ${money(c)}`).join("\n")}` : ""}`}>
            ≈ {money(r.cost)}
          </span>
        ) : null}
        <span id="tools-label" className="tools-label">
          {/* the rail's dot says the tools are up; words only when they're down */}
          {S.view === "home" && t.state === "failed" ? "tools offline" : ""}
        </span>
        {extra}
        {runActive() && S.view === "run" ? (
          <button id="end-chat" className="btn small danger" type="button" title="Stop the agents and close their browsers. The chat stays under Chats." onClick={() => void endChat()}>
            End chat
          </button>
        ) : null}
      </div>
    </header>
  );
}

/** The Master's line above the composer: what it's doing, and who's working. */
export function Activity() {
  const r = S.view === "run" ? S.run : null;
  // While Onyx starts or thinks, the thread's thinking row is the one indicator (roam/ThinkingRow.tsx).
  if (!r || !runActive() || thinkingShown()) return <div id="activity" className="activity" />;
  const busyBots = working();
  const ready = (
    <span className="ready-dots" title={`${S.bots.filter((b) => b.warm).length} of ${S.bots.length} agents ready`}>
      {S.bots.map((b) => (
        <i key={b.id} className={b.warm ? "warm" : ""} style={colorVars(b.color)} />
      ))}
    </span>
  );
  let body: React.ReactNode;
  if (r.status === "starting")
    body = (
      <>
        <span className="now dots">{r.step ?? "Starting"}</span>
      </>
    );
  else if (r.masterBusy)
    body = (
      <>
        <span className="now dots">Onyx: {r.masterDoing ?? "Thinking"}</span>
        {busyBots.length ? (
          <span className="sub">· {busyBots.map((b) => b.name).join(", ")} working</span>
        ) : !r.planned && S.bots.length ? (
          <>
            <span className="sub">·</span>
            {ready}
          </>
        ) : null}
      </>
    );
  else if (busyBots.length)
    body = (
      <>
        <span className="now">Onyx is watching the team</span>
        <span className="sub">· waiting for {busyBots.map((b) => b.name).join(", ")}</span>
      </>
    );
  else body = <span className="sub">{r.answered ? "Ask a follow-up, or end the chat when you're done." : "Onyx is idle."}</span>;
  return (
    <div id="activity" className="activity">
      {body}
    </div>
  );
}

/** A closed chat: read it, or start a new one. */
export function ClosedBar() {
  const r = S.run!;
  const ended = r.status === "ending" ? "This chat is ending…" : r.status === "interrupted" ? "This chat was interrupted (the server stopped)." : "This chat has ended. You can read it here or start a new one.";
  return (
    <div id="closed-bar" className="closed-bar">
      <span>{ended}</span>
      <button className="btn small primary" type="button" onClick={() => void newChat()}>
        + New chat
      </button>
    </div>
  );
}

const PEN = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z M13.5 7.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);

function day(ts: number) {
  const d = new Date(ts);
  const y = new Date(Date.now() - 864e5);
  return d.toDateString() === new Date().toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** The Chats panel: every chat by day; the live one first. */
export function History() {
  if (!S.historyOpen) return null;
  const rows: React.ReactNode[] = [];
  let group = "";
  for (const r of S.history) {
    const g = r.live ? "Now" : day(r.startedAt);
    if (g !== group)
      rows.push(
        <div key={`g-${g}`} className="h-group">
          {(group = g)}
        </div>,
      );
    const state = r.live ? "live" : r.status === "failed" ? "failed" : r.answers ? "answered" : "";
    const meta = r.live
      ? "Live now · click to return"
      : [clock(r.startedAt), r.bots ? `${r.bots} agent${r.bots === 1 ? "" : "s"}` : "", r.answers ? "answered" : r.status === "interrupted" ? "interrupted" : "no answer", r.costUSD !== null ? `≈ ${money(r.costUSD)}` : ""].filter(Boolean).join(" · ");
    rows.push(
      <button key={r.id} className={`h-item ${state}${S.view === "run" && S.run?.id === r.id ? " current" : ""}`} type="button" title={r.task} onClick={() => void openChat(r.id)}>
        <span className="st" />
        <span className="t">{clip(r.task, 80)}</span>
        <span className="m">{meta}</span>
      </button>,
    );
  }
  return (
    <aside id="history" aria-label="Chats">
      <div className="history-head">
        <b>Chats</b>
        <button id="history-close" className="icon-btn" type="button" aria-label="Close" onClick={() => toggleHistory(false)}>
          ✕
        </button>
      </div>
      <button id="history-new" className="history-new" type="button" onClick={() => void newChat()}>
        {PEN}
        New chat
      </button>
      <div id="history-list" className="history-list">
        {S.history.length ? rows : <div className="h-empty">No chats yet.</div>}
      </div>
    </aside>
  );
}

export { PEN };
