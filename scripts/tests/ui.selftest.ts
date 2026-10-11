// Offline end-to-end test of the dashboard (`npm run ui`) at zero cost.
//
// A mock Agents API plays a scripted Master and two scripted bots against our real MCP router; the
// bots drive real headless browsers on a local site. A headless Chromium opens the real dashboard
// and uses it as a person would: picks 2 bots, types the task, watches, takes over a bot's browser
// to get past a (fake) human check, types into the page, hands it back, reads the answer, sends a
// follow-up, reloads, and ends the run. It checks what shows on the page and what reaches the server.
// Screenshots land in spikes/out/ui-selftest/ for a look at the layout.
//
//   node scripts/tests/ui.selftest.ts             # self-test
//   node scripts/tests/ui.selftest.ts --verbose   # also print the squad's log

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { WebSocket } from "ws";
import { startMcpHttp } from "../lib/mcp-browser-server.ts";
import { ROOT } from "../lib/run-kit.ts";
import { SquadRunner } from "../lib/squad-runner.ts";
import type { RunOptions } from "../lib/squad-runner.ts";
import { startUiServer } from "../lib/ui-server.ts";
import { startMockAgentsApi } from "./mock-squad-api.ts";
import type { Script } from "./mock-squad-api.ts";

const VERBOSE = process.argv.includes("--verbose");
const SHOTS = join(ROOT, "spikes/out/ui-selftest");
const SECRET = "hunter2-ui-secret";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
mkdirSync(SHOTS, { recursive: true });

// ── A local site: a shop with a button, and a page that looks like a human check ──

let checkClicks = 0;
const site = createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  if (path === "/clicked" && req.method === "POST") {
    checkClicks++;
    return res.writeHead(204).end();
  }
  const pages: Record<string, string> = {
    "/shop": `<title>Shop</title><main><h1>Shop</h1><p>Aurora Lamp</p><button id="b" style="margin:40px;padding:20px 40px;font-size:20px" onclick="this.textContent='Price: $49.00'">Show price</button></main>`,
    // Big centered button: a click in the middle of the tile hits it. A password field to type into.
    "/check": `<title>Human verification</title><body style="margin:0;font:16px system-ui">
      <p style="padding:16px">Please verify you are a human to continue.</p>
      <input type="password" id="pw" placeholder="Passcode" style="position:absolute;left:40%;top:25%;width:20%;height:40px">
      <button id="human" style="position:absolute;left:30%;top:40%;width:40%;height:20%;font-size:24px"
        onclick="fetch('/clicked',{method:'POST'});document.title='Library';document.body.innerHTML='<main><h1>Verified</h1><p>Library hours: Mon–Fri 9:00–20:00</p></main>'">I'm a person</button></body>`,
  };
  const body = pages[path];
  if (!body) return res.writeHead(404).end("not found");
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(`<!doctype html>${body}`);
});
await new Promise<void>((r) => site.listen(0, "127.0.0.1", () => r()));
const SITE = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;

// ── Scripted agents ──

const flags = { answered: false, followUp: false, limeSawVerified: false, narrated: false };

const master: Script = async (s, input, { call, search, text }) => {
  if (input.startsWith("USER TASK")) {
    search(s, "aurora lamp price library hours");
    await sleep(1500); // planning: the chat stays in the middle meanwhile
    await call(s, "start_bots", {
      bots: [
        { bot: "Plum", label: "Lamp price", goal: "Find the price of the Aurora Lamp on the shop page and report it to the Master.", start_url: `${SITE}/shop` },
        { bot: "Lime", label: "Library hours", goal: "Find the library's opening hours on the library page and report them.", start_url: `${SITE}/check` },
      ],
    });
    text(s, "Two bots are on it: **Plum** checks the lamp, **Lime** the library.");
    return;
  }
  if (/Plum → you: /.test(input) && !flags.narrated) {
    flags.narrated = true;
    text(s, "Plum has the price; Lime is still on it."); // progress narration: belongs on the team card
  }
  if (/USER: Also mention the currency/.test(input) && !flags.followUp) {
    flags.followUp = true;
    text(s, "Noted: the answer gives prices in USD.");
  }
  if (/Every bot is done/.test(input) && !flags.answered) {
    flags.answered = true;
    await call(s, "final_answer", {
      answer: "Here's what the team found:\n\n| Item | Value |\n|---|---|\n| Aurora Lamp | $49.00 |\n| Library | Mon–Fri 9:00–20:00 |\n\n- Prices are in **USD**.",
      sources: [{ title: "Shop", url: `${SITE}/shop` }, { url: `${SITE}/check` }],
    });
  }
};

