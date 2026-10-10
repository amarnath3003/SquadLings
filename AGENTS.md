# Agent guide for hackathon projects

## Event requirements

- Read [RULES.md](RULES.md) before working. Build project implementation from scratch at the event; do not import a pre-built project.
- Libraries, APIs, and public datasets are allowed. Document their sources and use.
- Use Codex during development and briefly record its actual contribution in [AI_USAGE.md](AI_USAGE.md).
- Prepare a code repository, short project description, and working demo in [SUBMISSION.md](SUBMISSION.md).

## Use basic coding patterns

- Prefer straightforward, idiomatic code: small functions, clear names, simple data structures, and modules with one clear responsibility.
- Use the project's existing patterns. Add an abstraction only when an actual repeated need makes the code easier to understand.
- Choose the simplest implementation that meets the current requirement. Avoid unnecessary layers, generic frameworks, premature optimization, and speculative features.
- Keep dependencies few and purposeful. Reuse appropriate standard libraries and established libraries instead of reimplementing them.
- Validate inputs, handle errors explicitly, and show useful failure messages. Do not hide failures behind fabricated success or demo data.
- Keep changes focused. Explain the reason for non-obvious decisions in short comments or project documentation.

## Document every meaningful change

- Update [CHANGELOG.md](CHANGELOG.md) in the same commit as each meaningful change. Record the date and time with timezone, what changed, why, the affected files or feature, validation performed, and known limitations.
- Update [README.md](README.md) whenever setup, commands, environment requirements, project behavior, or demo instructions change.
- Update [AI_USAGE.md](AI_USAGE.md) whenever Codex makes a meaningful contribution. Record the task, assistance, human review status, checks, and any corrections. Brief summaries are enough; full chat transcripts are unnecessary.
- Keep claims accurate. Distinguish implemented and verified behavior from planned or incomplete work. Never invent test results, deployment success, AI usage, or commit timestamps.

## Make regular, timely commits

1. Inspect `git status` before editing. Preserve teammates' work and identify files belonging to the current task.
2. Finish a small, coherent change, run appropriate checks, and update its documentation.
3. Review the diff and explicitly stage only the files for that change.
4. **Commit after each completed milestone. While actively building, aim for a commit about every 30 minutes when meaningful changes are ready.** Do not leave the entire night's work for one final commit.
5. Commit completed work before a handoff, a long break, or the end of a work session. If work is incomplete, document its state and use an honest `wip:` message for a useful checkpoint.
6. Use short, descriptive messages, such as `feat: add project search`, `fix: handle empty results`, or `docs: explain local demo setup`.
7. Do not create empty commits to satisfy the clock. Do not backdate commits, squash away the event development record, force-push, or rewrite shared history.
8. Push committed checkpoints to the team's repository regularly, when network access is available and the team has authorized that remote. Resolve conflicts with care.

The 30-minute target is this repository's working convention. It does not replace event rules or organizer instructions.

## Check work and protect credentials

- Use the project's actual install, run, lint, test, and build commands. Add them to the README as soon as they exist; this template does not prescribe a stack.
- Run checks appropriate to the change. For a documentation-only change, check links and consistency. For code changes, verify the changed behavior and any relevant existing tests.
- Report what ran and what passed, failed, or could not be checked. If a command fails, investigate or document the limitation before handoff.
- Keep credentials, API keys, approved QR codes, and private participant data out of commits and logs. Use environment variables and sanitized examples; never put live keys in `.env.example`.

## Before submission

- Complete [SUBMISSION.md](SUBMISSION.md), replacing all participant placeholders.
- Confirm the README gives reproducible setup and demo steps.
- Check that the working demo matches the submitted code and that known limitations are disclosed.
- Update the changelog and AI usage record, commit the final coherent change, and push it.
- Record the final submitted commit SHA in the submission details. Documentation may record that SHA in a subsequent commit; do not claim later implementation changes belong to the earlier demo.
- Follow the organizers' actual submission method and timing. The event wraps up by 10:00 AM IST on 11 October 2026.
