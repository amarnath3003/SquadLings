// Offline self-test for our browser + MCP tools: no OpenAI, no tunnel, zero cost.
// Serves a local test page, starts the MCP server, and drives every tool through a real MCP client.
//
//   node scripts/tests/browser-mcp.selftest.ts            # headless
//   node scripts/tests/browser-mcp.selftest.ts --headed   # watch it in a Chromium window

import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { BotBrowser } from "../lib/browser.ts";
import { BOT_TOOLS, createBotTools, startMcpHttp } from "../lib/mcp-browser-server.ts";
import type { McpRequest } from "../lib/mcp-browser-server.ts";
import { SiteGate } from "../lib/site-gate.ts";

const HOME = `<!doctype html><title>Test Shop</title><meta name="description" content="A small shop for testing SquadLings."><main>
<h1>Test Shop</h1>
<form action="/search"><input type="search" name="q" aria-label="Search" placeholder="Search products"><button>Go</button></form>
<p><a href="/item">Aurora Lamp</a> · <a href="/form">Feedback form</a></p>
<button onclick="alert('hi there')">Say hi</button>
<button>Pay now</button>
<label>Password <input type="password"></label>
<select aria-label="Size"><option>Small</option><option>Large</option></select>
<div id="fancy" style="cursor:pointer;display:inline-block;padding:4px">Fancy div button</div>
<p><a href="http://blocked.example/">Evil site</a> · <a href="http://popup.example/" target="_blank">Popup link</a></p>
<div style="height:2400px"></div><a href="/bottom">Bottom link</a>
</main><script>document.getElementById("fancy").addEventListener("click", () => document.title = "Fancy clicked");</script>`;

const FORM = `<!doctype html><title>Feedback</title><main><h1>Feedback</h1><textarea aria-label="Message"></textarea>
<button onclick="window.onbeforeunload = (e) => { e.preventDefault(); e.returnValue = ''; }">Start editing</button></main>`;

const STUCK = `<!doctype html><title>Stuck</title><main><h1>Stuck</h1><button>Does nothing</button></main>`;
const CAPTCHA = `<!doctype html><title>Just a moment...</title><main><h1>Verify you are human</h1><p>Complete the check to continue.</p><button>I'm not a robot</button></main>`;
const COOKIES = `<!doctype html><title>News</title><main><h1>Today's news</h1><p>Story text.</p></main>
<div id="cookie-banner" class="cookie-consent" role="dialog"><p>We use cookies.</p><button>Reject all</button><button>Accept all</button></div>`;

// A normal article with an invisible reCAPTCHA for its comment form: not a human check.
const ARTICLE_RECAPTCHA = `<!doctype html><title>Article</title><main><h1>Roads reopen</h1><p>${"Crews cleared the debris overnight. ".repeat(20)}</p>
<iframe src="about:blank#recaptcha/api2/anchor" width="0" height="0" style="display:none"></iframe></main>`;
// A challenge page: little text and a visible, sizeable challenge frame.
const CHALLENGE_PAGE = `<!doctype html><title>example.org</title><main><p>One moment.</p><iframe src="about:blank#challenges.cloudflare.com/turnstile" width="300" height="80"></iframe></main>`;

// Like Bing's results page: an empty <main>, with the content elsewhere.
const EMPTY_MAIN = `<!doctype html><title>Results</title><main></main><div id="results"><h2>Result A: landslide report</h2>
<p>${"Details about the slide near Shimla, roads and weather. ".repeat(8)}</p></div>`;

