# One-agent Computer Use test

This is a minimal, interactive runner for one [Agents API Computer Use](https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use) agent. Enter a browser-based research or navigation task and it runs that task in an OpenAI-hosted browser.

The agent runs in an OpenAI-hosted desktop. It has no sign-in flow and is blocked from credentials, purchases, terms acceptance, messages, downloads, or changes to website and account data. The terminal asks you to approve, deny, or cancel every requested website origin; pressing Enter denies it by default.

## Run

Requires Node.js 22 or newer (the installed current OpenAI SDK requires it) and an OpenAI application API key. The key needs `api.agents.read`, `api.agents.write`, and `api.responses.write` permissions. Keep it in your shell environment, not in a file committed to this repository.

```bash
cd test
npm install
export OPENAI_API_KEY="your_key_here"
npm start
```

The script asks, `What should the browser agent do?` Enter a task such as:

```text
Find the OpenAI Agents API quickstart and report its page title and URL.
```

You can also provide the task directly:

```bash
npm start -- "Find the OpenAI Agents API quickstart and report its page title and URL."
```

Optionally set `OPENAI_AGENT_MODEL` to use a model other than the current documented default, `gpt-6-astra`.

Run the no-network syntax check with:

```bash
cd test
npm run check
```

## Expected interaction

1. Enter a browser-based task, then the script prints a session ID and starts following its event stream.
2. When the browser requests a website origin, review the site and reason, then enter `approve`, `deny`, or `cancel`.
3. The agent reports the task result and relevant URLs, then the completed session is deleted.

This runner is for public, read-only browser tasks. It cancels all sign-in requests and does not support actions with external effects. If a task errors or you interrupt it, the script intentionally keeps the session so it can be inspected or recovered. It prints the session ID; do not blindly rerun because the previous outcome may be unknown.

## Sources

- [OpenAI Computer Use guide](https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use)
- [OpenAI guide to continuing sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions)
- [OpenAI Agents API quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart)