const bot: Script = async (s, input, { call, text }) => {
  if (/^WARM-UP/.test(input)) return text(s, "ready");
  if (!/ASSIGNMENT/.test(input)) return;
  if (s.label === "bot1") {
    const opened = await call(s, "open", { url: `${SITE}/shop`, why: "Open the shop" });
    const ref = /\[(\d+)\] button "Show price"/.exec(opened.text)?.[1];
    if (ref) await call(s, "click", { ref: Number(ref), why: "Reveal the lamp's price" });
    await call(s, "message", { to: "master", text: "The Aurora Lamp is $49.00." });
    await call(s, "finish", { summary: "Aurora Lamp: $49.00", sources: [{ url: `${SITE}/shop` }] });
    return;
  }
  // Lime lands on a human check and keeps looking until the user has dealt with it (its calls wait during takeover).
  await call(s, "open", { url: `${SITE}/check`, why: "Open the library page" });
  for (let i = 0; i < 80; i++) {
    const r = await call(s, "list_elements", {});
    if (/Verified|Library hours/.test(r.text) || /Page: "Library"/.test(r.text)) {
      flags.limeSawVerified = true;
      break;
    }
    await sleep(400);
  }
  await call(s, "finish", { summary: flags.limeSawVerified ? "Library: Mon–Fri 9:00–20:00 (after the user's check)" : "Blocked by a human check", sources: [{ url: `${SITE}/check` }] });
};

const mock = await startMockAgentsApi({ master, bot, log: (m) => console.error(m) });

// ── The dashboard, wired as `npm run ui` wires it (no tunnel: the mock calls 127.0.0.1) ──

const out = mkdtempSync(join(tmpdir(), "ui-selftest-"));
const DEFAULTS: RunOptions = { bots: 5, masterModel: "gpt-6.1-sol", botModel: "gpt-6-luna", maxActions: 30, timeoutMin: 5, webSearch: true, allowDirect: false, allow: [], fresh: true };
let mcpPort = 0;
const runner = new SquadRunner({ apiKey: "test", apiBase: mock.base, publicUrl: async () => `http://127.0.0.1:${mcpPort}`, outRoot: out, verbose: VERBOSE });
const mcp = await startMcpHttp({ port: 0, token: runner.token, routes: runner.routes, onRequest: (r) => runner.current?.onMcp(r) });
mcpPort = mcp.port;
const ui = await startUiServer({ port: 0, staticDir: join(ROOT, "ui"), runner, defaults: DEFAULTS, models: { master: ["gpt-6.1-sol"], bot: ["gpt-6-luna"] }, tunnel: () => ({ state: "ready", url: `http://127.0.0.1:${mcpPort}`, source: "test" }) });

const checks: [string, boolean, string?][] = [];
const check = (label: string, pass: boolean, detail?: string) => checks.push([label, pass, pass ? undefined : detail]);
const browser = await chromium.launch({ headless: true });
const pageErrors: string[] = [];

