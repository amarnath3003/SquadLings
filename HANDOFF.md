# Latest addition: BuggyMart QA target (2026-10-11)

The user requested a modest-looking mock website with easy planted bugs for the squad to hunt. This is complete in `targets/buggymart/`, separate from the dashboard and agent engine.

- Start: `npm run buggymart` → **http://127.0.0.1:3001**. No build, API key or new dependencies.
- Six products, search/category/sort, lamp variants, cart/coupon, and fake checkout.
- Ten deterministic bugs enabled by default. `-- --bugs none` gives a working baseline; `-- --bugs BM-02,BM-09` enables selected bugs.
- **Reset demo** clears the current tab. Session storage isolates independent tabs/agent browsers; state survives reloads. No shipping details are stored.
- Maintainer-only answer key: `targets/buggymart/planted-bugs.json`; usage and triggers: `targets/buggymart/README.md`. These are not served as web routes and should not be passed to the agents.
- `npm run test:buggymart`: 29 passing checks, including all bugs on/off, normal checkout, isolation/reset, basic mobile fit and private file exclusions. No paid agent run was started.
- The simplified scope and actual bug IDs now replace the original plan in master.md §24. Auth, admin, red-team routes, runtime mutation endpoints, QA templates and automatic scoring remain unimplemented.
- Server and tests are included in the root TypeScript check. Existing dashboard behavior is untouched.

The earlier dashboard handoff is retained below for context.

---

# Handoff: moving the dashboard onto the character studio UI

Last updated 2026-10-11, about 06:25 IST, partway through the port. The spec is [master.md](master.md); the current dashboard's design and API are in its §19.8.

## Goal

The working dashboard lives in [ui/](ui/): `index.html`, `app.js` (about 1,640 lines of plain JS) and `app.css`. It is served by [scripts/lib/ui-server.ts](scripts/lib/ui-server.ts) through `npm run ui` on 127.0.0.1:8787. We are moving it into the React app in [web/](web/), which is built on a teammate's "character studio".

The studio comes from github.com/amarnath3003/squadlings at commit 45f625f. A read-only clone is in [external/amarnath-squadlings/](external/amarnath-squadlings/), and its UI is in `dashboard/`.

There are two rules:

- **It must look exactly like the 8787 dashboard.** That means the same DOM ids, classes and text. [web/src/styles/classic.css](web/src/styles/classic.css) is a copy of `ui/app.css`, so the same markup gets the same look.
- **The studio's characters and animations go where they fit.** The squad and effort pickers are done; the agents' cursors are in progress.

What the user wants:

- **UX over looks**, dark theme, and the flow of a ChatGPT-like chat app:
  - one bar in the middle;
  - the chat stays centered while the Master plans, then slides left as the agents' browsers spawn on the right;
  - a calm chat, with one team card per plan;
  - Chats history, End chat and New chat.
- **No wordy copy** from the studio components. The user calls it slop.
- **The −/+ buttons** for both the agent count and the effort.

## How to run

| What | Command | Where |
|---|---|---|
| The dashboard (new UI) | `npm --prefix web install`, once. Then `npm run ui` builds `web/` (under a second) and serves it, with the API and the WebSocket. It needs `OPENAI_API_KEY` in `.env`. | http://127.0.0.1:8787/ (MCP on 8788, behind the tunnel) |
| The old dashboard | `npm run ui -- --classic` serves `ui/` | :8787 |
| Free live testing | `node scripts/dev-mock-ui.ts --port 8796 --mcp-port 8795` runs the real server with a scripted mock Master and bots. Any task text plays the same run; nothing reaches OpenAI. | :8796 |
| Dev with hot reload | `npm run web` (or `cd web && SQUADLINGS_API=http://127.0.0.1:8787 npx vite --host 127.0.0.1`) | http://127.0.0.1:5173/ |
| Typecheck | `cd web && npx tsc --noEmit`, and `npm run typecheck` in the root for the server | |
| All tests (classic UI and server) | `npm test` in the root | |

