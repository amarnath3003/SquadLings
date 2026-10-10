# Change log

Record each meaningful project change during the event, newest first. Update this file in the same commit as the change. Use a real timestamp with timezone, for example `YYYY-MM-DDTHH:MM:SS+05:30`.

## Event build log

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
