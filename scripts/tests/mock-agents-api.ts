// Offline stand-in for the Agents API, used to test spike-computer-use.ts at zero cost.
//
// It imitates only the endpoints and event shapes the spike uses, as documented on
// developers.openai.com (read 2026-10-10). Passing proves our plumbing (SSE parsing, origin
// approvals, cancel, cleanup), not how the real API behaves. Run the real spike for that.
//
//   node scripts/tests/mock-agents-api.ts            # self-test: runs the spike against the mock
//   node scripts/tests/mock-agents-api.ts --verbose  # same, and prints each spike run's output
//   node scripts/tests/mock-agents-api.ts --serve    # just serve on :8799; then run the spike with
//                                              #   --base-url http://127.0.0.1:8799/v1

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = resolve(import.meta.dirname, "../..");
const PIXEL_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
const USAGE = {
  input_tokens: 1234,
  input_tokens_details: { cached_tokens: 1000 },
  output_tokens: 56,
  output_tokens_details: { reasoning_tokens: 20 },
  total_tokens: 1290,
};

type Session = { json: any; stream?: ServerResponse; items: any[]; turn?: any; openStep?: any; seq: number };
const sessions = new Map<string, Session>();
const seen = { cancels: [] as string[], deletes: [] as string[] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
const nowSec = () => Math.floor(Date.now() / 1000);
const apiError = (type: string, code: string | null, message: string) => ({ error: { type, code, message, param: null } });

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "x-request-id": newId("req") });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<any> {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : undefined;
}

/**
 * Writes one SSE message the way the real API did on 2026-10-10 (`event:` + `data:` lines, no `id:`),
 * in two chunks, alternating LF and CRLF line ends (CRLF ones split between \r and \n).
 */
async function emit(s: Session, event: Record<string, unknown>) {
  if (!s.stream) return;
  const eol = s.seq++ % 2 ? "\r\n" : "\n";
  const body = { event_id: newId("evt"), session_id: s.json.id, ...event };
  const text = `event: ${event.type}${eol}data: ${JSON.stringify(body)}${eol}${eol}`;
  const cut = eol === "\r\n" ? text.indexOf("\r\n") + 1 : Math.floor(text.length / 2);
  s.stream.write(text.slice(0, cut));
  await sleep(5);
  s.stream.write(text.slice(cut));
  await sleep(15);
}

// ── Scripted turn ─────────────────────────────────────

/** A browser step: item.added (in_progress, no output), later item.done (screenshot only sometimes). */
async function stepStart(s: Session, title: string) {
  const item = { type: "computer_use_call", id: newId("cu"), turn_id: s.turn.id, title, status: "in_progress", output: null };
  s.items.push(item);
  await emit(s, { type: "agent.session.turn.item.added", turn_id: s.turn.id, output_index: s.items.length, item });
  return item;
}

async function stepDone(s: Session, item: any, status: string, screenshot?: string) {
  Object.assign(item, { status, output: screenshot ? { type: "computer_screenshot", image_url: screenshot } : null });
  await emit(s, { type: "agent.session.turn.item.done", turn_id: s.turn.id, output_index: s.items.indexOf(item), item });
}

/** An assistant message: item.added, text deltas, output_text.done, item.done. */
async function say(s: Session, phase: "commentary" | "final_answer", text: string) {
  const msg = { type: "message", id: newId("msg"), turn_id: s.turn.id, role: "assistant", phase, content: [{ type: "output_text", text }], status: "completed" };
  s.items.push(msg);
  const at = { turn_id: s.turn.id, item_id: msg.id, output_index: s.items.length, content_index: 0 };
  await emit(s, { type: "agent.session.turn.item.added", turn_id: s.turn.id, output_index: at.output_index, item: { ...msg, status: "in_progress", content: [] } });
  const half = Math.ceil(text.length / 2);
  for (const delta of [text.slice(0, half), text.slice(half)]) await emit(s, { type: "agent.session.turn.output_text.delta", ...at, delta });
  await emit(s, { type: "agent.session.turn.output_text.done", ...at, text });
  await emit(s, { type: "agent.session.turn.item.done", turn_id: s.turn.id, output_index: at.output_index, item: msg });
}

