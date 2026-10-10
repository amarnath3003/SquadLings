# Project submission

Complete this file during the hackathon and use it to prepare your submission through the method announced by the organizers. Do not submit your project to the template repository.

## Project

- **Project name:** One-agent Computer Use test
- **Short description:** A minimal, interactive, read-only smoke test for one OpenAI Agents API browser agent. It finds the official Agents API quickstart and reports its title and URL.
- **Code repository URL:** TODO
- **Final submitted implementation commit SHA:** TODO
- **Working demo URL or local demo steps:** Follow [test/README.md](test/README.md) to install dependencies, export `OPENAI_API_KEY`, and run `npm start` from `test/`.
- **Demo access requirements:** Node.js 22 or newer, an interactive terminal, a billed OpenAI application API key with Agents and Responses permissions, and user approval for the requested public website origin. Do not include the key in the repository.

## Participants

Participate solo or in a team of up to 4. Remove unused rows.

| Participant name | GitHub handle | Contribution |
| --- | --- | --- |
| TODO | TODO | TODO |

## Run and demonstrate

- **Prerequisites and versions:** Node.js 22 or newer.
- **Install command:** `cd test && npm install`
- **Required environment variable names:** `OPENAI_API_KEY`; optionally `OPENAI_AGENT_MODEL`. Export values in the terminal; no `.env` file is required.
- **Start command:** `cd test && npm start`
- **Demo walkthrough:** Approve the requested `https://developers.openai.com` browser origin, then observe the agent’s answer containing the Agents API quickstart title and URL.
- **Checks performed and results:** `cd test && npm install` installed `openai@7.32.0` with no reported vulnerabilities; `cd test && npm run check` passed. The SDK was imported successfully. A live call was not made because it needs a participant API key and Node.js 22 or newer, while the workspace has Node.js 18.18.0.
- **Known limitations or incomplete features:** The test supports a public, read-only task only. It cancels browser sign-in requests and does not exercise mutations, private sites, screenshots, or recovery actions.
- **Libraries, APIs, and public datasets used:** [OpenAI Agents API Computer Use guide](https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use) and the official `openai` JavaScript SDK. No datasets are used.
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
