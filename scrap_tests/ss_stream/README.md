# ss_stream: can we watch hosted computer use as a live video?

A scrap test. It runs one browser task with the Agents API's hosted `computer_use` tool and
collects every frame it can get, from two sources. It shows them live in a local viewer, then
turns them into `.webm` videos.

| Source | How frames arrive | What the docs promise |
|---|---|---|
| **api** | `computer_use_call` items in the SSE stream, `output.image_url` (with `include_screenshots: true`) | "Each browser operation returns its **last** emitted screenshot … Some operations return `output: null`." There is no frame stream, no frame-rate option and no live-view URL. The tool has one setting, `include_screenshots`. |
| **sidecar** | Our recorder, [`sandbox/recorder.mjs`](sandbox/recorder.mjs), runs *inside* the hosted sandbox (started by a `setup_commands` entry). It looks for a way to see the browser, takes a screenshot about once a second, and pushes each frame to this laptop through a cloudflared quick tunnel. | Not documented. It's an experiment: it works only if the sandbox can reach the browser (a DevTools port or an X display). |

## Run it

```bash
npm run scrap:ss                                   # asks for the task
npm run scrap:ss -- "Open https://example.com and read the heading"
npm run scrap:ss -- --mode plain --sidecar off     # the Phase -1 baseline (API frames only)
npm run scrap:ss -- --dry-run                      # print the request bodies
node scrap_tests/ss_stream/video.ts <run-dir>      # rebuild the videos from a run's timeline.json
```

- The viewer opens at <http://127.0.0.1:4410>, with API frames on the left and sidecar frames on the right. Each frame shows its age, so you can see how stale the "live" view is.
- **Sites:** any site named with `https://` in the task is approved automatically. For other sites you're asked in the terminal; without a terminal they're denied.
- **`--mode prompted`** (the default) tells the agent to work in small steps and end each one with a screenshot, which is the most the API path can give. `--mode plain` uses the Phase -1 instructions.
- **`--sidecar setup|agent|off`:** `agent` asks the agent to start the recorder itself. Use it if the setup command's background process gets killed.
- **Videos:** these need no install. They use ffmpeg from PATH, or else the copy Playwright downloaded (`~/Library/Caches/ms-playwright/ffmpeg-*`, JPEG in, VP9 WebM out). Each frame is held until the next one arrived, capped at 5 s.
- **Testing without the API:** run `node scripts/mock-agents-api.ts --serve`, then add `--base-url http://127.0.0.1:8799/v1 --local-sidecar http://127.0.0.1:<devtools-port>`. The second flag runs the recorder on this laptop against a local Chrome, through the real tunnel.

Output goes to `out/<timestamp>/` (gitignored): `frames/`, `sidecar/live/` (pushed frames and
probes), `sidecar/artifacts/` (what the recorder left in `/workspace/outputs`), `timeline.json`,
`replay.html`, `video-api.webm`, `video-sidecar.webm` and `summary.json`.

## Verified offline (2026-10-10)

- **Mock API run:** steps, approvals, API frames, viewer, timeline, replay and video all work.
- **Recorder against a real headless Chromium with a DevTools port:** it finds the port, takes 1 frame/s with `Page.captureScreenshot`, and pushes frames, probes and log lines.
- **End to end through a real cloudflared quick tunnel** (mock API plus the local recorder): live frames reach the viewer at 1.0 fps, and `video-sidecar.webm` is built.
- **Tunnel gotcha:** asking for a brand-new `*.trycloudflare.com` hostname right away caches an NXDOMAIN on macOS. The script now waits for `Registered tunnel connection`, plus 6 s, before its self-test.

## Live results (2026-10-10, gpt-6.1-sol)

**Verdict: no.** Hosted computer use can't be turned into a live video. The API gives at most
one screenshot per browser step, delivered when the step ends. Nothing we run in the sandbox
can see the browser.

| Run | Mode | Browser steps | Steps with a screenshot | API frames | Gap between frames |
|---|---|---|---|---|---|
| Phase -1 (`spikes/out/cu-…`) | plain | 10 | 1 | 1 | — |
| `out/live-1` | prompted | 5 | 2 | 2 | 4.1 s |
| `out/live-2` | prompted | 6 | 3 | 3 | 9.2 s (median), 0.15 fps |

**API path**
- Telling the agent to "end every browser step with a screenshot" works for real actions (open, click, scroll). Housekeeping steps ("Connecting to Wikipedia", "Checking the open browser", "Finding the first article link") still return `output: null`.
- A frame shows the result of a step, not the action in progress. It arrives on `item.done`, every 4–9 s while the agent is active.
- Nothing arrives for the first 35–45 s after the task is sent, while the environment starts.
- **Screenshots exist only in the live stream.** `GET /items` after the turn returned `output: null` for every step (0 of 5 in live-1), although the docs say streamed and saved items have the same shape. To keep frames, save them from the stream.
- Frames are 1348 × 926 JPEGs, about 170 KB each, showing the browser viewport (the agent's cursor is visible).
- `video-api.webm` is therefore a slideshow: 11 s for live-2.

**Sidecar path**
- What works:
  - `setup_commands` can start a background process. It keeps running for the whole turn and isn't killed when setup ends.
  - The sandbox reaches the internet only through `HTTPS_PROXY=http://proxy:8080`, an envoy MITM proxy with its own CA. Node's `fetch` ignores the proxy and times out. `curl` honours it, so the recorder pushes through `curl`.
  - With that change, probes and logs arrived live on the laptop through the cloudflared tunnel.
- What doesn't: **the browser isn't in the sandbox.** No X display, no listening ports, no browser processes. The hosted browser skill (`/workspace/.managed-agents/browser/skills/browser/SKILL.md`, mounted after setup) says so:
  > Browser work runs in a separate container from the main executor.
- How the agent drives it:
  - Through a Node REPL tool (`mcp__node_repl__js`) that runs in that browser container, using `browser-client.mjs` → `agent.browsers.get("cdp")` → `tab.playwright`.
  - Each `computer_use_call` (IDs start with `exec-`) is one of those JS runs, and its screenshot is the last one that run took.
  - From the sandbox, the browser container shows up only as `gaas-browser` in `NO_PROXY` (a private 172.31.x address). We didn't probe it: it's internal OpenAI infrastructure, not an API.

**What this means for SquadLings**
- Hosted computer use can feed a progress view: step titles, commentary, and a fresh screenshot after each real action. It can't feed live tiles at ≥ 5 fps (US-03).
- A real-time view needs a browser we run (Playwright plus a CDP screencast, master.md §14.6), which is the core design.
- One untested idea: ask the agent to start a screenshot timer inside its own browser REPL that posts frames to our tunnel. It would depend on the prompt, could get in the way of the agent's own browser work, and the browser's network calls may need origin approval. Not worth it next to our own Playwright.
