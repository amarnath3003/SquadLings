// SquadLings basic dashboard (a Phase 2 stand-in for master.md §19; the real one is React + Vite).
//
// The flow follows a chat app:
//   home    one pill-shaped bar in the middle: the task, how many agents, how hard they think
//   center  the conversation with the Master in a centered column, while it reads and plans
//   side    the moment agents get work, the chat slides left and their live browsers spawn on the right
// A rail on the left starts a new chat and lists past chats (they reopen read-only).
//
// Every server event goes through apply() (the §19.3 reducer idea): it updates plain state and marks
// what changed, and one animation frame later only those parts are redrawn. Opening a chat (or
// reloading) replays its events through the same function. The chat stays calm: all team traffic for
// a plan lives in one live "team card" (a row per agent, the Master's latest note, and the messages
// folded away); the main thread keeps you, the Master's replies, research, what needs you, and the
// answer. Live frames are binary WebSocket messages drawn onto each tile's canvas; the cursor is
// drawn over the frame from cursor.* events (D-03).

const $ = (sel, root = document) => root.querySelector(sel);

/** Makes an element: h("div", { class: "x", onclick }, "text", child). `html` must be trusted markup. */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clip = (s, n) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // private window or storage off: settings just aren't remembered
    }
  },
};

function hostOf(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.host.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}
function shortUrl(url) {
  try {
    const u = new URL(url);
    const s = `${u.host.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
    return s.length > 60 ? `${s.slice(0, 59)}…` : s;
  } catch {
    return url;
  }
}
const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const money = (usd) => (usd === undefined || usd === null ? "" : `$${usd < 0.1 ? usd.toFixed(3) : usd.toFixed(2)}`);
const clock = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const safeHref = (url) => (/^https?:\/\//i.test(String(url)) ? String(url) : "#");

/** A lighter version of a bot color, readable as text on the dark background. */
function tint(hex, amount = 0.35) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}
/** Black or white text on a bot color. */
function onColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#111" : "#fff";
}
const colorVars = (color) => ({ "--c": color, "--ct": tint(color), "--on-c": onColor(color) });
/** Bots address the Master as "master"; show one spelling. */
const who = (name) => (/^(the )?master$/i.test(String(name ?? "").trim()) ? "Master" : /^(all|everyone)$/i.test(String(name ?? "").trim()) ? "all" : String(name ?? ""));

// ── Markdown (a small, safe subset: everything is escaped; only these tags come out) ──

const link = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(/^https?:\/\//.test(label) ? shortUrl(label) : label)}</a>`;

function inline(text) {
  const tokens = [];
  const keep = (html) => `\u0000${tokens.push(html) - 1}\u0000`;
  let t = String(text ?? "");
  t = t.replace(/`([^`\n]+)`/g, (_, c) => keep(`<code>${esc(c)}</code>`));
  t = t.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => keep(link(url, label)));
  t = t.replace(/https?:\/\/[^\s<>"'`\u0000]+/g, (raw) => {
    const [, url, tail] = /^(.*?)([.,;:!?)\]]*)$/.exec(raw);
    return keep(link(url, url)) + tail;
  });
  t = esc(t)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*\n]*)\*(?=$|[\s.,;:!?)])/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\s][^_\n]*)_(?=$|[\s.,;:!?)])/g, "$1<em>$2</em>");
  return t.replace(/\u0000(\d+)\u0000/g, (_, n) => tokens[Number(n)]);
}

