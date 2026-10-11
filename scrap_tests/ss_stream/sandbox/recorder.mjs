// Sidecar recorder. Runs INSIDE the OpenAI-hosted sandbox, next to the hosted browser.
//
// ss-stream.ts uploads this file to /workspace/ss_stream/recorder.mjs and starts it in the
// background (from a setup command, or by asking the agent to run it). It then:
//   1. probes the sandbox: X displays, listening ports, DevTools (CDP) endpoints, capture tools,
//      browser-related processes, and the hosted browser skill's files
//   2. looks for a way to see the browser's screen (CDP Page.captureScreenshot, else an X display)
//   3. captures about one frame per second
//   4. saves frames under /workspace/outputs/sidecar/ (published as artifacts when the turn ends)
//   5. POSTs each frame, probe and log line to SS_PUSH_URL (our laptop, through a tunnel) when set
//
// Plain Node, no packages. Every failure is logged and the recorder keeps going; it must never
// make the setup command fail, or the agent won't start.

import { execFile } from "node:child_process";
import dns from "node:dns/promises";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OUT = process.env.SS_OUT || "/workspace/outputs/sidecar"; // SS_OUT: for local testing only
const FRAMES = path.join(OUT, "frames");
const INTERVAL_MS = Number(process.env.SS_INTERVAL_MS) || 1000;
const MAX_SECONDS = Number(process.env.SS_MAX_SECONDS) || 900;
const MAX_FRAMES = Number(process.env.SS_MAX_FRAMES) || 600;
const PUSH = process.env.SS_PUSH_URL || ""; // has a secret token in its path
const run = promisify(execFile);
const T0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sinceStart = () => Date.now() - T0;

fs.mkdirSync(FRAMES, { recursive: true });

// ── Reporting ─────────────────────────────────────────

let pushFailures = 0;
let inflight = 0;

// The hosted sandbox only reaches the internet through HTTPS_PROXY (live run 2026-10-10), which
// Node's fetch ignores. curl honours it, so pushes go through curl when a proxy is set.
const PROXIED = Boolean(process.env.HTTPS_PROXY || process.env.https_proxy) && Boolean(which("curl"));

function curlPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const args = ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "-m", "5", "-X", "POST", "--data-binary", "@-"];
    for (const [k, v] of Object.entries(headers)) args.push("-H", `${k}: ${v}`);
    const child = execFile("curl", [...args, url], { timeout: 7000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message).trim().slice(0, 200)));
      const code = Number(stdout);
      code >= 200 && code < 300 ? resolve() : reject(new Error(`HTTP ${stdout}`));
    });
    child.stdin.end(body);
  });
}

async function push(kind, body, extra = {}) {
  if (!PUSH || inflight >= 3) return;
  inflight++;
  const headers = {
    "content-type": kind === "frame" ? "image/jpeg" : "application/json",
    "x-ss-kind": kind,
    "x-ss-wall": String(Date.now()),
    "x-ss-since-start": String(sinceStart()),
    ...extra,
  };
  try {
    if (PROXIED) {
      await curlPost(PUSH, headers, body);
    } else {
      const res = await fetch(PUSH, { method: "POST", headers, body, signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    if (pushFailures++ < 5) fs.appendFileSync(path.join(OUT, "recorder.log"), `push ${kind} failed: ${err?.message ?? err}\n`);
  } finally {
    inflight--;
  }
}

function log(msg) {
  const line = `${(sinceStart() / 1000).toFixed(1)}s ${msg}`;
  fs.appendFileSync(path.join(OUT, "recorder.log"), line + "\n");
  void push("log", JSON.stringify({ line }));
}

process.on("uncaughtException", (err) => log(`uncaught: ${err?.stack ?? err}`));
process.on("unhandledRejection", (err) => log(`unhandled: ${err?.stack ?? err}`));

/** Tokens in command lines or env values never leave the sandbox. */
function redact(text) {
  return String(text)
    .replace(/(--?[\w-]*(?:token|key|secret|password|passwd|auth|cookie|session)[\w-]*[=\s])\S+/gi, "$1[redacted]")
    .replace(/([?&][\w-]*(?:token|key|secret|sig|auth)[\w-]*=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\/\/[^/@\s]+@/g, "//[redacted]@")
    .replace(/\b(sk|ek|rk)-[A-Za-z0-9_-]{8,}/g, "[redacted]");
}

async function sh(cmd, args, { timeout = 4000, input } = {}) {
  try {
    const p = run(cmd, args, { timeout, maxBuffer: 30e6, encoding: "buffer" });
    if (input) p.child.stdin.end(input);
    const { stdout } = await p;
    return stdout;
  } catch {
    return null;
  }
}

// ── Probe ─────────────────────────────────────────────

function which(name) {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    const file = path.join(dir, name);
    try {
      fs.accessSync(file, fs.constants.X_OK);
      return file;
    } catch {}
  }
  return null;
}

/** Listening TCP sockets from /proc/net/tcp{,6}; no `ss` or `netstat` needed. */
function listeningPorts() {
  const out = [];
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols[3] !== "0A") continue; // 0A = LISTEN
      const [hexAddr, hexPort] = cols[1].split(":");
      const port = parseInt(hexPort, 16);
      const addr = hexAddr.length === 8 ? hexAddr.match(/../g).reverse().map((h) => parseInt(h, 16)).join(".") : `v6:${hexAddr}`;
      out.push({ addr, port });
    }
  }
  return out;
}

