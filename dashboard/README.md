# SquadLings Character Studio

Local frontend for the character/animation brief in `docs/Rough/characters-animation-prompt.md`. No backend, key, or paid API is needed.

From the repository root, with **Node.js 22.12 or newer**:

```sh
nvm use               # Reads the root .nvmrc; nvm install if missing
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/** for the studio or **http://127.0.0.1:5173/lab** for its development Lab entry. The `/lab` label/link is development-only. The build still includes the explicitly simulated studio demonstration.

## Demo

1. Meet Plum, Lime, Tango, Blu, and Sky in their living room. Move the pointer nearby and watch their gaze follow. Each bot breathes, blinks, shifts its weight, and has its own gestures.
2. Try **Say hello**, **Dance break**, **Pass a spark**, **Surprise them**, or **Nap time / Wake up**. Drag a character and release it to spring home. They also exchange short, prewritten remarks; **Chatter** switches those off.
3. Select a character and preview expressions. Press and release a boop target for squash, a happy reaction, blush, hearts, and optional sound. Enter/Space also works.
4. Change squad size with the slider, arrow keys, Home/End, or PageUp/PageDown. Pick Trip Planner, QA Swarm, or Auto.
5. Play a sample run. Watch the tiles, shared board, and reports to the Master.
6. Use event buttons to try a particular reaction. Approval controls act only on this simulated run.
7. Inspect all 50 expressions, the emote set, activity icons, and Master states in Face gallery.
8. Enable the toolbar speaker for UI/workflow effects and five original cartoon gibberish voices. **Sound settings** offers master volume (35% initially) and separate effects, voices, and idle chatter switches. The mix is saved; each page load starts muted. Face gallery has a voice audition bank and playable expressions. Reduced motion keeps audio and makes the speaking halo static.
9. In Squad in action, choose 1×/2×/4× speed, a deterministic seed, 8 fps synthetic load streams, or mobile Tango for the next run. In `/lab`, try leaving the last bot on the bench.
10. Open More reactions & states to preview safety blocks, gates, loading, login requests, pause/resume, deliveries, bugs, or a terminal failure. Pause/resume only previews the UI; browser takeover is not connected.

Browser pages and findings are synthetic and labelled **SIMULATED**. The estimate in the squad builder is the supplied spec's real-run planning estimate, not measured cost. The Lab makes no API calls.

## Commands

```sh
npm run check          # TypeScript
npm run build          # TypeScript + production bundle in dashboard/dist
npm test               # Logic and audio policy/event tests
npm run test:browser   # Interaction and offline audio rendering checks
npm run preview        # Serve the production build at http://127.0.0.1:4173
npm run perf           # 20-second synthetic load measurement; needs a running server
```

Use a compatible Node version for both installation and commands. The root `.nvmrc` selects Node 24. If `nvm` is installed but unavailable, run `source "$HOME/.nvm/nvm.sh"`, then `nvm use` from the repository root. A `node:util` / `styleText` export error on `npm run dev` means the terminal is still using Node 18; switching versions fixes it. Node 18 can also skip Vite's native optional dependency during installation. If a native dependency is missing after switching, run `npm install --include=optional`.

See [sound-design.md](../docs/reference/sound-design.md) for sound coverage, backend event mapping, voice auditions, and sound-enabled performance commands.

## How the characters stay alive

`characters/useCharacterLife.ts` owns ambient body/gaze/blink values independently from the event-driven cursor rig. Nine gesture sequences include anticipation, movement, and a soft settle. Each character has a different habit mix and tempo in `characters/life.ts`; breathing and shadows use CSS transforms. A single shared pointer listener updates motion values without frame-by-frame React renders. Portraits get autonomous gestures and wandering glances; small cursor bots combine continuous breathing/blinking with their event-driven action gestures to keep the five-stream view smooth.

Ambient activity stops when a character leaves the viewport, the document is hidden, or the character is paused. Reduced motion retains expressions and readable reactions while disabling breathing, gestures, dragging, and particles. Task errors and approvals retain their event-driven faces. The studio's chatter and social scenes are local, prewritten entertainment; no model calls, conversation memory, or autonomous backend work is involved.

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
- 14 Playwright checks cover slider keyboard/rapid scrubbing, expression selection, 50-face gallery, full five-bot completion, OS reduced motion, phone overflow, approvals/reset, pointer and ripple placement within 2 px, bench/focus behaviour, and per-bot render isolation. The five living-room checks additionally cover breathing/gaze, group reactions, repeated boops, naps/wake-up, reduced motion/offscreen suspension, conversations, drag return, and blink geometry. Development counters confirm one bot's event does not execute another tile component.
- Production measurements at 1440 × 1000, each over 20 seconds after startup: the living room with continuous pointer tracking, dance, and a spark pass measured **58.9 fps average / 16.8 ms p95**; the five-stream run measured **60.0 fps / 16.7 ms p95**. Both reported **zero long tasks over 50 ms and zero page errors**. The run uses five synthetic 8 fps canvases and includes finish/confetti effects.
- The first run with full ambient gestures on cursor-sized bots measured 53.7 fps / 33.3 ms p95 and 12 long tasks. Limiting autonomous gestures to portraits while retaining cursor breathing/blinking and event-driven movement produced the final run measurement above. These are samples, not guaranteed frame rates.
- This synthetic, headless measurement is not a certification for five live browser sessions or the event projector. Repeat the rehearsal on the demo laptop with real backend frames.

The test config uses installed Chrome automatically on macOS when available; set `PLAYWRIGHT_CHANNEL=chrome` explicitly if desired. On supported systems, install bundled Chromium with `npx playwright install chromium`. The current bundled browser does not support this host's macOS 12.

For a production measurement, start `npm run preview` in another terminal, then:

```sh
PREVIEW_URL=http://127.0.0.1:4173 npm run perf
PERF_SCENE=studio PREVIEW_URL=http://127.0.0.1:4173 npm run perf
```

The default performance scene measures the five-stream sample run. `PERF_SCENE=studio` measures the living room with continuous synthetic pointer movement, a dance, and a spark pass.

Screenshots and the measured JSON reports are generated under `dashboard/artifacts/` (ignored by Git). The official Master artwork is the unmodified DevDay SVG, with opacity/state rings used instead of drawing a modified outline logo. Real transport, recorded replay, snapshot hydration, browser takeover, and backend approvals remain backend integration work. No live API or hosted deployment is claimed.
