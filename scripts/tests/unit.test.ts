// Unit tests for the pure parts of scripts/lib (node:test; no browser, no network).
//   node --test scripts/tests/*.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { SiteGate, hostsIn, siteOf } from "../lib/site-gate.ts";
import { newSseStats, readSse } from "../lib/agents-api.ts";
import { estimateCost } from "../lib/pricing.ts";
import { localToday } from "../lib/run-kit.ts";
import { searchAction } from "../lib/agent-session.ts";
import { tiles } from "../lib/layout.ts";
import { appendLines } from "../lib/mcp-browser-server.ts";
import { parseRunOptions } from "../lib/squad-runner.ts";
import type { RunOptions } from "../lib/squad-runner.ts";

const tick = () => new Promise((r) => setTimeout(r, 0));

test("hostsIn keeps sites and drops sentence punctuation and www.", () => {
  assert.deepEqual(hostsIn("Open https://news.ycombinator.com, then https://www.example.com/a. Also (https://x.org)."), ["news.ycombinator.com", "example.com", "x.org"]);
  assert.deepEqual(hostsIn("no links here"), []);
});

test("siteOf normalizes case, a trailing dot and www.", () => {
  assert.equal(siteOf("WWW.Google.com."), "google.com");
});

test("SiteGate: an allowed site covers its subdomains; '*' allows everything", () => {
  const gate = new SiteGate(["www.google.com"], { ask: async () => false });
  assert.equal(gate.check("google.com"), "allowed");
  assert.equal(gate.check("consent.google.com"), "allowed");
  assert.equal(gate.check("notgoogle.com"), "unknown");
  assert.equal(new SiteGate(["*"], { ask: async () => false }).check("anything.org"), "allowed");
});

test("SiteGate: one question per site, however many callers; the answer is remembered", async () => {
  let asks = 0;
  const decisions: string[] = [];
  const gate = new SiteGate([], { ask: async () => (asks++, true), onDecision: (s, ok) => decisions.push(`${s}:${ok}`) });
  assert.deepEqual(await Promise.all([gate.request("www.bing.com"), gate.request("bing.com")]), ["allowed", "allowed"]);
  assert.equal(await gate.request("cn.bing.com"), "allowed");
  assert.equal(asks, 1);
  assert.deepEqual(decisions, ["bing.com:true"]);
});

test("SiteGate: a denial sticks", async () => {
  let asks = 0;
  const gate = new SiteGate([], { ask: async () => (asks++, false) });
  assert.equal(await gate.request("evil.example"), "denied");
  assert.equal(await gate.request("www.evil.example"), "denied");
  assert.equal(gate.check("evil.example"), "denied");
  assert.equal(asks, 1);
});

test("SiteGate: waitMs gives 'pending'; the late answer still applies", async () => {
  let answer!: (yes: boolean) => void;
  const gate = new SiteGate([], { ask: () => new Promise<boolean>((r) => (answer = r)) });
  assert.equal(await gate.request("slow.org", { waitMs: 20 }), "pending");
  assert.equal(gate.check("slow.org"), "unknown");
  answer(true);
  await tick();
  assert.equal(gate.check("slow.org"), "allowed");
});

test("SiteGate: a question that fails (run stopping) is 'pending' and can be asked again", async () => {
  let asks = 0;
  const gate = new SiteGate([], { ask: async () => (++asks === 1 ? Promise.reject(new Error("stopped")) : true) });
  assert.equal(await gate.request("x.org"), "pending");
  assert.equal(await gate.request("x.org"), "allowed");
  assert.equal(asks, 2);
});

test("SiteGate: decided() lets a waiting question use a wider answer without a second decision", async () => {
  const waiting: { site: string; decided: () => boolean | undefined; resolve: (yes: boolean) => void }[] = [];
  const decisions: string[] = [];
  const gate = new SiteGate([], {
    ask: (site, _reason, decided) => new Promise<boolean>((resolve) => waiting.push({ site, decided, resolve })),
    onDecision: (s, ok) => decisions.push(`${s}:${ok}`),
  });
  const narrow = gate.request("news.example.com");
  const wide = gate.request("example.com");
  waiting[1].resolve(true);
  assert.equal(await wide, "allowed");
  assert.equal(waiting[0].decided(), true);
  waiting[0].resolve(waiting[0].decided()!);
  assert.equal(await narrow, "allowed");
  assert.deepEqual(decisions, ["example.com:true"]);
});

test("readSse: LF and CRLF (split across chunks), comments, multi-line data; a cut-off last event is dropped", async () => {
  const chunks = ["event: a\r", '\ndata: {"x":1}\r\n\r\n', ": keep-alive\n\n", "data: line1\ndata: line2\n\n", "data: tail"];
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk));
      c.close();
    },
  });
  const stats = newSseStats();
  const got: [string | undefined, string][] = [];
  for await (const m of readSse(stream, stats)) got.push([m.event, m.data]);
  assert.deepEqual(got, [["a", '{"x":1}'], [undefined, "line1\nline2"]]); // "data: tail" has no closing blank line
  assert.deepEqual(stats, { messages: 2, eventField: 1, idField: 0, comments: 1 });
});