function md(src) {
  const lines = String(src ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  const row = (l) => /^\s*\|.*\|\s*$/.test(l);
  const sep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  const item = /^\s*([-*•]|\d+[.)])\s+(.*)$/;
  const heading = /^\s*#{1,6}\s+(.*)$/;
  const tableAt = (i) => row(lines[i]) && i + 1 < lines.length && sep(lines[i + 1]);
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
    } else if (tableAt(i)) {
      const cells = (r) => r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => inline(c.trim()));
      const head = cells(l);
      i += 2;
      const rows = [];
      while (i < lines.length && row(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    } else if (heading.test(l)) {
      out.push(`<h4>${inline(heading.exec(l)[1])}</h4>`);
      i++;
    } else if (item.test(l)) {
      const ordered = /^\s*\d/.test(l);
      const items = [];
      while (i < lines.length && item.test(lines[i])) {
        items.push(inline(item.exec(lines[i++])[2]));
        while (i < lines.length && lines[i].trim() && !item.test(lines[i]) && /^\s{2,}/.test(lines[i])) items[items.length - 1] += `<br>${inline(lines[i++].trim())}`;
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.map((t) => `<li>${t}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() && !item.test(lines[i]) && !heading.test(lines[i]) && !tableAt(i)) para.push(inline(lines[i++].trim()));
      out.push(`<p>${para.join("<br>")}</p>`);
    }
  }
  return out.join("");
}

// ── State ──

const S = {
  config: null,
  tunnel: { state: "starting" },
  view: "home", // "home" (new chat) or "run" (a chat on screen: live, or a closed one opened from Chats)
  run: null,
  liveId: null, // the run the server is running now, if any
  starting: false, // this tab just asked for a new run: open it when it starts
  bots: [],
  botById: new Map(),
  thread: [],
  replaying: false,
  history: [],
  ui: { focus: null, hover: null, chatHidden: false, unread: 0, pop: null },
};
let itemSeq = 0;
const pendingFrames = new Map(); // frames that arrived before their bot's tile
const liveFrames = new Map(); // the live run's latest frame per bot index, to repaint when you return to it

const ACTIVE = new Set(["starting", "running"]);
const runActive = () => Boolean(S.run && !S.run.past && ACTIVE.has(S.run.status));
const working = () => S.bots.filter((b) => b.status === "working" || b.status === "starting");
const EFFORTS = [
  { v: "none", label: "None", desc: "No thinking between steps. Fastest and cheapest; fine for simple lookups." },
  { v: "low", label: "Low", desc: "A little thinking. Quick, and enough for most browsing." },
  { v: "medium", label: "Medium", desc: "The default: a balance of speed and care." },
  { v: "high", label: "High", desc: "Thinks more before each step. Slower; for tricky sites." },
  { v: "xhigh", label: "X-High", desc: "The most careful. Slowest and costliest." },
];

/** Which layout: the home bar, the centered chat, or chat on the side with the agents' browsers. */
function phase() {
  if (S.view === "home" || !S.run) return "home";
  return S.run.planned || S.bots.some((b) => b.assignments > 0) ? "side" : "center";
}

function makeBot(c, index) {
  return {
    id: c.id, index, name: c.name, color: c.color, status: "idle", reason: null, warm: false,
    label: "", goal: "", startUrl: "", assignments: 0, actions: 0, maxActions: S.run?.options?.maxActions ?? 30,
    caption: "", url: "", title: "", vw: 1280, vh: 800, live: false, steps: [], result: null, human: null, control: false,
    lastReport: null, missionId: null, rowSig: "", spawned: false,
    cursor: null, el: null, decoding: false, nextFrame: null, bubbleTimer: null,
  };
}

// ── Dirty tracking: what to redraw on the next frame ──

const dirty = { items: new Set(), bots: new Set(), top: false, layout: false };
let raf = 0;
function schedule() {
  if (!raf && !S.replaying) raf = requestAnimationFrame(flush);
}
const touchBot = (b) => (dirty.bots.add(b), (dirty.top = true), schedule());
const touchTop = () => ((dirty.top = true), schedule());
const touchLayout = () => ((dirty.layout = true), (dirty.top = true), schedule());
const MAIN_KINDS = new Set(["you", "master", "answer", "human", "notice"]);
function addItem(item) {
  item.id = ++itemSeq;
  S.thread.push(item);
  dirty.items.add(item);
  if (S.ui.chatHidden && !S.replaying && MAIN_KINDS.has(item.kind)) (S.ui.unread++, (dirty.top = true));
  schedule();
  return item;
}
const touchItem = (item) => (dirty.items.add(item), schedule());

// ── Events (the reducer) ──

function botOf(e) {
  return e.botId ? S.botById.get(e.botId) : undefined;
}
function step(b, s) {
  b.steps.push({ ...s, at: s.at ?? Date.now() });
  if (b.steps.length > 300) b.steps.splice(0, b.steps.length - 300);
}
function researchItem(ts) {
  const last = S.thread.at(-1);
  if (last?.kind === "research" && last.live) return last;
  return addItem({ kind: "research", live: true, list: [], ts });
}
function closeResearch() {
  for (const it of S.thread) if (it.kind === "research" && it.live) (it.live = false), touchItem(it);
}
/** The team card of the latest plan. */
const mission = () => S.run?.missions.at(-1);
/** Team traffic goes into the latest team card's log (or the thread, before any plan). */
function teamLog(entry) {
  const m = mission();
  if (m) {
    m.log.push(entry);
    touchItem(m);
  } else addItem({ kind: "radio", ...entry });
}

const MASTER_DOING = { start_bots: "Assigning the agents", message_bot: "Messaging an agent", stop_bot: "Stopping an agent", site_access: "Deciding on a site", final_answer: "Writing the answer", team_status: "Checking on the team" };

const handlers = {
  "run.created"(e) {
    Object.assign(S.run, { task: e.data.task, options: e.data.options, out: e.data.out, replyDue: true });
    addItem({ kind: "you", text: e.data.task, ts: e.ts });
  },
  "run.status"(e) {
    const r = S.run;
    r.status = e.data.status;
    if (e.data.step) r.step = e.data.step;
    if (e.data.status === "ended" || e.data.status === "failed") {
      r.endedAt = e.ts;
      r.ended = e.data;
      if (e.data.costUSD !== undefined) r.cost = e.data.costUSD;
      r.masterBusy = false;
      closeResearch();
      for (const m of r.missions) m.closed = true, touchItem(m);
      addItem({ kind: "ended", ...e.data, ts: e.ts });
      if (!S.replaying && r.id === S.liveId) (S.liveId = null), void loadHistory();
    }
    touchLayout();
  },
  "run.notice"(e) {
    addItem({ kind: "notice", level: e.data.level ?? "info", text: e.data.text, ts: e.ts });
  },
  "run.result"(e) {
    S.run.answered = true;
    const m = mission();
    if (m) (m.closed = true), touchItem(m);
    addItem({ kind: "answer", answer: e.data.answer, sources: e.data.sources ?? [], n: e.data.n ?? 1, ts: e.ts });
    attention("answer");
    touchTop();
  },
  "usage.updated"(e) {
    S.run.cost = e.data.costUSD;
    S.run.byAgent = e.data.byAgent;
    touchTop();
  },

  "bot.spawned"(e) {
    let b = S.botById.get(e.botId);
    if (!b) {
      b = makeBot({ id: e.botId, name: e.data.name, color: e.data.color }, e.data.index);
      S.bots.push(b);
      S.bots.sort((x, y) => x.index - y.index);
      S.botById.set(b.id, b);
    }
    Object.assign(b, { vw: e.data.viewport?.width ?? 1280, vh: e.data.viewport?.height ?? 800, maxActions: e.data.maxActions ?? b.maxActions });
    touchBot(b);
    touchLayout();
  },
  "bot.warm"(e) {
    const b = botOf(e);
    if (b) (b.warm = true), touchBot(b);
  },
  "bot.status"(e) {
    const b = botOf(e);
    if (!b) return;
    const was = b.status;
    b.status = e.data.status;
    b.reason = e.data.reason ?? null;
    if (typeof e.data.actions === "number") b.actions = e.data.actions;
    if (b.status === "failed" && was !== "failed") {
      teamLog({ from: b.name, botId: b.id, event: "failed", text: `failed: ${b.reason ?? "unknown error"}`, ts: e.ts });
      step(b, { kind: "bad", text: `failed: ${b.reason ?? ""}`, at: e.ts });
    } else if (b.status === "stopped" && was !== "stopped") {
      teamLog({ from: b.name, botId: b.id, event: "stopped", text: b.reason && b.reason !== "stopped by the Master" ? `stopped (${b.reason})` : "stopped", ts: e.ts });
    } else if (b.status === "finished" && was !== "finished" && b.reason === "kept its earlier result") {
      teamLog({ from: b.name, to: "Master", botId: b.id, event: "kept", text: "replied; its earlier result stands", ts: e.ts });
    } else if (b.status === "finished" && was !== "finished" && b.reason) {
      teamLog({ from: b.name, botId: b.id, event: "stopped", text: b.reason, ts: e.ts });
    }
    if (b.status !== "working" && b.status !== "starting") hideCursorSoon(b);
    touchBot(b);
    touchLayout();
  },
  "bot.assigned"(e) {
    const b = botOf(e);
    if (!b) return;
    Object.assign(b, { goal: e.data.goal, label: e.data.label || b.label, startUrl: e.data.startUrl ?? "", assignments: e.data.assignment, result: null, actions: 0, caption: "", lastReport: null });
    step(b, { kind: "assign", text: e.data.assignment > 1 ? `New assignment: ${e.data.label || clip(e.data.goal, 60)}` : `Assignment: ${e.data.label || clip(e.data.goal, 60)}`, at: e.ts });
    touchBot(b);
    touchLayout();
  },
  "bot.caption"(e) {
    const b = botOf(e);
    if (b) (b.caption = e.data.text), touchBot(b);
  },
  "tool.called"(e) {
    const b = botOf(e);
    if (!b) return;
    b.actions = e.data.actions ?? b.actions;
    if (e.data.tool !== "message" && e.data.tool !== "finish") step(b, { kind: e.data.ok ? "ok" : "bad", text: e.data.summary, ms: e.data.ms, at: e.ts });
    touchBot(b);
  },
  "bot.search"(e) {
    const b = botOf(e);
    if (b) step(b, { kind: "search", text: `web search ${e.data.query}`, ms: e.data.ms, at: e.ts }), touchBot(b);
  },
  "bot.text"() {},
  "bot.notice"(e) {
    const b = botOf(e);
    if (b) teamLog({ from: b.name, botId: b.id, event: "notice", text: e.data.text, ts: e.ts });
  },
  "bot.result"(e) {
    const b = botOf(e);
    if (!b) return;
    b.result = { summary: e.data.summary, sources: e.data.sources ?? [] };
    step(b, { kind: "done", text: "finished and reported to the Master", at: e.ts });
    teamLog({ from: b.name, to: "Master", botId: b.id, event: "finished", text: e.data.summary, sources: e.data.sources ?? [], ts: e.ts });
    pulse(b);
    touchBot(b);
  },
  "page.navigated"(e) {
    const b = botOf(e);
    if (!b) return;
    b.url = e.data.url;
    if (e.data.title) b.title = e.data.title;
    touchBot(b);
  },
  "human.check"(e) {
    const b = botOf(e);
    if (!b) return;
    b.human = { host: e.data.host, reason: e.data.reason };
    addItem({ kind: "human", botId: b.id, host: e.data.host, ts: e.ts });
    teamLog({ from: b.name, botId: b.id, event: "notice", text: `hit a human check on ${e.data.host}`, ts: e.ts });
    attention("needs");
    touchBot(b);
  },
  "takeover.started"(e) {
    const b = botOf(e);
    if (!b) return;
    b.control = true;
    S.ui.control = b.id;
    if (!S.replaying) S.ui.focus = b.id;
    addItem({ kind: "notice", level: "info", text: `You took over ${b.name}'s browser. ${b.name}'s next actions wait until you hand it back.`, ts: e.ts });
    touchBot(b);
    touchLayout();
  },
  "takeover.ended"(e) {
    const b = botOf(e);
    if (!b) return;
    b.control = false;
    b.human = null;
    if (S.ui.control === b.id) S.ui.control = null;
    for (const it of S.thread) if (it.kind === "human" && it.botId === b.id && !it.done) (it.done = true), touchItem(it);
    addItem({ kind: "notice", level: "info", text: `You handed ${b.name}'s browser back.`, ts: e.ts });
    touchBot(b);
    touchLayout();
  },
  "site.request"(e) {
    const b = botOf(e);
    if (b) teamLog({ from: b.name, to: "Master", botId: b.id, event: "site", text: `asks to open ${e.data.site}${e.data.reason ? ` (${clip(e.data.reason, 80)})` : ""}`, ts: e.ts });
  },
  "site.decided"(e) {
    if (!e.data.askedBy?.length) return; // the plan's own sites
    teamLog({ from: e.data.by === "the Master" ? "Master" : "Plan", to: e.data.askedBy.join(", "), event: "site", text: `${e.data.allow ? "allowed" : "blocked"} ${e.data.site}`, ts: e.ts });
  },
  "team.message"(e) {
    const { text } = e.data;
    const from = who(e.data.from);
    const to = who(e.data.to);
    if (from === "user") {
      S.run.replyDue = true;
      return void addItem({ kind: "you", text, ts: e.ts });
    }
    const sender = S.bots.find((b) => b.name === from);
    const target = S.bots.find((b) => b.name === to);
    teamLog({ from, to, text, botId: sender?.id ?? target?.id, ts: e.ts });
    if (sender) {
      if (to === "Master") sender.lastReport = text;
      step(sender, { kind: "msg", text: `→ ${to === "all" ? "everyone" : to}: ${text}`, at: e.ts });
      bubble(sender, `→ ${to === "all" ? "everyone" : to}`, text);
      touchBot(sender);
    }
    if (from === "Master") {
      const targets = to === "all" ? working() : target ? [target] : [];
      for (const t of targets) step(t, { kind: "msg", text: `← Master: ${text}`, at: e.ts }), bubble(t, "Master", text), touchBot(t);
    }
  },
  "master.status"(e) {
    const r = S.run;
    r.masterBusy = Boolean(e.data.busy);
    if (r.masterBusy) r.masterDoing = r.planned ? "Thinking" : "Reading the task";
    else closeResearch();
    touchTop();
  },
  "master.text"(e) {
    // A reply to you is a message; progress narration while the agents work goes on the team card.
    const m = mission();
    if (S.run.replyDue || !m || m.closed) {
      S.run.replyDue = false;
      return void addItem({ kind: "master", text: e.data.text, ts: e.ts });
    }
    m.note = { text: e.data.text, ts: e.ts };
    m.log.push({ from: "Master", text: e.data.text, ts: e.ts, event: "note" });
    touchItem(m);
  },
  "master.search"(e) {
    const it = researchItem(e.ts);
    it.list.push({ q: e.data.query, ok: e.data.ok !== false });
    touchItem(it);
    S.run.masterDoing = /^open /.test(e.data.query) ? `Reading ${shortUrl(e.data.query.slice(5))}` : `Searching ${clip(e.data.query, 60)}`;
    touchTop();
  },
  "master.tool"(e) {
    if (MASTER_DOING[e.data.tool]) S.run.masterDoing = e.data.ok ? MASTER_DOING[e.data.tool] : "Fixing a step";
    touchTop();
  },
  "master.stopped"(e) {
    const names = (e.data.bots ?? []).map((id) => S.botById.get(id)?.name).filter(Boolean);
    teamLog({ from: "Master", to: names.join(", "), event: "halt", text: `stop${e.data.reason ? `: ${e.data.reason}` : ""}`, ts: e.ts });
  },
  "plan.ready"(e) {
    closeResearch();
    const first = !S.run.planned;
    S.run.planned = true;
    const prev = mission();
    if (prev) (prev.closed = true), touchItem(prev);
    const m = addItem({ kind: "mission", first, bots: e.data.assignments.map((a) => a.botId), plan: e.data.assignments, log: [], note: null, open: false, closed: false, ts: e.ts });
    S.run.missions.push(m);
    for (const a of e.data.assignments) {
      const b = S.botById.get(a.botId);
      if (!b) continue;
      b.label = a.label || b.label;
      b.goal = a.goal;
      b.missionId = m.id;
      b.lastReport = null;
      b.result = null;
      touchBot(b);
    }
    touchLayout();
  },
  "cursor.move"(e) {
    const b = botOf(e);
    if (b) cursorEvent(b, e.data);
  },
  "cursor.click"(e) {
    const b = botOf(e);
    if (b) cursorEvent(b, e.data);
  },
  "cursor.think"(e) {
    const b = botOf(e);
    if (b) cursorEvent(b, e.data);
  },
};

function apply(e) {
  if (!S.run || e.runId !== S.run.id) return;
  const fn = handlers[e.type];
  if (fn) fn(e);
}

// ── The thread ──

const threadEl = $("#thread");

function chip(name, botId) {
  if (name === "Master") return h("span", { class: "who-chip master" }, "Master");
  if (name === "user") return h("span", { class: "who-chip user" }, "You");
  if (name === "all") return h("span", { class: "who-chip" }, "everyone");
  const named = S.bots.find((x) => x.name === name) ?? (botId && S.botById.get(botId)?.name === name ? S.botById.get(botId) : undefined);
  if (!named) return h("span", { class: "who-chip" }, name);
  return h("span", { class: "who-chip", style: colorVars(named.color), "data-bot": named.id, title: `Show ${named.name}'s browser` }, name);
}

/** One line of team traffic. */
function radioLine(it) {
  const icon = it.event === "finished" || it.event === "kept" ? "✓" : it.event === "failed" ? "✗" : it.event === "stopped" || it.event === "halt" ? "■" : it.event === "site" ? "⌂" : it.event === "note" ? "·" : "";
  const route = it.to && it.event !== "failed" && it.event !== "stopped" ? [chip(it.from, it.botId), h("span", { class: "arrow" }, "→"), ...String(it.to).split(", ").flatMap((n, i) => (i ? [", ", chip(n)] : [chip(n)]))] : [chip(it.from, it.botId)];
  const long = String(it.text).length > 220;
  const text = h("div", { class: `text${long && !it.open ? " clamp" : ""}`, title: long && !it.open ? "Show all" : null },
    icon ? h("span", { class: "ico" }, icon) : null, it.event === "finished" ? "Finished: " : "", it.text,
    it.sources?.length ? h("span", { class: "src" }, it.sources.slice(0, 4).map((s, i) => [i ? " · " : "", h("a", { href: safeHref(s.url), target: "_blank", rel: "noopener noreferrer" }, shortUrl(s.url))])) : null);
  if (long) text.addEventListener("click", (ev) => {
    if (ev.target.closest("a")) return;
    it.open = !it.open;
    text.classList.toggle("clamp", !it.open);
  });
  return h("div", { class: `radio${it.event === "finished" ? " done" : ""}`, "data-bot": it.botId ?? null }, h("div", { class: "route" }, route), text);
}

/** What a team card row says about an agent: the newest thing that matters, in one line. */
function rowNote(b) {
  if (b.control) return { text: "You're in control of this browser", cls: "alert" };
  if (b.human) return { text: `⚠ Needs you: a human check on ${b.human.host}`, cls: "alert" };
  if (b.result) return { text: `✓ ${b.result.summary}`, cls: "news" };
  if (b.status === "failed" || b.status === "stopped") return { text: b.reason ?? b.status, cls: "" };
  if (b.lastReport) return { text: `“${b.lastReport}”`, cls: "news" };
  return { text: b.goal, cls: "" };
}
function rowState(b) {
  if (b.control) return "Paused";
  if (b.status === "working") return `Working · ${b.actions}/${b.maxActions}`;
  if (b.status === "starting") return "Starting";
  if (b.status === "finished") return "Done";
  if (b.status === "failed") return "Failed";
  if (b.status === "stopped") return "Stopped";
  return "Waiting";
}
const rowSig = (b) => [b.status, b.actions, b.control, b.human?.host, b.result?.summary, b.lastReport, b.reason, b.label].join("|");

function renderMission(it) {
  const bots = it.bots.map((id) => S.botById.get(id)).filter(Boolean);
  const live = !it.closed && bots.some((b) => b.status === "working" || b.status === "starting");
  const done = bots.filter((b) => b.status === "finished").length;
  const head = h("div", { class: "m-head" },
    live ? h("span", { class: "live-dot", "aria-hidden": "true" }) : null,
    h("b", {}, it.first ? `Team · ${bots.length} agent${bots.length === 1 ? "" : "s"}` : `More work · ${bots.map((b) => b.name).join(", ")}`),
    h("span", {}, live ? `${done}/${bots.length} done` : done === bots.length ? "all done" : `${done}/${bots.length} done`),
    h("span", { class: "spacer" }), h("span", {}, clock(it.ts)));
  const rows = bots.map((b) => {
    const note = rowNote(b);
    return h("div", { class: "m-row", style: colorVars(b.color), "data-bot": b.id, "data-status": b.control ? "working" : b.status, title: `Show ${b.name}'s browser` },
      h("span", { class: "dot" }),
      h("div", { style: { "min-width": "0" } },
        h("div", { class: "m-top" }, h("b", {}, b.name), h("span", { class: "role" }, b.label ? `· ${b.label}` : ""), h("span", { class: "spacer" }), h("span", { class: "m-state" }, rowState(b))),
        h("div", { class: `m-note ${note.cls}`, title: note.text }, note.text)));
  });
  const masterNote = it.note ? h("div", { class: "m-master" }, h("span", { class: "who-chip master" }, "Master"), h("span", {}, it.note.text)) : null;
  const n = it.log.length;
  const foot = h("div", { class: "m-foot" },
    h("button", { class: "m-log-btn", type: "button", onclick: () => ((it.open = !it.open), touchItem(it)), disabled: !n }, n ? `${it.open ? "▾" : "▸"} Team messages (${n})` : "No team messages yet"));
  const log = it.open && n ? h("div", { class: "m-log" }, it.log.map(radioLine)) : null;
  return h("div", { class: "mission" }, head, rows, masterNote, foot, log);
}

function renderItem(it) {
  switch (it.kind) {
    case "you":
      return h("div", { class: "msg you" }, it.text);
    case "master":
      return h("div", { class: "msg master" }, h("span", { class: "who", "aria-hidden": "true" }), h("div", { class: "body md", html: md(it.text) }));
    case "research": {
      const searches = it.list.filter((x) => !/^open /.test(x.q)).length;
      const pages = it.list.length - searches;
      const what = [searches && `${searches} search${searches === 1 ? "" : "es"}`, pages && `${pages} page${pages === 1 ? "" : "s"}`].filter(Boolean).join(", ");
      const el = h("details", { class: `research${it.live ? " live" : ""}` },
        h("summary", {}, it.live ? h("span", { class: "spinner", "aria-hidden": "true" }) : null, it.live ? `Researching · ${what}` : `Researched · ${what}`),
        h("ol", {}, it.list.map((x) => h("li", {}, /^open /.test(x.q) ? `read ${shortUrl(x.q.slice(5))}` : x.q.replace(/^"|"$/g, ""), x.ok ? "" : " ✗"))));
      if (it.open) el.open = true;
      el.addEventListener("toggle", () => (it.open = el.open));
      return el;
    }
    case "mission":
      return renderMission(it);
    case "radio":
      return radioLine(it);
    case "human": {
      const b = S.botById.get(it.botId);
      const name = b?.name ?? "An agent";
      return h("div", { class: `attn${it.done ? " done" : ""}`, "data-bot": it.botId },
        h("div", {}, "⚠ ", h("b", {}, name), " hit a human check (CAPTCHA) on ", h("b", {}, it.host), ". Agents never solve these, so ", name, " is trying other pages meanwhile."),
        it.done || !runActive() ? h("div", { class: "row" }, h("span", { class: "meta" }, it.done ? "You handed the browser back." : "")) :
          h("div", { class: "row" }, h("button", { class: "btn small primary", type: "button", onclick: () => takeover(it.botId, true) }, `Solve it in ${name}'s browser`), h("button", { class: "btn small ghost", type: "button", onclick: () => focusBot(it.botId) }, "Just look")));
    }
    case "answer": {
      const head = h("div", { class: "answer-head" }, h("b", {}, it.n > 1 ? `Answer · update ${it.n}` : "Answer"), h("span", {}, clock(it.ts)), h("span", { class: "spacer" }),
        h("button", { class: "btn small ghost", type: "button", onclick: (ev) => copy(it, ev.currentTarget) }, "Copy"));
      const sources = it.sources?.length ? h("div", { class: "sources" }, "Sources", h("ol", {}, it.sources.map((s) => h("li", {}, h("a", { href: safeHref(s.url), target: "_blank", rel: "noopener noreferrer" }, s.title ? clip(s.title, 90) : shortUrl(s.url)), s.title ? h("span", { class: "meta" }, ` · ${hostOf(s.url)}`) : null)))) : null;
      return h("div", { class: "answer" }, head, h("div", { class: "md", html: md(it.answer) }), sources);
    }
    case "notice":
      return h("div", { class: `notice ${it.level}` }, it.text);
    case "ended": {
      const why = { stopped_by_user: "You ended the chat", timeout: "Time limit reached", error: "The chat couldn't continue", server_stopped: "The server stopped", answered: "Done" }[it.reason] ?? it.reason;
      return h("div", { class: "ended" }, h("b", {}, it.status === "failed" ? "Chat failed" : "Chat ended"), ` · ${why}`, it.durationMs ? ` · ${mmss(it.durationMs)}` : "", it.costUSD !== undefined ? ` · ≈ ${money(it.costUSD)}` : "",
        it.out ? h("div", { class: "meta" }, `Saved in ${it.out}`) : null);
    }
    default:
      return h("div", {});
  }
}

async function copy(it, btn) {
  const text = `${it.answer}${it.sources?.length ? `\n\nSources:\n${it.sources.map((s) => `- ${s.title ? `${s.title}: ` : ""}${s.url}`).join("\n")}` : ""}`;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "Copied";
  } catch {
    btn.textContent = "Couldn't copy";
  }
  setTimeout(() => (btn.textContent = "Copy"), 1500);
}

function renderThread() {
  const nearBottom = threadEl.scrollHeight - threadEl.scrollTop - threadEl.clientHeight < 80;
  let added = false;
  for (const it of S.thread) {
    if (!it.el) {
      it.el = renderItem(it);
      threadEl.append(it.el);
      added = true;
      dirty.items.delete(it);
    }
  }
  for (const it of dirty.items) {
    if (!it.el) continue;
    const el = renderItem(it);
    it.el.replaceWith(el);
    it.el = el;
  }
  dirty.items.clear();
  if (nearBottom || S.replaying) threadEl.scrollTop = threadEl.scrollHeight;
  else if (added) $("#jump").hidden = false;
}

threadEl.addEventListener("scroll", () => {
  if (threadEl.scrollHeight - threadEl.scrollTop - threadEl.clientHeight < 40) $("#jump").hidden = true;
});
$("#jump").addEventListener("click", () => {
  threadEl.scrollTop = threadEl.scrollHeight;
  $("#jump").hidden = true;
});
// Hover an agent anywhere in the chat: its browser lights up. Click: it takes the stage.
threadEl.addEventListener("mouseover", (ev) => setHover(ev.target.closest("[data-bot]")?.dataset.bot ?? null));
threadEl.addEventListener("mouseleave", () => setHover(null));
threadEl.addEventListener("click", (ev) => {
  if (ev.target.closest("a, button, summary")) return;
  const el = ev.target.closest(".who-chip[data-bot], .m-row[data-bot]");
  if (el && phase() === "side") focusBot(el.dataset.bot);
});

function setHover(id) {
  if (S.ui.hover === id) return;
  S.ui.hover = id;
  for (const b of S.bots) b.el?.root.classList.toggle("hl", b.id === id);
  for (const el of threadEl.querySelectorAll(".m-row[data-bot], .radio[data-bot]")) el.classList.toggle("hl", el.dataset.bot === id);
}

// ── Top bar, the Master's line, the composer ──

function runPhaseLabel() {
  const r = S.run;
  if (!r || S.view === "home") return null;
  if (r.past && r.status === "interrupted") return ["Interrupted", "done"];
  if (r.status === "starting") return ["Starting", "busy"];
  if (r.status === "ending") return ["Ending", "busy"];
  if (r.status === "ended") return ["Ended", "done"];
  if (r.status === "failed") return ["Failed", "err"];
  const n = working().length;
  if (n) return [`Working · ${n} agent${n === 1 ? "" : "s"}`, "live"];
  if (r.masterBusy) return [r.planned ? "Master thinking" : "Planning", "busy"];
  if (r.answered) return ["Answered", "ok"];
  return ["Ready", "idle"];
}

function applyLayout() {
  const app = $("#app");
  const p = phase();
  for (const c of ["home", "center", "side"]) app.classList.toggle(c, c === p);
  app.classList.toggle("chat-hidden", p === "side" && S.ui.chatHidden);
  $("#chat-rail").hidden = !(p === "side" && S.ui.chatHidden);
  // The composer lives in the middle of the home view, and at the bottom of a chat.
  const slot = p === "home" ? $("#home-slot") : $("#chat-slot");
  const form = $("#composer");
  if (form.parentElement !== slot) slot.append(form);
}

function renderTop() {
  applyLayout();
  const r = S.view === "run" ? S.run : null;
  $("#run-title").textContent = r ? clip(r.task, 140) : "";
  $("#run-title").title = r?.task ?? "";
  const p = runPhaseLabel();
  const pill = $("#run-status");
  pill.hidden = !p;
  if (p) (pill.textContent = p[0]), (pill.className = `pill ${p[1]}`);
  $("#run-timer").hidden = !r;
  $("#run-cost").hidden = !r || r.cost === undefined;
  if (r && r.cost !== undefined) {
    $("#run-cost").textContent = `≈ ${money(r.cost)}`;
    $("#run-cost").title = `Model tokens so far (estimated from each session's usage)${r.byAgent ? `\n${Object.entries(r.byAgent).map(([a, c]) => `${a}: ${money(c)}`).join("\n")}` : ""}`;
  }
  tickTimer();
  const t = $("#tunnel");
  t.className = `tunnel-dot ${S.tunnel.state}`;
  t.title = S.tunnel.state === "ready" ? `Tools online: OpenAI reaches the agents' tools through ${S.tunnel.source ?? "the tunnel"}` : S.tunnel.state === "failed" ? `Tools offline: ${S.tunnel.error ?? ""}` : "Tools starting: opening the tunnel OpenAI uses to reach the agents' tools";
  $("#tools-label").textContent = S.view === "home" ? (S.tunnel.state === "ready" ? "tools online" : S.tunnel.state === "failed" ? "tools offline" : "tools starting…") : "";
  $("#end-chat").hidden = !runActive() || S.view !== "run";
  $("#master-mark").classList.toggle("busy", Boolean(r?.masterBusy));
  const o = r?.options;
  $("#master-sub").textContent = o ? `${o.masterModel} · leads ${o.bots} agent${o.bots === 1 ? "" : "s"} on ${o.botModel}` : "Your one line to the squad";
  $("#unread").hidden = !S.ui.unread;
  $("#unread").textContent = String(S.ui.unread);
  renderActivity();
  renderComposer();
  renderCounts();
}

function tickTimer() {
  const r = S.run;
  if (!r || S.view !== "run") return;
  $("#run-timer").textContent = mmss((r.endedAt ?? Date.now()) - r.startedAt);
}
setInterval(tickTimer, 1000);

function renderActivity() {
  const el = $("#activity");
  const r = S.view === "run" ? S.run : null;
  el.replaceChildren();
  if (!r || !runActive()) return;
  const busyBots = working();
  const ready = () => h("span", { class: "ready-dots", title: `${S.bots.filter((b) => b.warm).length} of ${S.bots.length} agents ready` }, S.bots.map((b) => h("i", { class: b.warm ? "warm" : "", style: colorVars(b.color) })));
  if (r.status === "starting") return void el.append(h("span", { class: "spinner" }), h("span", { class: "now dots" }, r.step ?? "Starting"));
  if (r.masterBusy) {
    el.append(h("span", { class: "spinner", "aria-hidden": "true" }), h("span", { class: "now dots" }, `Master: ${r.masterDoing ?? "Thinking"}`));
    if (busyBots.length) el.append(h("span", { class: "sub" }, `· ${busyBots.map((b) => b.name).join(", ")} working`));
    else if (!r.planned && S.bots.length) el.append(h("span", { class: "sub" }, "·"), ready());
    return;
  }
  if (busyBots.length) return void el.append(h("span", { class: "now" }, "Master is watching the team"), h("span", { class: "sub" }, `· waiting for ${busyBots.map((b) => b.name).join(", ")}`));
  el.append(h("span", { class: "sub" }, r.answered ? "Ask a follow-up, or end the chat when you're done." : "The Master is idle."));
}

function renderComposer() {
  const p = phase();
  const active = runActive() && S.view === "run";
  const closed = S.view === "run" && !active;
  const input = $("#input");
  input.placeholder = p === "home" ? "Describe a task for the squad" : "Message the Master";
  $("#composer").hidden = closed;
  const bar = $("#closed-bar");
  bar.hidden = !closed;
  if (closed) {
    const r = S.run;
    const ended = r.status === "ending" ? "This chat is ending…" : r.status === "interrupted" ? "This chat was interrupted (the server stopped)." : "This chat has ended. You can read it here or start a new one.";
    bar.replaceChildren(h("span", {}, ended), h("button", { class: "btn small primary", type: "button", onclick: () => newChat() }, "+ New chat"));
  }
  $("#send").disabled = sending || !input.value.trim();
}

function renderCounts() {
  const el = $("#counts");
  el.replaceChildren();
  if (phase() !== "side") return;
  const c = { working: 0, finished: 0, standby: 0, failed: 0 };
  for (const b of S.bots) {
    if (b.status === "working" || b.status === "starting") c.working++;
    else if (b.status === "finished") c.finished++;
    else if (b.status === "failed") c.failed++;
    else if (!b.assignments) c.standby++;
  }
  el.append(...[[c.working, "working"], [c.finished, "done"], [c.failed, "failed"], [c.standby, "standing by"]].filter(([n]) => n).map(([n, label]) => h("span", {}, h("b", {}, n), ` ${label}`)));
  $("#wall-hint").textContent = S.ui.focus ? "1–5 switch agents" : "Click a browser to focus it";
}

// ── The bar's controls: agents, effort, more options ──

let settings = { bots: 5, botEffort: "medium", ...store.get("squadlings.settings", {}) };
let sending = false;

function fillOptions(config) {
  const d = { ...config.defaults, ...settings };
  const sel = (id, list, value) => {
    const el = $(id);
    el.replaceChildren(...list.map((m) => h("option", { value: m }, m)));
    el.value = list.includes(value) ? value : list[0];
  };
  sel("#o-masterModel", config.models.master, d.masterModel);
  sel("#o-botModel", config.models.bot, d.botModel);
  $("#o-maxActions").value = d.maxActions;
  $("#o-timeoutMin").value = d.timeoutMin;
  $("#o-masterEffort").value = d.masterEffort ?? "";
  $("#o-allow").value = Array.isArray(d.allow) ? d.allow.join(", ") : d.allow ?? "";
  $("#o-webSearch").checked = d.webSearch !== false;
  $("#o-allowDirect").checked = Boolean(d.allowDirect);
  $("#o-fresh").checked = Boolean(d.fresh);
  $("#o-bots").value = settings.bots ?? 5;
  $("#o-effort").value = Math.max(0, EFFORTS.findIndex((x) => x.v === (settings.botEffort ?? "medium")));
  renderControls();
}

function readOptions() {
  return {
    bots: Number($("#o-bots").value),
    botEffort: EFFORTS[Number($("#o-effort").value)]?.v ?? "medium",
    masterModel: $("#o-masterModel").value,
    botModel: $("#o-botModel").value,
    maxActions: Number($("#o-maxActions").value),
    timeoutMin: Number($("#o-timeoutMin").value),
    masterEffort: $("#o-masterEffort").value || undefined,
    allow: $("#o-allow").value,
    webSearch: $("#o-webSearch").checked,
    allowDirect: $("#o-allowDirect").checked,
    fresh: $("#o-fresh").checked,
  };
}

function saveOptions() {
  settings = readOptions();
  store.set("squadlings.settings", settings);
  renderControls();
}

function renderControls() {
  const cast = S.config?.cast ?? [];
  const n = Number($("#o-bots").value) || 5;
  const e = EFFORTS[Number($("#o-effort").value)] ?? EFFORTS[2];
  $("#agent-dots").replaceChildren(...cast.map((c, i) => h("i", { class: i < n ? "" : "off", style: colorVars(c.color) })));
  $("#agents-val").textContent = `${n} agent${n === 1 ? "" : "s"}`;
  $("#agents-pop-val").textContent = `${n} agent${n === 1 ? "" : "s"}`;
  $("#agent-avatars").replaceChildren(...cast.map((c, i) => h("span", { class: i < n ? "" : "off", style: colorVars(c.color) }, h("i", {}), c.name)));
  $("#effort-val").textContent = e.label;
  $("#effort-pop-val").textContent = `Effort · ${e.label}`;
  $("#effort-desc").textContent = e.desc;
  // The gauge's needle sweeps the arc from left (fast) to right (careful).
  const theta = Math.PI * (1 - EFFORTS.indexOf(e) / (EFFORTS.length - 1));
  $("#effort-needle").setAttribute("d", `M12 16l${(Math.cos(theta) * 5.5).toFixed(2)} ${(-Math.sin(theta) * 5.5).toFixed(2)}`);
  for (const r of [$("#o-bots"), $("#o-effort")]) r.style.setProperty("--fill", `${((Number(r.value) - Number(r.min)) / (Number(r.max) - Number(r.min))) * 100}%`);
}

for (const el of document.querySelectorAll("#composer select, #composer input")) {
  el.addEventListener("input", () => (el.type === "range" ? renderControls() : null));
  el.addEventListener("change", saveOptions);
}

function openPop(name) {
  S.ui.pop = S.ui.pop === name ? null : name;
  for (const [n, pop, btn] of [["agents", "#agents-pop", "#agents-chip"], ["effort", "#effort-pop", "#effort-chip"], ["opts", "#opts", "#opts-btn"]]) {
    $(pop).hidden = S.ui.pop !== n;
    $(btn).setAttribute("aria-expanded", String(S.ui.pop === n));
  }
}
$("#agents-chip").addEventListener("click", () => openPop("agents"));
$("#effort-chip").addEventListener("click", () => openPop("effort"));
$("#opts-btn").addEventListener("click", () => openPop("opts"));
document.addEventListener("mousedown", (ev) => {
  if (S.ui.pop && !ev.target.closest(".pop, #agents-chip, #effort-chip, #opts-btn")) openPop(null);
  if (!$("#history").hidden && !ev.target.closest("#history, #rail-chats")) toggleHistory(false);
});

// ── Chats: new, history, open a closed one ──

function toggleHistory(open = $("#history").hidden) {
  $("#history").hidden = !open;
  $("#rail-chats").setAttribute("aria-expanded", String(open));
  if (open) void loadHistory();
}
$("#rail-chats").addEventListener("click", () => toggleHistory());
$("#history-close").addEventListener("click", () => toggleHistory(false));
$("#rail-new").addEventListener("click", () => newChat());
$("#history-new").addEventListener("click", () => newChat());
$("#rail-home").addEventListener("click", () => goHome());

async function loadHistory() {
  try {
    const res = await fetch("/api/runs");
    S.history = (await res.json()).runs ?? [];
  } catch {
    return;
  }
  renderHistory();
}

function renderHistory() {
  const list = $("#history-list");
  if (!S.history.length) return void list.replaceChildren(h("div", { class: "h-empty" }, "No chats yet."));
  const day = (ts) => {
    const d = new Date(ts);
    const today = new Date();
    const y = new Date(Date.now() - 864e5);
    return d.toDateString() === today.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString([], { month: "short", day: "numeric" });
  };
  const out = [];
  let group = "";
  for (const r of S.history) {
    const g = r.live ? "Now" : day(r.startedAt);
    if (g !== group) out.push(h("div", { class: "h-group" }, (group = g)));
    const state = r.live ? "live" : r.status === "failed" ? "failed" : r.answers ? "answered" : "";
    const meta = r.live ? "Live now · click to return" : [clock(r.startedAt), r.bots ? `${r.bots} agent${r.bots === 1 ? "" : "s"}` : "", r.answers ? "answered" : r.status === "interrupted" ? "interrupted" : "no answer", r.costUSD !== null ? `≈ ${money(r.costUSD)}` : ""].filter(Boolean).join(" · ");
    out.push(h("button", { class: `h-item ${state}${S.view === "run" && S.run?.id === r.id ? " current" : ""}`, type: "button", title: r.task, onclick: () => openChat(r.id) },
      h("span", { class: "st" }), h("span", { class: "t" }, clip(r.task, 80)), h("span", { class: "m" }, meta)));
  }
  list.replaceChildren(...out);
}

/** Opens a chat: the live one, or a closed one (read-only, with each agent's last screen). */
async function openChat(id) {
  toggleHistory(false);
  if (S.run?.id === id) {
    S.view = "run";
    touchLayout();
    return;
  }
  let data;
  try {
    const res = await fetch(`/api/runs/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    return showHint(`Couldn't open that chat: ${err.message}`, true);
  }
  loadRun(data.run, data.events, id !== S.liveId);
}

/** Rebuilds the screen from a run's events (the same reducer as live). */
function loadRun(info, events, past) {
  clearBots();
  S.view = "run";
  S.ui.unread = 0;
  S.run = { ...info, past, cost: undefined, masterBusy: false, planned: false, answered: false, replyDue: false, missions: [] };
  S.thread = [];
  threadEl.replaceChildren();
  S.replaying = true;
  for (const e of events) apply(e);
  S.replaying = false;
  S.run.status = info.status; // the server's word is final (an event may still be in flight)
  if (past) S.run.masterBusy = false;
  renderAll();
  if (past) for (const b of S.bots) void paintKeyframe(b);
  else for (const buf of liveFrames.values()) void drawFrame(buf);
}

/** A closed chat's tile shows the last screen its agent saved. */
async function paintKeyframe(b) {
  try {
    const res = await fetch(`/api/runs/${encodeURIComponent(S.run.id)}/frames/${b.name.toLowerCase()}.jpg`);
    if (!res.ok || !b.el) return;
    const bmp = await createImageBitmap(await res.blob());
    const c = b.el.canvas;
    (c.width = bmp.width), (c.height = bmp.height);
    c.getContext("2d").drawImage(bmp, 0, 0);
    bmp.close();
    b.live = true;
    touchBot(b);
  } catch {
    // no keyframe: the tile shows its placeholder
  }
}

function goHome() {
  toggleHistory(false);
  openPop(null);
  S.view = "home";
  S.ui.focus = null;
  if (S.run && S.run.id !== S.liveId) {
    // A closed chat leaves the screen; the live one keeps running in the background.
    clearBots();
    S.run = null;
    S.thread = [];
    threadEl.replaceChildren();
  }
  touchLayout();
  setTimeout(() => $("#input").focus(), 50);
}

async function newChat() {
  if (runActive() && S.view === "run") {
    if (!confirm("End this chat and start a new one? The agents stop and their browsers close. This chat stays under Chats.")) return;
    try {
      await post(`/api/runs/${S.run.id}/stop`);
    } catch (err) {
      return showHint(err.message, true);
    }
  }
  goHome();
}

function clearBots() {
  for (const b of S.bots) {
    b.el?.root.remove();
    clearTimeout(b.bubbleTimer);
  }
  S.bots = [];
  S.botById = new Map();
  S.ui.focus = null;
  S.ui.control = null;
}

// ── Sending ──

async function post(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error ?? `HTTP ${res.status}`), { status: res.status });
  return json;
}

