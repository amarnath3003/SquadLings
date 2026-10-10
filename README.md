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

## Current status

- Character frontend: A living room with continuous personality animation, pointer attention, draggable characters, social chatter, group play, naps/wake-up, and expressive boops; squad slider, all ten expressions, character motion, simulated events, browser tiles, reporting flights, board, approvals, particles, sound, and reduced motion are implemented. Backend transport and real browser actions are not connected.
- Frontend validation: TypeScript and production build passed under Node 22.23.3; Playwright rendered the local studio in installed Chrome without page errors. 36 logic tests and 14 browser checks passed, including desktop/mobile click accuracy, OS reduced motion, and isolated bot renders. Production 20-second samples measured 58.9 fps in the interactive living room and 60.0 fps with five synthetic streams, both with no long tasks over 50 ms. See the dashboard README for limits and reproduction.

- Independent API spike: Prompt entry, session creation, website-origin approval, streamed task output, error reporting, and completed-session cleanup are implemented in [test/computer-use-agent.mjs](test/computer-use-agent.mjs).
- Known limitations: A live test requires Node.js 22 or newer, a permitted, billed OpenAI application API key, and an interactive terminal. The repository check does not make a live API call.
- Libraries and APIs: [OpenAI Agents API Computer Use guide](https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use) and the official `openai` JavaScript SDK.

See [AI_USAGE.md](AI_USAGE.md) for AI assistance and [CHANGELOG.md](CHANGELOG.md) for the development record.