Notes:

- **The proxy.** [web/vite.config.ts](web/vite.config.ts) forwards `/api` and `/ws` to `SQUADLINGS_API`. The server only accepts its own Origin, so the proxy rewrites Origin, but only for requests from the dev page itself. `VITE_PORT` picks another port.
- **Opening a closed chat.** Until the Chats panel is ported, `http://127.0.0.1:5173/?run=<id>` opens one from disk, read-only. Get the ids from `GET /api/runs`.
- **The classic UI** at :8787 still works fully: chat, tiles, takeover and Chats. Use it to compare against.
- **The user's own `npm run ui`** (started 04:02) may still be running old server code, which lacks the Chats endpoints and the none/xhigh efforts. Restarting it fixes that.

## Done (in `web/`)

**Setup**
- **[package.json](web/package.json):** versions pinned to the teammate's lockfile (react 18.3.1, motion 12.43.0, zustand 5.0.15, vite 8.3.4, typescript 7.0.2).
- **[tsconfig.json](web/tsconfig.json):** the alias `@swarm/shared/*` points to [web/shared/](web/shared/), the studio's types, events and cast.

**Copied from the studio, unchanged**
- [web/src/characters/](web/src/characters/), [effects/](web/src/effects/) (synthesized sound, muted by default), [mood/](web/src/mood/), [components/SoundControls.tsx](web/src/components/SoundControls.tsx), [launch/SquadFire.tsx](web/src/launch/SquadFire.tsx).
- Styles: `tokens`, `life`, `sound`, `squad` and `activity.css`. [characters.css](web/src/styles/characters.css) holds just the character rules taken from their `app.css`.

**Changed**
- **[launch/SquadSlider.tsx](web/src/launch/SquadSlider.tsx):** the studio's "Pick your squad", with its extra copy removed and a `min` prop added (a run needs one agent).
- **[launch/EffortStepper.tsx](web/src/launch/EffortStepper.tsx), new:**
  - the same −/+ stepper around the chosen squad;
  - faces go bored → calm → curious → focused, with flames at X-High;
  - values none / low / medium / high / xhigh (gpt-6-luna rejects "minimal").

**Styles**
- **[classic.css](web/src/styles/classic.css):** our stylesheet, with the logo's colors updated.
- **[theme.css](web/src/styles/theme.css):** maps the studio's tokens to our palette.
- **[picker.css](web/src/styles/picker.css):** scales the pickers into our 320px popovers, and styles the sound buttons and the logo.

**Home screen**
- **[home/Composer.tsx](web/src/home/Composer.tsx):** the bar, with the same markup as classic.
  - Its pieces: "+" for options, the task box, the agents chip (opens the squad picker), the effort chip (opens the effort picker) and Send.
  - Settings are saved under the localStorage key `squadlings.settings`.
  - Enter sends.
- **[api.ts](web/src/api.ts):** `startRun` asks before ending a live chat, and retries on 409.
- **Logo and favicon:** both are the studio's white ball with `^ ^` ([public/favicon.svg](web/public/favicon.svg)).
- **Temporary hand-over:** after a successful start, `App.tsx` sends the browser to the :8787 page (`location.assign(DASHBOARD)`). Remove this once the live view is ported.

**State and actions**
- **[live/store.ts](web/src/live/store.ts):** a one-to-one port of app.js's "State" and "Events (the reducer)". It handles every server event. Its API:
  - `S`, the one mutable state object;
  - `useLive()`, which re-renders the component once per frame after changes;
  - `apply(e)`, `loadRun()`, `goHome()`, `phase()`, `touchBot` / `touchItem` / `touchTop` / `touchLayout`, `notify()`;
  - `effects` hooks: `cursor`, `hideCursorSoon`, `pulse`, `bubble`, `attention`, `historyChanged`;
  - helpers: `clip`, `money`, `mmss`, `colorVars`, `who`, and others.
- **[live/actions.ts](web/src/live/actions.ts):** `post`, `showHint` (sets `S.hint`), `focusBot`, `setHover`, `takeover`.

