# SquadLings Character Studio

Local frontend for the character/animation brief in `docs/Rough/characters-animation-prompt.md`. No backend, key, or paid API is needed.

The default theme uses the current DevDay website's black `#000000` background and white `#FFFFFF` foreground, with local charcoal panels, muted grey labels, dark native controls, and a matching browser theme colour. It stays dark with either OS colour preference. Studio, gallery, workflow, sound settings, results, and synthetic page previews share the theme; actual streamed website frames retain their original content.

Characters use single opaque fills, black expression glyphs, and no reflections, highlights, blush overlays, body rims, shadows, or glows. The live DevDay website's exact purple `#924FF7`, green `#04B84C`, orange `#FF8549`, and blue `#006AFF` are shared by the cast and interface through `DEVDAY_COLORS` in `packages/shared/src/cast.ts`. Sky `#A6D8F5` remains a local sticker colour; the website publishes no fifth event token. Full-squad flames are solid orange silhouettes. See [brand-sources.md](../docs/reference/brand-sources.md) for the fetched stylesheet and verification notes.

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
3. Select a character and preview expressions. Press and release a boop target for squash, a happy reaction, hearts, and optional sound. Enter/Space also works.
4. The squad starts empty. Drag across the compact row of circles, or use arrow keys, Home/End, PageUp/PageDown, or +/−. Grey circles wake in place and greet their neighbor. At five, every bot has a determined face and its own flames. Drag back to **None** to clear the team. Pick Trip Planner, QA Swarm, or Auto.
5. Wake at least one teammate, then play a sample run. Watch the tiles, shared board, and reports to the Master. An empty run screen links back to the focused squad control.
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

`characters/useCharacterLife.ts` owns ambient body/gaze/blink values independently from the event-driven cursor rig. Nine gesture sequences include anticipation, movement, and a soft settle. Each character has a different habit mix and tempo in `characters/life.ts`; breathing uses CSS transforms. A single shared pointer listener updates motion values without frame-by-frame React renders. Portraits get autonomous gestures and wandering glances; small cursor bots combine continuous breathing/blinking with their event-driven action gestures to keep the five-stream view smooth.

Ambient activity stops when a character leaves the viewport, the document is hidden, or the character is paused. Reduced motion retains expressions and readable reactions while disabling breathing, gestures, dragging, and particles. Task errors and approvals retain their event-driven faces. The studio's chatter and social scenes are local, prewritten entertainment; no model calls, conversation memory, or autonomous backend work is involved.

## The circle slider

`launch/SquadSlider.tsx` keeps a native 0–5 range input aligned with six visible positions: **None**, then the five characters. A thin rail runs through the circles, and the active bot itself moves as the thumb while dragging; releasing settles it onto a detent. The row is capped at 360 px and shrinks on phones. All keyboard range controls work, and the selected count is announced. The planner and real-run estimate sit below it.

Wake-ups stagger by 700 ms after a jump to a larger team. New arrivals and their neighbors exchange a wave, nod, and held glance. Scrubbing cancels old sequences; hiding or leaving finishes the visual selection silently and cancels pending greetings. Full strength adds flowing fire, a warm glow, rising embers, and focused faces. `launch/SquadFire.tsx` draws all five plumes with one canvas and one frame callback; it stops offscreen and draws a still frame for reduced motion. Reduced motion selects immediately and uses static flames while audio retains natural timing. Zero is an assembly state only; launch requires 1–5 agents. The living room remains a separate character playground.

## Activity reactions

In **Squad in action**, select any character under **Send an event to** and try **Output**, **Type**, **Scroll**, **Read**, **Found**, **Ask**, and **Finish**. All five share the activity gestures while retaining their colours and ambient personalities.

| Activity | Visible reaction | Event source |
| --- | --- | --- |
| Output | Composes lines on a small sheet with a moving writing hand | `bot.caption`, when no tool or approval cue is held |
| Type | Alternating hands tap a keyboard with a highlighted key; the cursor lands at the textbox coordinates | `tool.called: type` and `cursor.type` |
| Scroll | Moves with the scroll direction beside a moving scroll control | `tool.called: scroll` and signed `cursor.scroll.dy` |
| Read | One enlarged lens eye, a scanning pupil and line highlight, and a gentle sideways hover | `read_text`, `list_elements`, `look`, `screenshot`, or `read_board` tools |
| Found | Anticipation, a delighted lift, star eyes, raised hands, and a lightbulb | `board.posted` or `qa.bug` |
| Ask | Uneven curious eyes, a questioning head tilt, a hand at the chin, and a floating question mark | `ask_user`, `wait_for_user`, or `approval.requested` |
| Finish | Squash, celebratory jumps, smiling eyes, raised hands, sparkles, and a check medal | `bot.result` |

