# Project submission

Complete this file during the hackathon and use it to prepare your submission through the method announced by the organizers. Do not submit your project to the template repository.

## Project

- **Project name:** SquadLings
- **Short description:** Research, price comparison, trip planning and QA often mean juggling dozens of browser tabs. SquadLings hands one typed task to a coordinator agent (Onyx) that splits it among up to five browser agents. They browse real sites in parallel while you watch each browser live, chat mid-run and take over for human checks, and Onyx merges the findings into one answer with sources.
- **Code repository URL:** TODO
- **Final submitted implementation commit SHA:** TODO
- **Working demo URL or local demo steps:** Local. See [README Quick start](README.md#-quick-start): `npm install`, `npx playwright install chromium`, `npm --prefix web install`, put `OPENAI_API_KEY` in `.env`, optionally `npm run prewarm`, then `npm run ui` and open http://127.0.0.1:8787. No-cost scripted demo: `node scripts/dev-mock-ui.ts --port 8796 --mcp-port 8795`.
- **Demo access requirements:** An OpenAI API key with Agents API access (not included), `cloudflared` installed, and network access for the quick tunnel. The mock demo needs no key.

## Participants

Participate solo or in a team of up to 4. Remove unused rows.

| Participant name | GitHub handle | Contribution |
| --- | --- | --- |
| Vijay Anand | @vijayanand1505 | Engine, server and dashboard |
| D Amarnath | @amarnath3003 | Characters, animation studio, sound, banner and launch film |

## Run and demonstrate

- **Prerequisites and versions:** Node.js 22.18+ (developed on Node 26.7.0), `cloudflared`, Playwright Chromium, a modern browser.
- **Install command:** `npm install && npx playwright install chromium && npm --prefix web install`
- **Required environment variable names:** `OPENAI_API_KEY` (required); optional `MODEL_MASTER`, `MODEL_BOT`, `MODEL_VISION`, `MODEL_DECISIONS`, `OPENAI_BASE_URL`. See [.env.example](.env.example).
- **Start command:** `npm run ui` (dashboard) or `npm run squad -- "task"` (terminal)
- **Demo walkthrough:** Type a task in the centre bar, pick the number of agents and effort, press send. Onyx plans with web search, the agents' live browsers appear on the right, the team card shows progress, you can type a follow-up mid-run or take over a tile, and Onyx returns one answer with sources. Closed chats reopen from Chats.
- **Checks performed and results:** `npm test` (unit, mock Agents API, browser/MCP, squad and UI self-tests, offline) and `npm run bench` passed during the build; TestTown eval 13/13; live runs recorded in [CHANGELOG.md](CHANGELOG.md). TODO: rerun `npm test` and `npm run typecheck` on the final commit and record the result here.
- **Known limitations or incomplete features:** Local only; the React live-run screen is still being ported (see [HANDOFF.md](HANDOFF.md)); no cost cap; Cloudflare may rate-limit quick tunnels (HTTP 429); Bing used for search; agents never solve CAPTCHAs, the user takes over.
- **Libraries, APIs, and public datasets used:** OpenAI Agents API, Model Context Protocol SDK, Playwright, cloudflared, ws, zod, TypeScript, React, Vite, Motion, Zustand. Character studio components from [amarnath3003/SquadLings](https://github.com/amarnath3003/SquadLings). Colours follow the DevDay event website. No datasets.
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