try {
  // Only the dashboard may drive the server.
  const evil = await fetch(`${ui.url}/api/runs`, { method: "POST", headers: { "content-type": "application/json", origin: "http://evil.example" }, body: JSON.stringify({ task: "x" }) });
  check("a request from another site's page is refused (403)", evil.status === 403, String(evil.status));
  const wsEvil = await new Promise<boolean>((resolve) => {
    const w = new WebSocket(`ws://127.0.0.1:${ui.port}/ws`, { origin: "http://evil.example" });
    w.on("open", () => (w.close(), resolve(false)));
    w.on("error", () => resolve(true));
  });
  check("a WebSocket from another site's page is refused", wsEvil);
  const csp = (await fetch(ui.url)).headers.get("content-security-policy") ?? "";
  check("the page is served with a strict content security policy", /script-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp), csp);

  const ctx = await browser.newContext({ viewport: { width: 1512, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("dialog", (d) => void d.accept());
  await page.goto(ui.url);
  await page.waitForSelector("#agent-dots i");

  // Home: one bar in the middle, with the agents and effort chips.
  check("the page opens on the home bar (no wall, no chat yet)", await page.evaluate(() => document.querySelector("#app")!.classList.contains("home") && !!document.querySelector("#home-slot #composer")));
  await page.locator("#agents-chip").click();
  await page.locator("#o-bots").fill("2");
  check("the agents slider sets the count (chip and popover say 2 agents)", (await page.locator("#agents-val").textContent()) === "2 agents" && (await page.locator("#agent-avatars span.off").count()) === 3);
  await page.locator("#effort-chip").click();
  check("one popover at a time", (await page.locator("#agents-pop").isHidden()) && (await page.locator("#effort-pop").isVisible()));
  await page.locator("#o-effort").fill("1");
  check("the effort slider sets the agents' effort (Low)", (await page.locator("#effort-val").textContent()) === "Low");
  await page.locator("#opts-btn").click();
  await page.locator("#o-fresh").check();
  await page.screenshot({ path: join(SHOTS, "1-home.png") });
  await page.keyboard.press("Escape");

  await page.locator("#input").fill("Find the Aurora Lamp's price and the library's hours.");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#app.center .msg.you", { timeout: 10000 });
  check("while the Master plans, the chat is in the middle and no browsers show", await page.evaluate(() => document.querySelector("#app")!.classList.contains("center") && getComputedStyle(document.querySelector("#wall")!).opacity === "0" && document.querySelectorAll(".tile").length === 0));
  await page.screenshot({ path: join(SHOTS, "2-center.png") });
  await page.waitForSelector("#app.side .mission", { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll("#grid .tile").length === 2, null, { timeout: 5000 });
  check("once agents get work, the chat moves to the side and their tiles spawn", await page.evaluate(() => document.querySelector("#app")!.classList.contains("side") && document.querySelectorAll("#grid .tile").length === 2));
  const sessionsCreated = [...mock.sessions.values()];
  check("the agents run at the effort you picked; the Master at its default", sessionsCreated.filter((x) => x.label !== "master").every((x) => x.agent?.reasoning?.effort === "low") && !sessionsCreated.find((x) => x.label === "master")?.agent?.reasoning, JSON.stringify(sessionsCreated.map((x) => [x.label, x.agent?.reasoning])));
  check("the task shows as your message", (await page.locator(".msg.you").first().textContent())?.includes("Aurora Lamp") === true);
  check("the Master's research shows as one line", /Research/.test((await page.locator(".research summary").first().textContent()) ?? ""));
  const card = (await page.locator(".mission").textContent()) ?? "";
  check("the team card lists both agents with their roles", /Plum/.test(card) && /Lamp price/.test(card) && /Lime/.test(card) && /Library hours/.test(card), card);
  check("the Master's reply to you is a message (Markdown bold)", (await page.locator(".msg.master strong").count()) >= 1);

  // Live frames and the cursor.
  await page.waitForFunction(() => document.querySelectorAll(".tile.live").length >= 2, null, { timeout: 15000 });
  const painted = await page.evaluate(() => [...document.querySelectorAll<HTMLCanvasElement>(".tile canvas")].map((c) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4 * 997) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return { w: c.width, colors: seen.size };
  }));
  check("each tile shows the agent's live browser (frames painted)", painted.length === 2 && painted.every((p) => p.w >= 600 && p.colors > 1), JSON.stringify(painted));
  await page.waitForFunction(() => /The Aurora Lamp is \$49\.00|Aurora Lamp: \$49\.00/.test(document.querySelector('.m-row[data-bot="bot1"] .m-note')?.textContent ?? ""), null, { timeout: 15000 });
  check("an agent's report shows on its team-card row, not as a chat message", (await page.locator("#thread > .radio").count()) === 0 && (await page.locator(".msg", { hasText: "The Aurora Lamp is $49.00" }).count()) === 0);
  await page.waitForFunction(() => /Plum has the price/.test(document.querySelector(".mission .m-master")?.textContent ?? ""), null, { timeout: 10000 });
  check("the Master's progress notes go on the team card, not in the chat", (await page.locator(".msg.master", { hasText: "Plum has the price" }).count()) === 0);
  await page.locator(".m-log-btn").first().click();
  await page.waitForSelector(".mission .m-log .radio", { timeout: 3000 }).catch(() => {});
  check("the team messages are folded away, and open on demand", (await page.locator(".mission .m-log .radio", { hasText: "The Aurora Lamp is $49.00" }).count()) === 1);
  const cursor = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('.tile[data-bot="bot1"] .cursor');
    return c ? { left: c.style.left, top: c.style.top } : null;
  });
  check("the agent's cursor is drawn over its frame, away from the corner", Boolean(cursor?.left) && cursor!.left !== "3%", JSON.stringify(cursor));

  // The human check: take over, solve it in the tile, type a secret, hand back.
  await page.waitForSelector(".attn", { timeout: 15000 });
  check("a human check is surfaced to you in the chat", /Lime/.test((await page.locator(".attn").textContent()) ?? ""));
  await page.screenshot({ path: join(SHOTS, "3-side.png") });
  await page.locator(".attn button.primary").click();
  await page.waitForSelector(".tile.control.staged", { timeout: 5000 });
  await sleep(300);
  await page.screenshot({ path: join(SHOTS, "4-takeover.png") });
  const box = (await page.locator(".tile.staged canvas").boundingBox())!;
  // The passcode field (left 40–60 %, top 25 % + 20 px of 800), then the big button in the middle.
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * (0.25 + 20 / 800));
  await sleep(150);
  await page.keyboard.type(SECRET, { delay: 10 });
  await sleep(200);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  for (let i = 0; i < 40 && checkClicks === 0; i++) await sleep(100);
  check("your click in the tile reached the agent's page", checkClicks === 1, `clicks: ${checkClicks}`);
  await page.locator(".tile.staged .control-bar button").click();
  await page.waitForSelector(".tile.control", { state: "detached", timeout: 5000 });

  await page.waitForSelector(".answer", { timeout: 25000 });
  check("after you handed the browser back, the agent saw the real page and finished", flags.limeSawVerified);
  const answer = page.locator(".answer");
  check("the final answer renders its table and sources", (await answer.locator("table td").count()) >= 4 && (await answer.locator(".sources a").count()) === 2);
  check("after a takeover, the stage stays on that agent", (await page.locator('.tile.staged[data-bot="bot2"]').count()) === 1);
  await page.keyboard.press("Escape");
  await page.waitForSelector("#area:not(.staged)");
  await page.locator('.m-row[data-bot="bot1"]').click(); // a team-card row focuses that agent
  await page.waitForSelector('#area.staged .tile.staged[data-bot="bot1"]');
  check("clicking an agent's row shows its browser, assignment and steps", (await page.locator("#detail").textContent())?.includes("Aurora Lamp") === true && (await page.locator("#detail .steps li").count()) > 0);
  await page.keyboard.press("Escape");

  // Hide the chat; a message while hidden shows as unread.
  await page.locator("#hide-chat").click();
  await page.waitForSelector("#chat-rail:not([hidden])");
  const hiddenWidth = await page.evaluate(async () => (await new Promise((r) => setTimeout(r, 800)), document.querySelector("#chat")!.getBoundingClientRect().width));
  check("hiding the chat gives the agents the whole screen", hiddenWidth < 2, String(hiddenWidth));
  await page.locator("#chat-rail").click();
  await page.waitForSelector("#chat-rail", { state: "hidden" });

  // A follow-up to the Master.
  await page.locator("#input").fill("Also mention the currency.");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".msg.master >> text=Noted", { timeout: 10000 });
  const box2 = await page.locator(".pillbox").boundingBox();
  check("your follow-up reached the Master and its reply is a message; the box is back to one line", (box2?.height ?? 999) < 70, `box height ${box2?.height}`);
  await page.screenshot({ path: join(SHOTS, "5-answer.png") });

  // Reload: the live chat comes back from its events.
  await page.reload();
  await page.waitForSelector(".answer", { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll(".tile.live").length >= 2, null, { timeout: 5000 });
  const restored = await page.evaluate(() => ({
    mission: document.querySelector(".mission")?.getBoundingClientRect().height ?? 0,
    answer: document.querySelector(".answer")?.getBoundingClientRect().height ?? 0,
    you: document.querySelectorAll(".msg.you").length,
    tiles: document.querySelectorAll(".tile").length,
    side: document.querySelector("#app")!.classList.contains("side"),
  }));
  check("a reload restores the chat, team card, answer and live tiles", restored.mission > 100 && restored.answer > 120 && restored.you === 2 && restored.tiles === 2 && restored.side, JSON.stringify(restored));
  check("no stray text in tile headers", !/null|undefined/.test((await page.locator(".tile-head").allTextContents()).join(" ")));

  // End the chat; reopen it from Chats (read-only); start a new one.
  await page.locator("#end-chat").click();
  await page.waitForSelector("#closed-bar:not([hidden])", { timeout: 20000 });
  check("ending the chat closes it (composer gone) and deletes every session", (await page.locator("#composer").isHidden()) && ["master", "bot1", "bot2"].every((a) => mock.seen.deletes.includes(a)), mock.seen.deletes.join(","));
  await page.locator("#closed-bar button").click();
  await page.waitForSelector("#app.home");
  await page.locator("#rail-chats").click();
  await page.waitForSelector("#history .h-item");
  await sleep(800); // let the layout and the panel finish sliding
  check("Chats lists the chat you closed", /Aurora Lamp/.test((await page.locator("#history .h-item").first().textContent()) ?? ""));
  await page.screenshot({ path: join(SHOTS, "6-chats.png") });
  await page.locator("#history .h-item").first().click();
  await page.waitForSelector("#app.side .answer", { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll(".tile.live").length >= 2, null, { timeout: 8000 });
  check("a closed chat reopens read-only: its answer, and each agent's last screen", (await page.locator(".answer").count()) === 1 && (await page.locator("#composer").isHidden()) && (await page.locator(".tile.live").count()) === 2);
  await sleep(800);
  await page.screenshot({ path: join(SHOTS, "7-reopened.png") });
  await page.locator("#rail-new").click();
  await page.waitForSelector("#app.home #home-slot #composer");
  check("New chat goes back to the home bar", true);
  check("the page had no script errors", pageErrors.length === 0, pageErrors.join("\n"));

  // What was saved, and what wasn't.
  const dir = join(out, readdirSync(out).find((d) => d.startsWith("ui-"))!);
  const events = readFileSync(join(dir, "events.jsonl"), "utf8");
  check("events.jsonl records the run (plan, messages, answer, takeover)", ["plan.ready", "team.message", "run.result", "takeover.started", "run.status"].every((t) => events.includes(`"${t}"`)));
  const everything = readdirSync(dir).filter((f) => /\.(jsonl|json|txt)$/.test(f)).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
  const toModels = mock.seen.toolResults.map((t) => t.text).join("\n");
  check("what you typed in the agent's browser is in no log and no tool result", !everything.includes(SECRET) && !toModels.includes(SECRET) && events.length > 0);
} finally {
  await browser.close();
  await runner.shutdown();
  ui.close();
  mcp.server.close();
  mock.close();
  site.close();
  rmSync(out, { recursive: true, force: true });
}

let failed = 0;
for (const [label, pass, detail] of checks) {
  console.log(`${pass ? "✓" : "✗"} ${label}${pass ? "" : `\n    ${String(detail ?? "").slice(0, 1500)}`}`);
  if (!pass) failed++;
}
console.log(failed ? `\n${failed} of ${checks.length} dashboard checks failed` : `\nAll ${checks.length} dashboard checks passed (screenshots: spikes/out/ui-selftest/)`);
process.exit(failed ? 1 : 0);
