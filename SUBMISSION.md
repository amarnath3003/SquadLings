# Project submission

Complete this file during the hackathon and use it to prepare your submission through the method announced by the organizers. Do not submit your project to the template repository.

## Project

- **Project name:** SquadLings
- **Short description:** Five expressive browser-agent characters with distinct motion, an accessible squad builder, live-event-ready overlays, a shared board, and a Master coordinator. The current demo is a zero-cost simulated Character Studio; the team is developing the backend separately.
- **Code repository URL:** https://github.com/amarnath3003/SquadLings
- **Final submitted implementation commit SHA:** TODO — select after backend integration and the final rehearsal; the frontend checkpoint is not a final submission.
- **Working demo URL or local demo steps:** With Node 22.12+, run `npm ci && npm run dev` from the root and open http://127.0.0.1:5173/. Follow [dashboard/README.md](dashboard/README.md).
- **Demo access requirements:** Node 22.12 or newer and a modern browser. The character demo needs no API key and performs no real browsing. The independent API spike in `test/` has separate key/access requirements.

## Participants

Participate solo or in a team of up to 4. Remove unused rows.

| Participant name | GitHub handle | Contribution |
| --- | --- | --- |
| TODO | TODO | TODO |

## Run and demonstrate

- **Prerequisites and versions:** Node.js 22.12+; validation used Node 24.14.1 and Chrome 150.
- **Install command:** `nvm use` (or select compatible Node), then `npm ci` from the repository root.
- **Required environment variable names:** None for the frontend. `PREVIEW_URL` and `PLAYWRIGHT_CHANNEL` optionally configure browser verification; `PERF_AUDIO=1` and `PERF_SCENE=studio|run` select sound-enabled performance scenes. The separate API spike uses `OPENAI_API_KEY` (never commit it).
- **Start command:** `npm run dev`; production preview: `npm run build && npm run preview`.
- **Demo walkthrough:** Enable the speaker, adjust Sound settings, and audition the five original voices in Face gallery. Meet the breathing/blinking cast, move the pointer, try group play and naps, drag a character, then drag across the initially grey circle slider to wake a team. At five, show the individual flames and motivated faces. Choose a scenario, preview expressions, and play a sample run with at least one agent; observe shared findings and reports, inspect all faces, and try reduced motion, a mobile tile, or manual events.
- **Checks performed and results:** The slider checkpoint passed TypeScript/build, 48 Vitest tests, all seven slider browser checks, and 235 offline audio renders. The broader run passed 30 of 31 checks; the remaining living-room audio check passed in an isolated slider snapshot. Desktop/mobile slider screenshots were inspected. Earlier audio-checkpoint production samples measured 55.9 fps in the studio and 58.7 fps with five streams; performance with the redesigned fire and ongoing activity edits still needs rehearsal.
- **Known limitations or incomplete features:** The current demo is simulated; backend transport, real browser frames/actions, persisted replay, snapshot hydration, real approvals/takeover, and final projector rehearsal are separate integration work. The performance measurement does not certify live sessions or actual audio hardware. Human listening review of the synthesized voices remains pending. Participant details and final submitted SHA remain to be filled by the team. No hosted deployment or final submission is claimed.
- **Libraries, APIs, and public datasets used:** React, Vite, Motion, Zustand, TypeScript, Vitest, Playwright, SVG/Canvas, and Web Audio. Four colour tokens and the unmodified Master icon come from official OpenAI DevDay assets; [source record](docs/reference/brand-sources.md). The separate API spike uses the official `openai` SDK. No datasets are used.
- **AI usage record:** [AI_USAGE.md](AI_USAGE.md)
- **Development change log:** [CHANGELOG.md](CHANGELOG.md)

## Submission checklist

- [ ] The project implementation started from scratch at the event.
- [ ] I participated solo or with no more than 4 team members in total.
- [ ] Codex was used during development and its usage is documented.
- [ ] The code repository URL, short description, and working demo are provided.
- [ ] README setup and demo instructions match the submitted code.
- [ ] Actual checks and known limitations are documented.
- [ ] Meaningful changes are documented and committed throughout development.
- [ ] The final implementation is committed and pushed, and its SHA is recorded above.
- [ ] No credentials or private data are included in the repository or demo instructions.
- [ ] The organizers' announced submission method and timing have been followed.

Event reference: [DevDay Exchange Community: Kochi on Luma](https://luma.com/z10nz8gp). The event wraps up by **10:00 AM IST on 11 October 2026**.