let hintTimer = 0;
function showHint(text, isError) {
  const el = $("#hint");
  el.textContent = text ?? "";
  el.className = isError ? "err" : "";
  clearTimeout(hintTimer);
  if (text) hintTimer = setTimeout(() => (el.textContent = ""), isError ? 12000 : 6000);
}

/** Starts a run; if another chat is still live, offers to end it first. */
async function startRun(task) {
  if (S.liveId) {
    if (!confirm("A chat is still running. End it and start this one?")) return false;
    await post(`/api/runs/${S.liveId}/stop`).catch(() => {});
  }
  S.starting = true;
  for (let i = 0; ; i++) {
    try {
      await post("/api/runs", { task, options: readOptions() });
      return true;
    } catch (err) {
      if (err.status !== 409 || i > 40) {
        S.starting = false;
        throw err;
      }
      await new Promise((r) => setTimeout(r, 600)); // the old chat is still closing
    }
  }
}

$("#composer").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const input = $("#input");
  const text = input.value.trim();
  if (!text || sending) return;
  sending = true;
  openPop(null);
  renderComposer();
  showHint("");
  try {
    if (S.view === "run" && runActive()) {
      await post(`/api/runs/${S.run.id}/messages`, { text });
      if (S.run.masterBusy) showHint("The Master is busy; it gets this with its next step.");
      input.value = "";
    } else {
      saveOptions();
      if (await startRun(text)) input.value = "";
    }
    autoGrow();
  } catch (err) {
    showHint(err.message, true);
  } finally {
    sending = false;
    renderComposer();
  }
});

