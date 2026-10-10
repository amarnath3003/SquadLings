# Change log

Record each meaningful project change during the event, newest first. Update this file in the same commit as the change. Use a real timestamp with timezone, for example `YYYY-MM-DDTHH:MM:SS+05:30`.

## Event build log

## 2026-10-11T02:57:24+05:30 — Give every SquadLing clear activity animations

- Changed: Added original SVG activity faces and props, separate output composition and textbox keyboarding, directional scroll motion, reading with one magnified eye and a scanning hover, a lightbulb discovery, a curious ask, and a happy completion with raised hands and a check medal. Added Output preview and moved the Read preview over the synthetic page's text.
- Why: Several activities had no director mapping; typing ignored field coordinates and scrolling only bounced slightly. The activity rig now works across all five characters while keeping the cursor hotspot accurate.
- Lifecycle: Tool and approval cues stay active until completion or interruption. Matching call IDs prevent stale results from cancelling a newer action. Click, navigation, pause/stop, reset, hiding, and unmount clear activity motion. Reduced motion preserves readable static faces/props; typed content is not included in the artwork.
- Affected: `dashboard/src/characters/Activity.tsx`, `BotCharacter.tsx`, `useBotActor.ts`, `director/director.ts`, `lab/CharacterLab.tsx`, `styles/activity.css`, activity/studio browser checks, and both READMEs. The initial artwork and routing were included in the existing `animation refine` checkpoint; this milestone completes their lifecycle, formatting, and verification. No dependencies, backend contracts, or external image assets were added.
- Validation: Node 24.14.1 TypeScript and production build passed; all 48 logic tests passed. All 42 browser checks are verified: the full run passed 41/42, then the corrected placement check passed; a final focused rerun passed placement and render isolation. Eleven activity checks cover all 35 character/activity combinations, body/prop motion, desktop/mobile textbox coordinates, asymmetric eyes, repeat/interruption, long calls, stale results, signed/zero scrolling, empty typing, and reduced motion. Inspected screenshots for all seven activities.
- Performance: A muted production Chrome 150 sample at 1440 × 1000, five synthetic 8 fps streams over 20 seconds including finishes/confetti, measured 60.0 fps / 16.7 ms p95, zero long tasks over 50 ms, and zero page errors.
- Corrections: Fixed the activity hook's callback typing. Scoped reduced-motion assertions to the new body/props, excluding the existing bubble entrance. Changed placement verification to wait for the tile entrance to settle and isolation verification to await actual read completion. The earlier preview server had stopped; restarting the documented preview command resolved the initial performance connection failure.
- Limitations: Human visual review remains pending; browser pages and event controls remain simulated. Live frames/events need the backend adapter. The muted synthetic performance sample does not certify live browser sessions or event hardware.

## 2026-10-11T02:52:29+05:30 — Verify and wrap the circle-slider checkpoint

- Changed: Recorded final selector verification and labelled prior performance samples accurately. The slider implementation was saved in `56ef644`; a parallel workspace commit saved the documentation and separate activity work. No history was rewritten.
- Validation: All seven slider checks passed, including continuous pointer alignment within 2 px, staged greetings, mute/hide/unmount cancellation, mobile/static reduced motion, and selected-size launch. All 48 logic tests passed. TypeScript/production builds passed in the workspace and in an isolated snapshot containing only the selector change. The broader browser run passed 30 of 31 checks; its remaining living-room speaking-halo check passed separately in the isolated snapshot. All 235 offline audio renders passed. Desktop/mobile screenshots, local documentation links, and diff whitespace were checked.
- Limits: The first broader run occurred during concurrent activity edits; those changes have their own verification scope. No new production performance sample or human listening/visual approval is claimed. The user requested a quick wrap, so earlier audio performance figures are explicitly marked as preceding the redesigned fire. Verification servers were stopped; the user's development server was preserved.

## 2026-10-11T02:48:05+05:30 — Rebuild the squad selector around the character circles

