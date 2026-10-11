// SquadLings squad (Phase 1 core, master.md §10–§12 as adapted 2026-10-11): the Master on a stronger
// model and up to five bots, each bot driving its own browser window. You chat with the Master only.
//
//   npm run prewarm                                  # once, in another terminal (saves ~20 s per run)
//   npm run squad                                    # asks for the task
//   npm run squad -- "Compare the price of the Kindle Paperwhite on amazon.com, bestbuy.com and target.com"
//   npm run squad -- --bots 3 --master-model gpt-6-astra
//
//   you ⇄ Master session (gpt-6.1-sol + web_search) ──MCP──┐
//         Plum · Lime · Tango · Blu · Sky (gpt-6-luna) ──MCP──┴─► tunnel ─► our MCP router (:8788)
//                                                                  └─► one Playwright browser per bot
//
// While it runs, type to the Master at the "you ›" prompt; /status shows the team without a model
// call; /quit (or Ctrl-D) ends the run. The bot windows are tiled on screen, and the bottom-right
// cell is left for this terminal. Output: spikes/out/squad-<timestamp>/ (gitignored)
//   request.json (create bodies, token redacted) · events-<agent>.jsonl · tools.jsonl · mcp.jsonl
//   messages.jsonl · updates.jsonl · plan.jsonl · frames/<bot>/ · result.json · summary.json

import { parseArgs } from "node:util";
import { join, relative } from "node:path";
import { randomBytes } from "node:crypto";
import { createAgentsApi } from "./lib/agents-api.ts";
import { startMcpHttp } from "./lib/mcp-browser-server.ts";
import { PREWARM_FILE, ROOT, createRunLog, createStopper, loadEnv, positiveNumber, requireApiKey, secs } from "./lib/run-kit.ts";
import { hostsIn } from "./lib/site-gate.ts";
import { CAST, Squad } from "./lib/squad.ts";
import { printLine, readTask, startChat } from "./lib/terminal.ts";
import { openQuickTunnel, readPrewarm, waitUntilReachable } from "./lib/tunnel.ts";

