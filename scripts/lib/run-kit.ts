// Shared plumbing for the spikes: .env, the output folder, a timestamped log, JSON recording,
// and stopping cleanly on a timeout or Ctrl-C.

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { printLine } from "./terminal.ts";

export const ROOT = resolve(import.meta.dirname, "../..");

/** Written by `npm run prewarm` while its tunnel is up (scripts/prewarm.ts). */
export const PREWARM_FILE = join(ROOT, "spikes/prewarm.json");

/** Loads .env.local, then .env. loadEnvFile never overrides a variable that's set, so the first file wins. */
export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = join(ROOT, file);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

export function requireApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error("OPENAI_API_KEY is not set. Copy .env.example to .env and add your key.");
    process.exit(1);
  }
  return key;
}

/** Parses a positive number option, or exits with a message. */
export function positiveNumber(name: string, value: string | undefined, allowZero = false): number {
  const n = Number(value);
  if (!(allowZero ? n >= 0 : n > 0)) {
    console.error(`--${name} must be a ${allowZero ? "non-negative" : "positive"} number (got "${value}")`);
    process.exit(1);
  }
  return n;
}

export const secs = (ms: number) => (ms / 1000).toFixed(1);

/**
 * Today where the user is, for prompts: "2026-10-11 (Sunday, 03:12 in Asia/Kolkata); tomorrow is
 * 2026-10-12 (Monday)". The UTC date (toISOString) made "tomorrow" a day early for a user east of UTC
 * after their midnight (live, 2026-10-11). Even with the local date in its instructions, the Master
 * once planned from the UTC date ("tomorrow relative to user's UTC date Oct 10", live 2026-10-11), so
 * tomorrow is spelled out too.
 */
export function localToday(now = new Date()): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const day = (d: Date) => `${d.toLocaleDateString("en-CA")} (${d.toLocaleDateString("en-US", { weekday: "long" })}`; // YYYY-MM-DD, local
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
  return `${day(now)}, ${time} in ${tz}); tomorrow is ${day(tomorrow)})`;
}
export const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
export const countBy = <T>(xs: T[], key: (x: T) => string) =>
  xs.reduce<Record<string, number>>((m, x) => ((m[key(x)] = (m[key(x)] ?? 0) + 1), m), {});

type Replacer = (key: string, value: unknown) => unknown;

export type RunLog = {
  out: string;
  elapsed: () => number;
  log: (msg: string) => void;
  /** Appends one JSON line to a file in the output folder. */
  record: (file: string, entry: unknown) => void;
  /** Writes a file in the output folder (objects as pretty JSON). */
  write: (file: string, data: unknown) => void;
};

/** Creates spikes/out/<prefix>-<timestamp>/ (or `out`) and the log/record helpers for it. */
export function createRunLog(opts: { prefix: string; out?: string; dirs?: string[]; replacer?: Replacer; print?: (line: string) => void }): RunLog {
  const out = resolve(opts.out ?? join(ROOT, "spikes/out", `${opts.prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}`));
  mkdirSync(out, { recursive: true });
  for (const dir of opts.dirs ?? []) mkdirSync(join(out, dir), { recursive: true });
  const t0 = performance.now();
  const elapsed = () => Math.round(performance.now() - t0);
  return {
    out,
    elapsed,
    log: (msg) => (opts.print ?? printLine)(`[${secs(elapsed()).padStart(6)}s] ${msg}`),
    record: (file, entry) => appendFileSync(join(out, file), JSON.stringify(entry, opts.replacer) + "\n"),
    write: (file, data) => writeFileSync(join(out, file), typeof data === "string" ? data : JSON.stringify(data, opts.replacer, 2)),
  };
}

/**
 * Stops a run on a timeout or Ctrl-C: calls `onStop` once with the reason and aborts `signal`, which
 * closes the event stream and ends any open question. A second Ctrl-C exits at once.
 */
export function createStopper(opts: { timeoutSec: number; log: (msg: string) => void; onStop: (reason: string) => void }) {
  const controller = new AbortController();
  const stop = (reason: string) => {
    if (!controller.signal.aborted) opts.onStop(reason);
    controller.abort();
  };
  const timer = setTimeout(() => {
    opts.log(`timeout after ${opts.timeoutSec} s`);
    stop("timeout");
  }, opts.timeoutSec * 1000);
  let presses = 0;
  const interrupt = () => {
    if (++presses > 1) process.exit(130);
    opts.log("interrupted: cancelling the turn and cleaning up (Ctrl-C again to quit now)");
    stop("interrupted");
  };
  process.on("SIGINT", interrupt);
  return {
    signal: controller.signal,
    stop,
    interrupt,
    /** Clears the timer and aborts the signal (closes the stream) without counting as a stop. */
    dispose: () => {
      clearTimeout(timer);
      controller.abort();
    },
  };
}