- Changed: Replaced the long seat/range layout with a compact 0–5 circle slider, starting empty. The active character moves continuously as the drag thumb on a visible rail; release snaps to its detent. Grey circles wake in place, stagger after larger jumps, and exchange neighbor waves/glances. All five gain focused faces, flowing canvas flames, warm light, and embers. Zero-agent launch redirects to assembly; selected team size controls the sample run.
- Why: The user requested a shorter selector made from the bots themselves and rejected the separate selection ring and earlier flame treatment. The persistent ring is removed. One canvas draws all five flames behind the faces, with no new dependencies or external assets.
- Affected: Squad slider/fire/styles, studio launch/empty states, character attention, sample-run checks, performance setup, and demo/sound documentation. Unrelated activity-animation work remains outside this change.
- Validation: Node 24.14.1 production build (including TypeScript) and all 48 logic tests passed. Pointer geometry passed within 2 px; desktop/mobile screenshots were inspected. Final browser and production performance verification is in progress.
- Corrections: Fixed compact fire sizing, a wake animation overriding the phone scale, pointer tracking stealing greeting glances, and old flame selectors in browser checks. The first build encountered a concurrent activity-hook type error; that work was corrected separately and the build passed on rerun.
- Limitations: The demo remains frontend-only and simulated. Human visual and listening review remains pending; automated animation/geometry checks do not establish perceived quality.

## 2026-10-11T01:01:47+05:30 — Verify and tune sound playback

- Changed: Isolated speaking-state updates to the halo and reused one vocal tract across syllables, reducing character render work and audio-node creation. Split squad effects from cancellable voice sequences so disabling voices cannot leave future utterances. Added stale-queue, voice-disable, resume-retry, full sound-enabled completion, and desktop/mobile sound-settings checks; updated the demo and verification documentation.
- Validation: TypeScript/build and 48 logic tests passed; all 24 browser checks passed in the final full run. All 235 offline recipes/variants produced finite, non-silent samples, peak <=0.215, durations <=0.730 seconds, and silent tails. Desktop/mobile settings screenshots were inspected, with no horizontal overflow. Existing pointer accuracy, reduced motion, dialog focus, and tile-isolation checks passed. Local documentation links and diff whitespace passed.
- Performance: Sound-enabled production Chrome 150, 1440 × 1000, 20 seconds: studio 55.9 fps / 33.3 ms p95, zero long tasks over 50 ms; five synthetic 8 fps streams 58.7 fps / 16.8 ms p95, two long tasks (maximum 128 ms). Both observed bot speech and reported zero page errors. The initial studio sample measured 51.6 fps and five long tasks before tuning.
- Corrections: Fixed the overly exact Speed selector in a new test. The first preview invocation forwarded a port argument as a root directory and returned HTTP 404; restarting with the documented default preview command resolved it before sampling.
- Limitations: Automated checks do not establish perceived voice quality or actual speaker/headphone behaviour. Human listening review remains pending; an ignored audition WAV and in-app voice bank are provided. Synthetic performance samples do not certify a live backend or projector. No deployment or remote push is claimed.

## 2026-10-11T00:49:22+05:30 — Add sound effects and five character voices

- Changed: Replaced four blips with forty local Web Audio effects and thirteen voice reaction families, each with three variants across five personality-specific voices. Added a bounded priority scheduler, cancellation, separate mix controls, persistent preferences with muted startup, a voice audition bank, and speaking halos. Ordinary controls, squad changes, living-room play, workflow events, approvals/errors, and results now provide appropriate feedback.
- Why: Make meaningful interactions and workflow stages audible while keeping a five-bot soundscape controlled and independent of backend work. Audio ingestion runs once before reduction and outside actor registration.
- Validation: Node 24.14.1 TypeScript/build and 48 logic tests passed; all 21 browser checks passed. Offline checks rendered all 195 voice variants plus 40 effects: finite/non-silent samples, peak <=0.220, duration <=0.730 seconds, and silent tails. An ignored audition WAV was produced. Existing pointer accuracy, mobile layout, reduced motion, and render-isolation checks passed.
- Affected: Audio engine/recipes/policy/event mapping, shared UI feedback, character/studio/workflow controls, sound settings, gallery, browser/unit checks, performance script, and sound-design/setup documentation. No dependencies or backend contracts changed.
- Limitations: Human listening review and sound-enabled performance samples remain for the next verification milestone. Voices are synthesized cartoon gibberish, not intelligible speech. Browser sound needs user activation; all runs remain simulated.

## 2026-10-11T00:17:40+05:30 — Fix the terminal's development runtime selection

