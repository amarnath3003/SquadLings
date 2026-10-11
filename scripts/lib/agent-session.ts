// One Agents API session that lives across many turns: the Master and every squad bot use it.
// master.md §13.2 (AgentsApiDriver) and §25.1, with what the single-bot spike learned live:
//   • `environment: { type: "none" }` needs the first input and `stream: true` at create; a small
//     offline container is the fallback when it's refused.
//   • The create request's stream covers the first turn. Later turns need a GET events stream, opened
//     before the input is sent ("open before sending input"); streams don't replay missed events.
//   • Usage shows up on GET session a little after a turn, not on turn events.

import { ApiError, isRootTurn, message, readSse, wrapUpSession } from "./agents-api.ts";
import type { AgentsApi, SseStats } from "./agents-api.ts";

export type TurnEnd = "completed" | "failed" | "cancelled";

export type AgentSessionOptions = {
  api: AgentsApi;
  /** The create body without input: { agent, environment }. */
  body: Record<string, unknown>;
  signal: AbortSignal;
  log: (msg: string) => void;
  /** Every SSE event, for events.jsonl. */
  record: (entry: unknown) => void;
  sse?: SseStats;
  onText?: (text: string, phase: string | null) => void;
  onSearch?: (query: string, ms: number | null, ok: boolean) => void;
  /** An MCP call that failed inside OpenAI (not a tool error we returned). */
  onMcpItem?: (item: any) => void;
  /** A root turn started (also one that queued input starts on its own). */
  onTurnStart?: () => void;
  /** The root turn ended. `busy` is already false. */
  onTurnEnd: (kind: TurnEnd, ev: any) => void | Promise<void>;
  /** The session can't continue (session or environment failed, an error event, a stream that keeps dying). */
  onFailure: (error: unknown) => void;
};

const HOSTED = { type: "openai_hosted", container_size: "small", network: { access: "disabled" } };

/**
 * What a web_search_call did. Live (gpt-6.1-sol, 2026-10-11): `action` is { type: "search", query,
 * queries } or { type: "open_page", url }; the query is empty on item.added and filled on item.done.
 */
export function searchAction(item: any): string {
  const a = item?.action ?? {};
  if (a.type === "open_page") return `open ${a.url ?? "(page)"}`;
  if (a.type === "find_in_page") return `find "${a.pattern ?? ""}" in ${a.url ?? "(page)"}`;
  const q = a.query || (Array.isArray(a.queries) ? a.queries.join(" | ") : "") || item?.query;
  return q ? `"${q}"` : "(query not shown)";
}

export class AgentSession {
  id = "";
  /** A turn is running (set when input is sent, cleared when the root turn ends). */
  busy = false;
  closed = false;
  environment: "none" | "hosted" = "none";
  usage: any = undefined;
  turns = 0;
  eventTypes: Record<string, number> = {};
  private o: AgentSessionOptions;
  private abort = new AbortController();
  private signal: AbortSignal;
  private streaming = false;
  private streamId = 0; // the stream we rely on; an older one ending changes nothing
  private streamSeq = 0;
  private streamFailures = 0;
  private seen = new Set<string>();
  private phases = new Map<string, string | null>();
  private searchStarts = new Map<string, number>();
  private created?: { resolve: () => void; reject: (err: unknown) => void };

  constructor(o: AgentSessionOptions) {
    this.o = o;
    this.signal = AbortSignal.any([o.signal, this.abort.signal]);
  }

