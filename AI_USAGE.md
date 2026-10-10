# AI usage record

Use Codex during the hackathon and briefly document its actual contribution here. Add a row after each meaningful task or milestone. Keep summaries concise and omit secrets, private data, and full chat transcripts.

## Event build log

| Date and time with timezone | Tool / model, if known | Task | Assistance and affected files | Human review / corrections | Validation and result |
| --- | --- | --- | --- | --- | --- |
| 2026-10-10T23:12:31+05:30 | Codex | Build the SquadLings character frontend | Read the supplied brief/spec and event rules, fetched official DevDay colours, and implemented the React/Motion studio, shared event contracts, pure mood/emote logic, simulated dashboard, and documentation from scratch. | Pending human review; corrected the event factory typing and Node-version installation issue. | Node 22 TypeScript and build passed; HTTP 200 and Playwright Chrome screenshot succeeded without page errors. Full interaction/logic/performance checks continue in the next milestone. |
| 2026-10-10T22:08:58+05:30 | Codex | Make the Computer Use test prompt-driven | Updated the Node.js runner to accept an interactive or command-line task and documented the read-only safety limits in `test/README.md` and root project files. | Pending human review | `npm run check` and the required SDK API-surface check passed. No API key or live request used. |
| 2026-10-10T22:03:32+05:30 | Codex | Create a single-agent Agents API Computer Use test | Researched the official OpenAI Computer Use and Agents API documentation, then added the interactive Node.js test and setup documentation in `test/` plus README instructions. | Pending human review | Installed `openai@7.32.0`, ran the syntax check and required SDK API-surface check successfully. No API key or live request was used; the installed SDK requires Node.js 22 while the workspace has Node.js 18.18.0. |

## Template preparation

On 10 October 2026, Codex prepared this documentation template from the organizer's supplied rules and checked the linked Luma page for the event name and dates. This covered `README.md`, `RULES.md`, `AGENTS.md`, `CHANGELOG.md`, `AI_USAGE.md`, `SUBMISSION.md`, `.gitignore`, and the pull request checklist. Agent validation covered local links, event consistency, required documents, and diff whitespace; organizer review is pending.

This preparation is separate from participant project implementation and participant AI usage during the event.
