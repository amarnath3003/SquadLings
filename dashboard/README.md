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
- Pass validated `SwarmEvent` objects to `consumeEvent(event, { reduced, speed })` in `src/ingest.ts`. Both the Lab and future transport/replay adapters use this entry point. It sends JPEG frames directly to `FrameCanvas`, and other events to audio mapping, the director, and the pure reducer.
- `director/director.ts` routes cursor events to registered actors, queues events received before a tile mounts, and cancels pending effects on reset. `cursor.move`, `cursor.click`, and `cursor.scroll` do not replace bot view state or re-render other tiles.
- The Vite development proxy reserves `/api` and `/ws` for `127.0.0.1:8787`. It does not connect automatically. Backend transport, snapshot hydration, real approval actions, and replay recording are separate work.
- Preserve event coordinates in original viewport pixels. The overlay maps to its own inner canvas using `ResizeObserver`, including mobile.
- Colour sources and the intentional update from the brief are recorded in [brand-sources.md](../docs/reference/brand-sources.md).

## Verification

Verified using Node 24.14.1 and installed Google Chrome 150 on this host:

- TypeScript and production build pass.
- 48 Vitest checks cover the existing mood/emote/store/geometry contracts plus audio event ownership, lifecycle cue coverage, priorities, cooldowns, speed filtering, preferences, and the rolling start budget.
- All 24 Playwright checks pass: the existing studio, animation, full-run, mobile, reduced-motion, pointer/ripple accuracy, dialog-focus, and render-isolation checks, plus ten audio checks for muted startup, settings, control feedback, queue/concurrency/cancellation, all-five greetings, urgent interruption, failed startup/retry, stale requests, unique completion, and offline rendering.
- All 195 voice variants and 40 effects render finite, non-silent output with controlled peaks (maximum 0.215), durations no longer than 0.730 seconds, and silent tails. See the ignored audio report and audition WAV described in [sound-design.md](../docs/reference/sound-design.md).
- Final sound-enabled production samples at 1440 × 1000 over 20 seconds: studio with pointer tracking, dance, and spark measured **55.9 fps / 33.3 ms p95**, with **zero long tasks over 50 ms**; five synthetic 8 fps streams including finishes measured **58.7 fps / 16.8 ms p95**, with **two long tasks (maximum 128 ms)**. Both observed speech and reported **zero page errors**.
- An earlier sound-enabled studio sample measured 51.6 fps with five long tasks. Speaking-state updates now affect only the halo; each utterance reuses one vocal tract across syllables. Samples vary with host load and are not guaranteed frame rates.
- Human speaker/headphone listening review remains pending. Headless measurements do not certify actual audio hardware, five live browser sessions, or the event projector. Repeat the rehearsal with real backend frames.

The test config uses installed Chrome automatically on macOS when available; set `PLAYWRIGHT_CHANNEL=chrome` explicitly if desired. On supported systems, install bundled Chromium with `npx playwright install chromium`. The current bundled browser does not support this host's macOS 12.

For a production measurement, start `npm run preview` in another terminal, then:

```sh
PREVIEW_URL=http://127.0.0.1:4173 npm run perf
PERF_SCENE=studio PREVIEW_URL=http://127.0.0.1:4173 npm run perf
```

The default performance scene measures the five-stream sample run. `PERF_SCENE=studio` measures the living room with continuous synthetic pointer movement, a dance, and a spark pass.

Screenshots and the measured JSON reports are generated under `dashboard/artifacts/` (ignored by Git). The official Master artwork is the unmodified DevDay SVG, with opacity/state rings used instead of drawing a modified outline logo. Real transport, recorded replay, snapshot hydration, browser takeover, and backend approvals remain backend integration work. No live API or hosted deployment is claimed.
