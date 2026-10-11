# Change log

Record each meaningful project change during the event, newest first. Update this file in the same commit as the change. Use a real timestamp with timezone, for example `YYYY-MM-DDTHH:MM:SS+05:30`.

## Event build log

## 2026-10-11T07:55:39+05:30 — Correct contributor identity and team attribution

- Changed: Configured this clone's Git author and committer as D Amarnath with the ID-based GitHub noreply email for `amarnath3003`. Added the confirmed display name to `README.md` and replaced the teammate-name placeholder in `SUBMISSION.md`; updated `AI_USAGE.md`.
- Why: Previous commits used an email ending in `gmail.co`; GitHub's commit API returned no linked author or committer. The user confirmed the intended account is `amarnath3003` and requested a new commit under that identity.
- Validation: Matched the account name and numeric ID against GitHub's public user API, confirmed `main` is the default branch of a non-fork repository, and checked the existing commit's missing account attribution. Reviewed team-name consistency, effective Git identity, and diff whitespace before committing. Application tests are unnecessary for these documentation and local Git configuration changes.
- Limitations: Previous commits retain their original metadata. GitHub contribution graphs may take up to 24 hours to update. Human review of the documentation is pending; server-side linkage of this new commit is checked after pushing.

## 2026-10-11T07:47:31+05:30 — Import the merged SquadLings export locally

- Changed: Replaced the tracked project tree with the 169 files from `~/Downloads/SquadLings-export.zip` (`SquadLings-export/SquadLings/`); removed 92 former tracked paths absent from the export. The engine is in `scripts/`, the React dashboard in `web/`, and the classic dashboard in `ui/`. Kept `.git`, existing local ignored files, and HEAD `cd568c5c7d36c251689fdf04eda0531026cb755e`. Preserved old dashboard artifact ignores in local `.git/info/exclude`.
- Why: User requested replacing this repository with the downloaded export and explicitly requested no commit. Nothing was staged, committed, pulled, or pushed; the outer `IMPORT.md` was not imported.
- Validation: All 169 imported files initially matched the archive byte for byte. Installed locked dependencies with `npm ci` at root and in `web/`, using installed Node 24.14.1. `npm run typecheck` and `npm --prefix web run build` passed; `npm test` passed 15 unit tests and five mock API scenarios before the browser stage failed. `git diff --check` passed before this documentation update. Import-specific notes were added to README and AI usage; application source remains identical to the export.
- Limitations: The Playwright Chromium executable is missing, and `npx playwright install chromium` fails with “Playwright does not support chromium on mac12”. Browser, squad, and UI self-tests remain unverified on this machine; no live API run or visual demo was performed. Human review pending.

> The exported engine project was not under version control during the night before its import into this existing repository. The entries below were reconstructed on 2026-10-11 from file modification times and the build notes in [master.md](master.md) and [HANDOFF.md](HANDOFF.md). Times are approximate (to the nearest few minutes, IST). Entries from the first commit onward are written as changes happen.

