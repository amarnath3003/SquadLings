# DevDay Exchange Community Hackathon: Kochi

SquadLings: a living team of five browser-agent characters, built from scratch during the 10–11 October 2026 hackathon. The character frontend runs independently while the backend is developed.

**[Event and registration on Luma](https://luma.com/z10nz8gp)** · **[Event rules](RULES.md)** · **[Agent instructions](AGENTS.md)**

## Event details

| Detail | Information |
| --- | --- |
| Venue | JAIN University, Kochi |
| Location | [Open the venue map](https://maps.app.goo.gl/Eme7gR7NDXSNRANu5) |
| Rooms | 2008 and 2009 |
| Check-in | 10 October 2026, 6:00 PM IST |
| Kick-off | 10 October 2026, 6:30 PM IST |
| Wrap-up | 11 October 2026, by 10:00 AM IST |
| Participation | Solo or a team of up to 4 participants |
| Theme | Open — build anything you like |

Keep your approved Luma QR code ready for entry, and bring your laptop and charger. Eligible checked-in participants will receive Codex credits and OpenAI API credits.

# Project overview

- **Project name:** SquadLings
- **Short description:** Five expressive, event-driven SVG teammates with a squad builder, animation playground, shared board, and simulated browser dashboard. The independent one-agent API test remains in `test/`.
- **Working demo:** Follow [dashboard/README.md](dashboard/README.md) for the zero-cost character demo. The separate API spike is documented in [test/README.md](test/README.md).
- **Technology stack:** React 18, TypeScript, Vite, Motion, Zustand, SVG, and Canvas. The separate API spike uses the official `openai` JavaScript SDK.

## Run the character studio

Use Node.js **22.12 or newer**. From the repository root:

```sh
nvm use               # Select the project's Node 24 runtime; nvm install if missing
npm ci
npm run dev
```

If `nvm` is installed but unavailable in this terminal, run `source "$HOME/.nvm/nvm.sh"` first. The `.nvmrc` selects Node 24; other version managers can use any compatible Node version (22.12 or newer).

Open **http://127.0.0.1:5173/** or the development **/lab** entry. No API key is needed. `npm run check` checks TypeScript; `npm run build` produces `dashboard/dist`; `npm run preview` serves it at port 4173. `npm test`, `npm run test:browser`, and `npm run perf` verify the animation layer. See [dashboard/README.md](dashboard/README.md) for demo controls, backend handoff, and verification limits. Official event colours and source attribution are documented in [brand-sources.md](docs/reference/brand-sources.md).

The independent one-agent API test keeps its own install and commands in [test/README.md](test/README.md).

Build a squad by sliding across the compact circle selector. It starts empty; each grey circle wakes and greets a neighbor. All five gain motivated faces and their own flames at full strength. Select at least one to launch the simulated run.

Enable the toolbar speaker for UI/workflow effects and five original synthesized cartoon voices. **Sound settings** controls volume, effects, voices, and idle chatter; the mix is remembered while fresh page loads stay muted. Try **Face gallery → Voice reaction → Listen to…** to audition the cast. See [sound-design.md](docs/reference/sound-design.md) for coverage, integration, verification, and listening-review limits.

Activity previews in **Squad in action** now include separate **Output** and textbox **Type** gestures, directional scrolling, a reading scan with one magnified eye, an illuminated discovery reaction, a curious question, and a joyful completion with a medal. These react to the existing event stream; see [activity mappings and demo steps](dashboard/README.md#activity-reactions).

## Current status

- Character frontend: A living room with continuous personality animation, pointer attention, draggable characters, social chatter, group play, naps/wake-up, and expressive boops; a compact 0–5 circle slider with staged wake-ups and a fiery full-squad state, all ten expressions, character motion, simulated events, browser tiles, reporting flights, board, approvals, particles, sound, and reduced motion are implemented. Backend transport and real browser actions are not connected.
- Frontend validation: Node 24.14.1 TypeScript/build, 48 logic tests, all 24 browser checks, and 235 offline audio renders passed. Sound-enabled production 20-second samples measured 55.9 fps in the studio and 58.7 fps with five synthetic streams. Studio had no long tasks over 50 ms; the stream run had two (maximum 128 ms); neither had page errors. Human listening review remains pending. See the dashboard README for reproduction and limits.

- Independent API spike: Prompt entry, session creation, website-origin approval, streamed task output, error reporting, and completed-session cleanup are implemented in [test/computer-use-agent.mjs](test/computer-use-agent.mjs).
- Known limitations: A live test requires Node.js 22 or newer, a permitted, billed OpenAI application API key, and an interactive terminal. The repository check does not make a live API call.
- Libraries and APIs: [OpenAI Agents API Computer Use guide](https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use) and the official `openai` JavaScript SDK.

See [AI_USAGE.md](AI_USAGE.md) for AI assistance and [CHANGELOG.md](CHANGELOG.md) for the development record.
