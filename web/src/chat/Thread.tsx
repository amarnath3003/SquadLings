import { memo, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { S, useLive, clip, clock, colorVars, hostOf, mmss, money, onyx, phase, runActive, safeHref, shortUrl, touchItem } from "../live/store";
import { MasterCharacter } from "../characters/MasterCharacter";
import { BotCharacter } from "../characters/BotCharacter";
import { CAST } from "@swarm/shared/cast";
import type { Bot, Item, LogEntry, Mission, Source } from "../live/store";
import { focusBot, setHover, takeover } from "../live/actions";
import { md } from "./markdown";
import { ThinkingRow } from "../roam/ThinkingRow";

// The chat thread, ported from ui/app.js "The thread" with the same markup (classic.css): your messages,
// the Master's replies, its research, what needs you, the answer, and one live team card per plan.

function Chip({ name, botId }: { name: string; botId?: string }) {
  if (name === "Master") return <span className="who-chip master">Onyx</span>;
  if (name === "user") return <span className="who-chip user">You</span>;
  if (name === "all") return <span className="who-chip">everyone</span>;
  const named = S.bots.find((x) => x.name === name) ?? (botId && S.botById.get(botId)?.name === name ? S.botById.get(botId) : undefined);
  if (!named) return <span className="who-chip">{name}</span>;
  return (
    <span className="who-chip" style={colorVars(named.color)} data-bot={named.id} title={`Show ${named.name}'s browser`}>
      {name}
    </span>
  );
}

const links = (sources: Source[]) =>
  sources.slice(0, 4).map((s, i) => (
    <span key={i}>
      {i ? " · " : ""}
      <a href={safeHref(s.url)} target="_blank" rel="noopener noreferrer">
        {shortUrl(s.url)}
      </a>
    </span>
  ));

/** One line of team traffic. */
function RadioLine({ it, hover }: { it: Omit<LogEntry, "ts">; hover: string | null }) {
  const [open, setOpen] = useState(false);
  const icon = it.event === "finished" || it.event === "kept" ? "✓" : it.event === "failed" ? "✗" : it.event === "stopped" || it.event === "halt" ? "■" : it.event === "site" ? "⌂" : it.event === "note" ? "·" : "";
  const route: ReactNode[] =
    it.to && it.event !== "failed" && it.event !== "stopped"
      ? [<Chip key="f" name={it.from} botId={it.botId} />, <span key="a" className="arrow">→</span>, ...String(it.to).split(", ").flatMap((n, i) => (i ? [", ", <Chip key={n} name={n} />] : [<Chip key={n} name={n} />]))]
      : [<Chip key="f" name={it.from} botId={it.botId} />];
  const long = String(it.text).length > 220;
  return (
    <div className={`radio${it.event === "finished" ? " done" : ""}${it.botId && hover === it.botId ? " hl" : ""}`} data-bot={it.botId}>
      <div className="route">{route}</div>
      <div
        className={`text${long && !open ? " clamp" : ""}`}
        title={long && !open ? "Show all" : undefined}
        onClick={long ? (ev) => !(ev.target as Element).closest("a") && setOpen(!open) : undefined}
      >
        {icon ? <span className="ico">{icon}</span> : null}
        {it.event === "finished" ? "Finished: " : ""}
        {it.text}
        {it.sources?.length ? <span className="src">{links(it.sources)}</span> : null}
      </div>
    </div>
  );
}

/** What a team card row says about an agent: the newest thing that matters, in one line. */
function rowNote(b: Bot) {
  if (b.control) return { text: "You're in control of this browser", cls: "alert" };
  if (b.human) return { text: `⚠ Needs you: a human check on ${b.human.host}`, cls: "alert" };
  if (b.result) return { text: `✓ ${b.result.summary}`, cls: "news" };
  if (b.status === "failed" || b.status === "stopped") return { text: onyx(b.reason ?? b.status), cls: "" };
  if (b.lastReport) return { text: `“${b.lastReport}”`, cls: "news" };
  return { text: b.goal, cls: "" };
}
function rowState(b: Bot) {
  if (b.control) return "Paused";
  if (b.status === "working") return `Working · ${b.actions}/${b.maxActions}`;
  if (b.status === "starting") return "Starting";
  if (b.status === "finished") return "Done";
  if (b.status === "failed") return "Failed";
  if (b.status === "stopped") return "Stopped";
  return "Waiting";
}

function MissionCard({ it, hover }: { it: Mission; hover: string | null }) {
  const bots = it.bots.map((id) => S.botById.get(id)).filter((b): b is Bot => Boolean(b));
  const live = !it.closed && bots.some((b) => b.status === "working" || b.status === "starting");
  const done = bots.filter((b) => b.status === "finished").length;
  const n = it.log.length;
  return (
    <div className="mission">
      <div className="m-head">
        {live ? <span className="live-dot" aria-hidden="true" /> : null}
        <b>{it.first ? `Team · ${bots.length} agent${bots.length === 1 ? "" : "s"}` : `More work · ${bots.map((b) => b.name).join(", ")}`}</b>
        <span>{live ? `${done}/${bots.length} done` : done === bots.length ? "all done" : `${done}/${bots.length} done`}</span>
        <span className="spacer" />
        <span>{clock(it.ts)}</span>
      </div>
      {bots.map((b) => {
        const note = rowNote(b);
        return (
          <div key={b.id} className={`m-row${hover === b.id ? " hl" : ""}`} style={colorVars(b.color)} data-bot={b.id} data-status={b.control ? "working" : b.status} title={`Show ${b.name}'s browser`}>
            <span className="dot" />
            <div style={{ minWidth: 0 }}>
              <div className="m-top">
                <b>{b.name}</b>
                <span className="role">{b.label ? `· ${b.label}` : ""}</span>
                <span className="spacer" />
                <span className="m-state">{rowState(b)}</span>
              </div>
              <div className={`m-note ${note.cls}`} title={note.text}>
                {note.text}
              </div>
            </div>
          </div>
        );
      })}
      {it.note ? (
        <div className="m-master">
          <span className="who-chip master">Onyx</span>
          <span>{it.note.text}</span>
        </div>
      ) : null}
      <div className="m-foot">
        <button className="m-log-btn" type="button" disabled={!n} onClick={() => ((it.open = !it.open), touchItem(it))}>
          {n ? `${it.open ? "▾" : "▸"} Team messages (${n})` : "No team messages yet"}
        </button>
      </div>
      {it.open && n ? (
        <div className="m-log">
          {it.log.map((e, i) => (
            <RadioLine key={i} it={e} hover={hover} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Research({ it }: { it: Extract<Item, { kind: "research" }> & { open?: boolean } }) {
  const searches = it.list.filter((x) => !/^open /.test(x.q)).length;
  const pages = it.list.length - searches;
  const what = [searches && `${searches} search${searches === 1 ? "" : "es"}`, pages && `${pages} page${pages === 1 ? "" : "s"}`].filter(Boolean).join(", ");
  return (
    <details className={`research${it.live ? " live" : ""}`} open={it.open} onToggle={(e) => (it.open = (e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        {`Researched · ${what}`}
      </summary>
      <ol>
        {it.list.map((x, i) => (
          <li key={i}>
            {/^open /.test(x.q) ? `read ${shortUrl(x.q.slice(5))}` : x.q.replace(/^"|"$/g, "")}
            {x.ok ? "" : " ✗"}
          </li>
        ))}
      </ol>
    </details>
  );
}

function Answer({ it }: { it: Extract<Item, { kind: "answer" }> }) {
  const [label, setLabel] = useState("Copy");
  const copy = async () => {
    const text = `${it.answer}${it.sources?.length ? `\n\nSources:\n${it.sources.map((s) => `- ${s.title ? `${s.title}: ` : ""}${s.url}`).join("\n")}` : ""}`;
    try {
      await navigator.clipboard.writeText(text);
      setLabel("Copied");
    } catch {
      setLabel("Couldn't copy");
    }
    setTimeout(() => setLabel("Copy"), 1500);
  };
  return (
    <div className="answer">
      <div className="answer-head">
        <b>{it.n > 1 ? `Answer · update ${it.n}` : "Answer"}</b>
        <span>{clock(it.ts)}</span>
        <span className="spacer" />
        <button className="btn small ghost" type="button" onClick={() => void copy()}>
          {label}
        </button>
      </div>
      <div className="md" dangerouslySetInnerHTML={{ __html: md(it.answer) }} />
      {it.sources?.length ? (
        <div className="sources">
          Sources
          <ol>
            {it.sources.map((s, i) => (
              <li key={i}>
                <a href={safeHref(s.url)} target="_blank" rel="noopener noreferrer">
                  {s.title ? clip(s.title, 90) : shortUrl(s.url)}
                </a>
                {s.title ? <span className="meta"> · {hostOf(s.url)}</span> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

const WHY: Record<string, string> = { stopped_by_user: "You ended the chat", timeout: "Time limit reached", error: "The chat couldn't continue", server_stopped: "The server stopped", answered: "Done" };

function ItemView({ it, hover }: { it: Item; hover: string | null }) {
  switch (it.kind) {
    case "you":
      return <div className="msg you">{it.text}</div>;
    case "master":
      return (
        <div className="msg master">
          <span className="who onyx-who" aria-hidden="true">
            <MasterCharacter size={22} reduced />
          </span>
          <div className="body md" dangerouslySetInnerHTML={{ __html: md(it.text) }} />
        </div>
      );
    case "research":
      return <Research it={it} />;
    case "mission":
      return <MissionCard it={it} hover={hover} />;
    case "radio":
      return <RadioLine it={it} hover={hover} />;
    case "human": {
      const b = S.botById.get(it.botId);
      const name = b?.name ?? "An agent";
      const cast = CAST.find((c) => c.id === it.botId);
      const open = !it.done && runActive();
      if (!open)
        return (
          <div className="attn-done" data-bot={it.botId}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{it.done ? `Human check on ${it.host} handed back to ${name}.` : `${name} hit a human check on ${it.host}.`}</span>
          </div>
        );
      return (
        <div className="attn-card" data-bot={it.botId} style={b ? colorVars(b.color) : undefined}>
          {cast ? (
            <span className="attn-face">
              <BotCharacter id={cast.id} mood="worried" size={38} reduced />
            </span>
          ) : null}
          <div className="attn-body">
            <b>{b?.control ? `You're in ${name}'s browser` : `${name} needs you`}</b>
            <p>
              A human check (CAPTCHA) on <span className="attn-host">{it.host}</span>. Agents never solve these: take over, solve it, then hand the browser back.
            </p>
            <div className="attn-actions">
              {b?.control ? (
                <button className="attn-go" type="button" onClick={() => void takeover(it.botId, false)}>
                  I'm done, hand it back
                </button>
              ) : (
                <button className="attn-go" type="button" onClick={() => void takeover(it.botId, true)}>
                  Take over
                </button>
              )}
              <button className="attn-look" type="button" onClick={() => focusBot(it.botId)}>
                Just look
              </button>
            </div>
          </div>
        </div>
      );
    }
    case "answer":
      return <Answer it={it} />;
    case "notice":
      return <div className={`notice ${it.level}`}>{onyx(it.text)}</div>;
    case "ended": {
      const why = WHY[String(it.reason)] ?? it.reason;
      return (
        <div className="ended">
          <b>{it.status === "failed" ? "Chat failed" : "Chat ended"}</b>
          {` · ${why}`}
          {typeof it.durationMs === "number" && it.durationMs ? ` · ${mmss(it.durationMs)}` : ""}
          {it.costUSD !== undefined ? ` · ≈ ${money(it.costUSD)}` : ""}
          {it.out ? <div className="meta">Saved in {String(it.out)}</div> : null}
        </div>
      );
    }
    default:
      return <div />;
  }
}

/** A mission card also changes when its agents do. */
const sigOf = (it: Item) => (it.kind === "mission" ? it.bots.map((id) => S.botById.get(id)?.rev ?? 0).join(",") : "");
const Row = memo(
  function Row({ it }: { it: Item; rev: number; sig: string; hover: string | null }) {
    return <ItemView it={it} hover={S.ui.hover} />;
  },
  (a, b) => a.it === b.it && a.rev === b.rev && a.sig === b.sig && a.hover === b.hover,
);

export function Thread() {
  useLive();
  const el = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const seen = useRef({ run: "", count: 0 });
  const [jump, setJump] = useState(false);
  const runId = S.run?.id ?? "";
  const count = S.thread.length;

  // Stay at the bottom while you're there; otherwise say there's more.
  useLayoutEffect(() => {
    const t = el.current;
    if (!t) return;
    if (seen.current.run !== runId) (stick.current = true), setJump(false);
    const added = count > seen.current.count;
    seen.current = { run: runId, count };
    if (stick.current) t.scrollTop = t.scrollHeight;
    else if (added) setJump(true);
  });

  const hoverOf = (id: string) => (S.ui.hover === id ? id : null);
  return (
    <>
      <div
        id="thread"
        className="thread"
        aria-live="polite"
        ref={el}
        onScroll={(e) => {
          const t = e.currentTarget;
          stick.current = t.scrollHeight - t.scrollTop - t.clientHeight < 80;
          if (t.scrollHeight - t.scrollTop - t.clientHeight < 40) setJump(false);
        }}
        onMouseOver={(ev) => setHover((ev.target as Element).closest<HTMLElement>("[data-bot]")?.dataset.bot ?? null)}
        onMouseLeave={() => setHover(null)}
        onClick={(ev) => {
          const target = ev.target as Element;
          if (target.closest("a, button, summary")) return;
          const chip = target.closest<HTMLElement>(".who-chip[data-bot], .m-row[data-bot]");
          if (chip && phase() === "side") focusBot(chip.dataset.bot!);
        }}
      >
        {S.thread.map((it) => (
          <Row key={it.id} it={it} rev={it.rev} sig={sigOf(it)} hover={it.kind === "mission" || it.kind === "radio" ? (it.kind === "radio" ? hoverOf(it.botId ?? "") : S.ui.hover) : null} />
        ))}
        <ThinkingRow />
      </div>
      <button
        id="jump"
        className="jump"
        type="button"
        hidden={!jump}
        onClick={() => {
          if (el.current) el.current.scrollTop = el.current.scrollHeight;
          stick.current = true;
          setJump(false);
        }}
      >
        New messages ↓
      </button>
    </>
  );
}