- Changed: Added a root `.nvmrc` selecting Node 24 and documented `nvm use` and shell initialization in both READMEs.
- Why: The latest npm log showed `npm run dev` failing. Reproducing it under Node 18.18.0 revealed Vite's missing `node:util` `styleText` export. The installed Node 24.14.1 supplies the required API.
- Validation: Sourced the existing nvm installation, selected the project runtime, and reran `npm run dev` successfully; the studio returned HTTP 200. TypeScript and production build passed under Node 24.14.1. Diff whitespace passed.
- Limitations: `.nvmrc` requires `nvm use` in existing terminals; it does not change their active Node process or the user's global default. The verification server was stopped after checking. No application dependencies changed.

## 2026-10-11T00:11:13+05:30 — Give the characters a continuous life of their own

- Changed: Added a layered ambient rig, nine gesture sequences, personality-specific habits, breathing/shadows, single/double blinks, pointer attention, subtle highlights, springy press/release boops, blush/hearts, and optional reaction sounds. The new living room adds greetings, dancing, passing a spark, surprises, naps/wake-up, bounded spring-return dragging, and prewritten conversations with partner glances.
- Why: The previous idle loop ran only for calm/curious moods, leaving most signature faces still. The user requested much livelier characters and richer interaction. Ambient values now run separately from the action rig, preserving exact cursor coordinates and task faces. A shared pointer listener avoids React updates per animation frame; hidden/offscreen/paused characters stop ambient work, and reduced motion remains supported.
- Affected: `dashboard/src/characters/`, `components/LivingStage.tsx`, `styles/life.css`, studio integration, browser checks, performance script, README/master/submission documentation. No new dependencies or external assets were added.
- Validation: TypeScript/production build and 36 logic tests passed; all 14 browser checks passed. Five new checks cover continuous life/gaze, group play, repeated boops, naps/wake-up, reduced motion/offscreen suspension, chatter, drag return, and blink geometry. Desktop/mobile screenshots were inspected. The full-run, cursor accuracy, and tile-isolation checks also passed a focused rerun after the final compact-motion optimization.
- Performance: Production Chrome 150 at 1440 × 1000 measured 58.9 fps / 16.8 ms p95 for a 20-second studio sample with pointer tracking, dance, and spark controls. The final five-stream sample measured 60.0 fps / 16.7 ms p95. Both had zero long tasks over 50 ms and zero page errors. An earlier run measured 53.7 fps with 12 long tasks; cursor-sized bots now retain breathing/blinking and task gestures while autonomous idle flourishes are reserved for portraits.
- Corrections: Fixed an ambiguous boop test selector, numeric zero leaking into rendered text, mobile speech-bubble height, and SVG blink pivots drifting toward the bottom of the face. A geometry check now verifies blinks close in place. Corrected the focused-test command to forward its filter directly through the dashboard workspace.
- Limitations: Synthetic headless samples exclude startup and do not certify real sessions/projector hardware. Chatter is prewritten and local; backend transport, actual agent work, persistence, and final submission remain separate. Human visual review is pending.

## 2026-10-10T23:41:01+05:30 — Verify and complete the character interaction layer

- Changed: Finished launch/seat/pop-out/bench/merge choreography, Master state rings and roster flashes, report/board/delivery flights, social glances, extended event controls, an accessible result dialog, and the typed `consumeEvent` backend handoff. Replaced the temporary Master glyph with the unmodified official DevDay icon and documented its source/hash.
- Why: Make the frontend independently demonstrable and reviewable while preserving the backend event catalogue, cursor timing/coordinates, and truthful step counts.
- Correctness: Fixed expired emote pruning, curious-tool hold behaviour, live OS motion-preference updates, phone overflow, duplicate result handling, late manual actions after reset, pre-mount event effects, stopped rig transforms, and invalid URL display. Added per-tile development render counters; moved them out of a module singleton after hot reload revealed a test instrumentation mismatch.
- Performance: Removed app-wide event/whole-bot subscriptions, isolated timeline rendering, and kept cursor move/click/scroll out of bot view updates. The production synthetic load measurement (20 seconds after all five tiles mounted, five 8 fps canvases, including finishes/confetti, Chrome 150 at 1440 × 1000) measured 59.9 fps average, 16.7 ms p95, zero long tasks over 50 ms, and no page errors. The earlier development sample measured 49.1 fps / 33.4 ms p95 and prompted these corrections.
- Validation: TypeScript and production build passed; 36 Vitest checks and all nine Playwright checks passed in a full browser rerun after the render-counter correction. Browser checks cover all 50 expressions, slider keys/rapid scrubbing, complete sample run, OS reduced motion, mobile layout, approvals/reset, desktop/mobile pointer and ripple placement within 2 px, benches, dialog focus, and tile render isolation. Screenshots are in ignored `dashboard/artifacts/`; setup/source/verification/submission documentation was updated.
- Limitations: Synthetic headless results exclude startup and do not certify five real browser sessions or the projector. Backend transport, snapshot hydration, persisted replay, and real approvals/takeover remain integration work. Participant details and final submitted SHA remain for the team; no hosted deployment, final submission, or remote push is claimed. Original rough drafts/photo remain unchanged.

