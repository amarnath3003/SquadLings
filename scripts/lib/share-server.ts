// Authenticated bridge for an already-running local dashboard. Its original Host/Origin checks stay intact.
import { timingSafeEqual } from "node:crypto";
import { createServer, request } from "node:http";
import type { ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";

type ShareOptions = { port: number; target: string; frontend: string; token: string };

export async function startShareServer(options: ShareOptions) {
  const target = new URL(options.target);
  const frontend = new URL(options.frontend);
  if (target.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(target.hostname) || target.username || target.password || target.pathname !== "/" || target.search || target.hash) {
    throw new Error("The dashboard target must be a local HTTP origin, such as http://127.0.0.1:8787.");
  }
  if (frontend.protocol !== "https:" && !(frontend.protocol === "http:" && ["localhost", "127.0.0.1"].includes(frontend.hostname))) {
    throw new Error("The frontend must use HTTPS (HTTP is allowed only for local development).");
  }
  if (!/^[A-Za-z0-9_-]{32,}$/.test(options.token)) throw new Error("A random access key of at least 32 characters is required.");
  const expected = Buffer.from(options.token);
  const authorized = (value: string) => {
    const actual = Buffer.from(value);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  };
  const json = (res: ServerResponse, status: number, error: string) => {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ error }));
  };

  const server = createServer((req, res) => {
    res.setHeader("cache-control", "no-store");
    res.setHeader("vary", "Origin");
    if (req.headers.origin !== frontend.origin) return json(res, 403, "Use the configured SquadLings frontend.");
    res.setHeader("access-control-allow-origin", frontend.origin);
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) return json(res, 404, "not found");
    if (req.method === "OPTIONS") {
      const method = req.headers["access-control-request-method"];
      const headers = String(req.headers["access-control-request-headers"] ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
      if (!["GET", "POST"].includes(String(method)) || headers.some((h) => !["authorization", "content-type"].includes(h))) return json(res, 403, "Unsupported cross-origin request.");
      res.writeHead(204, {
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "Authorization, Content-Type",
        "access-control-max-age": "600",
      }).end();
      return;
    }
    if (!authorized(String(req.headers.authorization ?? "").replace(/^Bearer /, ""))) return json(res, 401, "Invalid access key.");
    if (!["GET", "POST"].includes(req.method ?? "")) return json(res, 405, "Use GET or POST.");
    const headers: Record<string, string> = { host: target.host, origin: target.origin };
    if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
    if (req.headers["content-length"]) headers["content-length"] = req.headers["content-length"];
    const upstream = request(`${target.origin}${url.pathname}${url.search}`, { method: req.method, headers, timeout: 15000 }, (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.on("error", () => res.destroy());
      response.pipe(res);
    });
    upstream.on("timeout", () => upstream.destroy(new Error("Dashboard timeout")));
    upstream.on("error", () => {
      if (!res.headersSent) json(res, 502, "The local SquadLings dashboard is unavailable. Keep npm run ui running.");
      else res.destroy();
    });
    req.on("aborted", () => upstream.destroy());
    res.on("close", () => upstream.destroy());
    req.pipe(upstream);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, handleProtocols: (protocols) => protocols.has("squadlings") ? "squadlings" : false });
  const pending = new Set<WebSocket>();
  server.on("upgrade", (req, socket, head) => {
    const protocols = String(req.headers["sec-websocket-protocol"] ?? "").split(",").map((s) => s.trim());
    const key = protocols.find((p) => p.startsWith("auth."))?.slice(5) ?? "";
    if (new URL(req.url ?? "/", "http://localhost").pathname !== "/ws" || req.headers.origin !== frontend.origin || !protocols.includes("squadlings") || !authorized(key)) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    const upstream = new WebSocket(`${target.origin.replace(/^http:/, "ws:")}/ws`, { origin: target.origin, handshakeTimeout: 5000, maxPayload: 8 * 1024 * 1024 });
    pending.add(upstream);
    let client: WebSocket | undefined;
    socket.on("close", () => { if (!client) upstream.terminate(); });
    upstream.on("error", () => {
      if (client) client.close(1011, "Local dashboard disconnected");
      else socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
    });
    upstream.on("close", () => { pending.delete(upstream); client?.close(1011, "Local dashboard disconnected"); });
    upstream.once("open", () => {
      if (socket.destroyed) return upstream.terminate();
      wss.handleUpgrade(req, socket, head, (downstream) => {
        client = downstream;
        downstream.on("message", (data, binary) => {
          if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary });
        });
        upstream.on("message", (data, binary) => {
          // Drop stale frames for slow viewers; keep events and input flowing.
          if (downstream.readyState === WebSocket.OPEN && (!binary || downstream.bufferedAmount < 4 * 1024 * 1024)) downstream.send(data, { binary });
        });
        downstream.on("close", () => upstream.close());
        downstream.on("error", () => upstream.terminate());
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", resolve);
  });
  return {
    port: (server.address() as AddressInfo).port,
    close() {
      for (const ws of pending) ws.terminate();
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      server.closeAllConnections();
      server.close();
    },
  };
}
