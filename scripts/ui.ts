// SquadLings dashboard (a basic Phase 2 stand-in, master.md §19): chat with the Master and watch
// every bot's browser live, in one page. Replaces the terminal chat and the tiled windows.
//
//   npm run prewarm      # once, in another terminal (saves ~20 s on the first run)
//   npm run ui           # opens http://127.0.0.1:8787
//
//   dashboard (browser) ⇄ 127.0.0.1:8787  REST + WebSocket: events, live frames, your messages
//                          └─ SquadRunner → Squad (Master + up to 5 bots, headless browsers)
//   OpenAI Agents API ──► tunnel ──► 127.0.0.1:8788  MCP router (the only public port)
//
// The task and the squad's settings come from the dashboard. Each run writes
// spikes/out/ui-<timestamp>/: events.jsonl, log.txt, tools/messages/updates/plan .jsonl,
// frames/<bot>/ keyframes, result.json, summary.json.

import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { startMcpHttp } from "./lib/mcp-browser-server.ts";
import { PRICES } from "./lib/pricing.ts";
import { PREWARM_FILE, ROOT, loadEnv, positiveNumber, requireApiKey } from "./lib/run-kit.ts";
import { SquadRunner } from "./lib/squad-runner.ts";
import type { RunOptions } from "./lib/squad-runner.ts";
import { openQuickTunnel, readPrewarm, waitUntilReachable } from "./lib/tunnel.ts";
import { startUiServer } from "./lib/ui-server.ts";
import type { TunnelState } from "./lib/ui-server.ts";
import { existsSync } from "node:fs";

loadEnv();