const site = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const html = (body: string) => res.writeHead(200, { "content-type": "text/html" }).end(body);
  const page = (title: string, body: string) => html(`<!doctype html><title>${title}</title><main>${body}</main>`);
  if (url.pathname === "/") return html(HOME);
  if (url.pathname === "/form") return html(FORM);
  if (url.pathname === "/stuck") return html(STUCK);
  if (url.pathname === "/captcha") return html(CAPTCHA);
  if (url.pathname === "/cookies") return html(COOKIES);
  if (url.pathname === "/results") return html(EMPTY_MAIN);
  if (url.pathname === "/setcookie") return res.writeHead(200, { "content-type": "text/html", "set-cookie": "remembered=yes; Max-Age=3600; Path=/" }).end("<title>Set</title><main>Cookie set.</main>");
  if (url.pathname === "/readcookie") return page("Cookie", `<p>cookie: ${/remembered=yes/.test(req.headers.cookie ?? "") ? "remembered" : "none"}</p>`);
  if (url.pathname === "/article") return html(ARTICLE_RECAPTCHA);
  if (url.pathname === "/challenge") return html(CHALLENGE_PAGE);
  if (url.pathname === "/search") return page("Search", `<h1>Results for ${url.searchParams.get("q")}</h1><p>Aurora Lamp matches.</p>`);
  if (url.pathname === "/item") return page("Aurora Lamp", "<h1>Aurora Lamp</h1><p>Price $49</p>");
  if (url.pathname === "/motion") return page("Motion", `<h1>Motion</h1><button style="position:fixed;right:60px;bottom:60px">Far corner</button>`);
  page("Other", "<h1>Other</h1>");
});
await new Promise<void>((r) => site.listen(0, "127.0.0.1", r));
const SITE = `http://127.0.0.1:${(site.address() as AddressInfo).port}/`;

// The "user": says no to every site except slow.example, which never gets an answer.
const asked: string[] = [];
const gate = new SiteGate(["127.0.0.1"], {
  ask: (s) => {
    asked.push(s);
    return s === "slow.example" ? new Promise<boolean>(() => {}) : Promise.resolve(false);
  },
  onDecision: (s, allowed) => browser.note(allowed ? `The user allowed ${s}.` : `The user blocked ${s}. Don't try it again.`),
});

const humanChecks: string[] = [];
const t0 = performance.now();
const browser = await BotBrowser.launch({
  headless: !process.argv.includes("--headed"),
  viewport: { width: 1280, height: 800 },
  showCursor: true,
  color: "#5B30A6",
  label: "Plum",
  glideMs: 60,
  sites: gate,
  approvalWaitMs: 300,
  onHumanCheck: async (host) => (humanChecks.push(host), "skipped"),
  onKeyframe: () => {},
});
const tools = createBotTools({ browser, maxActions: 40, now: () => Math.round(performance.now() - t0) });
const requests: McpRequest[] = [];
const TOKEN = "selftest-token";
const PATH = `/mcp/${TOKEN}/selftest/bot1`;
const mcp = await startMcpHttp({ port: 0, path: PATH, token: TOKEN, tools, onRequest: (r) => requests.push(r) });
const MCP_URL = `http://127.0.0.1:${mcp.port}${PATH}`;