async function startTurn(s: Session, task: string) {
  const turn: any = {
    id: newId("turn"), object: "agent.session.turn", session_id: s.json.id, agent_id: null, subagent_id: null,
    status: "queued", created_at: nowSec(), started_at: null, completed_at: null, error: null, usage: null,
  };
  s.turn = turn;
  s.json.status = "in_progress";
  s.items.push({ type: "message", id: newId("msg"), turn_id: turn.id, role: "user", content: [{ type: "input_text", text: task }], status: "completed" });
  await emit(s, { type: "agent.session.turn.created", turn_id: turn.id, turn });
  turn.status = "in_progress";
  turn.started_at = nowSec();
  await emit(s, { type: "agent.session.turn.in_progress", turn_id: turn.id, turn });
  if (task.includes("STALL")) return; // never progresses: exercises --timeout and cancel

  await emit(s, { type: "agent.session.environment.ready", environment: { id: newId("env"), type: "openai_hosted", status: "ready", error: null } });
  await say(s, "commentary", "I'll open Wikipedia and search for the article.");
  s.openStep = await stepStart(s, "Opening en.wikipedia.org");

  // Real clients can see the event before the session lists the action; make the spike cope with that.
  s.json.status = "requires_action";
  await emit(s, { type: "agent.session.requires_action", turn_id: turn.id, session: s.json });
  await sleep(150);
  s.json.required_actions = [{
    type: "computer_use_approval_request", request_id: newId("cuar"), turn_id: turn.id,
    request: { type: "browser_origin_access", origin: "https://en.wikipedia.org", reason: "Open the site named in the task" },
  }];
}

async function continueTurn(s: Session, decision: string) {
  if (decision === "approve") {
    await stepDone(s, s.openStep, "completed"); // most real steps had no screenshot
    const search = await stepStart(s, 'Searching for "Model Context Protocol"');
    await stepDone(s, search, "completed", PIXEL_JPEG);
    await say(s, "final_answer", "Model Context Protocol (https://en.wikipedia.org/wiki/Model_Context_Protocol): The Model Context Protocol is an open standard.");
  } else {
    await stepDone(s, s.openStep, "incomplete");
    await say(s, "final_answer", "I couldn't open https://en.wikipedia.org because access was denied.");
  }
  Object.assign(s.turn, { status: "completed", completed_at: nowSec(), usage: USAGE });
  await emit(s, { type: "agent.session.turn.completed", turn_id: s.turn.id, turn: s.turn, usage: USAGE });
  s.json.status = "idle";
  await emit(s, { type: "agent.session.idle", session: s.json });
}

// ── HTTP ──────────────────────────────────────────────