function processes() {
  const out = [];
  let pids = [];
  try {
    pids = fs.readdirSync("/proc").filter((d) => /^\d+$/.test(d));
  } catch {}
  for (const pid of pids) {
    try {
      const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" ").trim();
      if (cmd) out.push({ pid: Number(pid), cmd: redact(cmd).slice(0, 400) });
    } catch {}
  }
  return out;
}

function displays() {
  try {
    return fs.readdirSync("/tmp/.X11-unix").filter((f) => /^X\d+$/.test(f)).map((f) => `:${f.slice(1)}`);
  } catch {
    return [];
  }
}

/** Env var names, plus redacted values for the ones that might point at a browser or display. */
function envInfo() {
  const interesting = /DISPLAY|WAYLAND|CDP|CHROM|BROWSER|PLAYWRIGHT|PUPPETEER|DEVTOOLS|PROXY|VNC|DESKTOP|SCREEN/i;
  const values = {};
  for (const [k, v] of Object.entries(process.env)) if (interesting.test(k) && k !== "SS_PUSH_URL") values[k] = redact(v).slice(0, 200);
  return { names: Object.keys(process.env).sort(), values };
}

/** Copies the hosted browser skill's text files so we can read how the agent drives the browser. */
function copySkillFiles() {
  const root = "/workspace/.managed-agents";
  const dest = path.join(OUT, "skill-copy");
  const listing = [];
  let copied = 0;
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      let size = 0;
      try {
        size = fs.statSync(full).size;
      } catch {}
      listing.push({ path: full, size });
      if (/\.(md|txt|json|ya?ml|toml|py|m?js|ts|sh)$/i.test(e.name) && size < 300_000 && copied < 3_000_000) {
        try {
          const target = path.join(dest, path.relative(root, full));
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, redact(fs.readFileSync(full, "utf8")));
          copied += size;
        } catch {}
      }
    }
  };
  walk(root, 0);
  return listing;
}

async function getJson(url, ms = 800) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
    const text = await res.text();
    try {
      return { status: res.status, json: JSON.parse(text) };
    } catch {
      return { status: res.status, text: text.slice(0, 200) };
    }
  } catch (err) {
    return { error: String(err?.cause?.code ?? err?.message ?? err) };
  }
}

/** HTTP bases that might be a DevTools endpoint: local listening ports and URLs found in env vars. */
function cdpCandidates() {
  const bases = new Set();
  for (const { port } of listeningPorts()) bases.add(`http://127.0.0.1:${port}`);
  for (const [k, v] of Object.entries(process.env)) {
    if (k === "SS_PUSH_URL" || !/CDP|CHROM|BROWSER|DEVTOOLS|PLAYWRIGHT|PUPPETEER/i.test(k)) continue;
    try {
      const u = new URL(v);
      if (/^(https?|wss?):$/.test(u.protocol)) bases.add(`${u.protocol.replace("ws", "http")}//${u.host}`);
    } catch {}
  }
  return [...bases];
}

