// A mock Agents API with scripted agents, for the squad's offline tests (squad.selftest.ts,
// ui.selftest.ts). Like OpenAI, it calls our real MCP router over HTTP (the 2026-07-28 protocol):
// each session's create body names its MCP URL and token, and a script plays each turn by calling
// tools and emitting events. Streams behave as live: the create stream covers the first turn, later
// turns arrive on a GET events stream, and usage shows up on GET session.

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";

export type MockSession = { id: string; label: string; mcpUrl: string; auth: string; streams: Set<ServerResponse>; turns: number; inputs: string[]; agent: any };
export type ToolResult = { agent: string; tool: string; text: string; isError: boolean };

/** What a script can do in a turn. */
export type Kit = {
  call: (s: MockSession, name: string, args: Record<string, unknown>) => Promise<{ text: string; isError: boolean }>;
  emit: (s: MockSession, event: Record<string, unknown>) => void;
  /** The agent writes text (shown as the Master's reply, or a bot's note). */
  text: (s: MockSession, text: string) => void;
  /** A web_search_call, as gpt-6.1-sol sends it (the query arrives on item.done). */
  search: (s: MockSession, query: string) => void;
};
export type Script = (s: MockSession, input: string, kit: Kit) => Promise<void>;

const META = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "mock-openai", version: "0" } };
const ROOT_TURN = { subagent_id: null };

export async function startMockAgentsApi(o: { master: Script; bot: Script; log?: (msg: string) => void }) {
  const sessions = new Map<string, MockSession>();
  const seen = { deletes: [] as string[], cancels: [] as string[], toolResults: [] as ToolResult[] };
  let rpcId = 0;
  let searchId = 0;

  const emit = (s: MockSession, event: Record<string, unknown>) => {
    const body = JSON.stringify({ event_id: `evt_${randomUUID()}`, session_id: s.id, ...event });
    for (const res of s.streams) res.write(`event: ${event.type}\ndata: ${body}\n\n`);
  };
  const kit: Kit = {
    emit,
    async call(s, name, args) {
      const res = await fetch(s.mcpUrl, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: s.auth, "mcp-protocol-version": "2026-07-28" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args, _meta: META } }),
      });
      const json: any = await res.json();
      const text = (json?.result?.content ?? []).map((c: any) => c.text ?? "").join("\n");
      const isError = json?.result?.isError === true;
      seen.toolResults.push({ agent: s.label, tool: name, text, isError });
      emit(s, { type: "agent.session.turn.item.done", turn: ROOT_TURN, item: { type: "mcp_call", name, status: isError ? "failed" : "completed" } });
      return { text, isError };
    },
    text: (s, text) => emit(s, { type: "agent.session.turn.output_text.done", item_id: "msg", text }),
    search(s, query) {
      const id = `ws${++searchId}`;
      emit(s, { type: "agent.session.turn.item.added", turn: ROOT_TURN, item: { type: "web_search_call", id, status: "in_progress" } });
      emit(s, { type: "agent.session.turn.item.done", turn: ROOT_TURN, item: { type: "web_search_call", id, status: "completed", action: { type: "search", queries: [query] } } });
    },
  };

  /** Plays one turn of a scripted agent for `input`, then ends the turn. */
  async function playTurn(s: MockSession, input: string) {
    s.turns++;
    s.inputs.push(input);
    emit(s, { type: "agent.session.turn.created", turn: ROOT_TURN });
    try {
      await (s.label === "master" ? o.master : o.bot)(s, input, kit);
    } catch (err) {
      o.log?.(`mock ${s.label} failed: ${err instanceof Error ? err.stack : err}`);
    }
    emit(s, { type: "agent.session.turn.completed", turn: ROOT_TURN, usage: null });
  }

  const readBody = async (req: IncomingMessage) => {
    let t = "";
    for await (const c of req) t += c;
    return t ? JSON.parse(t) : undefined;
  };
  const sendJson = (res: ServerResponse, status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  const inputText = (input: any): string => (typeof input === "string" ? input : (input ?? []).flatMap((m: any) => m.content ?? []).map((c: any) => c.text ?? "").join("\n"));

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const m = /^\/v1\/agents\/sessions(?:\/([^/]+))?(?:\/(events|items))?$/.exec(url.pathname);
    if (!m) return sendJson(res, 404, { error: { message: "no route" } });
    const [, id, sub] = m;
    if (req.method === "POST" && !id) {
      const body = await readBody(req);
      const mcp = body.agent.tools.find((t: any) => t.type === "mcp");
      const s: MockSession = { id: `sess_${randomUUID().slice(0, 8)}`, label: mcp.server_label.replace("squadlings_", ""), mcpUrl: mcp.transport.server_url, auth: mcp.transport.authorization, streams: new Set(), turns: 0, inputs: [], agent: body.agent };
      sessions.set(s.id, s);
      res.writeHead(200, { "content-type": "text/event-stream" });
      s.streams.add(res);
      emit(s, { type: "agent.session.created", session: { id: s.id, environment: body.environment } });
      // The create stream covers the first turn, then ends (later turns need a GET stream).
      void playTurn(s, inputText(body.input)).then(() => {
        s.streams.delete(res);
        res.end();
      });
      return;
    }
    const s = id ? sessions.get(id) : undefined;
    if (!s) return sendJson(res, 404, { error: { message: "no session" } });
    if (sub === "events" && req.method === "GET") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(": open\n\n");
      s.streams.add(res);
      req.on("close", () => s.streams.delete(res));
      return;
    }
    if (sub === "events" && req.method === "POST") {
      const body = await readBody(req);
      sendJson(res, 202, {});
      for (const ev of body.events ?? []) {
        if (ev.type === "agent.session.input.cancel") {
          seen.cancels.push(s.label);
          emit(s, { type: "agent.session.turn.cancelled", turn: ROOT_TURN });
        } else if (ev.type === "agent.session.input.message") void playTurn(s, inputText(ev.input));
      }
      return;
    }
    if (sub === "items") return sendJson(res, 200, { data: [], has_more: false });
    if (req.method === "GET") return sendJson(res, 200, { id: s.id, status: "idle", usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 800 }, output_tokens: 100 } });
    if (req.method === "DELETE") {
      seen.deletes.push(s.label);
      for (const r of s.streams) r.end();
      return sendJson(res, 200, { id: s.id, deleted: true });
    }
    sendJson(res, 405, {});
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    sessions,
    seen,
    kit,
    close: () => server.close(),
  };
}