Tool cues stay active until their matching result or another action interrupts them. Approval cues clear on resolution; stale tool results cannot cancel a newer call. Standalone cursor reactions and discoveries settle after a bounded duration. Pausing, stopping, navigation, reset, hiding the document, and unmounting clear activity motion. Reduced motion retains the faces and props without their loops or body gestures. Empty typing and zero-distance scrolling do not start a new cursor reaction. Typed content is never rendered in the keyboard artwork.

`characters/useBotActor.ts` owns activity lifetime and body transforms; `characters/Activity.tsx` and `styles/activity.css` draw the original SVG faces/props and short loops. `director/director.ts` maps the existing backend contracts. There are no new libraries or image assets. The event playground and browser pages remain simulated; live browser activity still requires the backend adapter.

Run `npm run test:browser --workspace dashboard -- activity.spec.ts` for the activity checks. They cover all seven gestures on all five characters, actual body/prop motion, desktop/mobile textbox placement, the asymmetric reading eye, repeated events, interruption, long calls, stale results, scroll direction, and reduced motion. Review screenshots under the ignored `dashboard/artifacts/activity-*.png` paths.

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
- The full 42-check browser suite passed during the flat-palette update, covering activities, slider, living room, audio, workflow, mobile, reduced motion, cursor/ripple accuracy, dialog focus, and render isolation. After the dark theme and synthetic preview changes were finished, all 16 studio/slider checks passed again.
- A separate browser inspection with a light OS preference verified the default dark theme, 60 exact character fills (five living-room portraits, five powered selector portraits, and all 50 gallery faces), one opaque circle per body, no body shading or inherited shadow/filter effects, a completed workflow, sound settings, mobile layout without overflow, and zero page errors. Screenshots are in ignored `dashboard/artifacts/dark-*.png`; the inspection report is `flat-theme-check.json`. The temporary inspection initially used an overly strict Speed label; correcting the selector resolved that timeout.
- All 195 voice variants and 40 effects render finite, non-silent output with controlled peaks (maximum 0.215), durations no longer than 0.730 seconds, and silent tails. See the ignored audio report and audition WAV described in [sound-design.md](../docs/reference/sound-design.md).
- Earlier activity checkpoint, before the flat-fill/dark-theme update: a muted production Chrome sample at 1440 × 1000 over 20 seconds, with five synthetic 8 fps streams including completion reactions, measured **60.0 fps / 16.7 ms p95**, **zero long tasks over 50 ms**, and **zero page errors**. The report is generated at `dashboard/artifacts/performance.json`; synthetic headless results vary with host load.
- Earlier audio-checkpoint production samples at 1440 × 1000 over 20 seconds (before this circle/fire redesign): studio with pointer tracking, dance, and spark measured **55.9 fps / 33.3 ms p95**, with **zero long tasks over 50 ms**; five synthetic 8 fps streams including finishes measured **58.7 fps / 16.8 ms p95**, with **two long tasks (maximum 128 ms)**. Both observed speech and reported **zero page errors**.
- An earlier sound-enabled studio sample measured 51.6 fps with five long tasks. Speaking-state updates now affect only the halo; each utterance reuses one vocal tract across syllables. Samples vary with host load and are not guaranteed frame rates.
- Human speaker/headphone listening review remains pending. Headless measurements do not certify actual audio hardware, five live browser sessions, or the event projector. Repeat the rehearsal with real backend frames.

The test config uses installed Chrome automatically on macOS when available; set `PLAYWRIGHT_CHANNEL=chrome` explicitly if desired. On supported systems, install bundled Chromium with `npx playwright install chromium`. The current bundled browser does not support this host's macOS 12.

For a production measurement, start `npm run preview` in another terminal, then:

```sh
PREVIEW_URL=http://127.0.0.1:4173 npm run perf
PERF_SCENE=studio PREVIEW_URL=http://127.0.0.1:4173 npm run perf
```

Performance has not been remeasured after the flat-fill/dark-theme update. The performance script explicitly wakes all five agents before measuring. The studio sample includes the fully powered circle slider. The default performance scene measures the five-stream sample run. `PERF_SCENE=studio` measures the living room with continuous synthetic pointer movement, a dance, and a spark pass.

Screenshots and the measured JSON reports are generated under `dashboard/artifacts/` (ignored by Git). The official Master artwork is the unmodified DevDay SVG, with opacity/state rings used instead of drawing a modified outline logo. Real transport, recorded replay, snapshot hydration, browser takeover, and backend approvals remain backend integration work. No live API or hosted deployment is claimed.
