// Run on the laptop that already has `npm run ui` running; no backend restart needed.
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ROOT, positiveNumber } from "./lib/run-kit.ts";
import { startShareServer } from "./lib/share-server.ts";
import { openQuickTunnel } from "./lib/tunnel.ts";

const { values: options } = parseArgs({
  options: {
    port: { type: "string", default: "8790" },
    target: { type: "string", default: "http://127.0.0.1:8787" },
    frontend: { type: "string", default: "https://squadlings.vercel.app" },
    "no-open": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});
if (options.help) {
  console.log(`Usage: npm run share -- [--target http://127.0.0.1:8787] [--port 8790]
  [--frontend https://squadlings.vercel.app] [--no-open]

Run beside an existing dashboard on this laptop. Starts an authenticated bridge and a separate
Cloudflare tunnel for the hosted frontend. Saves a private connection link under spikes/out/share-ui/.
Keep this terminal, the dashboard, and the laptop awake. Ctrl+C closes sharing without stopping agents.`);
  process.exit(0);
}

const output = join(ROOT, "spikes/out/share-ui");
mkdirSync(output, { recursive: true, mode: 0o700 });
chmodSync(output, 0o700);
let bridge: Awaited<ReturnType<typeof startShareServer>> | undefined;
let tunnel: Awaited<ReturnType<typeof openQuickTunnel>> | undefined;
let closing = false;
const stop = () => {
  if (closing) return;
  closing = true;
  tunnel?.close();
  bridge?.close();
};
process.on("SIGINT", () => { stop(); process.exit(0); });
process.on("SIGTERM", () => { stop(); process.exit(0); });

try {
  const target = new URL(options.target);
  if (target.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(target.hostname)) throw new Error("--target must be the local dashboard address.");
  const response = await fetch(new URL("/api/config", target), { signal: AbortSignal.timeout(5000) });
  if (!response.ok || !(await response.json()).defaults) throw new Error("The target is not a running SquadLings dashboard.");
  const token = randomBytes(32).toString("base64url");
  bridge = await startShareServer({ port: positiveNumber("port", options.port), target: options.target, frontend: options.frontend, token });
  console.log(`Sharing bridge listening on 127.0.0.1:${bridge.port}; connecting its tunnel…`);
  tunnel = await openQuickTunnel(bridge.port, {
    logFile: join(output, "cloudflared.log"),
    onExit: () => { console.error("The sharing tunnel closed. Run npm run share again to reconnect."); stop(); process.exitCode = 1; },
  });
  const link = new URL(options.frontend);
  link.pathname = "/app";
  link.hash = new URLSearchParams({ backend: tunnel.url, key: token }).toString();
  const inviteFile = join(output, "connect.txt");
  writeFileSync(inviteFile, `${link.href}\n`, { mode: 0o600 });
  chmodSync(inviteFile, 0o600);
  console.log(`Laptop address: ${tunnel.url}`);
  console.log(`Private connection link saved to ${inviteFile} (keep it private; it grants control of this squad).`);
  console.log("Keep this terminal and the dashboard running. A new sharing session creates a new key and link.");
  if (!options["no-open"]) {
    const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer.exe" : "xdg-open";
    const child = spawn(command, [link.href], { stdio: "ignore", detached: true });
    child.on("error", () => console.log("Open the saved connection link in your browser."));
    child.unref();
  }
} catch (err) {
  stop();
  console.error(`Couldn't share the dashboard: ${err instanceof Error ? err.message : String(err)}. Keep npm run ui running and install cloudflared on this laptop.`);
  process.exitCode = 1;
}