## 2026-10-10T23:12:31+05:30 — Build the independent character studio

- Changed: Added the npm workspace, `dashboard/`, minimal shared contracts in `packages/shared/`, colour/source documentation, and a correctly located copy of the supplied sticker reference. Preserved the independent `test/` spike and the original rough brief/photo.
- Why: Build the animation and UI layer independently while the team develops the backend. Used four official DevDay event colour tokens fetched from its stylesheet; Sky remains a local extension.
- Features: Five SVG characters, ten faces, deterministic mood/emote logic, Motion actors, squad slider, simulated run, tile overlays, shared board, Master roster, report flights, bounded particles, optional synthesized sound, and reduced motion.
- Validation: Node 22.23.3 TypeScript check and Vite production build passed. Local `/lab` returned HTTP 200; Playwright opened installed Google Chrome, captured `dashboard/artifacts/studio.png`, and reported no page errors. Installation audit reported zero vulnerabilities.
- Corrections: Initial Node 18 installation skipped the native bundler dependency; reinstalling with Node 22 and optional dependencies resolved it. The first type check revealed a generic event-union mismatch, which was corrected. Bundled Chromium does not support this host's macOS 12; installed Chrome works.
- Limitations: This checkpoint is frontend-only. Logic/browser interaction tests, remaining launch choreography, and performance validation are still in progress. No real browsing, API calls, deployment, or 60 fps certification is claimed.

## 2026-10-10T22:08:58+05:30 — Accept a browser task from the terminal

- Changed: Updated `test/computer-use-agent.mjs` to accept a task entered at the terminal or passed after `npm start --`; updated the test and project documentation.
- Why: Let the user direct the single browser agent with their own task instead of a fixed documentation lookup.
- Validation: `npm run check` passed; importing the SDK and checking the required session and event methods succeeded. The implementation continues to use the official session input event flow and preserves explicit origin approval.
- Limitations: Only public, read-only browser tasks are supported. The agent cancels sign-in requests and cannot take actions with external effects.

## 2026-10-10T22:03:32+05:30 — Add one-agent Computer Use test

- Changed: Added `test/computer-use-agent.mjs`, `test/package.json`, and `test/README.md`; updated the root README with runnable project details.
- Why: Provide a minimal, interactive test of a single Agents API agent using an OpenAI-hosted browser and public documentation.
- Validation: `npm install` added `openai@7.32.0` with no reported vulnerabilities; `npm run check` passed; importing the SDK and checking the required session and event methods succeeded. The installed SDK requires Node.js 22 while this workspace currently has Node.js 18.18.0, so a live run was not attempted.
- Limitations: The live run requires Node.js 22 or newer, an interactive terminal, a permitted OpenAI API key, and explicit origin approval. It does not test sign-in or website-changing actions.

## Template setup — 10 October 2026

- Changed: Added the event README, rules, agent guide, change log, AI usage record, submission checklist, Git ignore rules, and pull request checklist.
- Why: Give participants a consistent starting point for event rules, basic coding patterns, documented changes, and regular commits.
- Validation: Checked local Markdown links, event detail consistency, required documents, and diff whitespace before publishing.
- Limitations: Documentation scaffolding only; no participant project, application, or working demo is included. GitHub publication and template status are verified separately after creation.