> Entries marked **character studio** come from the teammate repository [amarnath3003/SquadLings](https://github.com/amarnath3003/SquadLings) (copied verbatim from its `CHANGELOG.md`, up to commit `cd568c5`). Paths there such as `dashboard/src/` correspond to `web/src/` here, and `test/` was that repository's single-agent spike. Those entries keep their exact timestamps.

## 2026-10-11T07:30+05:30 — Adopt the hackathon repository template

- Changed: Added `RULES.md`, `AGENTS.md` and `.github/pull_request_template.md` from the event template; added `CHANGELOG.md`, `AI_USAGE.md` and `SUBMISSION.md`; merged the template's `.gitignore` with our runtime paths; added a project overview, team, libraries, known limitations and an updated repo map to `README.md`. Merged the teammate repository's change log and AI usage entries; copied its storyboard, brand-source, sound-design and banner-prompt notes into `docs/` so README links stay local.
- Why: Follow the organizer template so the submission has rules, change log, AI usage record and submission form in the expected places.
- Validation: Checked that `.env`, browser profiles, run logs, `web/dist` and the `external/` clone are ignored; scanned tracked files for API keys (none outside the ignored `.env`).
- Limitations: The teammate's display name, the repository URL and the final commit SHA are still TODO in `SUBMISSION.md`.

## 2026-10-11T07:20+05:30 — React dashboard: chat, live view and roaming characters

- Changed: Ported the classic dashboard's state and reducer into `web/src/live/`, added the chat (`web/src/chat/`), the character run screen (`web/src/studio/`, `web/src/wall/`, `web/src/roam/`) and wired them to real server events; `scripts/lib/squad-runner.ts` and unit tests updated.
- Why: Move the working dashboard onto the teammate's character studio while keeping the ChatGPT-style flow.
- Validation: `npm run ui` build and live use on 127.0.0.1:8787; `scripts/tests/unit.test.ts` updated. A full `npm test` rerun for this entry is pending.
- Limitations: Port in progress; see [HANDOFF.md](HANDOFF.md).

## 2026-10-11T06:40+05:30 — Serve the React dashboard from `npm run ui`

- Changed: `npm run ui` builds `web/` and serves `web/dist`; `--classic` serves the old `ui/`. Added `scripts/dev-mock-ui.ts`, a zero-cost mock server. README rewritten with banner, cast, film and quick start; added `docs/assets/cast/` and `docs/video/`.
- Why: One command for the new UI; free testing without API calls.
- Validation: Built and served locally; mock run played end to end.
- Limitations: Live run screen still partly on the classic layout.

## 2026-10-11T05:35:23+05:30 — Refine the film and correct the SquadLings brand · character studio

- Changed: Preserved the approved cold open and native squad-selection motion; simplified the task bar into a pill with agent dots and a circular send arrow. Corrected fire coordinates/resolution under scaled layouts and gave the film taller flames with clear spacing above the agents.
- Story: Replaced task cards/close-ups with a camera move from one browser page to five working pages. Reused native reading, scrolling, typing, discovery, and completion gestures. Free-floating charms carry reports and follow-ups without drawn connection lines. Onyx inspects all five contributions with a moving magnifier and individual checks, then sends an opening report. The same six character instances glide into the ending and fall asleep in sequence, with distinct faces beforehand; removed the second swarm.
- Branding: User approved the animation and corrected the name to **SquadLings**. Updated the video wordmark, recording default, media filenames, and README links. Used the built-in imagegen skill/tool to edit the existing GitHub banner's wordmark while retaining the composition/tagline; saved the 2172 × 724 result and exact prompt. Historical prompts and earlier development log entries retain their original spelling.
- Affected: `dashboard/src/film/`, `launch/SquadFire.tsx`, film/selector browser checks, the recorder's default output path, READMEs, brand-source/prompt documentation, and `docs/assets/` / `docs/video/` deliverables.
- Validation: Final TypeScript/production build passed; 48 logic tests passed. All 10 film/selector browser checks passed, with focused reruns after flame spacing/resolution changes, static-fire resize correction, and brand-name correction. Checks cover page containment, floating follow-ups, sequential review before delivery, persistent character nodes, distinct faces, staggered sleep, full-HD/phone layouts, playback, audio bounds/silent tail, and visible flames clear of the task bar. Documentation links and diff whitespace passed.
- Export: Re-recorded `docs/video/squadlings-intro.mp4`: 5,307,799 bytes, 52 seconds, 1920 × 1080, 30 fps, all 1,560 frames, H.264/AAC, zero page errors. Full FFmpeg decode passed; peak audio −25.5 dBFS. Near-black intervals occur only during the small-circle opening and launch cover, with none during the ending. Inspected the exported storyboard and corrected closing frame; banner spelling/aspect ratio inspected.
- Limitations: Browser pages and itinerary remain scripted and labeled simulated. Human review of the final name correction/listening remains pending; the user approved the preceding animation. Ambient motion may vary between exports. No remote push or deployment performed.

## 2026-10-11T05:30+05:30 — Start the React dashboard on the character studio

- Changed: Created `web/` (React 18, Vite, Motion, Zustand) with the teammate's characters, effects, mood and launch components copied from [amarnath3003/SquadLings](https://github.com/amarnath3003/SquadLings) at `45f625f`; new home composer, squad slider and effort stepper.
- Why: Combine our engine with the teammate's characters and animation.
- Validation: `npm --prefix web run check` and build.
- Limitations: Copied components are kept unchanged except where noted in [HANDOFF.md](HANDOFF.md).

## 2026-10-11T05:09:56+05:30 — Create the cinematic SquadLink launch film · character studio

- Changed: Added `/film`, a 48-second landscape story from typed task and animated squad selection through circle swarms, character close-ups, parallel tasks, Onyx coordination, assembled results, and a sleeping six-character lineup. Reused the existing selector/flames, SVG actors, activity gestures, and sound recipes; added an optional resting pose to Onyx.
- Direction: Inspected the first 15 seconds of the user's exact DevDay 2026 reference in Chrome. Authored original giant-face pullbacks, curved swarm paths, black circular wipes, and sparse typography after the user requested a more cinematic introduction. No reference footage, external music, or OpenAI logo is included.
- Affected: `dashboard/src/film/`, `main.tsx`, `MasterCharacter.tsx`, the recording script and package commands, film browser checks, README/source documentation, and `docs/video/` storyboard/media.
- Validation: TypeScript/production build and 48 logic tests passed. Three film browser checks cover story states, 1080p containment, phone letterboxing, playback/restart, six sleeping characters, and a 48-second bounded soundtrack with a silent tail. Both existing Onyx lifecycle checks passed. Local documentation links and diff whitespace passed.
- Corrections: Playwright's FFmpeg installer does not support this macOS 12 host; used a local ignored imageio-ffmpeg tool installation. Real-time capture had a 3.4-second gap, so the recorder now advances JS/CSS animation in fixed 1/30-second steps and captures every frame. Export inspection caught the inherited `main` width cap; removed it for the film and added a 1920 px regression check.
- Export: Saved `docs/video/squadlink-intro.mp4` (4,151,372 bytes) and a nine-frame storyboard preview. The production capture produced all 1,440 frames at fixed 1/30-second intervals with zero browser errors. FFmpeg decoded the complete 48-second, 1920 × 1080 H.264/AAC file; black transition intervals were detected around 12.8–14.03 and 40.8–41.2 seconds. Inspected the final contact sheet: full-width composition, selection flames, activities, complete task cards, results, and all six sleepers. AAC decoded without clipping; human listening review remains pending.
- Limitations: The workflow and itinerary are scripted; no backend/browser work is represented as live. Human pacing/listening review remains pending. Ambient motion can vary across exports, and pausing/scrubbing the web timeline keeps character ambience active. No deployment or remote push is claimed.

## 2026-10-11T04:54:28+05:30 — Add an independent animated effort slider · character studio

- Changed: Added a separate effort card below the squad-count control with five stacked character previews, none/low/med/high/xhigh steps, native keyboard controls, clickable labels, and increasing bounce speed, height, tilt, and squash. Updated `dashboard/src/App.tsx`, new `components/EffortSlider.tsx` and `styles/effort.css`, and both READMEs.
- Why: Preview effort through enthusiastic dots while keeping the main room and agent-count control independent, as clarified by the user. No new dependencies or external assets.
- Validation: Production build/TypeScript and all six existing squad browser checks passed. A focused Chrome check verified all five levels, keyboard/preset input, moving preview dots, main-room/count isolation, app/OS reduced motion, offscreen pause, 390/320 px card fit, and zero page errors. Desktop/mobile screenshots inspected; diff whitespace passed.
- Corrections: Removed the initial main-room animation wiring after user feedback. Fixed narrow-phone preset overflow; the final room component has no changes.
- Limitations: Visual preview only; no backend effort configuration. Defaults to med and resets when the studio remounts. Human animation review pending; no new performance measurement. Concurrent film/orchestrator work is excluded from this commit.

## 2026-10-11T04:50+05:30 — Classic dashboard: chat-app flow

- Changed: `ui/` redesigned to one centered pill bar with agents and effort chips, a live team card per plan, Chats history, End chat and New chat; effort levels none…xhigh; `scripts/lib/ui-server.ts`, `scripts/tests/ui.selftest.ts`, `scripts/tests/mock-squad-api.ts`.
- Why: User feedback asking for a calm, ChatGPT-like UX.
- Validation: `npm run test:ui` (36 checks) passed; live runs: HN/Lobsters/Node with follow-up 53 s, $0.056; Tokyo/London weather 48 s, $0.062.
- Limitations: Fixed live: Master used the UTC date; a finished bot replying without `finish` lost its result.

## 2026-10-11T04:37:39+05:30 — Add the SquadLink GitHub banner · character studio

- Changed: Added `docs/assets/squadlink-github-banner.png`, a 2172 × 724 banner with six circular characters, the requested SquadLink wordmark, and “One squad. Many minds.” Embedded it in the root README and recorded sources/prompts in `docs/reference/`.
- Why: Provide a GitHub banner based on the user's reference and the project's black-background character theme.
- Validation: Visually inspected both generated versions; corrected a stray accent above the tagline. Confirmed final PNG dimensions and 3:1 aspect ratio, local documentation links, and diff whitespace. No application code changed; application tests were not run.
- Limitations: Human design review pending; raster palette values are not certified exact tokens. Existing application naming remains SquadLings. No remote publication claimed.

## 2026-10-11T04:00+05:30 — Basic dashboard (`npm run ui`)

- Changed: `scripts/ui.ts`, `scripts/lib/squad-runner.ts`, `scripts/lib/ui-server.ts` and plain HTML/CSS/JS in `ui/`; headless browsers streamed by CDP screencast; human takeover with unlogged input; API documented in master.md §19.8.
- Why: Chat with the Master, choose the number of agents and watch every browser on one page.
- Validation: UI self-test against the mock API; live runs through the dashboard.
- Limitations: Local only (127.0.0.1).

## 2026-10-11T03:45:01+05:30 — Give the orchestrator an original charcoal character · character studio

- Changed: Replaced the OpenAI logo with Onyx, “the calm conductor,” in assembly, workflow, and the nine-state gallery. Shared paired glyphs render white on a flat `#262626` circle; the resting face is `^ ^` with no mouth. Active report, approval, completion, and failure reactions can add details, following the user’s clarification.
- Personality: Measured thinking tilts, watchful glances, report nods, and state-specific lines. Ambient motion stops hidden/offscreen; reduced motion preserves static expressions. Approval and terminal states take priority over report reception, and reset clears reception history.
- Affected: Shared cast/glyph colour, original `MasterCharacter.tsx`, coordinator card/copy, launch/merge targeting, gallery, lifecycle browser checks, READMEs, submission description, spec, and source attribution. Removed the former logo component/asset; backend `master` identity and five browser-agent slots remain unchanged. No dependencies or external art added.
- Validation: Build/TypeScript and all 48 logic tests passed in an isolated Onyx snapshot. Both new lifecycle browser checks passed in the workspace; the full 44-check browser suite passed in the isolated Onyx snapshot, including activities, audio, living room, reports/approvals, slider, workflow, mobile, and reduced motion. Separate Chrome inspection verified exact charcoal/white resting symbols, no resting mouth or shadows/filters, all nine states, five-agent completion, 390 px layout without overflow, and zero page errors. Resting/gallery/completion/phone screenshots inspected.
- Corrections: Refined the initial detailed idle face to match the supplied symbol-only base; the user clarified that active mouths/details are welcome. Corrected test setup to select a worker before report delivery and scroll the character fully offscreen. A build initially caught missing Motion imports in concurrent selector edits; those imports were restored before the successful build.
- Checkpoint: Implementation was included in the shared workspace commit `32322fb` (“onyx UI integration”); this follow-up records Onyx’s contribution and verification without rewriting that checkpoint.
- Limitations: Human visual review pending; workflow/browser pages remain simulated. No new performance measurement, deployment, or remote push is claimed.

## 2026-10-11T03:40:15+05:30 — Replace the agent slider with a growing character stack · character studio

- Changed: Removed the range input, draggable character thumb, rail, and extra count choices. Fixed − on the left and + on the right of a centred, overlapping character stack; arrivals pop in and departures tuck away. Added a live count, selected names, next-teammate hint, empty state, 44 px minimum buttons, keyboard activation, and responsive portrait sizing. Preserved greetings, full-squad flames, reduced motion, launch limits and cancellation.
- Why: The user rejected an extra handle and requested a stack that grows/shrinks through side buttons.
- Affected: Squad selector/styles/fire, App focus/empty-state copy, browser selection helpers and checks, performance setup, and both READMEs. No dependencies or external assets added. Concurrent orchestrator/character changes are separate work.
- Validation: Production build/TypeScript passed in the working tree and an isolated copy of this change; 48 logic tests passed. All nine studio and ten audio checks passed. All six selector checks and the blink geometry check passed in the isolated development copy; inspected desktop and 390/320 px screenshots. Documentation links and diff whitespace passed.
- Corrections: Fixed small-screen characters overlapping/intercepting the minus button. The 320 px check now measures selector containment separately: surrounding page chrome has an existing 20 px overflow at that width. A broader animation test missed a blink during concurrent character edits; its isolated rerun passed. An initial isolated browser run used production serving, which lacks the tests' development diagnostics; corrected to a development server.
- Limitations: Human visual/listening review pending; no new performance, deployment, or live-backend claim. Whole-page 320 px overflow remains outside this selector change.

## 2026-10-11T03:18:36+05:30 — Match the live DevDay palette and default to a flat dark theme · character studio

- Changed: Fetched the current DevDay website and its linked stylesheet directly; verified exact purple `#924FF7`, green `#04B84C`, orange `#FF8549`, blue `#006AFF`, and dark-mode black/white primitives. Centralized the four event colours in `DEVDAY_COLORS`, shared by character fills and CSS. The existing four hex values already matched the live website; Sky remains the local sticker-derived `#A6D8F5`.
- Why: The user requested web-verified exact colours, simple opaque fills without reflections/shadows/highlights, and then a dark default like the current DevDay website.
- Appearance: Removed white body rims, reflection/highlight strokes, blush overlays, ground shadows, colour filters, card/control shadows, and glows. Flames retain motion as single event-orange silhouettes. Added black page/white text, charcoal panels, readable muted labels, dark controls and browser metadata across studio, gallery, sound settings, workflow, and results. Synthetic pages use the same flat theme and an animated load stripe; real streamed frames retain their content. Official Master artwork stays unmodified.
- Affected: Shared cast, dashboard startup/metadata, character/activity/logo rendering, squad flames, preview canvas, all theme styles, source attribution, project spec, READMEs, and AI usage record. No dependencies, backend contracts, or external image assets added.
- Validation: Node 24.14.1 production build/TypeScript and all 48 logic tests passed. All 42 browser checks passed during the flat-palette update; all 16 studio/slider checks passed again after the final dark-theme changes. A separate browser inspection with a light OS preference checked 60 exact body fills, one circle per body without shading or inherited filters/shadows, completed workflow, sound settings, and mobile layout without overflow; zero page errors. Inspected desktop, gallery, workflow/results, settings, and mobile screenshots. Live CSS-to-code comparison and diff whitespace passed.
- Corrections: Fixed the temporary visual inspection's overly strict Speed label selector after a timeout; the corrected inspection passed. Retained distinct foreground/background colours for primary buttons, toggles, and the brand face under the dark theme.
- Limitations: Human visual review pending. The official website publishes four event tokens, not an official Sky token. Supporting charcoal/status colours are local choices. Performance has not been remeasured after this styling change; prior samples predate it. Demo remains simulated; no deployment or remote push is claimed.

## 2026-10-11T03:10+05:30 — The squad: a Master and up to five bots

- Changed: `scripts/squad.ts`, `scripts/lib/squad.ts`, `agent-session.ts`, `squad-prompts.ts`, `layout.ts`; one MCP router for every bot; tiled visible windows; `npm run test:squad`.
- Why: The core idea, parallel browser agents steered by one coordinator.
- Validation: `npm run test:squad` (19 offline checks). Live: HN/Lobsters/Node 52 → 38 s; four-city weather 121 s, $0.13; mid-run follow-up works.
- Limitations: Fixed: prompts used the UTC date. Input sent mid-turn queues for the next turn.

## 2026-10-11T02:57:24+05:30 — Give every SquadLing clear activity animations · character studio

- Changed: Added original SVG activity faces and props, separate output composition and textbox keyboarding, directional scroll motion, reading with one magnified eye and a scanning hover, a lightbulb discovery, a curious ask, and a happy completion with raised hands and a check medal. Added Output preview and moved the Read preview over the synthetic page's text.
- Why: Several activities had no director mapping; typing ignored field coordinates and scrolling only bounced slightly. The activity rig now works across all five characters while keeping the cursor hotspot accurate.
- Lifecycle: Tool and approval cues stay active until completion or interruption. Matching call IDs prevent stale results from cancelling a newer action. Click, navigation, pause/stop, reset, hiding, and unmount clear activity motion. Reduced motion preserves readable static faces/props; typed content is not included in the artwork.
- Affected: `dashboard/src/characters/Activity.tsx`, `BotCharacter.tsx`, `useBotActor.ts`, `director/director.ts`, `lab/CharacterLab.tsx`, `styles/activity.css`, activity/studio browser checks, and both READMEs. The initial artwork and routing were included in the existing `animation refine` checkpoint; this milestone completes their lifecycle, formatting, and verification. No dependencies, backend contracts, or external image assets were added.
- Validation: Node 24.14.1 TypeScript and production build passed; all 48 logic tests passed. All 42 browser checks are verified: the full run passed 41/42, then the corrected placement check passed; a final focused rerun passed placement and render isolation. Eleven activity checks cover all 35 character/activity combinations, body/prop motion, desktop/mobile textbox coordinates, asymmetric eyes, repeat/interruption, long calls, stale results, signed/zero scrolling, empty typing, and reduced motion. Inspected screenshots for all seven activities.
- Performance: A muted production Chrome 150 sample at 1440 × 1000, five synthetic 8 fps streams over 20 seconds including finishes/confetti, measured 60.0 fps / 16.7 ms p95, zero long tasks over 50 ms, and zero page errors.
- Corrections: Fixed the activity hook's callback typing. Scoped reduced-motion assertions to the new body/props, excluding the existing bubble entrance. Changed placement verification to wait for the tile entrance to settle and isolation verification to await actual read completion. The earlier preview server had stopped; restarting the documented preview command resolved the initial performance connection failure.
- Limitations: Human visual review remains pending; browser pages and event controls remain simulated. Live frames/events need the backend adapter. The muted synthetic performance sample does not certify live browser sessions or event hardware.

## 2026-10-11T02:52:29+05:30 — Verify and wrap the circle-slider checkpoint · character studio

- Changed: Recorded final selector verification and labelled prior performance samples accurately. The slider implementation was saved in `56ef644`; a parallel workspace commit saved the documentation and separate activity work. No history was rewritten.
- Validation: All seven slider checks passed, including continuous pointer alignment within 2 px, staged greetings, mute/hide/unmount cancellation, mobile/static reduced motion, and selected-size launch. All 48 logic tests passed. TypeScript/production builds passed in the workspace and in an isolated snapshot containing only the selector change. The broader browser run passed 30 of 31 checks; its remaining living-room speaking-halo check passed separately in the isolated snapshot. All 235 offline audio renders passed. Desktop/mobile screenshots, local documentation links, and diff whitespace were checked.
- Limits: The first broader run occurred during concurrent activity edits; those changes have their own verification scope. No new production performance sample or human listening/visual approval is claimed. The user requested a quick wrap, so earlier audio performance figures are explicitly marked as preceding the redesigned fire. Verification servers were stopped; the user's development server was preserved.

## 2026-10-11T02:48:05+05:30 — Rebuild the squad selector around the character circles · character studio

- Changed: Replaced the long seat/range layout with a compact 0–5 circle slider, starting empty. The active character moves continuously as the drag thumb on a visible rail; release snaps to its detent. Grey circles wake in place, stagger after larger jumps, and exchange neighbor waves/glances. All five gain focused faces, flowing canvas flames, warm light, and embers. Zero-agent launch redirects to assembly; selected team size controls the sample run.
- Why: The user requested a shorter selector made from the bots themselves and rejected the separate selection ring and earlier flame treatment. The persistent ring is removed. One canvas draws all five flames behind the faces, with no new dependencies or external assets.
- Affected: Squad slider/fire/styles, studio launch/empty states, character attention, sample-run checks, performance setup, and demo/sound documentation. Unrelated activity-animation work remains outside this change.
- Validation: Node 24.14.1 production build (including TypeScript) and all 48 logic tests passed. Pointer geometry passed within 2 px; desktop/mobile screenshots were inspected. Final browser and production performance verification is in progress.
- Corrections: Fixed compact fire sizing, a wake animation overriding the phone scale, pointer tracking stealing greeting glances, and old flame selectors in browser checks. The first build encountered a concurrent activity-hook type error; that work was corrected separately and the build passed on rerun.
- Limitations: The demo remains frontend-only and simulated. Human visual and listening review remains pending; automated animation/geometry checks do not establish perceived quality.

## 2026-10-11T02:10+05:30 — Speed and intelligence pass, prewarm and eval

- Changed: MCP 2026-07-28 support (per-step overhead 1.5 → 0.85 s), `environment: none`, `web_search`, faster page settling (bench 21.9 → 6.5 s), curved cursor, link targets, `find`, human-check detection and handoff; `npm run prewarm`; `scripts/eval-agent.ts` (TestTown).
- Why: Faster runs and smarter browsing without solving CAPTCHAs or spoofing (declined by design; see master.md §17.8).
- Validation: `npm test` (10 unit, 5 mock, 48 browser/MCP checks), `npm run bench`; eval 13/13. Himachal task ≈137 s → ≈70 s; HN task 19 → 15.6 s.
- Limitations: Cloudflare answers 429 when many quick tunnels start in a few minutes.

## 2026-10-11T01:01:47+05:30 — Verify and tune sound playback · character studio

- Changed: Isolated speaking-state updates to the halo and reused one vocal tract across syllables, reducing character render work and audio-node creation. Split squad effects from cancellable voice sequences so disabling voices cannot leave future utterances. Added stale-queue, voice-disable, resume-retry, full sound-enabled completion, and desktop/mobile sound-settings checks; updated the demo and verification documentation.
- Validation: TypeScript/build and 48 logic tests passed; all 24 browser checks passed in the final full run. All 235 offline recipes/variants produced finite, non-silent samples, peak <=0.215, durations <=0.730 seconds, and silent tails. Desktop/mobile settings screenshots were inspected, with no horizontal overflow. Existing pointer accuracy, reduced motion, dialog focus, and tile-isolation checks passed. Local documentation links and diff whitespace passed.
- Performance: Sound-enabled production Chrome 150, 1440 × 1000, 20 seconds: studio 55.9 fps / 33.3 ms p95, zero long tasks over 50 ms; five synthetic 8 fps streams 58.7 fps / 16.8 ms p95, two long tasks (maximum 128 ms). Both observed bot speech and reported zero page errors. The initial studio sample measured 51.6 fps and five long tasks before tuning.
- Corrections: Fixed the overly exact Speed selector in a new test. The first preview invocation forwarded a port argument as a root directory and returned HTTP 404; restarting with the documented default preview command resolved it before sampling.
- Limitations: Automated checks do not establish perceived voice quality or actual speaker/headphone behaviour. Human listening review remains pending; an ignored audition WAV and in-app voice bank are provided. Synthetic performance samples do not certify a live backend or projector. No deployment or remote push is claimed.

## 2026-10-11T00:49:22+05:30 — Add sound effects and five character voices · character studio

- Changed: Replaced four blips with forty local Web Audio effects and thirteen voice reaction families, each with three variants across five personality-specific voices. Added a bounded priority scheduler, cancellation, separate mix controls, persistent preferences with muted startup, a voice audition bank, and speaking halos. Ordinary controls, squad changes, living-room play, workflow events, approvals/errors, and results now provide appropriate feedback.
- Why: Make meaningful interactions and workflow stages audible while keeping a five-bot soundscape controlled and independent of backend work. Audio ingestion runs once before reduction and outside actor registration.
- Validation: Node 24.14.1 TypeScript/build and 48 logic tests passed; all 21 browser checks passed. Offline checks rendered all 195 voice variants plus 40 effects: finite/non-silent samples, peak <=0.220, duration <=0.730 seconds, and silent tails. An ignored audition WAV was produced. Existing pointer accuracy, mobile layout, reduced motion, and render-isolation checks passed.
- Affected: Audio engine/recipes/policy/event mapping, shared UI feedback, character/studio/workflow controls, sound settings, gallery, browser/unit checks, performance script, and sound-design/setup documentation. No dependencies or backend contracts changed.
- Limitations: Human listening review and sound-enabled performance samples remain for the next verification milestone. Voices are synthesized cartoon gibberish, not intelligible speech. Browser sound needs user activation; all runs remain simulated.

## 2026-10-11T00:17:40+05:30 — Fix the terminal's development runtime selection · character studio

- Changed: Added a root `.nvmrc` selecting Node 24 and documented `nvm use` and shell initialization in both READMEs.
- Why: The latest npm log showed `npm run dev` failing. Reproducing it under Node 18.18.0 revealed Vite's missing `node:util` `styleText` export. The installed Node 24.14.1 supplies the required API.
- Validation: Sourced the existing nvm installation, selected the project runtime, and reran `npm run dev` successfully; the studio returned HTTP 200. TypeScript and production build passed under Node 24.14.1. Diff whitespace passed.
- Limitations: `.nvmrc` requires `nvm use` in existing terminals; it does not change their active Node process or the user's global default. The verification server was stopped after checking. No application dependencies changed.

## 2026-10-11T00:15+05:30 — S1: one agent drives our own browser over MCP

- Changed: `scripts/spike-agents-mcp.ts`, `scripts/lib/` (agents-api, browser, mcp-browser-server, site-gate, tunnel, pricing, run-kit, terminal), tests moved to `scripts/tests/`.
- Why: Hosted computer use cannot stream a live view, so we drive a local Playwright browser through an MCP server behind a cloudflared tunnel.
- Validation: Browser self-test and unit tests; live runs on `gpt-6-luna`. Fixed site-gate stall, pop-up allow-list bypass, trailing-comma URLs, beforeunload trap and SSE truncation.
- Limitations: Bing is the default search; Google blocks automated browsers.

## 2026-10-11T00:11:13+05:30 — Give the characters a continuous life of their own · character studio

- Changed: Added a layered ambient rig, nine gesture sequences, personality-specific habits, breathing/shadows, single/double blinks, pointer attention, subtle highlights, springy press/release boops, blush/hearts, and optional reaction sounds. The new living room adds greetings, dancing, passing a spark, surprises, naps/wake-up, bounded spring-return dragging, and prewritten conversations with partner glances.
- Why: The previous idle loop ran only for calm/curious moods, leaving most signature faces still. The user requested much livelier characters and richer interaction. Ambient values now run separately from the action rig, preserving exact cursor coordinates and task faces. A shared pointer listener avoids React updates per animation frame; hidden/offscreen/paused characters stop ambient work, and reduced motion remains supported.
- Affected: `dashboard/src/characters/`, `components/LivingStage.tsx`, `styles/life.css`, studio integration, browser checks, performance script, README/master/submission documentation. No new dependencies or external assets were added.
- Validation: TypeScript/production build and 36 logic tests passed; all 14 browser checks passed. Five new checks cover continuous life/gaze, group play, repeated boops, naps/wake-up, reduced motion/offscreen suspension, chatter, drag return, and blink geometry. Desktop/mobile screenshots were inspected. The full-run, cursor accuracy, and tile-isolation checks also passed a focused rerun after the final compact-motion optimization.
- Performance: Production Chrome 150 at 1440 × 1000 measured 58.9 fps / 16.8 ms p95 for a 20-second studio sample with pointer tracking, dance, and spark controls. The final five-stream sample measured 60.0 fps / 16.7 ms p95. Both had zero long tasks over 50 ms and zero page errors. An earlier run measured 53.7 fps with 12 long tasks; cursor-sized bots now retain breathing/blinking and task gestures while autonomous idle flourishes are reserved for portraits.
- Corrections: Fixed an ambiguous boop test selector, numeric zero leaking into rendered text, mobile speech-bubble height, and SVG blink pivots drifting toward the bottom of the face. A geometry check now verifies blinks close in place. Corrected the focused-test command to forward its filter directly through the dashboard workspace.
- Limitations: Synthetic headless samples exclude startup and do not certify real sessions/projector hardware. Chatter is prewritten and local; backend transport, actual agent work, persistence, and final submission remain separate. Human visual review is pending.

## 2026-10-10T23:41:01+05:30 — Verify and complete the character interaction layer · character studio

- Changed: Finished launch/seat/pop-out/bench/merge choreography, Master state rings and roster flashes, report/board/delivery flights, social glances, extended event controls, an accessible result dialog, and the typed `consumeEvent` backend handoff. Replaced the temporary Master glyph with the unmodified official DevDay icon and documented its source/hash.
- Why: Make the frontend independently demonstrable and reviewable while preserving the backend event catalogue, cursor timing/coordinates, and truthful step counts.
- Correctness: Fixed expired emote pruning, curious-tool hold behaviour, live OS motion-preference updates, phone overflow, duplicate result handling, late manual actions after reset, pre-mount event effects, stopped rig transforms, and invalid URL display. Added per-tile development render counters; moved them out of a module singleton after hot reload revealed a test instrumentation mismatch.
- Performance: Removed app-wide event/whole-bot subscriptions, isolated timeline rendering, and kept cursor move/click/scroll out of bot view updates. The production synthetic load measurement (20 seconds after all five tiles mounted, five 8 fps canvases, including finishes/confetti, Chrome 150 at 1440 × 1000) measured 59.9 fps average, 16.7 ms p95, zero long tasks over 50 ms, and no page errors. The earlier development sample measured 49.1 fps / 33.4 ms p95 and prompted these corrections.
- Validation: TypeScript and production build passed; 36 Vitest checks and all nine Playwright checks passed in a full browser rerun after the render-counter correction. Browser checks cover all 50 expressions, slider keys/rapid scrubbing, complete sample run, OS reduced motion, mobile layout, approvals/reset, desktop/mobile pointer and ripple placement within 2 px, benches, dialog focus, and tile render isolation. Screenshots are in ignored `dashboard/artifacts/`; setup/source/verification/submission documentation was updated.
- Limitations: Synthetic headless results exclude startup and do not certify five real browser sessions or the projector. Backend transport, snapshot hydration, persisted replay, and real approvals/takeover remain integration work. Participant details and final submitted SHA remain for the team; no hosted deployment, final submission, or remote push is claimed. Original rough drafts/photo remain unchanged.

## 2026-10-10T23:40+05:30 — Phase −1 spike and screenshot-streaming probe

- Changed: `scripts/spike-computer-use.ts` (hosted `computer_use`), `scripts/tests/mock-agents-api.ts`, `scrap_tests/ss_stream/`.
- Why: Test whether hosted computer use can give a live view.
- Validation: Live runs and the mock self-test. Result: one screenshot per action, 4–9 s apart; no live stream.
- Limitations: Question closed; replaced by the S1 approach.

## 2026-10-10T23:12:31+05:30 — Build the independent character studio · character studio

- Changed: Added the npm workspace, `dashboard/`, minimal shared contracts in `packages/shared/`, colour/source documentation, and a correctly located copy of the supplied sticker reference. Preserved the independent `test/` spike and the original rough brief/photo.
- Why: Build the animation and UI layer independently while the team develops the backend. Used four official DevDay event colour tokens fetched from its stylesheet; Sky remains a local extension.
- Features: Five SVG characters, ten faces, deterministic mood/emote logic, Motion actors, squad slider, simulated run, tile overlays, shared board, Master roster, report flights, bounded particles, optional synthesized sound, and reduced motion.
- Validation: Node 22.23.3 TypeScript check and Vite production build passed. Local `/lab` returned HTTP 200; Playwright opened installed Google Chrome, captured `dashboard/artifacts/studio.png`, and reported no page errors. Installation audit reported zero vulnerabilities.
- Corrections: Initial Node 18 installation skipped the native bundler dependency; reinstalling with Node 22 and optional dependencies resolved it. The first type check revealed a generic event-union mismatch, which was corrected. Bundled Chromium does not support this host's macOS 12; installed Chrome works.
- Limitations: This checkpoint is frontend-only. Logic/browser interaction tests, remaining launch choreography, and performance validation are still in progress. No real browsing, API calls, deployment, or 60 fps certification is claimed.

## 2026-10-10T22:08:58+05:30 — Accept a browser task from the terminal · character studio

- Changed: Updated `test/computer-use-agent.mjs` to accept a task entered at the terminal or passed after `npm start --`; updated the test and project documentation.
- Why: Let the user direct the single browser agent with their own task instead of a fixed documentation lookup.
- Validation: `npm run check` passed; importing the SDK and checking the required session and event methods succeeded. The implementation continues to use the official session input event flow and preserves explicit origin approval.
- Limitations: Only public, read-only browser tasks are supported. The agent cancels sign-in requests and cannot take actions with external effects.

## 2026-10-10T22:03:32+05:30 — Add one-agent Computer Use test · character studio

- Changed: Added `test/computer-use-agent.mjs`, `test/package.json`, and `test/README.md`; updated the root README with runnable project details.
- Why: Provide a minimal, interactive test of a single Agents API agent using an OpenAI-hosted browser and public documentation.
- Validation: `npm install` added `openai@7.32.0` with no reported vulnerabilities; `npm run check` passed; importing the SDK and checking the required session and event methods succeeded. The installed SDK requires Node.js 22 while this workspace currently has Node.js 18.18.0, so a live run was not attempted.
- Limitations: The live run requires Node.js 22 or newer, an interactive terminal, a permitted OpenAI API key, and explicit origin approval. It does not test sign-in or website-changing actions.

## 2026-10-10T22:00+05:30 — Spec and planning

- Changed: `master.md` (product and architecture spec), `docs/chat-history/2026-10-10-planning-chat.md`, `.env.example`, `package.json`, `tsconfig.json`.
- Why: Agree on the idea and plan before building.
- Validation: Documentation only.
- Limitations: None identified.

## Template setup — 10 October 2026

- Changed: Added the event README, rules, agent guide, change log, AI usage record, submission checklist, Git ignore rules, and pull request checklist.
- Why: Give participants a consistent starting point for event rules, basic coding patterns, documented changes, and regular commits.
- Validation: Checked local Markdown links, event detail consistency, required documents, and diff whitespace before publishing.
- Limitations: Documentation scaffolding only; no participant project, application, or working demo is included. GitHub publication and template status are verified separately after creation.
