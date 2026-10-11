// Offline end-to-end test of the squad orchestrator (scripts/lib/squad.ts) at zero cost.
//
// A mock Agents API plays a scripted Master and two scripted bots. Like OpenAI, it calls our real MCP
// router over HTTP (the 2026-07-28 protocol), and the bots drive real headless browsers on a local
// site. What it proves: routing per agent, start_bots, team messages both ways (including a reply
// waited for), a site request the Master answers, a nudge after a turn without finish, the
// final_answer guard while bots work, updates batched to the Master, and cleanup. It doesn't prove
// how the real models behave; `npm run squad` does that.
//
//   node scripts/tests/squad.selftest.ts             # self-test
//   node scripts/tests/squad.selftest.ts --verbose   # also print the squad's log

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentsApi } from "../lib/agents-api.ts";
import { startMcpHttp } from "../lib/mcp-browser-server.ts";
import type { McpRequest } from "../lib/mcp-browser-server.ts";
import { createRunLog } from "../lib/run-kit.ts";
import { Squad } from "../lib/squad.ts";
import { startMockAgentsApi } from "./mock-squad-api.ts";
import type { Script } from "./mock-squad-api.ts";

const VERBOSE = process.argv.includes("--verbose");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── A local site ──────────────────────────────────────

const site = createServer((req, res) => {
  const pages: Record<string, string> = {
    "/shop": "<title>Shop</title><main><h1>Shop</h1><p>Aurora Lamp: $49.00</p></main>",
    "/library": "<title>Library</title><main><h1>Library</h1><p>Open Mon–Fri 9:00–20:00</p></main>",
    "/other": "<title>Other</title><main><h1>Another site</h1><p>Branch phone: 555-0100</p></main>",
  };
  const body = pages[new URL(req.url ?? "/", "http://x").pathname];
  if (!body) return res.writeHead(404).end("not found");
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(`<!doctype html>${body}`);
});
await new Promise<void>((r) => site.listen(0, "127.0.0.1", () => r()));
const SITE_PORT = (site.address() as AddressInfo).port;
const SITE = `http://127.0.0.1:${SITE_PORT}`;
const OTHER = `http://localhost:${SITE_PORT}/other`; // another host: the bot must ask the Master

// ── Mock Agents API with scripted agents ──────────────

const flags = { askedFinalEarly: false, repliedToPlum: false, answered: false, thankedPlum: false };

const masterScript: Script = async (s, input, { call, search, text }) => {
  if (input.startsWith("USER TASK")) {
    search(s, "test shop lamp price");
    await call(s, "start_bots", {
      bots: [
        { goal: "Find the price of the Aurora Lamp on the shop page and report it to the Master.", start_url: `${SITE}/shop` },
        { goal: "Find the library's opening hours, and the branch phone on the other page; report both.", start_url: `${SITE}/library` },
      ],
    });
    const early = await call(s, "final_answer", { answer: "too early" });
    flags.askedFinalEarly = early.isError && /^BOTS_WORKING/.test(early.text);
    text(s, "Two bots are on it.");
    return;
  }
  if (/SITE REQUEST: \w+ wants to open localhost/.test(input)) await call(s, "site_access", { sites: ["localhost"], allow: true });
  if (/Plum → you: /.test(input) && !flags.repliedToPlum) {
    flags.repliedToPlum = true;
    await call(s, "message_bot", { to: "Plum", text: "Thanks. Include the currency in your result." });
  }
  if (/Plum FINISHED/.test(input) && !flags.thankedPlum) {
    flags.thankedPlum = true; // a message to a finished bot: it replies without a new finish
    await call(s, "message_bot", { to: "Plum", text: "Thanks, that's all I need." });
    return;
  }
  if (/Every bot is done/.test(input) && !flags.answered) {
    flags.answered = true;
    await call(s, "final_answer", { answer: "The Aurora Lamp costs $49.00; the library is open Mon–Fri 9:00–20:00; branch phone 555-0100.", sources: [{ url: `${SITE}/shop` }] });
  }
};