test("estimateCost uses cached and uncached input and output prices", () => {
  // Luna: 500k uncached × $0.10 + 500k cached × $0.01 + 100k out × $0.50, per 1M tokens
  assert.equal(estimateCost("gpt-6-luna", { input_tokens: 1_000_000, input_tokens_details: { cached_tokens: 500_000 }, output_tokens: 100_000 }), 0.105);
  assert.equal(estimateCost("unknown-model", { input_tokens: 1 }), null);
  assert.equal(estimateCost("gpt-6-luna", null), null);
});

test("localToday gives the local date, weekday, time and time zone (not the UTC date)", () => {
  const d = new Date(2026, 9, 11, 3, 12); // 11 Oct 2026, 03:12 local
  assert.match(localToday(d), /^2026-10-11 \(Sunday, 03:12 in [\w/+-]+\); tomorrow is 2026-10-12 \(Monday\)$/);
  assert.match(localToday(new Date(2026, 11, 31, 23, 59)), /tomorrow is 2027-01-01 \(Friday\)$/);
});

test("searchAction describes searches and page opens (live shapes, 2026-10-11)", () => {
  assert.equal(searchAction({ action: { type: "search", query: "nodejs latest", queries: null } }), '"nodejs latest"');
  assert.equal(searchAction({ action: { type: "search", query: "", queries: ["a", "b"] } }), '"a | b"');
  assert.equal(searchAction({ action: { type: "open_page", url: "https://news.ycombinator.com" } }), "open https://news.ycombinator.com");
  assert.equal(searchAction({ action: { type: "search", query: "" } }), "(query not shown)");
});

test("tiles: 3 × 2 grid in reading order, the last cell left free, zoom for a 1280 px page", () => {
  const t = tiles({ left: 0, top: 33, width: 1512, height: 882 }, 5);
  assert.equal(t.length, 5);
  assert.deepEqual(t.map((c) => [c.left, c.top]), [[0, 33], [504, 33], [1008, 33], [0, 474], [504, 474]]);
  assert.ok(t.every((c) => c.width === 504 && c.height === 441 && Math.abs(c.zoom - 504 / 1280) < 1e-9));
  assert.equal(tiles({ left: 0, top: 0, width: 4000, height: 2000 }, 9).length, 5); // never more than 5, zoom ≤ 1
  assert.equal(tiles({ left: 0, top: 0, width: 4000, height: 2000 }, 1)[0].zoom, 1);
});

test("appendLines adds to the last text part, or adds a text part after an image", () => {
  const text = appendLines({ content: [{ type: "text", text: "a" }] }, ["Messages:", "• hi"]);
  assert.equal((text.content[0] as any).text, "a\nMessages:\n• hi");
  const image = appendLines({ content: [{ type: "image", data: "x", mimeType: "image/jpeg" }] }, ["b"]);
  assert.equal(image.content.length, 2);
  assert.equal(appendLines({ content: [{ type: "text", text: "a" }] }, []).content.length, 1);
});

test("parseRunOptions: fills defaults, checks ranges and ids, cleans the site list", () => {
  const d: RunOptions = { bots: 5, masterModel: "gpt-6.1-sol", botModel: "gpt-6-luna", maxActions: 30, timeoutMin: 20, webSearch: true, allowDirect: false, allow: [], fresh: false };
  assert.deepEqual(parseRunOptions(undefined, d), { ...d, masterEffort: undefined, botEffort: undefined });
  const o = parseRunOptions({ bots: "3", maxActions: 40, masterEffort: "high", botEffort: "", allow: "example.com, docs.example.org bad/site <x>" }, d);
  assert.equal(o.bots, 3);
  assert.equal(o.maxActions, 40);
  assert.equal(o.masterEffort, "high");
  assert.equal(o.botEffort, undefined);
  assert.deepEqual(o.allow, ["example.com", "docs.example.org"]);
  assert.throws(() => parseRunOptions({ bots: 6 }, d), /Bots must be between 1 and 5/);
  assert.throws(() => parseRunOptions({ masterModel: "gpt 6; rm -rf" }, d), /isn't a model id/);
  assert.throws(() => parseRunOptions({ botEffort: "turbo" }, d), /Bot effort must be one of/);
  assert.throws(() => parseRunOptions({ timeoutMin: 0 }, d), /Time limit/);
  // Each effort fits its model: gpt-6.1-sol refuses "none" (it runs at "low"); gpt-6-luna takes it.
  assert.equal(parseRunOptions({ botModel: "gpt-6.1-sol", botEffort: "none" }, d).botEffort, "low");
  assert.equal(parseRunOptions({ botEffort: "none" }, d).botEffort, "none");
  assert.equal(parseRunOptions({ botEffort: "minimal" }, d).botEffort, "low");
  assert.equal(parseRunOptions({ masterEffort: "none" }, d).masterEffort, "low");
});