/** Fits the box to its text. Measured only at a real width: typing while the chat slides in once grew it to its maximum. */
const autoGrow = () => {
  const input = $("#input");
  $("#send").disabled = sending || !input.value.trim();
  input.style.height = "";
  if (!input.value || input.clientWidth < 120) return;
  input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
};
$("#chat").addEventListener("transitionend", (ev) => ev.target === $("#chat") && autoGrow());
window.addEventListener("resize", autoGrow);
$("#input").addEventListener("input", autoGrow);
$("#input").addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault();
    $("#composer").requestSubmit();
  }
});

$("#end-chat").addEventListener("click", async () => {
  if (!S.run || !confirm("End this chat? The agents stop and their browsers close. You can reopen it from Chats to read it.")) return;
  try {
    await post(`/api/runs/${S.run.id}/stop`);
  } catch (err) {
    showHint(err.message, true);
  }
});

$("#hide-chat").addEventListener("click", () => {
  S.ui.chatHidden = true;
  touchLayout();
});
$("#chat-rail").addEventListener("click", () => {
  S.ui.chatHidden = false;
  S.ui.unread = 0;
  touchLayout();
});

// ── The wall: tiles ──

const POINTER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2.5 20 11l-7.2 1.9L9.6 20z" fill="var(--c)" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';