  /** Creates the session with its first input and starts following its events. Resolves once it exists. */
  async start(input: string): Promise<void> {
    this.busy = true;
    const { api } = this.o;
    try {
      const stream = await api.createStreaming({ ...this.o.body, input }, this.signal);
      const created = new Promise<void>((resolve, reject) => (this.created = { resolve, reject }));
      this.streaming = true;
      void this.pump(stream, true);
      await created;
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 400) || this.closed) throw err;
      // Fall back to the smallest offline container: create, open the stream, then send the input.
      this.o.log(`environment "none" was refused (${err.body?.error?.message ?? err.status}); using a small offline container`);
      this.environment = "hosted";
      const res = await api.request("POST", "/agents/sessions", { ...this.o.body, environment: HOSTED });
      this.id = res.json.id;
      await this.ensureStream();
      await api.send(this.id, [message(input)]);
    }
  }

  /** Sends a message: starts a turn when idle (the API steers an active turn instead). */
  async send(text: string): Promise<void> {
    if (this.closed) throw new Error("session closed");
    this.busy = true;
    await this.ensureStream();
    await this.o.api.send(this.id, [message(text)]);
  }

  /** Cancels the active turn; the session and its history stay. */
  async cancel(): Promise<void> {
    if (this.id && this.busy) await this.o.api.cancel(this.id);
  }

  /** Looks for usage on the session (it lands a little after each turn). */
  async refreshUsage(): Promise<void> {
    if (!this.id || this.closed) return;
    try {
      const s = await this.o.api.getSession(this.id);
      if (s?.usage) this.usage = s.usage;
    } catch {
      // keep the last value
    }
  }

  /** Cancels a running turn, saves items and usage, deletes the session, and closes the stream. */
  async close(): Promise<{ items: any[]; deleted?: boolean }> {
    if (this.closed) return { items: [] };
    this.closed = true;
    const busy = this.busy;
    this.created?.reject(new Error("closed"));
    let end: Awaited<ReturnType<typeof wrapUpSession>> | undefined;
    if (this.id) {
      end = await wrapUpSession(this.o.api, this.id, { cancel: busy, log: this.o.log, record: (_f, entry) => this.o.record(entry) });
      if (end.usage) this.usage = end.usage;
    }
    this.abort.abort();
    return { items: end?.items ?? [], deleted: end?.deleted };
  }

  /** Opens a GET events stream unless one is open. Resolves once the server has answered. */
  private async ensureStream(): Promise<void> {
    if (this.streaming || this.closed) return;
    this.streaming = true;
    try {
      const stream = await this.o.api.openStream(this.id, this.signal);
      void this.pump(stream);
    } catch (err) {
      this.streaming = false;
      throw err;
    }
  }

  /**
   * Reads one stream to its end; reopens it if a turn is still running. The create request's stream
   * covers only the first turn: once that turn ends it stops being the stream we rely on, so input
   * sent from the turn-end handler (a nudge) opens a GET stream first and no event is missed.
   */
  private async pump(stream: ReadableStream<Uint8Array>, create = false) {
    const id = ++this.streamSeq;
    this.streamId = id;
    try {
      for await (const msg of readSse(stream, this.o.sse)) {
        let ev: any;
        try {
          ev = JSON.parse(msg.data);
        } catch {
          ev = { type: "(unparsed)", raw: msg.data };
        }
        // A create stream and a GET stream can overlap for a moment.
        if (typeof ev?.event_id === "string") {
          if (this.seen.has(ev.event_id)) continue;
          this.seen.add(ev.event_id);
        }
        this.o.record({ sse: msg.event, data: ev });
        this.streamFailures = 0;
        if (create && this.streamId === id && /^agent\.session\.turn\.(completed|failed|cancelled)$/.test(ev?.type) && isRootTurn(ev)) {
          this.streamId = 0;
          this.streaming = false;
        }
        await this.handle(ev);
      }
    } catch (err) {
      if (this.closed || this.signal.aborted || this.streamId !== id) return;
      this.o.log(`event stream error: ${err instanceof Error ? err.message : err}`);
    } finally {
      if (this.streamId === id) this.streaming = false;
    }
    if (this.closed || this.signal.aborted || (this.streamId !== id && this.id)) return;
    if (!this.id) {
      this.created?.reject(new Error("the event stream ended before the session was created"));
      return;
    }
    if (!this.busy) return; // idle: send() opens a new stream before the next input
    if (++this.streamFailures > 5) {
      this.o.onFailure(new Error("the event stream kept closing during a turn"));
      return;
    }
    await new Promise((r) => setTimeout(r, 300 * this.streamFailures));
    await this.ensureStream().catch((err) => this.o.onFailure(err));
  }

  private async handle(ev: any) {
    const type: string = ev?.type ?? "(no type)";
    this.eventTypes[type] = (this.eventTypes[type] ?? 0) + 1;
    switch (type) {
      case "agent.session.created":
        this.id ||= ev.session?.id ?? "";
        this.created?.resolve();
        return;

      case "agent.session.turn.created":
        if (!isRootTurn(ev)) return;
        this.busy = true;
        this.o.onTurnStart?.();
        return;

      case "agent.session.requires_action":
        this.o.log(`requires_action (unexpected with MCP tools): ${JSON.stringify(ev).slice(0, 200)}`);
        return;

      case "agent.session.turn.item.added":
      case "agent.session.turn.item.done": {
        const item = ev.item ?? {};
        if (item.type === "web_search_call") {
          if (type.endsWith(".added")) this.searchStarts.set(item.id, performance.now());
          else {
            const start = this.searchStarts.get(item.id);
            this.o.onSearch?.(searchAction(item), start === undefined ? null : Math.round(performance.now() - start), item.status !== "failed");
          }
        } else if (item.type === "mcp_call" && type.endsWith(".done")) {
          this.o.onMcpItem?.(item);
        } else if (/message/.test(item.type ?? "") && item.role !== "user") {
          this.phases.set(item.id, item.phase ?? null);
        }
        return;
      }

      case "agent.session.turn.output_text.done":
        if (ev.text?.trim()) this.o.onText?.(ev.text.trim(), this.phases.get(ev.item_id) ?? null);
        return;

      case "agent.session.turn.completed":
      case "agent.session.turn.failed":
      case "agent.session.turn.cancelled": {
        if (!isRootTurn(ev)) return;
        this.busy = false;
        this.turns++;
        if (ev.usage ?? ev.turn?.usage) this.usage = ev.usage ?? ev.turn.usage;
        await this.o.onTurnEnd(type.slice("agent.session.turn.".length) as TurnEnd, ev);
        return;
      }

      case "error":
      case "agent.session.failed":
      case "agent.session.environment.failed": {
        this.busy = false;
        const error = ev.error ?? ev.session?.error ?? ev.environment?.error ?? ev;
        if (!this.id) this.created?.reject(new Error(`the session failed before it was created: ${JSON.stringify(error).slice(0, 300)}`));
        else this.o.onFailure(error);
        return;
      }

      default:
        return;
    }
  }
}
