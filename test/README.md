# One-agent Computer Use test

This is a minimal, interactive test of one [Agents API Computer Use](https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use) agent. It opens the public OpenAI developer site, asks the agent to find the Agents API quickstart, and prints the page title and URL.

The agent runs in an OpenAI-hosted desktop. It has no sign-in flow and is instructed not to submit forms, download files, or change site data. The terminal asks you to approve, deny, or cancel every requested website origin; pressing Enter denies it by default.

## Run

Requires Node.js 22 or newer (the installed current OpenAI SDK requires it) and an OpenAI application API key. The key needs `api.agents.read`, `api.agents.write`, and `api.responses.write` permissions. Keep it in your shell environment, not in a file committed to this repository.

```bash
cd test
npm install
export OPENAI_API_KEY="your_key_here"
npm start
```

Optionally set `OPENAI_AGENT_MODEL` to use a model other than the current documented default, `gpt-6-astra`.

Run the no-network syntax check with:

```bash
cd test
npm run check
```

## Expected interaction

1. The script prints a session ID and starts following its event stream.
2. When the browser asks to visit `https://developers.openai.com`, review the request and enter `approve` to continue.
3. The agent reports the quickstart page title and URL, then the completed session is deleted.

If a task errors or you interrupt it, the script intentionally keeps the session so it can be inspected or recovered. It prints the session ID; do not blindly rerun because the previous outcome may be unknown.

## Sources

- [OpenAI Computer Use guide](https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use)
- [OpenAI Agents API quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart)
