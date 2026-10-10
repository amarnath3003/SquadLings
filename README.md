# DevDay Exchange Community Hackathon: Kochi

A small, interactive test for one OpenAI Agents API Computer Use agent, built from scratch during the 10–11 October 2026 hackathon.

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

- **Project name:** One-agent Computer Use test
- **Short description:** An interactive, read-only smoke test for one OpenAI Agents API agent using an OpenAI-hosted browser. It finds the Agents API quickstart and reports its title and URL.
- **Working demo:** Run the local walkthrough in [test/README.md](test/README.md).
- **Technology stack:** Node.js, the official `openai` JavaScript SDK, and the OpenAI Agents API.

## Run the project

1. Install Node.js 22 or newer.
2. Follow the install, API-key, and start steps in [test/README.md](test/README.md).
3. Run `cd test && npm run check` for a no-network syntax check.

## Current status

- Working features: Session creation, public-site origin approval, streamed task output, error reporting, and completed-session cleanup are implemented in [test/computer-use-agent.mjs](test/computer-use-agent.mjs).
- Known limitations: A live test requires Node.js 22 or newer, a permitted, billed OpenAI application API key, and an interactive terminal. The repository check does not make a live API call.
- Libraries and APIs: [OpenAI Agents API Computer Use guide](https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use) and the official `openai` JavaScript SDK.

See [AI_USAGE.md](AI_USAGE.md) for AI assistance and [CHANGELOG.md](CHANGELOG.md) for the development record.
