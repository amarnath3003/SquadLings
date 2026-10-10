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

The default theme follows the current DevDay website's black background and white text, with charcoal panels and native dark controls. Characters use flat, opaque fills with no reflections, highlights, or shadows. The four event colours come directly from the live website and share one palette with the interface; Sky remains the sticker-derived light-blue extension.

Onyx, **the calm conductor**, coordinates the five browser teammates. Its resting look follows the supplied reference: a flat charcoal `#262626` circle with white `^ ^` symbols. Planning tilts, watchful glances, report nods, and state-specific lines give it a measured personality. Mouths and extra details appear during reactions; the resting characters keep their simple paired symbols. Onyx replaces the OpenAI logo in assembly, workflow, and the expression gallery.

The independent one-agent API test keeps its own install and commands in [test/README.md](test/README.md).

Build a squad with **− on the left and + on the right** of the character stack. It starts empty; + adds a teammate and − removes the last one. The stack expands and contracts around its centre, with a live count and a hint for who joins next. All five gain motivated faces and flames at full strength. Select at least one to launch the simulated run.

Enable the toolbar speaker for UI/workflow effects and five original synthesized cartoon voices. **Sound settings** controls volume, effects, voices, and idle chatter; the mix is remembered while fresh page loads stay muted. Try **Face gallery → Voice reaction → Listen to…** to audition the cast. See [sound-design.md](docs/reference/sound-design.md) for coverage, integration, verification, and listening-review limits.

Activity previews in **Squad in action** now include separate **Output** and textbox **Type** gestures, directional scrolling, a reading scan with one magnified eye, an illuminated discovery reaction, a curious question, and a joyful completion with a medal. These react to the existing event stream; see [activity mappings and demo steps](dashboard/README.md#activity-reactions).

## Current status

- Character frontend: A living room with continuous personality animation, pointer attention, draggable characters, social chatter, group play, naps/wake-up, and expressive boops; a compact 0–5 character stack with side −/+ buttons, animated arrivals/departures, and a fiery full-squad state, all ten expressions, character motion, simulated events, browser tiles, reporting flights, board, approvals, particles, sound, and reduced motion are implemented. Backend transport and real browser actions are not connected.
- Stack selector validation: Build/TypeScript, 48 logic tests, six isolated selector checks, nine studio checks and ten audio checks passed. The selector fits at 390/320 px; the surrounding page still overflows by 20 px at 320 px.
- Earlier frontend validation: TypeScript/build and 48 logic tests passed; all 42 browser checks passed during the flat-palette update, and all 16 studio/slider checks passed again on the final dark theme. A separate browser inspection verified 60 exact flat fills, dark controls, and desktop/mobile layouts. All 235 offline audio renders passed. Before the flat-fill/dark-theme update, the muted five-stream production sample measured 60 fps with no long tasks or page errors; performance has not been remeasured since that styling update. Earlier sound-enabled samples measured 55.9 fps in the studio and 58.7 fps with five streams. Human visual/listening review remains pending. See the dashboard README for reproduction and limits.

- Independent API spike: Prompt entry, session creation, website-origin approval, streamed task output, error reporting, and completed-session cleanup are implemented in [test/computer-use-agent.mjs](test/computer-use-agent.mjs).
- Known limitations: A live test requires Node.js 22 or newer, a permitted, billed OpenAI application API key, and an interactive terminal. The repository check does not make a live API call.
- Libraries and APIs: [OpenAI Agents API Computer Use guide](https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use) and the official `openai` JavaScript SDK.

See [AI_USAGE.md](AI_USAGE.md) for AI assistance and [CHANGELOG.md](CHANGELOG.md) for the development record.
