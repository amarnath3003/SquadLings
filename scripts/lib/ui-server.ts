// The dashboard's server (master.md §8.2, §18.3, §19.7): static files, a small REST API and one
// WebSocket, on 127.0.0.1 only. The MCP port is separate and is the only one behind the tunnel.
//
// Requests must come from the dashboard itself: the Host header must be this server, and any
// Origin must be this server too. That keeps other web pages (including the pages the bots visit,
// which run in browsers on this machine) from starting runs or driving a browser through it.
//
//   GET  /                                   the dashboard (ui/)
//   GET  /api/config                         defaults, models, efforts, cast, tunnel state
//   GET  /api/runs                           Recent chats (the live run first)
//   GET  /api/runs/:id                       a run and its events (a closed chat opens read-only)
//   GET  /api/runs/:id/frames/:bot.jpg       the last keyframe of a bot's browser in that run
//   POST /api/runs                           { task, options } → { runId }
//   POST /api/runs/:id/messages              { text }: to the Master
//   POST /api/runs/:id/halt                  Stop: the agents at work stop, the Master's turn is cancelled (the chat stays open)
//   POST /api/runs/:id/stop                  end the run
//   POST /api/runs/:id/bots/:botId/takeover  { action: "start" | "end" }
//   WS   /ws   → { type: "hello" } · { type: "snapshot", run, events } · { type: "event", event }
//              · { type: "tunnel" } · binary frames (§18.3 header + JPEG)
//          ←  { type: "input", botId, ... } (takeover input, never logged) · { type: "ping" }

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import type { UserInput } from "./browser.ts";
import { CAST } from "./squad.ts";
import { parseRunOptions } from "./squad-runner.ts";
import type { ActiveRun, HubMessage, RunOptions, SquadRunner } from "./squad-runner.ts";

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };
const MAX_BUFFERED = 4 * 1024 * 1024; // a slow dashboard skips frames instead of piling them up

export type TunnelState = { state: "starting" | "ready" | "failed"; url?: string; error?: string; source?: string };

export type UiServerOptions = {
  port: number;
  staticDir: string;
  runner: SquadRunner;
  defaults: RunOptions;
  models: { master: string[]; bot: string[] };
  tunnel: () => TunnelState;
};

/** The run as the dashboard needs it on connect. */
function runInfo(r: ActiveRun | undefined) {
  if (!r) return null;
  return { id: r.id, task: r.task, options: r.options, status: r.status, startedAt: r.startedAt, endedAt: r.endedAt ?? null, out: r.out };
}

