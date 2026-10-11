// A zero-cost live dev server for the dashboard: the real server (`npm run ui` wiring) with a scripted
// mock Agents API instead of OpenAI, adapted from scripts/tests/ui.selftest.ts. Any task you send plays
// the same scripted run: the Master plans 2 agents; Plum types, scrolls and clicks on a local shop page,
// Lime lands on a fake human check and waits until you take over its browser and click "I'm a person".
// Runs are saved under spikes/out/dev-mock-ui/ (so closed chats show under Chats). No OpenAI calls.
//
//   node scripts/dev-mock-ui.ts [--port 8796] [--mcp-port 8795] [--verbose]
//   then: cd web && SQUADLINGS_API=http://127.0.0.1:8796 VITE_PORT=5176 npx vite --host 127.0.0.1

import { existsSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { startMcpHttp } from "./lib/mcp-browser-server.ts";
import { ROOT } from "./lib/run-kit.ts";
import { SquadRunner } from "./lib/squad-runner.ts";
import type { RunOptions } from "./lib/squad-runner.ts";
import { startUiServer } from "./lib/ui-server.ts";
import { startMockAgentsApi } from "./tests/mock-squad-api.ts";
import type { Script } from "./tests/mock-squad-api.ts";

const { values: opt } = parseArgs({
  options: {
    port: { type: "string", default: "8796" },
    "mcp-port": { type: "string", default: "8795" },
    verbose: { type: "boolean", default: false },
  },
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PACE = 1500; // between the agents' actions, so you can watch

// ── A local site: a long shop page with a search box and a button, and a fake human check ──

const filler = Array.from({ length: 12 }, (_, i) => `<p style="height:90px;margin:0;border-bottom:1px solid #ddd">Item ${i + 1}: a lamp you don't need</p>`).join("");
const pages: Record<string, string> = {
  "/shop": `<title>Shop</title><body style="margin:0;font:16px system-ui"><main style="padding:24px"><h1>Shop</h1>
    <input id="q" placeholder="Search the shop" style="width:50%;height:36px;font-size:18px">${filler}
    <p>Aurora Lamp</p><button id="b" style="margin:40px;padding:20px 40px;font-size:20px" onclick="this.textContent='Price: $49.00'">Show price</button></main></body>`,
  "/check": `<title>Human verification</title><body style="margin:0;font:16px system-ui">
    <p style="padding:16px">Please verify you are a human to continue.</p>
    <input type="password" id="pw" placeholder="Passcode" style="position:absolute;left:40%;top:25%;width:20%;height:40px">
    <button id="human" style="position:absolute;left:30%;top:40%;width:40%;height:20%;font-size:24px"
      onclick="document.title='Library';document.body.innerHTML='<main><h1>Verified</h1><p>Library hours: Mon–Fri 9:00–20:00</p></main>'">I'm a person</button></body>`,
};
const site = createServer((req, res) => {
  const body = pages[new URL(req.url ?? "/", "http://x").pathname];
  if (!body) return res.writeHead(404).end("not found");
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(`<!doctype html>${body}`);
});
await new Promise<void>((r) => site.listen(0, "127.0.0.1", () => r()));
const SITE = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;

// ── Scripted agents (any task text plays this run) ──

const answered = new Set<string>(); // master sessions that gave their answer
const master: Script = async (s, input, { call, search, text }) => {
  if (input.startsWith("USER TASK")) {
    search(s, "aurora lamp price library hours");
    await sleep(2000); // planning: the chat stays in the middle meanwhile
    await call(s, "start_bots", {
      bots: [
        { bot: "Plum", label: "Lamp price", goal: "Find the price of the Aurora Lamp on the shop page and report it to the Master.", start_url: `${SITE}/shop` },
        { bot: "Lime", label: "Library hours", goal: "Find the library's opening hours on the library page and report them.", start_url: `${SITE}/check` },
      ],
    });
    text(s, "Two agents are on it: **Plum** checks the lamp, **Lime** the library.");
    return;
  }
  if (/Every bot is done/.test(input) && !answered.has(s.id)) {
    answered.add(s.id);
    await call(s, "final_answer", {
      answer: "Here's what the team found (a scripted dev run):\n\n| Item | Value |\n|---|---|\n| Aurora Lamp | $49.00 |\n| Library | Mon–Fri 9:00–20:00 |",
      sources: [{ title: "Shop", url: `${SITE}/shop` }, { url: `${SITE}/check` }],
    });
    return;
  }
  const said = /USER: (.+)/.exec(input)?.[1];
  if (said) text(s, `Noted: "${said.slice(0, 80)}" (scripted dev run).`);
};

const bot: Script = async (s, input, { call, text }) => {
  if (/^WARM-UP/.test(input)) return text(s, "ready");
  if (!/ASSIGNMENT/.test(input)) return;
  const ref = (list: string, label: RegExp) => Number(new RegExp(`\\[(\\d+)\\] ${label.source}`).exec(list)?.[1] ?? 0);
  if (s.label === "bot1") {
    const opened = await call(s, "open", { url: `${SITE}/shop`, why: "Open the shop" });
    await sleep(PACE);
    const q = ref(opened.text, /(textbox|input|searchbox)[^\n]*Search/);
    if (q) await call(s, "type", { ref: q, text: "aurora lamp", why: "Search for the lamp" });
    await sleep(PACE);
    await call(s, "scroll", { direction: "down", amount: "page", why: "Look further down the page" });
    await sleep(PACE);
    await call(s, "scroll", { direction: "down", amount: "page", why: "Find the lamp" });
    await sleep(PACE);
    const list = await call(s, "list_elements", { scope: "all" });
    const b = ref(list.text, /button "Show price"/);
    if (b) await call(s, "click", { ref: b, why: "Reveal the lamp's price" });
    await sleep(PACE);
    await call(s, "message", { to: "master", text: "The Aurora Lamp is $49.00." });
    await call(s, "finish", { summary: "Aurora Lamp: $49.00", sources: [{ url: `${SITE}/shop` }] });
    return;
  }
  // Lime lands on the human check and keeps looking until you've dealt with it (its calls wait during takeover).
  await call(s, "open", { url: `${SITE}/check`, why: "Open the library page" });
  let verified = false;
  for (let i = 0; i < 300 && !verified; i++) {
    const r = await call(s, "list_elements", {});
    verified = /Verified|Library hours/.test(r.text) || /Page: "Library"/.test(r.text);
    if (!verified) await sleep(1000);
  }
  await call(s, "finish", { summary: verified ? "Library: Mon–Fri 9:00–20:00 (after your check)" : "Blocked by a human check", sources: [{ url: `${SITE}/check` }] });
};

const mock = await startMockAgentsApi({ master, bot, log: (m) => console.error(m) });

// ── The dashboard, wired as `npm run ui` wires it (no tunnel: the mock calls 127.0.0.1) ──

const DEFAULTS: RunOptions = { bots: 5, masterModel: "gpt-6.1-sol", botModel: "gpt-6-luna", maxActions: 30, timeoutMin: 10, webSearch: true, allowDirect: false, allow: [], fresh: true };
let mcpPort = Number(opt["mcp-port"]);
const runner = new SquadRunner({ apiKey: "mock", apiBase: mock.base, publicUrl: async () => `http://127.0.0.1:${mcpPort}`, outRoot: join(ROOT, "spikes/out/dev-mock-ui"), verbose: opt.verbose });
const mcp = await startMcpHttp({ port: mcpPort, token: runner.token, routes: runner.routes, onRequest: (r) => runner.current?.onMcp(r) });
mcpPort = mcp.port;
const ui = await startUiServer({ port: Number(opt.port), staticDir: existsSync(join(ROOT, "web/dist/index.html")) ? join(ROOT, "web/dist") : join(ROOT, "ui"), runner, defaults: DEFAULTS, models: { master: ["gpt-6.1-sol"], bot: ["gpt-6-luna"] }, tunnel: () => ({ state: "ready", url: `http://127.0.0.1:${mcpPort}`, source: "mock" }) });

console.log(`SquadLings dev mock (no OpenAI calls) → ${ui.url}   MCP on ${mcpPort}   (Ctrl+C to quit)`);
console.log(`  React dev UI: cd web && SQUADLINGS_API=${ui.url} VITE_PORT=5176 npx vite --host 127.0.0.1`);

let quitting = false;
async function quit() {
  if (quitting) process.exit(130);
  quitting = true;
  await runner.shutdown().catch(() => {});
  ui.close();
  mcp.server.close();
  mock.close();
  site.close();
  process.exit(0);
}
process.on("SIGINT", () => void quit());
process.on("SIGTERM", () => void quit());