function makeTile(b) {
  const canvas = h("canvas", { width: 1280, height: 800, "aria-label": `${b.name}'s browser` });
  const cursor = h("div", { class: "cursor", html: POINTER });
  const tag = h("span", { class: "tag" });
  cursor.append(tag);
  const tbox = h("div", { class: "tbox" });
  const overlay = h("div", { class: "overlay" }, tbox, cursor);
  const els = {
    canvas, cursor, tag, tbox, overlay,
    name: h("b", { class: "name" }, b.name),
    role: h("span", { class: "role" }),
    state: h("span", { class: "state" }),
    actions: h("span", { class: "tile-actions" }),
    host: h("span", { class: "host mono" }),
    caption: h("span", { class: "caption" }),
    nosignal: h("div", { class: "nosignal" }, h("div", {}, h("div", { class: "av" }), h("span", {}, "Connecting to the browser…"))),
    bubble: h("div", { class: "bubble" }),
    badge: h("div", { class: "badge" }),
    needsText: h("span", {}),
  };
  els.needs = h("div", { class: "needs" }, "⚠", els.needsText, h("button", { class: "btn small", type: "button", onclick: (ev) => (ev.stopPropagation(), takeover(b.id, true)) }, "Take over"));
  const control = h("div", { class: "control-bar" }, h("span", {}, `You're in control · ${b.name} is paused. Click and type in the page.`), h("button", { class: "btn small", type: "button", onclick: (ev) => (ev.stopPropagation(), takeover(b.id, false)) }, "Hand back"));
  const screen = h("div", { class: "screen" }, canvas, els.nosignal, overlay, els.badge, els.needs, els.bubble, control);
  screen.addEventListener("click", () => {
    if (S.ui.focus !== b.id) focusBot(b.id);
  });
  const root = h("div", { class: "tile", style: colorVars(b.color), "data-bot": b.id, tabindex: "-1" },
    h("div", { class: "tile-head" }, h("span", { class: "dot" }), els.name, els.role, h("span", { class: "spacer" }), els.actions, els.state),
    screen,
    h("div", { class: "tile-foot" }, els.host, els.caption));
  root.addEventListener("animationend", (ev) => {
    if (ev.animationName === "glow") root.classList.remove("pulse");
    if (ev.animationName === "spawn") root.classList.remove("spawn");
  });
  root.addEventListener("mouseenter", () => setHover(b.id));
  root.addEventListener("mouseleave", () => setHover(null));
  attachInput(b, overlay, canvas);
  b.el = { root, screen, ...els };
  const early = pendingFrames.get(b.index);
  if (early && !S.run?.past) {
    pendingFrames.delete(b.index);
    queueMicrotask(() => drawFrame(early));
  }
  return b.el;
}