const botScript: Script = async (s, input, { call, text }) => {
  const plum = s.label === "bot1";
  if (/^WARM-UP/.test(input)) return text(s, "ready");
  if (plum && /Thanks, that's all I need/.test(input)) return text(s, "I already finished; nothing to add.");
  if (/ASSIGNMENT/.test(input)) {
    if (plum) {
      await call(s, "open", { url: `${SITE}/shop`, why: "Open the shop" });
      const sent = await call(s, "message", { to: "master", text: "The Aurora Lamp is $49.00.", wait_for_reply: true });
      const gotReply = /Master → you: Thanks/.test(sent.text);
      await call(s, "finish", { summary: gotReply ? "Aurora Lamp: $49.00 (USD)" : "Aurora Lamp: $49.00 (no reply)", sources: [{ url: `${SITE}/shop` }] });
    } else {
      await call(s, "open", { url: `${SITE}/library`, why: "Open the library" });
      await call(s, "message", { to: "Plum", text: "Hi Plum, Lime here." });
      // Ends the turn without finish: the orchestrator should nudge.
    }
    return;
  }
  if (/haven't called finish/.test(input) && !plum) {
    const other = await call(s, "open", { url: OTHER, why: "Open the branch page" });
    await call(s, "finish", { summary: other.isError ? `Hours Mon–Fri 9:00–20:00; other page failed: ${other.text.split("\n")[0]}` : "Hours Mon–Fri 9:00–20:00; phone 555-0100", sources: [{ url: `${SITE}/library` }] });
  }
};

const mock = await startMockAgentsApi({ master: masterScript, bot: botScript, log: (m) => console.error(m) });
const { sessions, seen } = mock;
const API_BASE = mock.base;

// ── The squad, wired as the CLI wires it (no tunnel: the mock calls 127.0.0.1) ──

const out = mkdtempSync(join(tmpdir(), "squad-selftest-"));
const run = createRunLog({ prefix: "squad-selftest", out });
if (!VERBOSE) run.log = () => {};
const life = new AbortController();
let answered!: () => void;
const answer = new Promise<void>((r) => (answered = r));
const TOKEN = "selftest-token";
const squad = new Squad({
  api: createAgentsApi({ base: API_BASE, key: "test" }),
  run,
  token: TOKEN,
  runId: "run_selftest",
  masterModel: "gpt-6.1-sol",
  botModel: "gpt-6-luna",
  bots: 2,
  maxActions: 10,
  webSearch: true,
  headless: true,
  cursor: false,
  allow: ["127.0.0.1"],
  signal: life.signal,
  onAnswer: () => answered(),
});
const requests: McpRequest[] = [];
const mcp = await startMcpHttp({ port: 0, token: TOKEN, routes: squad.routes, onRequest: (r) => requests.push(r) });
squad.mcpRequests = requests;

// The squad prints to the terminal; keep the test output short unless --verbose.
const realLog = console.log;
if (!VERBOSE) console.log = () => {};
const checks: [string, boolean, string?][] = [];
const check = (label: string, pass: boolean, detail?: string) => checks.push([label, pass, pass ? undefined : detail]);
try {
  await squad.launchBrowsers();
  squad.publicUrl = `http://127.0.0.1:${mcp.port}`;
  squad.warmBots();
  await squad.start("Find the lamp price and the library hours.");
  const timedOut = await Promise.race([answer.then(() => false), sleep(30000).then(() => true)]);
  await sleep(300);
  const [plum, lime] = squad.bots;
  const masterInputs = [...sessions.values()].find((s) => s.label === "master")?.inputs ?? [];
  const toolsOf = (agent: string) => seen.toolResults.filter((t) => t.agent === agent);

  check("the Master's final answer arrived", !timedOut && squad.answers.length === 1 && /\$49\.00/.test(squad.answers[0]?.answer ?? ""), JSON.stringify(squad.answers));
  check("start_bots gave each bot its own session and assignment", sessions.size === 3 && plum.goal?.includes("Aurora") === true && lime.goal?.includes("library") === true, `${sessions.size} sessions`);
  check("each agent's MCP calls reached its own tools (master, bot1, bot2)", ["master", "bot1", "bot2"].every((a) => requests.some((r) => r.agent === a && r.rpc.includes("tools/call"))), JSON.stringify(requests.map((r) => r.agent)));
  check("a wrong token in the path is 404", (await fetch(`http://127.0.0.1:${mcp.port}/mcp/wrong/run_selftest/bot1`, { method: "POST", body: "{}" })).status === 404);
  check("each bot's browser opened its page", toolsOf("bot1").some((t) => t.tool === "open" && /Page: "Shop"/.test(t.text)) && toolsOf("bot2").some((t) => t.tool === "open" && /Page: "Library"/.test(t.text)));
  check("final_answer is refused while bots work (BOTS_WORKING)", flags.askedFinalEarly);
  check("a bot's report reached the Master as a TEAM UPDATE", masterInputs.some((i) => /TEAM UPDATES/.test(i) && /Plum → you: The Aurora Lamp is \$49\.00/.test(i)), masterInputs.join("\n---\n").slice(0, 1500));
  check("the Master's reply reached the waiting bot (wait_for_reply)", plum.result?.summary === "Aurora Lamp: $49.00 (USD)", plum.result?.summary);
  check("a bot-to-bot message was recorded and copied to the Master", squad.messages.some((m) => m.from === "Lime" && m.to === "Plum") && masterInputs.some((i) => /Lime → Plum: Hi Plum/.test(i)));
  check("a turn that ended without finish was nudged, then finished", lime.status === "finished" && [...sessions.values()].find((s) => s.label === "bot2")?.inputs.some((i) => /haven't called finish/.test(i)) === true, lime.status);
  check("an unknown site went to the Master, who allowed it; the bot then opened it", masterInputs.some((i) => /SITE REQUEST: Lime wants to open localhost/.test(i)) && /phone 555-0100/.test(lime.result?.summary ?? ""), lime.result?.summary);
  check("each update carries the bots' activity", masterInputs.some((i) => /Activity since the last update:\n- (Plum|Lime) \(/.test(i)));
  check("'Every bot is done' is sent only once both finished", masterInputs.filter((i) => /Every bot is done/.test(i)).length >= 1 && plum.status === "finished" && lime.status === "finished");
  check("the Master's web_search is counted", squad.summary().master.webSearches.length === 1);
  const plumInputs = [...sessions.values()].find((s) => s.label === "bot1")?.inputs ?? [];
  check("a finished bot that answers a message without a new finish keeps its result, unnudged", flags.thankedPlum && plum.status === "finished" && !plumInputs.some((i) => /haven't called finish/.test(i)) && masterInputs.some((i) => /Plum replied without a new finish; its earlier result stands/.test(i)), JSON.stringify({ status: plum.status, inputs: plumInputs.map((i) => i.slice(0, 60)) }));
  const bot1 = [...sessions.values()].find((s) => s.label === "bot1");
  check("bots were warmed up before their assignment, which reused the warm session", sessions.size === 3 && /^WARM-UP/.test(bot1?.inputs[0] ?? "") && /^ASSIGNMENT from the Master/.test(bot1?.inputs[1] ?? ""), JSON.stringify(bot1?.inputs.map((i) => i.slice(0, 40))));
} finally {
  await squad.shutdown();
  life.abort();
  console.log = realLog;
}
check("every session is deleted at shutdown", ["master", "bot1", "bot2"].every((a) => seen.deletes.includes(a)), seen.deletes.join(","));
const summary = squad.summary();
check("usage and cost are summed per agent", summary.agents.length === 3 && summary.costUSD > 0, JSON.stringify(summary.agents.map((a) => a.costUSD)));
const result = JSON.parse(readFileSync(join(out, "result.json"), "utf8"));
check("result.json holds the answer", result.answers?.length === 1);

mcp.server.close();
mock.close();
site.close();
rmSync(out, { recursive: true, force: true });

let failed = 0;
for (const [label, pass, detail] of checks) {
  console.log(`${pass ? "✓" : "✗"} ${label}${pass ? "" : `\n    ${String(detail ?? "").slice(0, 1500)}`}`);
  if (!pass) failed++;
}
console.log(failed ? `\n${failed} of ${checks.length} squad checks failed` : `\nAll ${checks.length} squad checks passed`);
process.exit(failed ? 1 : 0);
