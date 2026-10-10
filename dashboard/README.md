# SquadLings Character Studio

Local frontend for the character/animation brief in `docs/Rough/characters-animation-prompt.md`. No backend, key, or paid API is needed.

From the repository root, with **Node.js 22.12 or newer**:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/** for the studio or **http://127.0.0.1:5173/lab** for its development Lab entry. The `/lab` label/link is development-only. The build still includes the explicitly simulated studio demonstration.

## Demo

1. Meet Plum, Lime, Tango, Blu, and Sky. Select a character and try an expression or boop.
2. Change squad size with the slider, arrow keys, Home/End, or PageUp/PageDown. Pick Trip Planner, QA Swarm, or Auto.
3. Play a sample run. Watch the tiles, shared board, and reports to the Master.
4. Use event buttons to try a particular reaction. Approval controls act only on this simulated run.
5. Inspect all 50 expressions, the emote set, activity icons, and Master states in Face gallery.
6. Toggle reduced motion and sound. In Squad in action, choose 1×/2×/4× speed, a deterministic seed, 8 fps synthetic load streams, or mobile Tango for the next run. In `/lab`, try leaving the last bot on the bench.
7. Open More reactions & states to preview safety blocks, gates, loading, login requests, pause/resume, deliveries, bugs, or a terminal failure. Pause/resume only previews the UI; browser takeover is not connected.

Browser pages and findings are synthetic and labelled **SIMULATED**. The estimate in the squad builder is the supplied spec's real-run planning estimate, not measured cost. The Lab makes no API calls.

## Commands

```sh
npm run check          # TypeScript
npm run build          # TypeScript + production bundle in dashboard/dist
npm test               # 36 pure logic tests
npm run test:browser   # 9 Playwright interaction checks
npm run preview        # Serve the production build at http://127.0.0.1:4173
npm run perf           # 20-second synthetic load measurement; needs a running server
```

Use Node 22 for both installation and commands. Node 18 can skip Vite's native optional dependency and cannot run the current toolchain. If this happens, switch Node versions and run `npm install --include=optional`.

## Backend handoff

- `packages/shared/src/types.ts` matches the supplied master spec §26. `events.ts` implements §18's complete catalogue, with `SwarmEvent` and `SquadLingsEvent` as equivalent names.
- `store/reducer.ts` and `mood/*` are pure functions taking explicit event time. Zustand selectors isolate bot slices. Frames are excluded from the store.
- Pass validated `SwarmEvent` objects to `consumeEvent(event, { reduced, speed })` in `src/ingest.ts`. Both the Lab and future transport/replay adapters use this entry point. It sends JPEG frames directly to `FrameCanvas`, and other events to the director and pure reducer.
- `director/director.ts` routes cursor events to registered actors, queues events received before a tile mounts, and cancels pending effects on reset. `cursor.move`, `cursor.click`, and `cursor.scroll` do not replace bot view state or re-render other tiles.
- The Vite development proxy reserves `/api` and `/ws` for `127.0.0.1:8787`. It does not connect automatically. Backend transport, snapshot hydration, real approval actions, and replay recording are separate work.
- Preserve event coordinates in original viewport pixels. The overlay maps to its own inner canvas using `ResizeObserver`, including mobile.
- Colour sources and the intentional update from the brief are recorded in [brand-sources.md](../docs/reference/brand-sources.md).

## Verification

Verified using Node 22.23.3 and installed Google Chrome 150 on this host:

- TypeScript and production build pass.
- 36 Vitest checks cover priority, expiry, minimum holds, permanent moods, emote queues, deterministic playback, state isolation, actual step counts, benches, input limits, and desktop/mobile coordinate mapping.
- 9 Playwright checks cover slider keyboard/rapid scrubbing, expression selection, 50-face gallery, full five-bot completion, OS reduced motion, phone overflow, approvals/reset, pointer and ripple placement within 2 px, bench/focus behaviour, and per-bot render isolation. Development counters confirm one bot's event does not execute another tile component.
- A 20-second production measurement (starting 500 ms after all five tiles mounted, excluding startup) at 1440 × 1000 with five synthetic 8 fps canvases and finish/confetti effects measured **59.9 fps average, 16.7 ms p95, zero long tasks over 50 ms, and zero page errors**. The earlier development run measured 49.1 fps / 33.4 ms p95; removing app-wide event subscriptions and cursor-driven view updates and testing the production bundle improved the measured result.
- This synthetic, headless measurement is not a certification for five live browser sessions or the event projector. Repeat the rehearsal on the demo laptop with real backend frames.

The test config uses installed Chrome automatically on macOS when available; set `PLAYWRIGHT_CHANNEL=chrome` explicitly if desired. On supported systems, install bundled Chromium with `npx playwright install chromium`. The current bundled browser does not support this host's macOS 12.

For a production measurement, start `npm run preview` in another terminal, then:

```sh
PREVIEW_URL=http://127.0.0.1:4173 npm run perf
```

Screenshots and the measured JSON report are generated under `dashboard/artifacts/` (ignored by Git). The official Master artwork is the unmodified DevDay SVG, with opacity/state rings used instead of drawing a modified outline logo. Real transport, recorded replay, snapshot hydration, browser takeover, and backend approvals remain backend integration work. No live API or hosted deployment is claimed.
