// Prewarm (master.md §35): keeps one cloudflared quick tunnel open to the MCP port, so each agent run
// skips the ~17 s tunnel start and the DNS wait, and repeated runs don't hit trycloudflare's 429 limit.
// Leave it running; `npm run spike:mcp` picks it up from spikes/prewarm.json (--no-prewarm to ignore).
//
//   npm run prewarm                 # tunnel to 127.0.0.1:8788 (the spike's default port)
//   npm run prewarm -- --port 9000  # then: npm run spike:mcp -- --port 9000 "task"

import { parseArgs } from "node:util";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PREWARM_FILE, ROOT, positiveNumber } from "./lib/run-kit.ts";
import { openQuickTunnel, waitUntilReachable } from "./lib/tunnel.ts";

const { values: opt } = parseArgs({ options: { port: { type: "string", default: "8788" } } });
const PORT = positiveNumber("port", opt.port);

const started = performance.now();
const secs = () => ((performance.now() - started) / 1000).toFixed(1);
console.log(`Prewarming a tunnel to 127.0.0.1:${PORT}…`);

const cleanup = () => rmSync(PREWARM_FILE, { force: true });
const tunnel = await openQuickTunnel(PORT, {
  logFile: join(ROOT, "spikes/prewarm-cloudflared.log"),
  onExit: (code) => {
    cleanup();
    console.log(`✗ cloudflared exited (code ${code}); prewarm is off. Run npm run prewarm again.`);
    process.exit(1);
  },
});
// Nothing listens on the port yet, so any answer from the edge (a 502) means DNS and the tunnel work.
await waitUntilReachable(tunnel.url, { anyAnswer: true });
writeFileSync(PREWARM_FILE, JSON.stringify({ url: tunnel.url, port: PORT, pid: process.pid, startedAt: new Date().toISOString() }, null, 2));

console.log(`✓ prewarm on after ${secs()} s: ${tunnel.url} → 127.0.0.1:${PORT}
  Leave this running. In another terminal:  npm run spike:mcp -- "your task"
  Ctrl+C turns prewarm off.`);

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => {
    tunnel.close();
    cleanup();
    console.log("\nprewarm off");
    process.exit(0);
  });
}
setInterval(() => {}, 1 << 30); // stay alive until a signal