async function findCdp() {
  const checks = await Promise.all(cdpCandidates().map(async (base) => ({ base, r: await getJson(`${base}/json/version`) })));
  return checks
    .filter(({ r }) => r.json?.webSocketDebuggerUrl || r.json?.Browser)
    .map(({ base, r }) => ({ base, browser: r.json.Browser, protocol: r.json["Protocol-Version"] }));
}

/** Resolves the non-local hosts in NO_PROXY (the services the sandbox talks to directly). DNS only. */
async function directHosts() {
  const names = (process.env.NO_PROXY ?? process.env.no_proxy ?? "").split(",").map((h) => h.trim()).filter((h) => h && !/^(localhost|127\.|::1$|\d+\.\d+)/.test(h));
  const out = {};
  for (const name of names) {
    try {
      out[name] = (await dns.lookup(name, { all: true })).map((a) => a.address);
    } catch (err) {
      out[name] = String(err?.code ?? err);
    }
  }
  return out;
}

let probes = 0;
async function probe(reason) {
  const tools = Object.fromEntries(
    ["node", "python3", "curl", "ffmpeg", "import", "convert", "xwd", "scrot", "grim", "xdotool", "Xvfb", "x11vnc", "websockify",
     "chromium", "chromium-browser", "google-chrome", "chrome", "playwright"].map((t) => [t, which(t)]),
  );
  const report = {
    reason,
    sinceStartMs: sinceStart(),
    node: process.version,
    hasWebSocket: typeof WebSocket === "function",
    uid: process.getuid?.(),
    host: os.hostname(),
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpus: os.cpus().length,
    displays: displays(),
    ports: listeningPorts(),
    cdp: await findCdp(),
    tools,
    env: envInfo(),
    directHosts: await directHosts(),
    processes: processes().filter((p) => p.pid !== process.pid),
    skillFiles: copySkillFiles(), // every probe: the browser skill is mounted after setup ends
  };
  const file = path.join(OUT, `probe-${String(++probes).padStart(2, "0")}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  void push("probe", JSON.stringify(report));
  log(`probe ${probes} (${reason}): displays=${report.displays.join(",") || "none"} ports=${report.ports.map((p) => p.port).join(",") || "none"} cdp=${report.cdp.map((c) => c.base).join(",") || "none"}`);
  return report;
}

// ── Capture methods ───────────────────────────────────

/** A tiny CDP client over the global WebSocket (Node 22+). */
class Cdp {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
  }
  open() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      const timer = setTimeout(() => reject(new Error("CDP connect timeout")), 4000);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = () => reject(new Error("CDP socket error"));
      ws.onclose = () => {
        for (const { reject: r } of this.pending.values()) r(new Error("CDP closed"));
        this.pending.clear();
        this.closed = true;
      };
      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString());
        } catch {
          return;
        }
        const p = msg.id && this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
      };
      this.ws = ws;
    });
  }
  send(method, params = {}, ms = 4000) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timeout`));
      }, ms);
    });
  }
  close() {
    try {
      this.ws?.close();
    } catch {}
  }
}

/** Screenshots the browser's active page through CDP; re-picks the page every few seconds. */
function cdpMethod(base) {
  let client = null;
  let target = null;
  let pickedAt = 0;
  return {
    name: `cdp ${base}`,
    async capture() {
      if (!client || client.closed || Date.now() - pickedAt > 5000) {
        const list = await getJson(`${base}/json/list`, 1500);
        const pages = (Array.isArray(list.json) ? list.json : []).filter(
          (t) => t.type === "page" && t.webSocketDebuggerUrl && !/^(devtools|chrome-extension|chrome):/.test(t.url ?? ""),
        );
        const next = pages[0]; // DevTools lists the most recently active page first
        if (!next) throw new Error("no page targets");
        if (!target || next.id !== target.id || !client || client.closed) {
          client?.close();
          client = new Cdp(next.webSocketDebuggerUrl);
          await client.open();
          target = next;
        }
        target = { ...target, url: next.url, title: next.title };
        pickedAt = Date.now();
      }
      const shot = await client.send("Page.captureScreenshot", { format: "jpeg", quality: 60 });
      return { buf: Buffer.from(shot.data, "base64"), title: target.title, url: redact(target.url ?? "") };
    },
  };
}