const { values: opt } = parseArgs({
  allowNegative: true,
  options: {
    port: { type: "string", default: "8787" },
    "mcp-port": { type: "string", default: "8788" },
    "public-url": { type: "string" },
    prewarm: { type: "boolean", default: true },
    open: { type: "boolean", default: true },
    warm: { type: "boolean", default: true },
    verbose: { type: "boolean", default: false },
    classic: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (opt.help) {
  console.log(`Usage: npm run ui [-- options]

  Opens the SquadLings dashboard: type the task, pick the squad, chat with the Master, and watch every
  bot's browser live. The settings (bots, models, actions, time limit…) are on the page.

  --port <n>          Dashboard port (default 8787, on 127.0.0.1 only)
  --mcp-port <n>      MCP port (default 8788, the one \`npm run prewarm\` tunnels to)
  --public-url <url>  Use an existing tunnel to the MCP port
  --no-prewarm        Start a new tunnel even when \`npm run prewarm\` is running
  --no-open           Don't open the dashboard in your browser
  --no-warm           Don't create the bots' sessions while the Master plans
  --verbose           Print the squad's log here too (it's always in each run's log.txt)
  --classic           Serve the old dashboard (ui/) instead of the new one (web/, built by \`npm run ui\`)`);
  process.exit(0);
}

const API_KEY = requireApiKey();
const PORT = positiveNumber("port", opt.port, true);
const MCP_PORT = positiveNumber("mcp-port", opt["mcp-port"], true);
// The dashboard: the new one (web/, React, built into web/dist by `npm run ui`), or the old one (ui/).
const BUILT = existsSync(join(ROOT, "web/dist/index.html"));
if (!opt.classic && !BUILT) console.error("No web/dist (run `npm --prefix web install` once, then `npm run ui`); serving the old dashboard.");
const STATIC = opt.classic || !BUILT ? join(ROOT, "ui") : join(ROOT, "web/dist");
const say = (line: string) => console.log(`[${new Date().toLocaleTimeString("en-GB")}] ${line}`);

const DEFAULTS: RunOptions = {
  bots: 5,
  masterModel: process.env.MODEL_MASTER ?? "gpt-6.1-sol",
  botModel: "gpt-6-luna",
  maxActions: 30,
  timeoutMin: 20,
  webSearch: true,
  allowDirect: false,
  allow: [],
  fresh: false,
};
const models = Object.keys(PRICES);
const MODELS = { master: [...new Set([DEFAULTS.masterModel, ...models])], bot: [...new Set([DEFAULTS.botModel, ...models])] };

// ── Tunnel: one for the server's life, shared by every run ──

let tunnel: TunnelState = { state: "starting" };
let tunnelJob: Promise<string> | undefined;
let closeTunnel: (() => void) | undefined;
let ui: Awaited<ReturnType<typeof startUiServer>> | undefined;

function setTunnel(t: TunnelState) {
  tunnel = t;
  ui?.tunnelChanged();
}

/** The MCP port's public URL: --public-url, the prewarmed tunnel, or a quick tunnel of our own. Retried on the next run after a failure. */
function publicUrl(): Promise<string> {
  tunnelJob ??= (async () => {
    setTunnel({ state: "starting" });
    try {
      const prewarmed = opt["public-url"] || !opt.prewarm ? undefined : readPrewarm(PREWARM_FILE, mcp.port);
      let url: string;
      let source: string;
      if (opt["public-url"]) [url, source] = [opt["public-url"].replace(/\/+$/, ""), "--public-url"];
      else if (prewarmed) [url, source] = [prewarmed.url, "prewarm"];
      else {
        say("starting a cloudflared tunnel to the MCP port (run `npm run prewarm` in another terminal to skip this)…");
        const t = await openQuickTunnel(mcp.port, {
          logFile: join(ROOT, "spikes/ui-cloudflared.log"),
          onExit: (code) => {
            say(`✗ cloudflared exited (code ${code}); the next run starts a new tunnel`);
            tunnelJob = undefined;
            closeTunnel = undefined;
            setTunnel({ state: "failed", error: "The tunnel closed. The next run starts a new one." });
          },
        });
        closeTunnel = t.close;
        [url, source] = [t.url, "quick tunnel"];
      }
      await waitUntilReachable(url, source === "quick tunnel" ? {} : { firstWaitMs: 0, timeoutMs: 15000 });
      setTunnel({ state: "ready", url, source });
      say(`tools reachable through ${source}: ${url}`);
      return url;
    } catch (err) {
      tunnelJob = undefined;
      closeTunnel?.();
      closeTunnel = undefined;
      const error = `${err instanceof Error ? err.message : err}${opt.prewarm && !opt["public-url"] ? " (restart npm run prewarm, or start with --no-prewarm)" : ""}`;
      setTunnel({ state: "failed", error });
      throw new Error(`The tools tunnel isn't reachable: ${error}`);
    }
  })();
  return tunnelJob;
}

// ── Servers ──

const runner = new SquadRunner({
  apiKey: API_KEY,
  apiBase: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  publicUrl,
  verbose: opt.verbose,
  warm: opt.warm,
  log: say,
});

const mcp = await startMcpHttp({
  port: MCP_PORT,
  token: runner.token,
  routes: runner.routes,
  onRequest: (r) => runner.current?.onMcp(r),
}).catch((err) => {
  console.error(`Couldn't start the MCP server on port ${MCP_PORT}: ${err instanceof Error ? err.message : err}. Is \`npm run squad\` or another dashboard running? Try --mcp-port 0 (no prewarm then).`);
  process.exit(1);
});

ui = await startUiServer({ port: PORT, staticDir: STATIC, runner, defaults: DEFAULTS, models: MODELS, tunnel: () => tunnel }).catch((err) => {
  console.error(`Couldn't start the dashboard on port ${PORT}: ${err instanceof Error ? err.message : err}. Try --port 0.`);
  process.exit(1);
});

say(`SquadLings dashboard → ${ui.url}   (Ctrl+C to quit)`);
void publicUrl().catch(() => {}); // get the tunnel ready before the first run
if (opt.open && process.platform === "darwin") spawn("open", [ui.url], { stdio: "ignore", detached: true }).unref();

let quitting = false;
async function quit() {
  if (quitting) process.exit(130);
  quitting = true;
  say("quitting: ending the run and closing the browsers… (Ctrl+C again to force)");
  await runner.shutdown().catch(() => {});
  closeTunnel?.();
  ui?.close();
  mcp.server.close();
  process.exit(0);
}
process.on("SIGINT", () => void quit());
process.on("SIGTERM", () => void quit());