function stateText(b) {
  if (b.control) return "You're in control";
  switch (b.status) {
    case "idle": return b.assignments ? "Idle" : "Standing by";
    case "starting": return "Starting";
    case "working": return `Working · ${b.actions}/${b.maxActions}`;
    case "finished": return `Done · ${b.actions} action${b.actions === 1 ? "" : "s"}`;
    case "failed": return "Failed";
    case "stopped": return "Stopped";
    default: return b.status;
  }
}

function renderTile(b) {
  const e = b.el ?? makeTile(b);
  e.root.dataset.status = b.status;
  e.role.textContent = b.label ? `· ${b.label}` : "";
  e.role.title = b.goal || "";
  e.state.textContent = stateText(b);
  e.root.classList.toggle("live", b.live);
  e.root.classList.toggle("control", b.control);
  e.root.classList.toggle("human", Boolean(b.human) && !b.control && runActive());
  e.overlay.classList.toggle("capture", b.control && S.ui.focus === b.id);
  e.host.textContent = hostOf(b.url);
  e.host.title = b.title ? `${b.title}\n${b.url}` : b.url;
  let caption = "";
  if (b.status === "working" || b.status === "starting") caption = b.caption || (b.status === "starting" ? "Reading the assignment" : "");
  else if (b.status === "finished") caption = b.result ? clip(b.result.summary, 160) : "Done";
  else if (b.status === "failed" || b.status === "stopped") caption = b.reason ?? "";
  e.caption.textContent = caption;
  e.caption.title = caption;
  e.badge.textContent = b.status === "finished" ? "✓ Done" : b.status === "failed" ? "✗ Failed" : b.status === "stopped" ? "■ Stopped" : "";
  e.needsText.textContent = b.human ? `Human check on ${b.human.host}. You can solve it.` : "";
  const canTake = runActive() && !b.control && S.ui.focus === b.id;
  e.actions.replaceChildren(...(canTake ? [h("button", { class: "btn small ghost", type: "button", title: "Use this browser yourself, e.g. to solve a human check or sign in. The agent waits.", onclick: (ev) => (ev.stopPropagation(), takeover(b.id, true)) }, "Take over")] : []));
}

// ── The wall: layout ──