const server = createServer(async (req, res) => {
  try {
    if (req.headers["openai-beta"] !== "agents=v1") {
      return sendJson(res, 400, apiError("invalid_request_error", "invalid_beta", "Missing or invalid OpenAI-Beta header."));
    }
    if (!req.headers.authorization?.startsWith("Bearer ")) {
      return sendJson(res, 401, apiError("invalid_request_error", "unauthorized", "Missing bearer token."));
    }
    const url = new URL(req.url ?? "/", "http://mock");
    const [v1, agents, kind, sessionId, sub, subId] = url.pathname.split("/").filter(Boolean);
    if (v1 !== "v1" || agents !== "agents" || kind !== "sessions") return sendJson(res, 404, apiError("not_found_error", null, "Unknown path."));

    if (!sessionId && req.method === "POST") {
      const body = await readBody(req);
      if (!body?.agent?.model) return sendJson(res, 400, apiError("invalid_request_error", null, "agent.model is required."));
      if (body.agent.model === "no-such-model") return sendJson(res, 404, apiError("invalid_request_error", "model_not_found", `The model '${body.agent.model}' does not exist.`));
      const wantsBrowser = body.agent.tools?.some((t: any) => t.type === "computer_use");
      if (wantsBrowser && body.environment?.desktop?.enabled !== true) {
        return sendJson(res, 400, apiError("invalid_request_error", null, "computer_use requires environment.desktop.enabled."));
      }
      const json = {
        id: newId("sess"), object: "agent.session", agent: body.agent, environment: body.environment,
        status: "idle", required_actions: [], error: null, created_at: nowSec(), last_active_at: nowSec(), metadata: {}, usage: null,
      };
      sessions.set(json.id, { json, items: [], seq: 0 });
      return sendJson(res, 200, json);
    }

    const s = sessionId ? sessions.get(sessionId) : undefined;
    if (!s) return sendJson(res, 404, apiError("not_found_error", null, "No such session."));

    if (!sub && req.method === "GET") return sendJson(res, 200, s.json);
    if (!sub && req.method === "DELETE") {
      sessions.delete(s.json.id);
      seen.deletes.push(s.json.id);
      s.stream?.end();
      return sendJson(res, 200, { id: s.json.id, object: "agent.session.deleted", deleted: true });
    }

    if (sub === "events" && req.method === "GET") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", "x-request-id": newId("req") });
      res.write(": keep-alive\n\n");
      s.stream = res;
      req.on("close", () => {
        if (s.stream === res) s.stream = undefined;
      });
      return;
    }

    if (sub === "events" && req.method === "POST") {
      const body = await readBody(req);
      if (!Array.isArray(body?.events)) return sendJson(res, 400, apiError("invalid_request_error", null, "events: expected an array."));
      for (const ev of body.events) {
        if (ev.type === "agent.session.input.message") {
          const text = ev.input?.[0]?.content?.[0]?.text;
          if (typeof text !== "string") return sendJson(res, 400, apiError("invalid_request_error", null, "input[0].content[0].text is required."));
          sendJson(res, 202, {});
          void startTurn(s, text);
          return;
        }
        if (ev.type === "agent.session.input.computer_use_approval_request_result") {
          const pending = s.json.required_actions.find((a: any) => a.request_id === ev.request_id);
          if (!pending) return sendJson(res, 404, apiError("not_found_error", null, "No pending request with that request_id."));
          if (ev.response?.type !== pending.request.type) return sendJson(res, 400, apiError("invalid_request_error", null, "response.type does not match the request."));
          s.json.required_actions = [];
          s.json.status = "in_progress";
          sendJson(res, 202, {});
          void continueTurn(s, ev.response.decision);
          return;
        }
        if (ev.type === "agent.session.input.cancel") {
          seen.cancels.push(s.json.id);
          sendJson(res, 202, {});
          if (s.turn && !["completed", "failed", "cancelled"].includes(s.turn.status)) {
            Object.assign(s.turn, { status: "cancelled", completed_at: nowSec(), usage: USAGE });
            s.json.status = "idle";
            void emit(s, { type: "agent.session.turn.cancelled", turn_id: s.turn.id, turn: s.turn, usage: USAGE });
          }
          return;
        }
        return sendJson(res, 400, apiError("invalid_request_error", null, `Unknown input event type: ${ev.type}`));
      }
      return sendJson(res, 400, apiError("invalid_request_error", null, "events must not be empty."));
    }

    if (sub === "items" && req.method === "GET") {
      const last = s.items.at(-1);
      return sendJson(res, 200, { object: "list", data: s.items, first_id: s.items[0]?.id ?? null, last_id: last?.id ?? null, has_more: false });
    }

    if (sub === "turns" && subId && req.method === "GET") {
      if (s.turn?.id !== subId) return sendJson(res, 404, apiError("not_found_error", null, "No such turn."));
      return sendJson(res, 200, s.turn);
    }

    return sendJson(res, 404, apiError("not_found_error", null, "Unknown route."));
  } catch (err) {
    sendJson(res, 500, apiError("server_error", "internal_error", String(err)));
  }
});

// ── Self-test ─────────────────────────────────────────

type Check = [string, boolean];
type Scenario = { name: string; args: string[]; exitCode: number; checks: (s: any, output: string) => Check[] };