/** A raw 2026-07-28 request (OpenAI's client speaks this protocol). */
const META = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "selftest", version: "0" }, "io.modelcontextprotocol/clientCapabilities": {} };
let rpcId = 100;
async function modern(method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}, meta: Record<string, unknown> = META) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${TOKEN}`,
      "mcp-protocol-version": "2026-07-28", "mcp-method": method, ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params: { ...params, _meta: meta } }),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : undefined };
}

const client = new Client({ name: "squadlings-selftest", version: "0.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }));

type Result = { text: string; isError: boolean; types: string[] };
async function call(name: string, args: Record<string, unknown> = {}): Promise<Result> {
  const r: any = await client.callTool({ name, arguments: args });
  const content: any[] = r.content ?? [];
  return { text: content.map((c) => c.text ?? "").join("\n"), isError: Boolean(r.isError), types: content.map((c) => c.type) };
}
/** The ref number of the first element line matching a pattern, e.g. /searchbox "Search"/. */
function refOf(text: string, pattern: RegExp): number {
  const line = text.split("\n").find((l) => /^\[\d+\]/.test(l) && pattern.test(l));
  return line ? Number(/^\[(\d+)\]/.exec(line)![1]) : -1;
}

const checks: [string, boolean, string?][] = [];
const check = (label: string, pass: boolean, detail?: string) => checks.push([label, pass, pass ? undefined : detail]);

try {
  const listed = (await client.listTools()).tools.map((t) => t.name).sort();
  check("all bot tools listed over MCP", JSON.stringify(listed) === JSON.stringify([...BOT_TOOLS].sort()), listed.join(","));

  let r = await call("open", { url: SITE, why: "Open the test shop" });
  check("open returns the page and its elements", /Page: "Test Shop"/.test(r.text) && refOf(r.text, /searchbox "Search"/) > 0, r.text);
  check("cursor overlay is not in the element list", !/Plum ·/.test(r.text), r.text);
  check("div with cursor:pointer is listed", refOf(r.text, /"Fancy div button"/) > 0, r.text);
  check("links show where they go", /link "Aurora Lamp" → \/item/.test(r.text) && /link "Evil site" → blocked\.example\//.test(r.text), r.text);
  check("the page description is shown", /About: A small shop for testing SquadLings\./.test(r.text), r.text);
  const home = r.text;

  r = await call("type", { ref: refOf(home, /searchbox "Search"/), text: "lamp", submit: true, why: "Search for lamps" });
  check("type + submit reaches the results page", /Results for lamp/.test(r.text), r.text);

  r = await call("back", { why: "Back to the shop" });
  check("back returns to the shop", /Page: "Test Shop"/.test(r.text), r.text);

  r = await call("click", { ref: refOf(r.text, /button "Say hi"/), why: "Say hi" });
  check("alert dialog is accepted and reported", /alert dialog said "hi there"/.test(r.text), r.text);

  r = await call("click", { ref: refOf(r.text, /button "Pay now"/), why: "Pay" });
  check("Pay now is blocked (BLOCKED_FORBIDDEN)", r.isError && /^BLOCKED_FORBIDDEN/.test(r.text), r.text);

  r = await call("list_elements");
  const list = r.text;
  r = await call("type", { ref: refOf(list, /textbox "Password"/), text: "hunter2", why: "Type password" });
  check("password field is refused (SENSITIVE_FIELD)", r.isError && /^SENSITIVE_FIELD/.test(r.text), r.text);

  r = await call("select", { ref: refOf(list, /combobox "Size"/), option: "Large", why: "Pick large" });
  check("select changes the value", /combobox "Size" value="Large"/.test(r.text), r.text);

  r = await call("click", { ref: refOf(r.text, /"Fancy div button"/), why: "Click the fancy div" });
  check("click on a div button runs its handler", /Page: "Fancy clicked"/.test(r.text), r.text);

  // Sites (the live bug, 2026-10-10): a navigation never waits for the user; open does, briefly.
  r = await call("click", { ref: refOf(r.text, /link "Evil site"/), why: "Open evil site" });
  check("a link to an unknown site is stopped and the user is asked", /Opening blocked\.example needs the user's OK/.test(r.text) && /Page: "Fancy clicked"/.test(r.text) && asked.includes("blocked.example"), r.text);
  check("the user's answer reaches the bot", /The user blocked blocked\.example/.test(r.text), r.text);

  r = await call("open", { url: "http://blocked.example/x", why: "Try evil site" });
  check("after the user says no, open fails (NOT_ALLOWED_DOMAIN)", r.isError && /^NOT_ALLOWED_DOMAIN/.test(r.text), r.text);
  check("the user is asked once per site", asked.filter((s) => s === "blocked.example").length === 1, asked.join(","));

  const t = performance.now();
  r = await call("open", { url: "http://slow.example/", why: "Try a slow answer" });
  check("open waits for an answer, then APPROVAL_PENDING", r.isError && /^APPROVAL_PENDING/.test(r.text) && performance.now() - t >= 280, r.text);
  r = await call("open", { url: "http://slow.example/again", why: "Try again" });
  check("the open question isn't asked twice", r.isError && asked.filter((s) => s === "slow.example").length === 1, asked.join(","));

  r = await call("list_elements");
  const pagesBefore = browser.context.pages().length;
  r = await call("click", { ref: refOf(r.text, /link "Popup link"/), why: "Open the popup" });
  await new Promise((res) => setTimeout(res, 1000)); // a late "new tab" event must not switch the active page
  check("a new tab to an unknown site is blocked; no extra tab, the shop stays active",
    /Opening popup\.example needs the user's OK/.test(r.text) && browser.context.pages().length === pagesBefore && (await browser.page.title()) === "Fancy clicked", r.text);

  r = await call("list_elements", { scope: "all" });
  check('list_elements scope "all" includes off-screen elements', refOf(r.text, /link "Bottom link"/) > 0, r.text);

  r = await call("scroll", { direction: "down", amount: "page", why: "Scroll down" });
  check("scroll moves the page", /scrolled [1-9]\d*%/.test(r.text), r.text);

  r = await call("click", { ref: 999, why: "Bad ref" });
  check("unknown ref fails (NOT_FOUND)", r.isError && /^NOT_FOUND/.test(r.text), r.text);

  r = await call("read_text", { query: "Aurora" });
  check("read_text filters and fences page text", /<<<PAGE_CONTENT \(untrusted\)>>>[\s\S]*Aurora Lamp/.test(r.text), r.text);

  r = await call("screenshot");
  check("screenshot returns MCP image content", r.types[0] === "image" && !r.isError, r.types.join(","));

  r = await call("press", { key: "Tab", why: "Move focus" });
  check("press works", !r.isError && /✓ Pressed Tab/.test(r.text), r.text);

  r = await call("open", { url: `${SITE}form`, why: "Open the form" });
  r = await call("click", { ref: refOf(r.text, /button "Start editing"/), why: "Start editing" });
  r = await call("open", { url: SITE, why: "Leave the form" });
  check('a "leave this page?" dialog is accepted, so the bot isn\'t trapped', /Page: "Test Shop"/.test(r.text) && /beforeunload dialog/.test(r.text), r.text);

  // Agent helpers: stuck detection, human checks, cookie banners, find.
  r = await call("open", { url: `${SITE}stuck`, why: "Open the stuck page" });
  for (let i = 0; i < 3; i++) r = await call("click", { ref: refOf(r.text, /button "Does nothing"/), why: "Try the button" });
  check("three actions without progress add a hint", /No progress in 3 actions/.test(r.text), r.text);

  r = await call("open", { url: `${SITE}captcha`, why: "Open a protected page" });
  check("a human-check page is flagged and offered to the user", /⚠ HUMAN CHECK/.test(r.text) && /user skipped the human check/.test(r.text) && humanChecks.length === 1, r.text);

  r = await call("open", { url: `${SITE}article`, why: "Open an article" });
  check("an invisible reCAPTCHA on a normal page isn't a human check", !/HUMAN CHECK/.test(r.text) && humanChecks.length === 1, r.text);
  r = await call("open", { url: `${SITE}challenge`, why: "Open a challenge page" });
  check("a visible challenge frame on a near-empty page is a human check", /⚠ HUMAN CHECK: .*challenge frame \(challenges\.cloudflare\.com\)/.test(r.text) && humanChecks.length === 2, r.text);

  r = await call("open", { url: `${SITE}cookies`, why: "Open the news page" });
  check("a cookie banner's buttons are pointed out", /Cookie banner: \[\d+\] "Reject all", \[\d+\] "Accept all" closes it\./.test(r.text), r.text);

  r = await call("open", { url: `${SITE}results`, why: "Open the results page" });
  r = await call("read_text");
  check("read_text finds the content when <main> is empty (as on Bing)", /Result A: landslide report/.test(r.text), r.text);

  r = await call("open", { url: SITE, why: "Back to the shop" });
  r = await call("find", { text: "Bottom link" });
  check("find scrolls to the text and lists the elements there", /Found "Bottom link" 1 time/.test(r.text) && refOf(r.text, /link "Bottom link"/) > 0, r.text);
  r = await call("find", { text: "no such words" });
  check("find says when nothing matches", /No visible text matches "no such words"/.test(r.text) && !r.isError, r.text);

  // The 2026-07-28 protocol: one POST per call, cacheable discovery and tool list.
  let m = await modern("server/discover");
  check("server/discover answers with the version, tools capability and a cache lifetime",
    m.status === 200 && m.json?.result?.supportedVersions?.includes("2026-07-28") && m.json.result.capabilities?.tools && m.json.result.ttlMs > 0 && m.json.result.resultType === "complete", JSON.stringify(m));
  m = await modern("tools/list");
  check("tools/list (2026-07-28) lists every tool in a fixed order, cacheable",
    m.status === 200 && JSON.stringify(m.json?.result?.tools?.map((t: any) => t.name)) === JSON.stringify(BOT_TOOLS) && m.json.result.ttlMs > 0 && m.json.result.cacheScope === "private" && m.json.result.tools[0].inputSchema?.type === "object", JSON.stringify(m).slice(0, 400));
  m = await modern("tools/call", { name: "list_elements", arguments: {} }, { "mcp-name": "list_elements" });
  check("tools/call (2026-07-28) runs the tool in one request", m.status === 200 && m.json?.result?.resultType === "complete" && /Page: "Test Shop"/.test(m.json.result.content?.[0]?.text ?? ""), JSON.stringify(m).slice(0, 300));
  m = await modern("tools/call", { name: "click", arguments: { ref: "not a number", why: "x" } }, { "mcp-name": "click" });
  check("bad arguments come back as a tool error the model can fix", m.json?.result?.isError === true && /^INVALID_INPUT: ref/.test(m.json.result.content?.[0]?.text ?? ""), JSON.stringify(m));
  m = await modern("prompts/list");
  check("an unknown method is 404 with JSON-RPC -32601", m.status === 404 && m.json?.error?.code === -32601, JSON.stringify(m));
  m = await modern("tools/list", {}, {}, { ...META, "io.modelcontextprotocol/protocolVersion": "2025-11-25" });
  check("a version header that doesn't match _meta is 400 with -32020", m.status === 400 && m.json?.error?.code === -32020, JSON.stringify(m));
  const fromPage = await fetch(MCP_URL, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
  check("a request carrying an Origin header (from a web page) is refused", fromPage.status === 403, String(fromPage.status));

  r = await call("finish", { summary: "Self-test done.", sources: [{ title: "Test Shop", url: SITE }] });
  check("finish is recorded, with sources", tools.state.finished && tools.state.summary === "Self-test done." && tools.state.sources[0]?.url === SITE, r.text);
  r = await call("click", { ref: 1, why: "After finish" });
  check("tools refuse calls after finish (RUN_ENDED)", r.isError && /^RUN_ENDED/.test(r.text), r.text);

  check("action budget counts every attempt, refused ones too", tools.state.actions === 29, String(tools.state.actions));
  await browser.flushed();
  check("keyframe saved after each completed action", browser.frames === 23, String(browser.frames));
  check("Authorization header seen on every MCP request", requests.length > 0 && requests.every((q) => q.auth === "ok"), JSON.stringify(requests.filter((q) => q.auth !== "ok").slice(0, 3)));
  const legacy = requests.filter((q) => q.protocol === "legacy");
  check("legacy MCP requests (the SDK client) answered 200", legacy.length > 0 && legacy.every((q) => q.status === 200 || q.status === 202), JSON.stringify(legacy.filter((q) => q.status >= 300)));
  // The earlier agent, for evaluations: no link targets, no page hints.
  const plain = await BotBrowser.launch({ headless: true, viewport: { width: 1280, height: 800 }, showCursor: false, color: "#000", label: "Base", glideMs: 0, sites: gate, features: { linkTargets: false, pageHints: false } });
  const pr = await plain.open(SITE, "Open the shop");
  check("features off: no link targets or page description", !/ → /.test(pr) && !/About:/.test(pr) && /link "Aurora Lamp"$/m.test(pr), pr);
  const pc = await plain.open(`${SITE}captcha`, "Open a protected page");
  check("features off: no human-check flag", !/HUMAN CHECK/.test(pc), pc);
  await plain.close();

  // A persistent profile keeps cookies between runs (a solved human check stays solved).
  const dir = mkdtempSync(join(tmpdir(), "squadlings-profile-"));
  try {
    const opts = { headless: true, viewport: { width: 1280, height: 800 }, showCursor: false, color: "#000", label: "P", glideMs: 0, sites: gate, profileDir: dir };
    const first = await BotBrowser.launch(opts);
    await first.open(`${SITE}setcookie`, "Set a cookie");
    await first.close();
    const second = await BotBrowser.launch(opts);
    await second.open(`${SITE}readcookie`, "Read the cookie");
    const kept = await second.readText();
    await second.close();
    const fresh = await BotBrowser.launch({ ...opts, profileDir: undefined });
    await fresh.open(`${SITE}readcookie`, "Read the cookie");
    const clean = await fresh.readText();
    await fresh.close();
    check("a persistent profile keeps cookies between launches; a clean one doesn't", /cookie: remembered/.test(kept) && /cookie: none/.test(clean), `${kept}\n---\n${clean}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // Smooth cursor motion at the spike's glide (350 ms): sample the drawn cursor every animation frame
  // during a long move. It should glide along a curve with no jumps, overshoot a little, and land.
  const mover = await BotBrowser.launch({ headless: true, viewport: { width: 1280, height: 800 }, showCursor: true, color: "#5B30A6", label: "Plum", glideMs: 350, sites: gate });
  try {
    await mover.open(`${SITE}motion`, "Open the motion page");
    await mover.page.evaluate(() => {
      const w = window as any;
      w.__samples = [];
      const tick = () => {
        const c = document.getElementById("__squadlings_cursor");
        if (c) {
          const m = new DOMMatrix(getComputedStyle(c).transform);
          w.__samples.push([performance.now(), m.e, m.f]);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const list = await mover.listElements();
    await mover.click(refOf(list, /button "Far corner"/), "Go to the far corner");
    const samples: [number, number, number][] = await mover.page.evaluate(() => (window as any).__samples);
    const box = await mover.page.evaluate(() => JSON.parse(JSON.stringify(document.querySelector("button")!.getBoundingClientRect())));
    const moved = samples.findIndex(([, x, y], i) => i > 0 && (x !== samples[i - 1][1] || y !== samples[i - 1][2]));
    let last = samples.length - 1;
    while (last > 0 && samples[last][1] === samples[last - 1][1] && samples[last][2] === samples[last - 1][2]) last--;
    const glide = samples.slice(Math.max(0, moved - 1), last + 1);
    const [t0g, x0, y0] = glide[0];
    const [t1g, x1, y1] = glide[glide.length - 1];
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const ux = (x1 - x0) / dist;
    const uy = (y1 - y0) / dist;
    const steps = glide.slice(1).map(([, x, y], i) => Math.hypot(x - glide[i][1], y - glide[i][2]));
    const maxStep = Math.max(...steps);
    const bow = Math.max(...glide.map(([, x, y]) => Math.abs((x - x0) * uy - (y - y0) * ux)));
    const overshoot = Math.max(...glide.map(([, x, y]) => (x - x0) * ux + (y - y0) * uy)) - dist;
    const landed = x1 >= box.left && x1 <= box.right && y1 >= box.top && y1 <= box.bottom;
    const ms = t1g - t0g;
    const motion = `${glide.length} frames over ${Math.round(ms)} ms for ${Math.round(dist)} px; largest frame step ${Math.round(maxStep)} px (${Math.round((maxStep / dist) * 100)}%); bow ${Math.round(bow)} px; overshoot ${overshoot.toFixed(1)} px; landed on the button: ${landed}`;
    console.log(`  cursor motion: ${motion}`);
    check("cursor glides smoothly: ≥12 frames, no frame jump >25% of the move, ~350 ms", glide.length >= 12 && maxStep / dist < 0.25 && ms > 250 && ms < 700, motion);
    check("cursor path is curved, overshoots a little on a long move, and lands on the target", bow >= 10 && overshoot > 2 && overshoot < 15 && landed, motion);
  } finally {
    await mover.close();
  }
} catch (err) {
  check("no unexpected exception", false, err instanceof Error ? err.stack : String(err));
} finally {
  await client.close().catch(() => {});
  mcp.server.close();
  site.close();
  await browser.close();
}

let failed = 0;
for (const [label, pass, detail] of checks) {
  console.log(`${pass ? "✓" : "✗"} ${label}`);
  if (!pass) {
    failed++;
    if (detail) console.log(detail.replace(/^/gm, "    │ "));
  }
}
const rpc = requests.flatMap((q) => q.rpc).reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {});
console.log(`\nMCP requests: ${JSON.stringify(rpc)}`);
console.log(failed ? `${failed} of ${checks.length} checks failed` : `All ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
