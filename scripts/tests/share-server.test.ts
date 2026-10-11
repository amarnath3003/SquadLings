import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { WebSocket, WebSocketServer } from "ws";
import { startShareServer } from "../lib/share-server.ts";

test("hosted dashboard bridge protects and forwards REST and WebSocket traffic", async (t) => {
  const frontend = "https://squadlings.vercel.app";
  const token = randomBytes(32).toString("base64url");
  let target = "";
  const local = createServer(async (req, res) => {
    if (req.headers.origin !== target || req.headers.host !== new URL(target).host) return res.writeHead(403).end();
    let body = "";
    for await (const chunk of req) body += chunk;
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ path: req.url, method: req.method, body, authorization: req.headers.authorization ?? null }));
  });
  const localSockets = new WebSocketServer({ noServer: true });
  local.on("upgrade", (req, socket, head) => {
    if (req.headers.origin !== target || req.headers.host !== new URL(target).host || req.url !== "/ws") return socket.destroy();
    localSockets.handleUpgrade(req, socket, head, (ws) => {
      ws.send(JSON.stringify({ type: "hello" }));
      ws.on("message", (data, binary) => ws.send(data, { binary }));
    });
  });
  await new Promise<void>((resolve) => local.listen(0, "127.0.0.1", resolve));
  target = `http://127.0.0.1:${(local.address() as AddressInfo).port}`;
  const bridge = await startShareServer({ port: 0, target, frontend, token });
  const address = `http://127.0.0.1:${bridge.port}`;
  t.after(() => {
    bridge.close();
    for (const ws of localSockets.clients) ws.terminate();
    localSockets.close();
    local.closeAllConnections();
    local.close();
  });
  const headers = { Origin: frontend, Authorization: `Bearer ${token}` };

  await t.test("rejects unknown origins and missing or incorrect keys", async () => {
    assert.equal((await fetch(`${address}/api/config`)).status, 403);
    assert.equal((await fetch(`${address}/api/config`, { headers: { ...headers, Origin: "https://evil.example" } })).status, 403);
    assert.equal((await fetch(`${address}/api/config`, { headers: { Origin: frontend } })).status, 401);
    assert.equal((await fetch(`${address}/api/config`, { headers: { ...headers, Authorization: "Bearer incorrect" } })).status, 401);
    assert.equal((await fetch(`${address}/`, { headers })).status, 404);
  });
  await t.test("permits only expected preflight methods and headers", async () => {
    const response = await fetch(`${address}/api/runs`, { method: "OPTIONS", headers: { Origin: frontend, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization, content-type" } });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), frontend);
    assert.equal((await fetch(`${address}/api/runs`, { method: "OPTIONS", headers: { Origin: frontend, "Access-Control-Request-Method": "DELETE" } })).status, 403);
  });
  await t.test("forwards GET and JSON POST through the existing local trust checks", async () => {
    const response = await fetch(`${address}/api/runs?limit=2`, { headers });
    assert.equal(response.headers.get("access-control-allow-origin"), frontend);
    assert.deepEqual(await response.json(), { path: "/api/runs?limit=2", method: "GET", body: "", authorization: null });
    const body = JSON.stringify({ task: "test" });
    const post = await fetch(`${address}/api/runs`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body });
    assert.equal(post.status, 200);
    assert.deepEqual(await post.json(), { path: "/api/runs", method: "POST", body, authorization: null });
  });
  await t.test("authenticates WebSockets and preserves hello, events, input and binary frames", async () => {
    const ws = new WebSocket(address.replace(/^http/, "ws") + "/ws", ["squadlings", `auth.${token}`], { origin: frontend });
    const hello = once(ws, "message");
    await once(ws, "open");
    assert.equal(ws.protocol, "squadlings");
    assert.deepEqual(JSON.parse(String((await hello)[0])), { type: "hello" });
    const message = once(ws, "message");
    ws.send(JSON.stringify({ type: "input", botId: "bot1" }));
    assert.equal(String((await message)[0]), '{"type":"input","botId":"bot1"}');
    const frame = once(ws, "message");
    ws.send(Buffer.from([1, 2, 3, 4]));
    const [data, binary] = await frame;
    assert.equal(binary, true);
    assert.deepEqual(data, Buffer.from([1, 2, 3, 4]));
    ws.close();
    await once(ws, "close");
  });
  await t.test("rejects WebSocket clients with invalid keys", async () => {
    const ws = new WebSocket(address.replace(/^http/, "ws") + "/ws", ["squadlings", "auth.incorrect"], { origin: frontend });
    ws.on("error", () => {});
    const [, response] = await once(ws, "unexpected-response");
    assert.equal(response.statusCode, 403);
    ws.terminate();
  });
});
