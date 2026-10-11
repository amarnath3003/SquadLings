// A cloudflared quick tunnel to a local port (master.md §8.2: only the MCP port is public).

import { spawn } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { Resolver } from "node:dns/promises";
import { get as httpsGet } from "node:https";

type TunnelOpts = { logFile: string; onExit?: (code: number | null) => void };

/**
 * Starts `cloudflared tunnel --url` and resolves with the public https://….trycloudflare.com URL.
 * trycloudflare.com answers 429 when several quick tunnels start at once (4 parallel eval runs,
 * live 2026-10-10), so a rate-limited start is retried after 5, 10 and 20 s (plus jitter).
 */
export async function openQuickTunnel(port: number, opts: TunnelOpts): Promise<{ url: string; close: () => void }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await startQuickTunnel(port, opts);
    } catch (err: any) {
      if (!err?.rateLimited || attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 5000 * 2 ** attempt + Math.random() * 3000));
    }
  }
}

function startQuickTunnel(port: number, opts: TunnelOpts): Promise<{ url: string; close: () => void }> {
  const log = createWriteStream(opts.logFile, { flags: "a" });
  const child = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`], { stdio: ["ignore", "pipe", "pipe"] });
  let closing = false; // our own close() isn't an unexpected exit
  let rateLimited = false;
  return new Promise((resolve, reject) => {
    let url: string | undefined;
    const timer = setTimeout(() => reject(new Error(`cloudflared didn't print a tunnel URL within 30 s (see ${opts.logFile})`)), 30000);
    const onData = (d: Buffer) => {
      log.write(d);
      if (/status 429/.test(String(d))) rateLimited = true;
      const m = !url && /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(d));
      if (m) {
        url = m[0];
        clearTimeout(timer);
        resolve({
          url,
          close: () => {
            closing = true;
            child.kill();
          },
        });
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`cloudflared failed to start (${err.message}). Install it: brew install cloudflared`));
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (!url) {
        const err: any = new Error(`cloudflared exited with code ${code}${rateLimited ? " (rate-limited: 429)" : ""} (see ${opts.logFile})`);
        err.rateLimited = rateLimited;
        reject(err);
      }
      else if (!closing) opts.onExit?.(code);
    });
  });
}

// Public resolvers, not the system one: macOS caches an early "no such host" for a new quick tunnel,
// which made every retry fail (live, 2026-10-10).
const publicDns = new Resolver();
publicDns.setServers(["1.1.1.1", "8.8.8.8"]);

/** GET `<url><path>` with the host resolved through public DNS; true when `accept(status, body)` says so. */
function probe(url: string, path: string, accept: (status: number, body: string) => boolean): Promise<boolean> {
  return new Promise((done) => {
    const lookup: any = (host: string, options: { all?: boolean }, cb: (...args: any[]) => void) => {
      publicDns.resolve4(host).then(
        (ips) => (options?.all ? cb(null, ips.map((address) => ({ address, family: 4 }))) : cb(null, ips[0], 4)),
        (err) => cb(err),
      );
    };
    const req = httpsGet(`${url}${path}`, { lookup, timeout: 5000 }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => done(accept(res.statusCode ?? 0, body)));
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => done(false));
  });
}

/**
 * Waits until `<url><path>` answers 200 "ok" from the internet side. For a new tunnel the first
 * lookup waits 10 s: resolvers cache an early "no such host" for about a minute (seen live), and
 * that would hit OpenAI's too. A prewarmed tunnel already resolves, so `firstWaitMs: 0`.
 * `anyAnswer` accepts any HTTP status (the edge is up even if nothing listens on the port yet).
 */
export async function waitUntilReachable(url: string, opts: { path?: string; timeoutMs?: number; firstWaitMs?: number; anyAnswer?: boolean } = {}) {
  const { path = "/healthz", timeoutMs = 70000, firstWaitMs = 10000, anyAnswer = false } = opts;
  const deadline = Date.now() + timeoutMs;
  const accept = anyAnswer ? (status: number) => status > 0 : (status: number, body: string) => status === 200 && body === "ok";
  if (firstWaitMs) await new Promise((r) => setTimeout(r, firstWaitMs));
  while (Date.now() < deadline) {
    if (await probe(url, path, accept)) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`${url}${path} isn't reachable after ${Math.round(timeoutMs / 1000)} s`);
}

/** What `npm run prewarm` leaves for the spikes: a live quick tunnel to `port`. */
export type Prewarm = { url: string; port: number; pid: number; startedAt: string };

/** The prewarmed tunnel in `file`, if its process is still running and it points at `port`. */
export function readPrewarm(file: string, port: number): Prewarm | undefined {
  try {
    const p = JSON.parse(readFileSync(file, "utf8")) as Prewarm;
    if (p.port !== port) return undefined;
    process.kill(p.pid, 0); // throws if the process is gone
    return p;
  } catch {
    return undefined;
  }
}