const SCENARIOS: Scenario[] = [
  {
    name: "approve",
    args: ["Open https://en.wikipedia.org and look up Model Context Protocol"], // plain-text task
    exitCode: 0,
    checks: (s) => [
      ["task taken from the plain-text argument", /^Open https:\/\/en\.wikipedia\.org/.test(s.task ?? "")],
      ["turn completed", s.outcome === "completed"],
      ["site named in the task auto-approved (HTTP 202)", s.approvals[0]?.decision === "approve" && s.approvals[0]?.status === 202],
      ["final answer kept apart from commentary", /^Model Context Protocol/.test(s.answer ?? "") && s.texts[0]?.phase === "commentary"],
      ["steps paired added → done", s.steps.length === 2 && s.steps.every((st: any) => st.status === "completed" && st.endedAt >= st.startedAt)],
      ["screenshot saved from item.done", s.verify.screenshotsInStream === true && s.verify.stepsWithScreenshot === "1 of 2"],
      ["usage read from the turn event", s.usage?.input_tokens === 1234 && s.usageSource === "turn event .usage"],
      ["cost estimated", typeof s.costUSD === "number" && s.costUSD > 0],
      ["SSE event: lines and comments parsed", s.verify.sseUsesEventField && s.sse.comments >= 1],
      ["session deleted", s.deleted === true && seen.deletes.includes(s.sessionId)],
    ],
  },
  {
    name: "deny",
    args: ["--task", "Look up Model Context Protocol on Wikipedia", "--allow", "example.com"],
    exitCode: 0,
    checks: (s) => [
      ["turn completed", s.outcome === "completed"],
      ["unlisted site denied without a terminal", s.approvals[0]?.decision === "deny"],
      ["session deleted", s.deleted === true],
    ],
  },
  {
    name: "no-task",
    args: [],
    exitCode: 1,
    checks: (s, output) => [
      ["explains how to give a task", output.includes("No task given")],
      ["nothing sent to the API", s.sessionId === undefined],
    ],
  },
  {
    name: "timeout",
    args: ["--task", "STALL forever", "--timeout", "1"],
    exitCode: 1,
    checks: (s) => [
      ["outcome is timeout", s.outcome === "timeout"],
      ["turn cancel sent", seen.cancels.includes(s.sessionId)],
      ["session deleted", s.deleted === true],
    ],
  },
  {
    name: "bad-model",
    args: ["--task", "Open https://example.com", "--model", "no-such-model"],
    exitCode: 1,
    checks: (s) => [
      ["create failure reported", s.outcome === "create_failed" && s.error?.status === 404 && s.error?.error?.code === "model_not_found"],
      ["no session id recorded", s.sessionId === null],
    ],
  },
];

function runSpike(base: string, out: string, args: string[]): Promise<{ code: number | null; output: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(ROOT, "scripts/spike-computer-use.ts"), "--base-url", base, "--out", out, ...args], {
      env: { ...process.env, OPENAI_API_KEY: "sk-mock" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("exit", (code) => done({ code, output }));
  });
}

async function selfTest() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const verbose = process.argv.includes("--verbose");
  let failed = 0;

  for (const sc of SCENARIOS) {
    const out = join(ROOT, "spikes/out/selftest", sc.name);
    rmSync(out, { recursive: true, force: true });
    const { code, output } = await runSpike(base, out, sc.args);
    let summary: any = {};
    try {
      summary = JSON.parse(readFileSync(join(out, "summary.json"), "utf8"));
    } catch {
      // checks below fail and the output is printed
    }
    const checks: Check[] = [[`exit code ${sc.exitCode}`, code === sc.exitCode], ...sc.checks(summary, output)];
    const ok = checks.every(([, pass]) => pass);
    if (!ok) failed++;
    console.log(`${ok ? "✓" : "✗"} ${sc.name}`);
    for (const [label, pass] of checks) if (!pass || verbose) console.log(`    ${pass ? "✓" : "✗"} ${label}`);
    if (!ok || verbose) console.log(output.replace(/^/gm, "    │ "));
  }

  server.close();
  console.log(failed ? `\n${failed} of ${SCENARIOS.length} scenarios failed` : `\nAll ${SCENARIOS.length} scenarios passed`);
  process.exit(failed ? 1 : 0);
}

if (process.argv.includes("--serve")) {
  server.listen(8799, "127.0.0.1", () => console.log("Mock Agents API on http://127.0.0.1:8799/v1"));
} else {
  await selfTest();
}