export async function startUiServer(o: UiServerOptions) {
  let port = o.port;
  const hosts = () => new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const origins = () => new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  const trusted = (req: IncomingMessage, needOrigin: boolean) => {
    if (!hosts().has(req.headers.host ?? "")) return false;
    const origin = req.headers.origin;
    return origin ? origins().has(origin) : !needOrigin;
  };

  const send = (res: ServerResponse, status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
  // The effort slider's stops: what gpt-6-luna accepts, minus "max" (very slow for browsing).
  const config = () => ({ defaults: o.defaults, models: o.models, efforts: ["none", "low", "medium", "high", "xhigh"], tunnel: o.tunnel(), cast: CAST });

  async function readBody(req: IncomingMessage): Promise<any> {
    let text = "";
    for await (const chunk of req) {
      text += chunk;
      if (text.length > 64_000) throw new Error("too large");
    }
    return text ? JSON.parse(text) : {};
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    // POSTs need the dashboard's Origin (browsers always send it on POST); GETs may come from the address bar.
    if (!trusted(req, req.method !== "GET")) return send(res, 403, { error: "This server only answers the SquadLings dashboard at its own address." });

    if (req.method === "GET" && !path.startsWith("/api/")) {
      const file = path === "/" ? "index.html" : normalize(path).replace(/^[/\\]+/, "");
      const full = join(o.staticDir, file);
      if (!full.startsWith(o.staticDir) || !TYPES[extname(full)] || !existsSync(full)) return res.writeHead(404).end("not found");
      res.writeHead(200, {
        "content-type": TYPES[extname(full)],
        "cache-control": "no-store",
        // Page text from the web reaches the dashboard through the agents: no inline or outside scripts.
        "content-security-policy": `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:${port} ws://localhost:${port}; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      });
      return res.end(readFileSync(full));
    }

    try {
      if (req.method === "GET" && path === "/api/config") return send(res, 200, config());
      if (req.method === "GET" && path === "/api/runs") return send(res, 200, { runs: o.runner.listRuns() });
      const got = req.method === "GET" && /^\/api\/runs\/([\w-]+)(?:\/frames\/([a-z]+)\.jpg)?$/.exec(path);
      if (got) {
        if (got[2]) {
          const jpeg = o.runner.lastFrame(got[1], got[2]);
          return jpeg ? res.writeHead(200, { "content-type": "image/jpeg", "cache-control": "no-store" }).end(jpeg) : send(res, 404, { error: "no frame" });
        }
        const r = o.runner.runEvents(got[1]);
        return r ? send(res, 200, r) : send(res, 404, { error: "No such chat." });
      }
      if (req.method !== "POST") return send(res, 404, { error: "not found" });
      if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) return send(res, 415, { error: "Send JSON." });
      const body = await readBody(req);

      if (path === "/api/runs") {
        let options: RunOptions;
        try {
          options = parseRunOptions(body.options, o.defaults);
        } catch (err) {
          return send(res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
        try {
          const run = o.runner.start(String(body.task ?? ""), options);
          return send(res, 201, { runId: run.id });
        } catch (err) {
          return send(res, 409, { error: err instanceof Error ? err.message : String(err) });
        }
      }

      const m = /^\/api\/runs\/([\w-]+)\/(messages|stop|halt|bots\/([\w-]+)\/takeover)$/.exec(path);
      const run = o.runner.current;
      if (!m) return send(res, 404, { error: "not found" });
      if (!run || run.id !== m[1]) return send(res, 404, { error: "That run isn't the current one." });
      if (m[2] === "messages") {
        const text = String(body.text ?? "").trim();
        if (!text) return send(res, 400, { error: "Type a message." });
        if (text.length > 4000) return send(res, 400, { error: "That message is too long (4,000 characters at most)." });
        try {
          run.say(text);
        } catch (err) {
          return send(res, 409, { error: err instanceof Error ? err.message : String(err) });
        }
        return send(res, 200, { ok: true });
      }
      if (m[2] === "halt") {
        try {
          return send(res, 200, { ok: true, halted: run.halt() });
        } catch (err) {
          return send(res, 409, { error: err instanceof Error ? err.message : String(err) });
        }
      }
      if (m[2] === "stop") {
        void run.end("stopped_by_user");
        return send(res, 202, { ok: true });
      }
      const on = body.action === "start";
      if (!on && body.action !== "end") return send(res, 400, { error: 'action must be "start" or "end"' });
      return send(res, 200, { ok: run.takeover(m[3], on) });
    } catch (err) {
      return send(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path !== "/ws" || !trusted(req, true)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => connect(ws));
  });

  function connect(ws: WebSocket) {
    const json = (m: unknown) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
    json({ type: "hello", config: config() });
    const run = o.runner.current;
    json({ type: "snapshot", run: runInfo(run), events: run?.events ?? [] });
    for (const f of run?.frames.values() ?? []) ws.send(f);
    const off = o.runner.subscribe((m: HubMessage) => {
      if (ws.readyState !== ws.OPEN) return;
      if (m.kind === "frame") {
        if (ws.bufferedAmount < MAX_BUFFERED) ws.send(m.data);
      } else if (m.kind === "reset") json({ type: "snapshot", run: runInfo(o.runner.current), events: o.runner.current?.events ?? [] });
      else json({ type: "event", event: m.event });
    });
    ws.on("message", (raw, binary) => {
      if (binary) return;
      let m: any;
      try {
        m = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (m?.type === "ping") return json({ type: "pong", t: m.t ?? null });
      // Takeover input: forwarded only while the user controls that bot's browser; never logged (§14.7).
      if (m?.type === "input" && typeof m.botId === "string" && m.event && typeof m.event === "object") o.runner.current?.input(m.botId, m.event as UserInput);
    });
    ws.on("close", off);
    ws.on("error", off);
  }

  /** Tells every dashboard the tunnel's state changed. */
  const tunnelChanged = () => {
    for (const ws of wss.clients) if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "tunnel", tunnel: o.tunnel() }));
  };

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(o.port, "127.0.0.1", () => resolve());
  });
  port = (server.address() as AddressInfo).port;
  return {
    server,
    port,
    url: `http://127.0.0.1:${port}`,
    tunnelChanged,
    close: () => {
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      server.close();
    },
  };
}