**Chat**
- **[chat/markdown.ts](web/src/chat/markdown.ts)** and **[chat/Thread.tsx](web/src/chat/Thread.tsx):**
  - every thread item type;
  - the team card (rows, the Master's note, folded team messages);
  - the human-check card with takeover;
  - the answer with Copy and sources;
  - stay-at-bottom scrolling and the "New messages ↓" jump button.
- **Not yet checked visually** against classic. Open the same closed chat in both UIs and compare.

**App shell**
- **[App.tsx](web/src/App.tsx):** a skeleton of classic's page structure. The `#app` classes come from `phase()` (home / center / side / chat-hidden). It renders `<Thread />` and `<Wall />`.

## Done since: the live connection and the shell (lead)

- **[live/connection.ts](web/src/live/connection.ts):** the WebSocket. It handles hello / tunnel / snapshot / event, applies `onSnapshot`'s rules, passes binary frames to `onFrame`, and shows `#banner` with backoff reconnect. `send()` works.
- **[live/history.ts](web/src/live/history.ts):** `loadHistory`, `toggleHistory`, `openChat`, `newChat`.
- **[shell/Shell.tsx](web/src/shell/Shell.tsx):** `TopBar` (status pill, timer, cost, tools label, End chat), `Activity` (the Master's line), `ClosedBar`, `History` (the Chats panel).
- **[App.tsx](web/src/App.tsx):**
  - connects on mount;
  - the rail: logo goes home, New chat, Chats;
  - the chat head: the Master mark (busy), `#master-sub`, hide-chat;
  - the composer sits in `#home-slot` on home and in `#chat-slot` in a run;
  - `#chat-rail` with the unread count, the splitter, `#banner`;
  - shortcuts: Esc, "/", 1–5;
  - `effects.attention` (the tab title).
- **[home/Composer.tsx](web/src/home/Composer.tsx):** in a run it posts to `/api/runs/:id/messages`; on home it starts a run with `S.starting`, so the snapshot opens the run in this app. The hand-over to :8787 is gone.
- **Checked:** the Chats panel, plus a closed chat (Python/Node/Go) with its team card opened, matched classic on the chat side. Tested against a server on :8790 and the dev app on :5178.

## Status at 06:40 IST: the studio run screen works on real runs

Both workers finished, and the lead integrated their work.

- **Worker B** built `web/src/studio/` (the studio engine, copied unchanged and bridged to the shared `characters/`, `mood/` and `effects/`), `studio/adapter.ts` (our events become their `SwarmEvent`s; the full mapping table is in the file's comments) and `studio/StudioFx.tsx` (EffectsCanvas and Flights; importing it installs the adapter). It is mounted in App.tsx. A dev harness is at `/src/studio/dev/harness.html`.
- **Worker A** built:
  - `studio/components/` (BotTile, FrameCanvas, MasterCard, BoardPanel with NeedsYou);
  - `wall/Wall.tsx`, `wall/frames.ts` and `wall/takeover.ts`;
  - `styles/studio-run.css`;
  - `scripts/dev-mock-ui.ts`.
- **Lead:**
  - fixed events arriving twice (two WebSockets);
  - synced the teammate's newer `MasterCharacter.tsx` and `SquadFire.tsx` (commit cd568c5; the rest of that commit is a promo film we don't need);
  - Hand back now returns to the full grid, so Onyx's card and the finish flights are visible;
  - `npm run ui` serves the new app.
- **Checked on the mock, end to end:**
  - pick 2 agents, then send;
  - the chat sits in the center, then moves to the side;
  - the tiles show the real role labels and the character cursors;
  - Lime needs you, then Take over, click "I'm a person" in the frame, then Hand back;
  - the answer arrives; Onyx shows Done with 2/2 reports;
  - nothing doubled, no page errors.
- **Tests:** `npm test` (unit 15, squad 19, classic dashboard 36) pass, and so do both typechecks.

**UX pass, 06:55 IST (the user's list)**

- **Onyx's card is pinned at the top of the chat.** `studio/components/MasterCard.tsx` was rewritten as a foldable card and is mounted in App.tsx as `.onyx-pin`, styled by `styles/onyx-card.css`.
  - It keeps the studio's `.master-card .master-character` / `[data-master-row]`, so the flights still start and land there.
  - Clicking a row focuses that agent.
  - While the card is pinned, the latest team card in the thread hides its rows (CSS only).
- **The shared board and the right column are gone.** The wall is just the tiles (`wall/Wall.tsx`), restyled in `styles/squad-wall.css`:
  - rounded cards with a thin line in the agent's colour along the top, and readable type;
  - an odd tile sits centred under the others;
  - when you focus a tile, the others become small screens below it.
- **Chat head:** a "■ Stop" button (`/halt`: Onyx and the agents stop, the chat stays open), shown only while something is working, plus a hide-panel icon.
  - When the chat is hidden, it becomes an "Onyx" pill showing a live Onyx and an unread count; clicking it reopens the chat.
- **End chat** (top bar) ends everything (`/stop`). It's restyled as a red-tinted pill with a ■ (`styles/chrome.css`).
- **Sound panel and More options use our popover styles, with switch toggles.**
  - On the home screen, More options opens above the bar.
  - The sound panel says "Volume" rather than "Master volume".
- **Another session** added `/halt`, the composer's Stop button and the Master → Onyx rename before this pass. squadlings-2f is only writing README.md and the media files.

**Design pass, 07:10 IST**

- **Skills installed** in `.claude/skills/`: `frontend-design` (from anthropics/skills) and `impeccable` (from pbakaus/impeccable, Apache-2.0). Only impeccable's SKILL.md and `reference/` were installed. Its scripts were left out on purpose, because the launcher downloads an unreviewed binary.
- **Tiles look like little game consoles** (`styles/squad-wall.css`, BotTile):
  - a dotted face and the avatar in a coloured ring;
  - the browser set in a bezel;
  - progress as XP pips, recent actions as item slots, and a hopping status dot;
  - amber "Needs you" with a breathing ring; green "Done".
- **Human checks:**
  - on the tile, a floating amber pill ("Human check on host · Take over") and, while you're in control, a slim pill with Hand back;
  - in the chat, a card with the agent's worried face, "Take over" / "Just look", then "I'm done, hand it back"; once handed back, it collapses to a ✓ line.
  - Our `S` state overrides the studio status for Needs you / You're in control, on both the tiles and Onyx's card.
- **Onyx's pinned card** is reworked into aligned rows: avatar ring, name and role, a status chip, the latest note, and a progress bar (`styles/onyx-card.css`).
- **Icons:** the speaker (waves or muted) and the settings gear are drawn SVGs. "tools online" is gone; the text shows only when the tools are offline.
- **In progress (roam worker):** `web/src/roam/`.
  - On home, the squad roams and reacts while you type.
  - On send, the characters shrink into coloured dots, and the dots wave while Onyx plans (a DotWave component replaces the spinners).
  - On plan, they pop out, get their tasks and fly to their tiles.

**07:30 IST**

- **Efforts now fit the model** (`fitEffort` in `scripts/lib/squad-runner.ts`; unit-tested). gpt-6.1-sol accepts only low to max, so "none" runs at "low".
- **Roam (`web/src/roam/`, finished by the lead after the worker was stopped):**
  - about 80px characters roam the home screen and react to typing;
  - on send, they shrink into the thinking row's dots;
  - there is one chat-like thinking row in the thread (`ThinkingRow`: Onyx, the dot wave and what Onyx is doing), and Activity stays empty while it shows;
  - at the plan, the planned agents get a task note and fly to their tiles; the others doze off and fade.
- **Colours:** "needs you" is lavender (`--you` in chrome.css) on the tiles and Onyx's chips; the chat's human-check card is grey.
- **Out of scope** (user, hackathon): mobile and responsive work.

**Left to do**

1. Point `scripts/tests/ui.selftest.ts` at `web/dist`. The tile selectors there are classic (`.tile`); the new ones are `.bot-tile`, and the pickers use `.squad-remove` / `.effort-down`.
2. Update master.md §19.8 for the new dashboard.
3. The studio's tiny font sizes on the wall are kept as they are. The wall hasn't been checked at phone width.
4. When an agent gets a new assignment, it flies out of Onyx again. That's deliberate.

## The user's edits at 06:45 IST (lead)

- **Onyx everywhere you can see it.**
  - `onyx()` in store.ts rewrites "the Master" / "Master" in our wording and in the server's notices and reasons. Agents' and Onyx's own words stay as written.
  - Onyx's character replaces the white circles in the chat head, beside its messages and on the chat rail.
  - "Master" stays the internal name, so the logic and the server are unchanged.
- **A Stop button in the box.**
  - While Onyx or the agents are at work and the box is empty, Send becomes a square Stop. It calls the new `POST /api/runs/:id/halt`.
  - `Squad.halt()` stops the working bots ("stopped by you") and cancels the Master's turn.
  - Queued updates wait (wake "no") until the user's next message, and the chat stays open. End chat still ends everything.
  - Checked on the mock.
- **The roster row no longer jumps right on a report** (fix at the end of `studio-run.css`).
- **The teammate's repo has 4 new commits** (to `cd568c5`).
  - Synced: the `MasterCharacter` resting prop and the `SquadFire` zoom-safe measuring.
  - Not taken: their `EffortSlider` (a slider with caption copy; the user wants −/+ and no copy) and the launch film.
- **`scripts/dev-mock-ui.ts` serves `web/dist`** when it's built.

## Not started (do these next, in order)

1. **Mount what the workers ask for** (see their notes, and the files themselves).
2. **Done: serving the build.** `npm run web:build`, then `npm run ui -- --web`, serves `web/dist` under the server's strict CSP. It has been checked with no page errors. Once the wall is done, make `--web` the default ([scripts/ui.ts](scripts/ui.ts), `STATIC`). `npm run web` is the dev server.
3. **Point the tests at the new app:** run [scripts/tests/ui.selftest.ts](scripts/tests/ui.selftest.ts) against `web/dist`. The ids are the same, so most checks should hold. The picker checks change: click `.squad-remove` / `.effort-down` instead of filling range inputs.
4. **Done: the server's cast uses the DevDay colors** ([scripts/lib/squad.ts](scripts/lib/squad.ts) `CAST`). A running server needs a restart to pick this up.
5. **Update the docs:** master.md §19.8 and the test counts.

## Rules that still apply

- **Secrets:** never print `OPENAI_API_KEY` from `.env`. The user's email is for identification only.
- **No real tasks in tests.** A real task costs money and opens real sites. Use the mock (`scripts/tests/mock-squad-api.ts`, the `ui.selftest.ts` pattern, or `scripts/dev-mock-ui.ts`).
- **Agents never solve CAPTCHAs or imitate humans** (master.md §17.8). Human checks are left to the user through takeover.
- **Test tasks come from the user.** No hardcoded demo tasks outside offline self-tests.
- **Security:**
  - the dashboard listens on 127.0.0.1 only, and checks Host and Origin;
  - the Markdown renderer escapes everything;
  - takeover input is never logged.

## Gotchas

- **Re-rendering:** `S` is mutable, so components must call `useLive()`. Memoize on `rev` to skip unchanged items.
- **The flames:** `SquadFire` measures `.seat-art` and `--agent-scale`. `picker.css` sets the scale to 0.6875 (64px characters drawn at 44px).
- **The bar on phones:** the text box needs `width: 0` inside the flex bar, or the bar overflows a phone screen (the 8787 stylesheet already handles it).
- **Run statuses:** starting, running, ending, ended, failed, interrupted.
- **Cursor coordinates:** cursor events give x, y and box in the page's viewport pixels (for example 1280×800); `glideMs` is how long the move takes.