loadEnv();

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  allowNegative: true,
  options: {
    task: { type: "string" },
    bots: { type: "string", default: "5" },
    "master-model": { type: "string", default: process.env.MODEL_MASTER ?? "gpt-6.1-sol" },
    "bot-model": { type: "string", default: "gpt-6-luna" },
    "master-effort": { type: "string" },
    "bot-effort": { type: "string" },
    "max-actions": { type: "string", default: "30" },
    timeout: { type: "string", default: "1200" },
    allow: { type: "string" },
    port: { type: "string", default: "8788" },
    "public-url": { type: "string" },
    prewarm: { type: "boolean", default: true },
    headless: { type: "boolean", default: false },
    cursor: { type: "boolean", default: true },
    "web-search": { type: "boolean", default: true },
    fresh: { type: "boolean", default: false },
    once: { type: "boolean", default: false },
    direct: { type: "boolean", default: false },
    warm: { type: "boolean", default: true },
    steer: { type: "boolean", default: true },
    out: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (opt.help) {
  console.log(`Usage: node scripts/squad.ts [options] ["task for the team"]

  With no task given, you're asked for one. Then chat with the Master at the "you ›" prompt:
  /status shows the team, /quit ends the run.

  --bots <n>             Bots available to the Master, 1–5 (default 5; it decides how many to use)
  --master-model <id>    The Master's model (default: MODEL_MASTER or gpt-6.1-sol)
  --bot-model <id>       The bots' model (default: gpt-6-luna)
  --master-effort <lvl>  The Master's reasoning effort: none | low | medium | high (default: model default)
  --bot-effort <lvl>     The bots' reasoning effort (default: model default)
  --max-actions <n>      Browser actions per bot assignment (default: 30)
  --timeout <sec>        The run wraps up after this long: bots stop, the Master answers (default: 1200)
  --allow <hosts>        Comma-separated sites every bot may open ('*' = all). Sites of https:// URLs in
                         the task, bing.com and the sites in the Master's plan are allowed too; the Master
                         decides on any other site a bot asks for.
  --port <n>             MCP port (default: 8788, the one \`npm run prewarm\` tunnels to)
  --public-url <url>     Use an existing tunnel to the MCP port
  --no-prewarm           Start a new tunnel even when \`npm run prewarm\` is running
  --headless             No browser windows
  --no-cursor            Don't draw the bots' cursors in the pages
  --no-web-search        Bots search in the browser instead (the Master always has web_search)
  --fresh                Clean browser profiles (default: spikes/profile/squad-<bot>, which keep cookies
                         and the human checks you solved)
  --once                 End after the Master's first final answer (also the default without a terminal)
  --direct               Let the Master answer simple questions from its own research, without bots
  --no-warm              Don't create the bots' sessions while the Master plans (warm-up saves ~3–5 s
                         before the bots' first actions; costs one tiny turn per bot)
  --no-steer             Hold urgent updates while the Master is mid-turn, instead of sending them so they
                         start its next turn as soon as this one ends
  --out <dir>            Output directory (default: spikes/out/squad-<timestamp>)`);
  process.exit(0);
}

const API_KEY = requireApiKey();
const BOTS = Math.min(CAST.length, Math.round(positiveNumber("bots", opt.bots)));
const MAX_ACTIONS = positiveNumber("max-actions", opt["max-actions"]);
const TIMEOUT_SEC = positiveNumber("timeout", opt.timeout);
const PORT = positiveNumber("port", opt.port, true);
const TASK = await readTask(opt.task ?? positionals.join(" "), { example: 'npm run squad -- "your task"' });
const TOKEN = randomBytes(24).toString("base64url"); // fresh per run (D-12)
const RUN_ID = `run_${Date.now().toString(36)}`;
const INTERACTIVE = Boolean(process.stdin.isTTY && process.stdout.isTTY);

const run = createRunLog({
  prefix: "squad",
  out: opt.out,
  replacer: (_key, value) => (typeof value === "string" && value.length > 5000 ? `[${value.length} chars omitted]` : value),
});
const { log } = run;
const life = new AbortController(); // aborted only at the very end, so a wrap-up can still talk to the API
let ending: Promise<void> | undefined;
let closeTunnel: (() => void) | undefined;
let outcome = "running";

const api = createAgentsApi({ base: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1", key: API_KEY, onHttp: (e) => run.record("http.jsonl", { at: run.elapsed(), ...e }) });

const squad = new Squad({
  api,
  run,
  token: TOKEN,
  runId: RUN_ID,
  masterModel: opt["master-model"]!,
  botModel: opt["bot-model"]!,
  masterEffort: opt["master-effort"],
  botEffort: opt["bot-effort"],
  bots: BOTS,
  maxActions: MAX_ACTIONS,
  webSearch: opt["web-search"]!,
  headless: opt.headless!,
  cursor: opt.cursor!,
  profileRoot: opt.fresh ? undefined : join(ROOT, "spikes/profile"),
  allow: [...hostsIn(TASK), ...(opt.allow ?? "").split(",").map((h) => h.trim()).filter(Boolean)],
  signal: life.signal,
  allowDirect: opt.direct,
  steer: opt.steer,
  onAnswer: () => {
    if (opt.once || !INTERACTIVE) setTimeout(() => void end("answered"), 500);
  },
});

let wrapUpTimer: ReturnType<typeof setTimeout> | undefined;
const stopper = createStopper({
  timeoutSec: TIMEOUT_SEC,
  log,
  onStop: (reason) => {
    if (reason === "timeout" && squad.master && !squad.closing) {
      log("time's up: stopping the bots and asking the Master for its final answer");
      squad.wrapUp("TIME IS UP");
      squad.onAnswerOnce = () => void end("timeout");
      wrapUpTimer = setTimeout(() => void end("timeout"), 75000);
    } else void end(reason);
  },
});

const mcp = await startMcpHttp({
  port: PORT,
  token: TOKEN,
  routes: squad.routes,
  onRequest: (r) => {
    squad.mcpRequests.push(r);
    run.record("mcp.jsonl", { at: run.elapsed(), ...r });
  },
}).catch((err) => {
  console.error(`Couldn't start the MCP server on port ${PORT}: ${err instanceof Error ? err.message : err}. Try --port 0 (no prewarm then).`);
  process.exit(1);
});

/** The public URL of the MCP port: --public-url, the prewarmed tunnel, or a new quick tunnel. */
async function tunnel(): Promise<string> {
  const prewarmed = opt["public-url"] || !opt.prewarm ? undefined : readPrewarm(PREWARM_FILE, mcp.port);
  let url: string;
  if (opt["public-url"]) url = opt["public-url"].replace(/\/+$/, "");
  else if (prewarmed) {
    url = prewarmed.url;
    log(`prewarm on: reusing the tunnel from npm run prewarm (up since ${prewarmed.startedAt.slice(11, 19)}Z)`);
  } else {
    log("starting a cloudflared tunnel (run `npm run prewarm` in another terminal to skip this)…");
    const t = await openQuickTunnel(mcp.port, {
      logFile: join(run.out, "cloudflared.log"),
      onExit: (code) => {
        log(`✗ cloudflared exited (code ${code}): OpenAI can't reach the tools any more`);
        void end("tunnel_closed");
      },
    });
    closeTunnel = t.close;
    url = t.url;
  }
  await waitUntilReachable(url, opt["public-url"] || prewarmed ? { firstWaitMs: 0, timeoutMs: 15000 } : {}).catch((err) => {
    throw new Error(`${err instanceof Error ? err.message : err}${prewarmed ? "; restart npm run prewarm, or use --no-prewarm" : ""}`);
  });
  return url;
}

async function end(reason: string) {
  ending ??= (async () => {
    outcome = outcome === "running" ? reason : outcome;
    clearTimeout(wrapUpTimer);
    chat?.stop();
    stopper.dispose();
    log(`ending (${reason}): stopping sessions and closing the browsers…`);
    await squad.shutdown();
    life.abort();
    closeTunnel?.();
    mcp.server.close();
    const summary = { outcome, ...squad.summary() };
    run.write("summary.json", summary);
    const usageLine = summary.agents
      .filter((a) => a.usage)
      .map((a) => `${a.agent} ${Math.round(a.usage.input_tokens / 1000)}k in / ${Math.round(a.usage.output_tokens / 1000)}k out${a.costUSD !== null ? ` $${a.costUSD.toFixed(4)}` : ""}`)
      .join(" · ");
    console.log(`
── Squad run ──────────────────────────────────────
  outcome   ${outcome}
  answers   ${summary.answers.length}${summary.timingsMs.firstAnswer !== undefined ? ` (first after ${secs(summary.timingsMs.firstAnswer)} s)` : ""}
  bots      ${summary.bots.filter((b) => b.assignments).map((b) => `${b.name} ${b.status} (${b.toolCalls} calls)`).join(" · ") || "none used"}
  Master    ${summary.master.toolCalls} tool calls, ${summary.master.webSearches.length} web searches
  usage     ${usageLine || "not reported"}
  cost      ≈ $${summary.costUSD.toFixed(4)} (model tokens)
  output    ${relative(process.cwd(), run.out) || "."}`);
    process.exit(outcome === "answered" || outcome === "quit" ? 0 : 1);
  })();
  return ending;
}

let chat: ReturnType<typeof startChat> | undefined;

try {
  console.log(`SquadLings squad · you chat with the Master; it runs the bots
  Master  ${opt["master-model"]}${opt["master-effort"] ? ` (effort ${opt["master-effort"]})` : ""} + web_search
  bots    ${CAST.slice(0, BOTS).map((c) => c.name).join(", ")} on ${opt["bot-model"]}, ${MAX_ACTIONS} actions per assignment
  task    ${TASK}
  out     ${relative(process.cwd(), run.out) || "."}
`);
  const [publicUrl] = await Promise.all([tunnel(), squad.launchBrowsers()]);
  squad.publicUrl = publicUrl;
  log(`${BOTS} browser windows open${opt.headless ? " (headless)" : ", tiled"} · tunnel ${publicUrl} reachable`);
  run.write("request.json", squad.requestBodies());
  if (opt.warm) squad.warmBots(); // in parallel with the Master's planning
  await squad.start(TASK);
  chat = startChat({
    prompt: "you › ",
    onLine: (line) => {
      const text = line.trim();
      if (!text) return;
      if (text === "/quit" || text === "/exit") return void end("quit");
      if (text === "/status") return printLine(squad.teamStatus());
      squad.userSays(text);
    },
    onClose: () => void end("quit"),
    onInterrupt: stopper.interrupt,
  });
  if (INTERACTIVE) printLine("  (type to the Master any time · /status · /quit)");
} catch (err) {
  outcome = "error";
  log(`✗ ${err instanceof Error ? err.message : err}`);
  await end("error");
}
