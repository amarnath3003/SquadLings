// Thin client for the Agents API beta. Raw fetch, so request and event shapes stay visible.
// Shapes: master.md §25.1, checked against the docs and the live runs (2026-10-10).

import { randomUUID } from "node:crypto";

/** A user message input event (wrapped in `{ events: [...] }` when sent). */
export const message = (text: string) => ({ type: "agent.session.input.message", input: [{ role: "user", content: [{ type: "input_text", text }] }] });

/** Root-agent turn events have `turn.subagent_id === null`. */
export const isRootTurn = (ev: any) => ev?.turn?.subagent_id == null;

/** The text of a message item. */
export const itemText = (item: any): string =>
  (Array.isArray(item?.content) ? item.content : []).map((p: any) => p?.text ?? "").join("").trim();

export type HttpEntry = {
  method: string;
  path: string;
  status: number;
  ms: number;
  requestId: string | null;
  contentType?: string | null;
};

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(what: string, status: number, body: any) {
    super(`${what} → HTTP ${status}: ${body?.error?.message ?? JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

export function createAgentsApi(opts: { base: string; key: string; onHttp?: (entry: HttpEntry) => void }) {
  const base = opts.base.replace(/\/+$/, "");
  const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
    Authorization: `Bearer ${opts.key}`,
    "OpenAI-Beta": "agents=v1",
    ...extra,
  });

  async function request(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
    const started = performance.now();
    const res = await fetch(base + path, {
      method,
      headers: headers(body === undefined ? extra : { "Content-Type": "application/json", ...extra }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    const ms = Math.round(performance.now() - started);
    opts.onHttp?.({ method, path, status: res.status, ms, requestId: res.headers.get("x-request-id") });
    if (!res.ok) throw new ApiError(`${method} ${path}`, res.status, json);
    return { status: res.status, ms, json };
  }

  /** Opens a session's event stream. Resolves when the server answers; send input only after that. */
  async function openStream(sessionId: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> {
    const path = `/agents/sessions/${sessionId}/events?stream=true`;
    const started = performance.now();
    const res = await fetch(base + path, { headers: headers({ Accept: "text/event-stream" }), signal });
    opts.onHttp?.({
      method: "GET", path, status: res.status, ms: Math.round(performance.now() - started),
      requestId: res.headers.get("x-request-id"), contentType: res.headers.get("content-type"),
    });
    if (!res.ok || !res.body) throw new ApiError("GET events stream", res.status, await res.text());
    return res.body;
  }

  /**
   * Creates a session with its first input and streams its events (`stream: true`). Required for
   * `environment: { type: "none" }`: "conversation-only sessions currently require initial input"
   * (live, 2026-10-11). The session id arrives in the first event, agent.session.created.
   */
  async function createStreaming(body: Record<string, unknown>, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> {
    const path = "/agents/sessions";
    const started = performance.now();
    const res = await fetch(base + path, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json", Accept: "text/event-stream", "Idempotency-Key": randomUUID() }),
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    });
    opts.onHttp?.({
      method: "POST", path, status: res.status, ms: Math.round(performance.now() - started),
      requestId: res.headers.get("x-request-id"), contentType: res.headers.get("content-type"),
    });
    if (!res.ok || !res.body) {
      const text = await res.text();
      let json: any = text;
      try {
        json = JSON.parse(text);
      } catch {
        // not JSON
      }
      throw new ApiError(`POST ${path} (streaming)`, res.status, json);
    }
    return res.body;
  }

  /** POSTs input events. Messages get an Idempotency-Key, as the docs ask for each logical submission. */
  const send = (sessionId: string, events: unknown[]) => {
    const isMessage = events.some((e: any) => e?.type === "agent.session.input.message");
    return request("POST", `/agents/sessions/${sessionId}/events`, { events }, isMessage ? { "Idempotency-Key": randomUUID() } : {});
  };

  async function listItems(sessionId: string): Promise<any[]> {
    const items: any[] = [];
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const q = new URLSearchParams({ order: "asc", limit: "100", ...(after ? { after } : {}) });
      const { json } = await request("GET", `/agents/sessions/${sessionId}/items?${q}`);
      items.push(...(json?.data ?? []));
      if (!json?.has_more || !json.last_id) break;
      after = json.last_id;
    }
    return items;
  }

  return {
    base,
    request,
    openStream,
    createStreaming,
    send,
    cancel: (sessionId: string) => send(sessionId, [{ type: "agent.session.input.cancel" }]),
    getSession: async (sessionId: string) => (await request("GET", `/agents/sessions/${sessionId}`)).json,
    listItems,
    deleteSession: (sessionId: string) => request("DELETE", `/agents/sessions/${sessionId}`),
  };
}

export type AgentsApi = ReturnType<typeof createAgentsApi>;

/**
 * Ends a session the same way in every spike: cancel the turn (if asked), save the items, look for
 * usage on the turn and the session (it was null everywhere in the first live runs), then delete.
 */
export async function wrapUpSession(
  api: AgentsApi,
  sessionId: string,
  opts: { cancel: boolean; keep?: boolean; turnId?: string; log: (msg: string) => void; record: (file: string, entry: unknown) => void },
) {
  const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
  const result = { items: [] as any[], usage: undefined as any, usageSource: undefined as string | undefined, deleted: undefined as boolean | undefined };
  if (opts.cancel) {
    await api.cancel(sessionId).then(() => opts.log("turn cancel sent"), (err) => opts.log(`cancel failed: ${errorText(err)}`));
  }
  try {
    result.items = await api.listItems(sessionId);
    const types = result.items.reduce<Record<string, number>>((m, i) => ((m[i?.type] = (m[i?.type] ?? 0) + 1), m), {});
    opts.log(`items: ${result.items.length} saved ${JSON.stringify(types)}`);
  } catch (err) {
    opts.log(`items fetch failed: ${errorText(err)}`);
  }
  if (opts.turnId) {
    try {
      const turn = (await api.request("GET", `/agents/sessions/${sessionId}/turns/${opts.turnId}`)).json;
      opts.record("events.jsonl", { turnRetrieve: turn });
      if (turn?.usage) Object.assign(result, { usage: turn.usage, usageSource: "GET /turns/{id} .usage" });
    } catch (err) {
      opts.log(`turn retrieve failed: ${errorText(err)}`);
    }
  }
  // Usage lands on the session a little after the turn (seen live: there after 1.2 s once, missing after
  // 1.5 s another time), so look a few times before deleting.
  for (let attempt = 0; attempt < 4 && !result.usage; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1500));
    try {
      const session = await api.getSession(sessionId);
      opts.record("events.jsonl", { finalSession: { attempt, status: session?.status, usage: session?.usage, spend_control: session?.spend_control } });
      if (session?.usage) Object.assign(result, { usage: session.usage, usageSource: "GET session .usage" });
    } catch (err) {
      opts.log(`session retrieve failed: ${errorText(err)}`);
      break;
    }
  }
  if (opts.keep) {
    opts.log(`session kept: ${sessionId}`);
  } else {
    try {
      await api.deleteSession(sessionId);
      result.deleted = true;
      opts.log("session deleted");
    } catch (err) {
      result.deleted = false;
      opts.log(`delete failed: ${errorText(err)}`);
    }
  }
  return result;
}

export type SseMessage = { event?: string; id?: string; data: string };
export type SseStats = { messages: number; eventField: number; idField: number; comments: number };
export const newSseStats = (): SseStats => ({ messages: 0, eventField: 0, idField: 0, comments: 0 });

/**
 * Minimal text/event-stream parser (WHATWG rules: CR, LF or CRLF line ends; a blank line dispatches;
 * an event cut off by the end of the stream is dropped). The live API sends `event:` and `data:`
 * lines, no `id:`, plus `:` keep-alive comments.
 */
export async function* readSse(body: ReadableStream<Uint8Array>, stats: SseStats = newSseStats()): AsyncGenerator<SseMessage> {
  const decoder = new TextDecoder();
  let buf = "";
  let data: string[] = [];
  let event: string | undefined;
  let id: string | undefined;
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let start = 0;
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if (c !== "\n" && c !== "\r") continue;
      if (c === "\r" && i === buf.length - 1) break; // may be the first half of a CRLF split across chunks
      const line = buf.slice(start, i);
      if (c === "\r" && buf[i + 1] === "\n") i++;
      start = i + 1;
      if (line === "") {
        if (data.length) {
          stats.messages++;
          yield { event, id, data: data.join("\n") };
        }
        data = [];
        event = undefined;
      } else if (line.startsWith(":")) {
        stats.comments++;
      } else {
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "data") {
          data.push(value);
        } else if (field === "event") {
          event = value;
          stats.eventField++;
        } else if (field === "id") {
          id = value;
          stats.idField++;
        }
      }
    }
    buf = buf.slice(start);
  }
}