function x11Methods(display) {
  const methods = [];
  if (which("import")) methods.push({ name: `import ${display}`, capture: async () => ({ buf: await sh("import", ["-silent", "-display", display, "-window", "root", "-quality", "60", "jpg:-"]) }) });
  if (which("ffmpeg"))
    methods.push({
      name: `ffmpeg x11grab ${display}`,
      capture: async () => ({ buf: await sh("ffmpeg", ["-loglevel", "error", "-f", "x11grab", "-i", display, "-frames:v", "1", "-q:v", "6", "-f", "mjpeg", "-"]) }),
    });
  if (which("xwd") && which("convert"))
    methods.push({
      name: `xwd ${display}`,
      capture: async () => ({ buf: await sh("sh", ["-c", `xwd -root -silent -display ${display} | convert xwd:- -quality 60 jpg:-`]) }),
    });
  return methods;
}

async function discover() {
  const candidates = [];
  if (typeof WebSocket === "function") for (const { base } of await findCdp()) candidates.push(cdpMethod(base));
  for (const d of displays()) candidates.push(...x11Methods(d));
  for (const m of candidates) {
    try {
      const shot = await m.capture();
      if (shot?.buf?.length > 1000 && shot.buf[0] === 0xff && shot.buf[1] === 0xd8) {
        log(`capture method works: ${m.name} (${shot.buf.length} bytes)`);
        return m;
      }
      log(`capture method gave no JPEG: ${m.name}`);
    } catch (err) {
      log(`capture method failed: ${m.name}: ${err?.message ?? err}`);
    }
  }
  return null;
}

// ── Main loop ─────────────────────────────────────────

log(`recorder started (node ${process.version}, push ${PUSH ? (PROXIED ? "on, via curl and HTTPS_PROXY" : "on") : "off"}, every ${INTERVAL_MS} ms, max ${MAX_SECONDS} s)`);
await probe("start");

const probeAt = [10_000, 20_000, 30_000, 60_000, 120_000]; // the browser may start after setup ends
let method = null;
let lastDiscover = 0;
let frames = 0;
let failuresInRow = 0;

while (sinceStart() < MAX_SECONDS * 1000 && frames < MAX_FRAMES) {
  const tick = Date.now();
  if (probeAt.length && sinceStart() >= probeAt[0]) {
    probeAt.shift();
    await probe("scheduled");
  }
  if (!method && tick - lastDiscover > 5000) {
    lastDiscover = tick;
    method = await discover();
    if (method) await probe(`method found: ${method.name}`);
  }
  if (method) {
    try {
      const shot = await method.capture();
      if (!shot?.buf?.length) throw new Error("empty frame");
      frames++;
      failuresInRow = 0;
      const name = `${String(frames).padStart(5, "0")}-${Date.now()}.jpg`;
      fs.writeFileSync(path.join(FRAMES, name), shot.buf);
      fs.appendFileSync(path.join(OUT, "frames.jsonl"), JSON.stringify({ n: frames, file: name, wallMs: Date.now(), sinceStartMs: sinceStart(), method: method.name, bytes: shot.buf.length, title: shot.title, url: shot.url }) + "\n");
      void push("frame", shot.buf, { "x-ss-n": String(frames), "x-ss-method": method.name, "x-ss-title": encodeURIComponent(shot.title ?? ""), "x-ss-url": encodeURIComponent(shot.url ?? "") });
    } catch (err) {
      if (++failuresInRow >= 5) {
        log(`capture keeps failing (${err?.message ?? err}); looking for another method`);
        method = null;
        failuresInRow = 0;
      }
    }
  }
  fs.writeFileSync(path.join(OUT, "heartbeat.json"), JSON.stringify({ sinceStartMs: sinceStart(), wallMs: Date.now(), frames, method: method?.name ?? null }));
  await sleep(Math.max(50, INTERVAL_MS - (Date.now() - tick)));
}
log(`recorder finished: ${frames} frames`);
await sleep(1500); // let the last pushes finish
process.exit(0); // an open CDP socket would otherwise keep the process alive