/** Agents on the wall: the ones with work (the others wait on the bench). */
function shownBots() {
  return S.bots.filter((b) => b.assignments > 0 || b.status === "working" || b.status === "starting" || b.control || b.id === S.ui.focus);
}

const CHROME = 32 + 28 + 2; // tile header + footer + borders
/** The biggest 16:10 tiles that fit n of them in w × h. */
function fit(n, w, h, gap = 12) {
  let best = { cols: 1, width: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const byWidth = (w - (cols - 1) * gap) / cols;
    const byHeight = ((h - (rows - 1) * gap) / rows - CHROME) * 1.6;
    const width = Math.floor(Math.min(byWidth, byHeight));
    if (width > best.width) best = { cols, width };
  }
  return best;
}

function layout() {
  applyLayout();
  const area = $("#area");
  const side = phase() === "side";
  for (const b of S.bots) if (!b.el) makeTile(b);
  if (!side) {
    for (const b of S.bots) b.el.root.remove();
    area.classList.remove("staged");
    $("#to-grid").hidden = true;
    $("#bench").replaceChildren();
    return;
  }
  const W = area.clientWidth - 28;
  const H = area.clientHeight - 28;
  const shown = shownBots();
  const focus = S.ui.focus ? S.botById.get(S.ui.focus) : null;
  if (S.ui.focus && !focus) S.ui.focus = null;
  area.classList.toggle("staged", Boolean(focus));
  $("#to-grid").hidden = !focus;
  // Agents joining the wall spawn in, one after another.
  let n = 0;
  for (const b of shown) if (!b.spawned) (b.spawned = true), b.el.root.classList.add("spawn"), b.el.root.style.setProperty("--i", String(n++));
  if (focus) {
    const others = shown.filter((b) => b !== focus);
    const stripW = others.length ? Math.round(Math.min(280, Math.max(170, W * 0.2))) : 0;
    const mainW = W - (others.length ? stripW + 12 : 0);
    const width = Math.floor(Math.max(300, Math.min(mainW, (H - 180 - 10 - CHROME) * 1.6)));
    place([focus], $("#stage-slot"), width, false, true);
    $("#strip").style.width = `${stripW}px`;
    place(others, $("#strip"), stripW, true, false);
    $("#grid").replaceChildren();
    renderDetail(focus);
  } else {
    const { width } = fit(Math.max(shown.length, 1), W, H);
    place(shown, $("#grid"), width, width < 380, false);
    $("#stage-slot").replaceChildren();
    $("#strip").replaceChildren();
  }
  for (const b of S.bots) if (!shown.includes(b) && b !== focus) b.el.root.remove();
  renderBench(shown);
  renderCounts();
}

/** Puts tiles in `parent` in this order, moving only the ones out of place (a moved element restarts its animations). */
function place(bots, parent, width, small, staged) {
  bots.forEach((b, i) => {
    const root = b.el.root;
    if (parent.children[i] !== root) parent.insertBefore(root, parent.children[i] ?? null);
    root.style.width = `${width}px`;
    root.classList.toggle("small", small);
    root.classList.toggle("staged", staged);
    renderTile(b);
  });
  for (const el of [...parent.children].slice(bots.length)) el.remove();
}

function renderBench(shown) {
  const bench = S.bots.filter((b) => !shown.includes(b));
  const el = $("#bench");
  el.replaceChildren();
  if (!bench.length) return;
  el.append(h("span", {}, "Standing by:"), ...bench.map((b) => h("span", { class: "bench-chip", style: colorVars(b.color), title: `Show ${b.name}'s browser`, onclick: () => focusBot(b.id) }, h("span", { class: "dot" }), b.name)));
}

function renderDetail(b) {
  const d = $("#detail");
  const goal = h("div", { class: "card" },
    h("h3", {}, b.label ? `${b.name} · ${b.label}` : `${b.name}'s assignment`),
    b.goal ? h("div", { class: "goal" }, b.goal) : h("div", { class: "goal meta" }, "No assignment yet."),
    b.startUrl ? h("div", { class: "start" }, "Start: ", h("a", { href: safeHref(b.startUrl), target: "_blank", rel: "noopener noreferrer" }, shortUrl(b.startUrl))) : null,
    b.result ? [h("h3", { style: { "margin-top": "12px" } }, "Result"), h("div", { class: "result-text" }, b.result.summary),
      b.result.sources?.length ? h("ol", { class: "result-src" }, b.result.sources.map((s) => h("li", {}, h("a", { href: safeHref(s.url), target: "_blank", rel: "noopener noreferrer" }, s.title ? clip(s.title, 80) : shortUrl(s.url))))) : null] : null);
  const list = h("ol", { class: "steps" }, b.steps.slice(-120).map((s) => h("li", { class: s.kind === "bad" ? "bad" : s.kind === "msg" ? "msg" : s.kind === "assign" ? "assign" : "" },
    h("span", {}, s.kind === "bad" ? "✗" : s.kind === "search" ? "⌕" : s.kind === "msg" ? "✉" : s.kind === "assign" ? "◆" : s.kind === "done" ? "✔" : "✓"),
    h("span", {}, s.text),
    h("span", { class: "t" }, s.ms ? `${(s.ms / 1000).toFixed(1)}s` : ""))));
  const steps = h("div", { class: "card", style: colorVars(b.color) }, h("h3", {}, `Steps · ${b.actions}/${b.maxActions} actions`), b.steps.length ? list : h("div", { class: "meta" }, "Nothing yet."));
  d.replaceChildren(goal, steps);
  steps.scrollTop = steps.scrollHeight;
}

function focusBot(id) {
  if (id && !S.botById.has(id)) return;
  if (!id && S.ui.control) return; // hand the browser back first
  S.ui.focus = id;
  touchLayout();
  if (id) S.botById.get(id)?.el?.root.focus({ preventScroll: true });
}
$("#to-grid").addEventListener("click", () => focusBot(null));

new ResizeObserver(() => touchLayout()).observe($("#area"));

// ── Frames (binary, master.md §18.3) ──

async function drawFrame(buf) {
  const v = new DataView(buf);
  if (v.getUint8(0) !== 1) return;
  const index = v.getUint8(1);
  if (!S.run || S.run.past || S.run.id !== S.liveId) return;
  const b = S.bots.find((x) => x.index === index);
  if (!b?.el) return void pendingFrames.set(index, buf);
  if (b.decoding) return void (b.nextFrame = buf);
  b.decoding = true;
  try {
    const bmp = await createImageBitmap(new Blob([new Uint8Array(buf, 10)], { type: "image/jpeg" }));
    const c = b.el.canvas;
    if (c.width !== bmp.width || c.height !== bmp.height) (c.width = bmp.width), (c.height = bmp.height);
    c.getContext("2d").drawImage(bmp, 0, 0);
    bmp.close();
    b.vw = v.getUint16(2) || b.vw;
    b.vh = v.getUint16(4) || b.vh;
    if (!b.live) (b.live = true), touchBot(b);
  } catch {
    // a broken frame: the next one replaces it
  }
  b.decoding = false;
  if (b.nextFrame) {
    const next = b.nextFrame;
    b.nextFrame = null;
    void drawFrame(next);
  }
}

// ── Cursor, bubbles, pulses ──

function cursorEvent(b, d) {
  b.cursor = { ...d, at: Date.now() };
  if (S.replaying || !b.el) return;
  showCursor(b, true);
}

function showCursor(b, animate) {
  const d = b.cursor;
  const e = b.el;
  if (!d || !e) return;
  if (!animate && b.status !== "working" && b.status !== "starting" && !b.control) return; // a finished agent's last cursor isn't news
  clearTimeout(b.hideTimer);
  const pct = (v, total) => `${(v / total) * 100}%`;
  const ms = animate && d.kind === "move" ? d.glideMs ?? 0 : 0;
  e.cursor.style.transitionDuration = `${ms}ms`;
  e.cursor.style.left = pct(d.x, b.vw);
  e.cursor.style.top = pct(d.y, b.vh);
  e.cursor.classList.add("on");
  e.cursor.classList.toggle("think", d.kind === "think");
  e.tag.textContent = d.kind === "think" ? "thinking" : clip(d.why, 60);
  if (d.box && d.kind !== "think") {
    e.tbox.style.setProperty("--glide", `${ms}ms`);
    Object.assign(e.tbox.style, { left: pct(d.box.x, b.vw), top: pct(d.box.y, b.vh), width: pct(d.box.width, b.vw), height: pct(d.box.height, b.vh) });
    e.tbox.classList.add("on");
  } else if (d.kind === "think") e.tbox.classList.remove("on");
  if (d.kind === "click" && animate) {
    e.cursor.classList.remove("press");
    void e.cursor.offsetWidth;
    e.cursor.classList.add("press");
    const r = h("div", { class: "ripple", style: { left: pct(d.x, b.vw), top: pct(d.y, b.vh) } });
    e.overlay.append(r);
    setTimeout(() => r.remove(), 600);
  }
}

function hideCursorSoon(b) {
  if (S.replaying || !b.el) return;
  clearTimeout(b.hideTimer);
  if (b.status === "finished") b.el.tag.textContent = "done";
  b.el.cursor.classList.remove("think");
  b.hideTimer = setTimeout(() => {
    b.el?.cursor.classList.remove("on");
    b.el?.tbox.classList.remove("on");
  }, 1500);
}

