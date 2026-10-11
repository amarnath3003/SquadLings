// Speed benchmark for BotBrowser actions on a local site (no OpenAI, no network).
// Each case checks that the result still shows the right page state, so faster can't mean wrong.
//
//   node scripts/tests/bench-browser.ts            # prints a table; exits 1 if a correctness check fails
//   node scripts/tests/bench-browser.ts --json     # machine-readable

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { BotBrowser } from "../lib/browser.ts";
import { SiteGate } from "../lib/site-gate.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PAGES: Record<string, string> = {
  "/": `<title>Home</title><main><h1>Home</h1>
    <input aria-label="Search"><button onclick="document.getElementById('out').textContent='Clicked!'">Change text</button>
    <p id="out">Not yet</p><a href="/next">Next page</a><a href="/busy">Busy page</a><a href="/spa">App page</a><a href="/img">Image page</a>
    <div style="height:3000px"></div></main>`,
  "/next": `<title>Next</title><main><h1>Next page</h1><a href="/">Home</a></main>`,
  // Like Bing: the network never goes quiet (polling every 300 ms).
  "/busy": `<title>Busy</title><main><h1>Busy page</h1><a href="/next">Next page</a>
    <button onclick="document.getElementById('o').textContent='Busy clicked'">Busy button</button><p id="o">idle</p></main>
    <script>setInterval(() => fetch('/ping?' + Date.now()), 300)</script>`,
  // A single-page app: the click fetches data (300 ms server delay) and renders it.
  "/spa": `<title>App</title><main><h1>App</h1><button id="b">Load results</button><ul id="r"></ul></main>
    <script>document.getElementById('b').onclick = async () => {
      const d = await (await fetch('/data')).json();
      document.getElementById('r').innerHTML = d.items.map((i) => '<li><a href="/next">' + i + '</a></li>').join('');
    };</script>`,
  // A big image that takes 2 s: it doesn't change the element list.
  "/img": `<title>Image</title><main><h1>Image page</h1><img src="/slow.jpg" alt="slow picture" width="300" height="200"><a href="/next">Next page</a></main>`,
};

const site = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  if (path === "/ping") return res.writeHead(204).end();
  if (path === "/data") {
    await sleep(300);
    return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ items: ["Loaded result one", "Loaded result two"] }));
  }
  if (path === "/slow.jpg") {
    await sleep(2000);
    return res.writeHead(404).end();
  }
  const html = PAGES[path];
  if (!html) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html>${html}`);
});
await new Promise<void>((r) => site.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;

const browser = await BotBrowser.launch({
  headless: true,
  viewport: { width: 1280, height: 800 },
  showCursor: true,
  color: "#5B30A6",
  label: "Plum",
  glideMs: 350,
  sites: new SiteGate(["127.0.0.1"], { ask: async () => false }),
  onKeyframe: () => {},
});

const refOf = (text: string, pattern: RegExp) => {
  const line = text.split("\n").find((l) => /^\[\d+\]/.test(l) && pattern.test(l));
  return line ? Number(/^\[(\d+)\]/.exec(line)![1]) : -1;
};

type Row = { name: string; ms: number; ok: boolean };
const rows: Row[] = [];
async function measure(name: string, fn: () => Promise<string>, expect: RegExp) {
  const t0 = performance.now();
  const out = await fn();
  rows.push({ name, ms: Math.round(performance.now() - t0), ok: expect.test(out) });
  if (!expect.test(out)) console.error(`✗ ${name}: expected ${expect}\n${out.replace(/^/gm, "    │ ")}`);
  return out;
}

try {
  let r = await measure("open (plain page)", () => browser.open(`${BASE}/`, "Open home"), /Page: "Home"/);
  r = await measure("click, same page (DOM change)", () => browser.click(refOf(r, /button "Change text"/), "Change the text"), /Page: "Home"/);
  r = await measure("type, no submit", () => browser.type(refOf(r, /textbox "Search"/), "hello", "Type a word"), /value="hello"/);
  r = await measure("scroll down", () => browser.scroll("down", "page", "Scroll down"), /scrolled [1-9]\d*%/);
  r = await measure("scroll up", () => browser.scroll("up", "page", "Scroll up"), /scrolled 0%/);
  r = await measure("click link (navigation)", () => browser.click(refOf(r, /link "Next page"/), "Go to next"), /Page: "Next"/);
  r = await measure("back", () => browser.back("Go back"), /Page: "Home"/);
  r = await measure("open busy page (network never idle)", () => browser.open(`${BASE}/busy`, "Open busy page"), /Page: "Busy"/);
  r = await measure("click on busy page (DOM change)", () => browser.click(refOf(r, /button "Busy button"/), "Click busy button"), /Page: "Busy"/);
  r = await measure("click link on busy page (navigation)", () => browser.click(refOf(r, /link "Next page"/), "Leave busy page"), /Page: "Next"/);
  r = await measure("open app page", () => browser.open(`${BASE}/spa`, "Open the app"), /Page: "App"/);
  r = await measure("click that fetches + renders (300 ms API)", () => browser.click(refOf(r, /button "Load results"/), "Load results"), /link "Loaded result one"/);
  r = await measure("open page with a 2 s image", () => browser.open(`${BASE}/img`, "Open image page"), /Page: "Image"/);
} finally {
  await browser.close();
  site.close();
}

const total = rows.reduce((s, r) => s + r.ms, 0);
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ rows, total }));
} else {
  for (const r of rows) console.log(`${r.ok ? "✓" : "✗"} ${r.name.padEnd(44)} ${String(r.ms).padStart(6)} ms`);
  console.log(`${"total".padStart(46)} ${String(total).padStart(6)} ms`);
}
process.exit(rows.every((r) => r.ok) ? 0 : 1);