function bubble(b, route, text) {
  if (S.replaying || !b.el) return;
  const el = b.el.bubble;
  el.replaceChildren(h("b", {}, route), " ", clip(text, 200));
  el.classList.add("on");
  clearTimeout(b.bubbleTimer);
  b.bubbleTimer = setTimeout(() => el.classList.remove("on"), 7000);
}

function pulse(b) {
  if (S.replaying || !b.el) return;
  b.el.root.classList.remove("pulse");
  void b.el.root.offsetWidth;
  b.el.root.classList.add("pulse");
}

/** A tab in the background shows that something needs you, or that the answer is in. */
let attentionFlag = "";
function attention(kind) {
  if (S.replaying || !document.hidden) return;
  attentionFlag = kind;
  document.title = kind === "needs" ? "(!) An agent needs you · SquadLings" : "✓ Answer ready · SquadLings";
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && attentionFlag) (attentionFlag = ""), (document.title = "SquadLings");
});

// ── Takeover: your mouse and keys go to that agent's browser (never logged, never shown to a model) ──

async function takeover(botId, on) {
  if (!S.run) return;
  if (on) focusBot(botId);
  try {
    await post(`/api/runs/${S.run.id}/bots/${botId}/takeover`, { action: on ? "start" : "end" });
  } catch (err) {
    showHint(err.message, true);
  }
}

function attachInput(b, overlay, canvas) {
  const at = (ev) => {
    const r = canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
  };
  const live = () => b.control && S.ui.focus === b.id;
  let lastMove = 0;
  const button = (n) => (n === 1 ? "middle" : n === 2 ? "right" : "left");
  overlay.addEventListener("mousedown", (ev) => {
    if (!live()) return;
    ev.preventDefault();
    b.el.root.focus({ preventScroll: true });
    send(b, { kind: "down", ...at(ev), button: button(ev.button), clickCount: ev.detail || 1 });
  });
  overlay.addEventListener("mouseup", (ev) => live() && (ev.preventDefault(), send(b, { kind: "up", ...at(ev), button: button(ev.button), clickCount: ev.detail || 1 })));
  overlay.addEventListener("mousemove", (ev) => {
    if (!live() || performance.now() - lastMove < 33) return; // ≤ 30 moves a second (§14.7)
    lastMove = performance.now();
    send(b, { kind: "move", ...at(ev) });
  });
  overlay.addEventListener("wheel", (ev) => {
    if (!live()) return;
    ev.preventDefault();
    send(b, { kind: "wheel", ...at(ev), dx: ev.deltaX, dy: ev.deltaY });
  }, { passive: false });
  overlay.addEventListener("contextmenu", (ev) => live() && ev.preventDefault());
}

const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn"]);
document.addEventListener("keydown", (ev) => {
  const typing = ev.target.closest?.("input, textarea, select, [contenteditable]");
  const ctl = S.ui.control && S.botById.get(S.ui.control);
  if (ctl && !typing) {
    if (MODIFIERS.has(ev.key) || ev.isComposing) return;
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.key.toLowerCase() === "v") return; // the paste event sends the text
    ev.preventDefault();
    return void send(ctl, { kind: "key", key: ev.key, ctrl: ev.ctrlKey, meta: ev.metaKey, alt: ev.altKey, shift: ev.shiftKey });
  }
  if (ev.key === "Escape") {
    if (S.ui.pop) return void openPop(null);
    if (!$("#history").hidden) return void toggleHistory(false);
  }
  if (typing) return;
  if (ev.key === "Escape" && S.ui.focus) return void focusBot(null);
  if (ev.key === "/") return void (ev.preventDefault(), $("#input").focus());
  if (/^[1-5]$/.test(ev.key) && !ev.metaKey && !ev.ctrlKey && !ev.altKey && phase() === "side") {
    const b = S.bots.find((x) => x.index === Number(ev.key));
    if (b && shownBots().includes(b)) focusBot(S.ui.focus === b.id ? null : b.id);
  }
});
document.addEventListener("paste", (ev) => {
  const ctl = S.ui.control && S.botById.get(S.ui.control);
  if (!ctl || ev.target.closest?.("input, textarea")) return;
  const text = ev.clipboardData?.getData("text") ?? "";
  if (text) (ev.preventDefault(), send(ctl, { kind: "text", text }));
});

function send(b, event) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", botId: b.id, event }));
}

// ── Splitter ──

{
  const sp = $("#splitter");
  const setW = (w) => document.documentElement.style.setProperty("--chat-w", `${Math.round(Math.max(320, Math.min(w - 52, window.innerWidth * 0.55)))}px`);
  const saved = store.get("squadlings.chatWidth", null);
  if (saved) document.documentElement.style.setProperty("--chat-w", `${saved}px`);
  sp.addEventListener("pointerdown", (ev) => {
    sp.setPointerCapture(ev.pointerId);
    sp.classList.add("drag");
    $("#app").classList.add("dragging");
  });
  sp.addEventListener("pointermove", (ev) => sp.classList.contains("drag") && setW(ev.clientX));
  sp.addEventListener("pointerup", (ev) => {
    sp.classList.remove("drag");
    $("#app").classList.remove("dragging");
    sp.releasePointerCapture(ev.pointerId);
    store.set("squadlings.chatWidth", parseInt(getComputedStyle(document.documentElement).getPropertyValue("--chat-w")));
  });
  sp.addEventListener("keydown", (ev) => {
    const w = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--chat-w"));
    if (ev.key === "ArrowLeft") document.documentElement.style.setProperty("--chat-w", `${Math.max(320, w - 30)}px`);
    if (ev.key === "ArrowRight") document.documentElement.style.setProperty("--chat-w", `${w + 30}px`);
  });
}

// ── Flush: redraw what changed ──

function flush() {
  raf = 0;
  if (dirty.layout) {
    dirty.layout = false;
    layout();
  }
  for (const b of dirty.bots) {
    if (!S.bots.includes(b)) continue;
    if (b.el?.root.isConnected) renderTile(b);
    // A team card row changes only when what it shows changes (not on every caption).
    const m = b.missionId && S.thread.find((it) => it.id === b.missionId);
    const sig = rowSig(b);
    if (m && sig !== b.rowSig) (b.rowSig = sig), dirty.items.add(m);
  }
  if (S.ui.focus && dirty.bots.has(S.botById.get(S.ui.focus))) renderDetail(S.botById.get(S.ui.focus));
  dirty.bots.clear();
  if (dirty.items.size || S.thread.some((it) => !it.el)) renderThread();
  if (dirty.top) {
    dirty.top = false;
    renderTop();
  }
}

function renderAll() {
  for (const it of S.thread) it.el = null;
  threadEl.replaceChildren();
  for (const b of S.bots) (b.rowSig = rowSig(b)), dirty.bots.add(b);
  dirty.layout = true;
  dirty.top = true;
  flush();
  for (const b of S.bots) if (b.cursor) showCursor(b, false);
}

// ── Connection ──

let ws = null;
let retry = 0;
let firstSnapshot = true;

function connect() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.binaryType = "arraybuffer";
  ws.onopen = () => {
    retry = 0;
    $("#banner").hidden = true;
  };
  ws.onmessage = (m) => {
    if (m.data instanceof ArrayBuffer) {
      const index = new DataView(m.data).getUint8(1);
      liveFrames.set(index, m.data);
      return void drawFrame(m.data);
    }
    let msg;
    try {
      msg = JSON.parse(m.data);
    } catch {
      return;
    }
    if (msg.type === "hello") {
      const first = !S.config;
      S.config = msg.config;
      S.tunnel = msg.config.tunnel ?? S.tunnel;
      if (first) fillOptions(msg.config);
      touchTop();
    } else if (msg.type === "tunnel") {
      S.tunnel = msg.tunnel;
      touchTop();
    } else if (msg.type === "snapshot") onSnapshot(msg);
    else if (msg.type === "event") apply(msg.event);
  };
  ws.onclose = () => {
    const b = $("#banner");
    b.textContent = "Lost the connection to the SquadLings server. Reconnecting…";
    b.hidden = false;
    setTimeout(connect, Math.min(5000, 400 * 2 ** retry++));
  };
}

/** The server's current run: open it if it's live and this tab is free for it (or asked for it). */
function onSnapshot(msg) {
  const run = msg.run;
  const live = Boolean(run && ["starting", "running", "ending"].includes(run.status));
  const was = S.liveId;
  S.liveId = live ? run.id : null;
  if (S.liveId !== was) liveFrames.clear(), pendingFrames.clear();
  if (live && (S.starting || firstSnapshot || S.run?.id === run.id || (S.view === "home" && (!S.run || S.run.id !== run.id)))) {
    // A reconnect while you're on the home screen refreshes the live chat in the background.
    const stayHome = S.view === "home" && !S.starting && !firstSnapshot && S.run?.id === run.id;
    S.starting = false;
    loadRun({ id: run.id, task: run.task, status: run.status, startedAt: run.startedAt, endedAt: run.endedAt, out: run.out }, msg.events, false);
    if (stayHome) (S.view = "home"), touchLayout();
  } else touchLayout();
  firstSnapshot = false;
  void loadHistory();
}

renderThread();
touchLayout();
connect();
setTimeout(() => $("#input").focus(), 100);
