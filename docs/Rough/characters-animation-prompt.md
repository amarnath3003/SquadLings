# Build prompt: SquadLings characters, animation and reactions

> **How to use.** Paste everything between `PROMPT START` and `PROMPT END` into your coding agent (Codex or Claude Code), run from the repo root with `master.md` present.
>
> **What it builds.** The "Face" layer from master.md §32: the living squad. That covers the squad-size slider, the launch choreography, each bot's tile, faces and reactions, the icon and emote set, reporting to the Master, effects and sound.
>
> **No backend needed.** Everything runs on fake events in a Character Lab first, at zero API cost. It plugs into the real event stream later without changes.
>
> **Prerequisite.** `packages/shared` types and events (P1.1). If they don't exist yet, the agent creates the minimal pieces exactly as master.md §18 and §26 define them.

---

## PROMPT START

### 0. Your job

You're building the part of SquadLings that people will remember: **the living squad.** Five DevDay sticker characters (Plum, Lime, Tango, Blu and Sky) and the OpenAI-logo Master work as a team on screen. Each bot gets its own task, its own tile (its "home"), its own personality in motion, and its own reactions. Every bot visibly reports back to the Master.

**The bar:**
- Someone watches one tile for 10 seconds without reading any text. They can still tell which bot it is, what it's doing, and how it "feels" about it.
- It holds 60 fps on a laptop with five live browser streams running underneath.

Charm is never allowed to cost smoothness, and it's never allowed to bend the truth.

### 1. Read these first

From `master.md`:

| Section | Why |
|---|---|
| §6 Product experience | Screens, tile anatomy, layouts for 1–5 bots, status copy, accessibility |
| §7 Characters and animation | Cast, colors, geometry, the 10 faces, the mood engine, set pieces. **The base you build on.** |
| §10.3 Bot states, §11.3 Launching bots | When bots appear and how fast (300 ms server stagger) |
| §16 Shared board | Notes and delivery (the paper planes) |
| §18 Events | The only inputs you get. §18.2 is the catalog. |
| §19 Dashboard | Stack, store, pure reducer, component tree, coordinate mapping (§19.5) |
| §26 Data models | `BotId`, `BotStatus`, `Mood`, `ToolName`, `Approval`, `BoardNote`, `Template` |
| §28 Repository layout | Where files go |
| §35 Performance budget | One bot step takes 3–7 s, and animation fills the gaps |

Also look at the sticker art: `docs/reference/devday-stickers.jpg`.

**Contracts you must not break** (all from master.md):

- **Cast and colors.**
  - Master: `#0D0D0D`
  - Plum `#5B30A6`, signature face `¬ ¬`
  - Lime `#58A81A`, signature face `+ +`
  - Tango `#DE5A26`, signature face `= =`
  - Blu `#2E61C8`, signature face `> <`
  - Sky `#A6D8F5`, signature face `^ ^`
  - Face ink is `#111` on every body.
  - Fixed slots: plan assignment 1 goes to bot1 (Plum), assignment 2 to bot2, and so on.
- **The 10 moods and their priority:** failed › worried › found › content › suspicious › happy › focused › bored › curious › calm. Use exactly the engine in §7.4.
- **Geometry:**
  - The body is r = 30 in a 64 × 64 viewBox, rendered at 44 px on a 1080p tile (32–56 px).
  - The pointer tip hotspot is at (0, 0), with path `M0 0 L14 5 L5 14 Z`.
  - The body is offset +10, +10 from the hotspot.
- **Timing:**
  - `CURSOR_GLIDE_MS` = 350. The server emits `cursor.move`, waits that long, clicks for real, then emits `cursor.click`.
  - `FRAME_FPS` = 8.
- **Characters live only in the dashboard overlay.** Never inject them into pages.
- **Animate only `transform` and `opacity`.**
  - Use Motion (formerly Framer Motion) for characters.
  - Use one particle canvas, with at most 60 particles alive at once.
- **Accessibility:**
  - Reduced motion is supported (§6.7).
  - Status is never shown by color alone.
  - No sky-blue or green text on white.

**If this prompt and master.md disagree:**
- On a contract (event names, types, timings, mood priorities), master.md wins. Stop and flag the conflict.
- On look and feel, this prompt adds to §6–§7. When you build an addition, write it into master.md in the same change.

### 2. Five rules behind every decision

1. **Actions are truth; personality is style.**
   - A character moves, clicks, types or scrolls only because a `cursor.*` event said so.
   - Its face changes only through the mood engine.
   - Personality changes *how* things move (curves, springs, idle flourishes), never *what* happens or *when* it lands.
   - A live run and its replay must look the same.
2. **Every bot is its own actor.**
   - Each bot has its own state slice, its own animation values, its own seeded random generator and its own idle schedule.
   - Nothing runs on a shared global timeline, so the five bots never bob in sync.
   - One bot's event never re-renders another bot.
3. **Everyone reports to the Master.** Every meaningful thing a bot does has a visible path back to the Master card, and the Master visibly reacts. That includes finding something, finding a bug, asking you, failing and finishing.
4. **Quiet by default, loud for moments.**
   - Idle life is small: at most 4 px of float, plus a blink.
   - Big effects (confetti, sparkles, flights) are only for real milestones.
   - Each bot shows at most one speech bubble at a time.
5. **Everything can be interrupted.**
   - A newer event can cut off any animation. The cut-off animation hands over smoothly from its current position and velocity.
   - There's never a backlog of stale animations.

### 3. The cast and their motion DNA

Every bot runs the same rig and the same events. What makes them feel like different creatures is a small set of motion parameters. Put these in `dashboard/src/characters/personality.ts`.

| | Plum | Lime | Tango | Blu | Sky |
|---|---|---|---|---|---|
| Personality (§7.1) | The skeptic | The finder | The patient one | The doer | The cheerful one |
| Glide curve | Deliberate: `cubicBezier(0.65, 0, 0.35, 1)` | Eager spring, `bounce: 0.3` | Smooth sine in-out: `cubicBezier(0.37, 0, 0.63, 1)` | Snappy expo-out: `cubicBezier(0.16, 1, 0.3, 1)` | Floaty spring, `bounce: 0.35` |
| Arrival quirk (inside the glide window) | 2 px "double-check" settle wiggle in the last 60 ms | None; it's already there | None | Leans 2° toward the target over the last 30% | Slight overshoot, then settles |
| Click squish (scaleX × scaleY) | 1.10 × 0.90 | 1.15 × 0.85 | 1.08 × 0.92 | 1.20 × 0.80 | 1.15 × 0.85 |
| Idle float | ±2 px, 3.4 s | ±3 px, 2.6 s | ±3 px, 4.2 s ("breathing") | ±2 px, 2.2 s | ±4 px, 3.0 s, with 3° sway |
| Blink interval and length | 3–6 s, 120 ms | 2.5–5 s, 120 ms | 4–8 s, slow 180 ms | 2.5–5 s, 100 ms | 2.5–5 s, 120 ms |
| Idle flourish (every 6–12 s while calm) | Slow side-glance: eyes left, then right, then center (900 ms), or a 6° doubtful tilt | Quick scan: eyes dart to 3 random points, 150 ms each | One long breath, scale 1 → 1.03 → 1 over 2.4 s | Impatient double hop (2 × 3 px) | Happy wiggle, rotate ±5° twice |
| "Found" flourish (with the §7.5 sparkle) | One firm nod, 8 sparkles | 360° body spin (400 ms), 14 sparkles | Calm nod, 8 sparkles | Punchy pop (scale 1.15 → 1), 10 sparkles | Little twirl, 12 sparkles |
| Finish flourish | Two hops and an approving nod | Two hops and a sparkle | Two slow hops, small confetti | Two quick hops and a spin | **Three** hops and extra confetti |
| Sound pitch | 330 Hz (E4) | 440 Hz (A4) | 262 Hz (C4) | 392 Hz (G4) | 523 Hz (C5) |

**Rules for the DNA:**

- **The landing time never changes.** Every glide ends exactly at `durationMs` from the event.
  - Springs use Motion's time-bounded spring: `{ type: "spring", visualDuration: d / 1000, bounce }`.
  - On `cursor.click`, snap to the exact (x, y). After a spring overshoot that's at most 3 px, so nobody sees it. Then squish.
- **Idle flourishes run only when it's safe:**
  - only while the mood is calm, or curious-while-thinking
  - only when no glide is in progress
  - never changing the face glyph
  - never moving the pointer tip more than 4 px from the last cursor point, so viewers can still see where the bot last acted
- **Schedules use the bot's seeded generator,** so replays match.
- **The pitches are C, E, G, A and C,** a major pentatonic set, so overlapping blips never sound sour.

### 4. Character anatomy (the rig)

`BotCharacter.tsx` is one SVG with this nesting. Each layer owns one kind of motion, so animations add up instead of fighting each other.

```
CharacterRoot            x, y in tile pixels (glide)
├── PointerTip           hotspot at (0,0); 2 px white outline; never squashed
├── Seat (translate 10,10)
│   ├── GroundShadow     soft ellipse; shrinks while hopping (static shape, opacity/scale only)
│   └── BodyRig          hopY, tilt, scaleX/scaleY (origin: bottom center)
│       ├── StickerEdge  white 2.5 px die-cut ring (r = 32), so the bot reads on any busy page
│       ├── Body         circle r = 30 in the bot's color
│       └── FaceRig      eyeX/eyeY (±3 px look), blink scaleY (origin y = 30)
│           └── Face     one of the 10 glyphs from master.md §7.3 (unchanged)
├── NamePill             role, 11 px, white fill, border in the bot's color
└── BubbleAnchor         emote bubble (§6), above-left of the body; flips near tile edges
```

**Motion values.** Each actor gets these once, in `useBotActor`, and animates them imperatively: `x`, `y`, `hopY`, `tilt`, `scaleX`, `scaleY`, `eyeX`, `eyeY`, `blink`, `shadowScale` and `opacity`.

**Shadows.** Don't use CSS `filter` or `box-shadow` on moving parts. Draw the lift shadow as a static semi-transparent shape inside the SVG.

### 5. Three layers: mood, attention and emotes

These layers are separate and independent. One bot can show a worried face, a "?" bubble and eyes glancing at a teammate, all at once.

| Layer | Controls | Source | File |
|---|---|---|---|
| **A. Mood** | The face glyph | master.md §7.4, exactly | `mood/engine.ts` |
| **B. Attention** | Where the eyes point (≤ 3 px offset) | Priority: (1) the current action's target, (2) a social glance (§10), (3) the user's pointer (§12), (4) idle wander | `mood/attention.ts` |
| **C. Emotes** | The speech bubble | §6.1 | `mood/emotes.ts` |

- **All three are pure functions** of (state, events, `now`). So they're deterministic, easy to test, and identical in replay.
- **Glance timing:** a glance holds for 400–600 ms, then the eyes return to center.

### 6. Icons and emotes (the "emoji" layer)

**Draw every icon as an ink SVG, in the same family as the faces. Don't use OS emoji or emoji fonts.**

Why:
- Emoji look different on Mac, Windows and the projector, and the font may be missing.
- Full-color emoji clash with the flat sticker look.
- SVGs scale and animate cleanly.
- One stroke style across faces and icons reads as a single visual language.

**Icon grammar:**
- 24 × 24 viewBox
- stroke `#111`, width 2, round caps and joins
- no fill, except small accents in the bot's color

Export everything as React components from `characters/icons.tsx`.

#### 6.1 Emotes (speech bubbles)

**Bubble:**
- A white circle, 28 px.
- A 1.5 px border in the bot's color. Lime and Sky also get a `#111` hairline at 25% opacity, for contrast on white.
- A small tail points at the body.
- It enters with scale 0.6 → 1 (spring, 160 ms) and leaves with a 120 ms fade.

| Emote | Glyph | Trigger | Shows for | Priority (1 = highest) |
|---|---|---|---|---|
| ask | `?` | `approval.requested` (confirm or question) | until resolved | 1 |
| login | padlock | `approval.requested` (login), `takeover.started` | until resolved or ended | 1 |
| blocked | stop hand | `safety.blocked` | 1,600 ms | 2 |
| alert | `!` | `page.dialog`, or `gate.checked` with level "confirm" | 1,000 ms | 3 |
| bug | ink ladybug | `qa.bug` from this bot | 1,400 ms | 3 |
| done | star | `bot.result` | 2,000 ms | 3 |
| found | 4-point spark | `board.posted` from this bot | 1,200 ms | 4 |
| retry | `↻` | `bot.error` with `retryable` | until the next `tool.called` | 4 |
| mail | envelope | `board.delivered` to this bot | 800 ms | 5 |
| ok | `✓` | `approval.resolved`, approved | 900 ms | 5 |
| skip | `↷` | `approval.resolved`, skipped or expired | 900 ms | 5 |
| low | empty battery | `steps` first reaches 80% of `maxSteps` (worked out in the client) | 1,500 ms | 6 |
| think | `…`, dots in a wave | curious and thinking for more than 1.5 s (§7.4) | until the next tool call | 7 |
| wait | `…`, slow pulse | bored | until loading ends | 7 |
| zzz | `z z` | bored for more than 5 s | until loading ends | 7 |

**Queue rules** (`mood/emotes.ts`):
- **One bubble per bot.**
  - A higher priority replaces a lower one immediately.
  - At equal priority, the newer one replaces the older.
  - A lower priority waits in a queue of at most 2; when it's full, drop the oldest.
- **Minimum time on screen** is 600 ms, unless the bubble is replaced by priority 1 or 2.
- **Replay:** durations divide by the replay speed, with a floor of 300 ms.
- **Placement:** a bubble never covers the pointer tip. It sits above-left of the body and flips right or down within 40 px of a tile edge.

#### 6.2 Tool icons (activity chip and activity strip)

| Tool | Icon | Verb in the chip |
|---|---|---|
| `open` | globe | Opening page |
| `click` | pointer | Clicking |
| `type` | keyboard | Typing |
| `select` | list with a check | Choosing |
| `press` | key cap | Pressing key |
| `scroll` | up and down arrows | Scrolling |
| `back` | left arrow | Going back |
| `wait` | hourglass | Waiting |
| `list_elements` | numbered list | Reading page |
| `read_text` | text lines | Reading |
| `look` | eye | Looking closely |
| `screenshot` | camera | Capturing |
| `post_to_board` | sticky note | Sharing a find |
| `read_board` | pinboard | Checking the board |
| `ask_user` | `?` in a circle | Asking you |
| `wait_for_user` | clock | Waiting for you |
| `finish` | flag | Finishing up |
| `report_bug` | bug | Reporting a bug |
| `get_errors` | `{!}` | Checking errors |
| `check_screen` | scan frame | Checking screen |

#### 6.3 Status, template and tab icons

- **Status pills** show text plus an icon:
  - Waiting: clock
  - Starting: spark
  - Working: pointer
  - Thinking: `…`
  - Needs you: `?`
  - Paused: hand
  - Done: `✓`
  - Failed: `x`
  - Stopped: square
  - Out of budget: empty battery

  The pill fill is a light tint of the bot's color, and the text is always `#111`.
- **Template chips:** a plane (Trip Planner), a bug (QA Swarm) and a sparkle (Auto). These match `template.icon`.
- **Browser tab:**
  - The favicon is the Master logo.
  - While any approval is pending, it switches to a variant with a "?" badge, and the title becomes `(1) Needs you · SquadLings`.

### 7. The squad slider: "assemble the squad"

This replaces the plain "Bots (1–5)" input on the launch screen (§6.3 A). It's the first thing judges will touch, so it should feel like picking a team.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Squad size                                     3 bots · Plum, Lime, Tango │
│                                                              est. ≤ $0.92 │
│    (⎔)        (¬ ¬)       (+ +)       (= =)       ( ◌ )       ( ◌ )        │
│   Master      Plum        Lime        Tango       empty       empty       │
│              Flights     Hotels    Activities                             │
│              ●━━━━━━━━━━━●━━━━━━━━━━━●───────────○───────────○            │
│              1           2           3           4           5            │
└───────────────────────────────────────────────────────────────────────────┘
```

**Seats and track**
- There are five seats, in fixed slot order: Plum, Lime, Tango, Blu, Sky.
- Seats above the current count are dashed empty circles.
- The track is discrete (1 to `template.maxBots`) and snaps with a spring.
- The thumb is white, with a 3 px ring in the color of the highest seated bot.

**Adding a bot (n → n+1)**
1. Bot n+1 pops out of the Master logo (scale 0 → 1.2 → 1).
2. It arcs to its seat (450 ms) and lands with a squash.
3. It plays its intro (600 ms or less), then settles on its signature face. The launch screen always shows signature faces.

| Bot | Intro |
|---|---|
| Plum | Lands, leans 8°, side-eyes the user (`¬ ¬`), one slow nod |
| Lime | Lands in a sparkle burst (`+ +`) |
| Tango | Drifts in slowest and takes one long breath (`= =`) |
| Blu | Zips in fastest (300 ms) with the strongest squash and a tiny double hop (`> <`) |
| Sky | Bounces in with an extra hop and a sway (`^ ^`) |

**Removing a bot (n → n−1)**
1. Bot n's face goes `n n`.
2. It waves: a ±10° wobble, twice, over 300 ms.
3. It arcs back into the Master logo (350 ms), and its seat turns dashed.

**Fast scrubbing**
- Only the latest value counts.
- Arrivals stagger by 70 ms.
- If the user reverses mid-flight, the flying bot turns back from where it is. No teleporting, no queue.

**Role labels**
- Under each seated bot, show the template's role for that slot:
  - Trip Planner: Flights, Hotels, Activities, Transport, Budget.
  - QA Swarm: First-timer, Keyboard-only, Mobile, Breaker, Role checker.
  - Auto: "Master decides".
- Changing the template flips the labels (`rotateX`, 40 ms stagger).
- If the new template's `maxBots` is lower than the current count, the extra bots leave as described above.

**Summary line**
- Example: `3 bots · Plum, Lime, Tango`.
- Add an estimate from `packages/shared/src/pricing.ts`, using the §34 cost model. That works out to about $0.25 per bot (35 steps × $0.007) plus about $0.18 for the Master, Decisions and `look` calls. Label it "est."

**Life on the launch screen**
- Seated bots run their idle flourishes, out of sync with each other.
- The Master logo breathes, in outline.
- On hover, a bot looks at the pointer and hops slightly. A tooltip gives its personality line, for example "Plum · the skeptic. Double-checks everything."

**Accessibility**
- `role="slider"`, with `aria-valuemin=1` and `aria-valuemax=template.maxBots`.
- `aria-valuetext`, for example "3 bots: Plum, Lime and Tango".
- Arrow keys, Home, End, PageUp and PageDown all work, with a visible focus ring.
- With reduced motion, seats fade in and out (150 ms) without flights.

**Sound** (if on): a soft blip at the bot's pitch when it arrives, and a lower blip when it leaves.

**Start**
1. The seated bots squash in anticipation (1.05 × 0.92, 120 ms).
2. They hop into the Master logo, 90 ms apart.
3. The logo moves to the run screen's master card through a shared layout transition (Motion `layoutId="master-logo"`).

### 8. From launch to run (beat sheet)

Every beat starts from a real event, not a timer.

| # | Beat | Triggered by | What happens |
|---|---|---|---|
| 1 | Hand-off | Start pressed | The squad hops into the logo, and the logo moves to the master card (600 ms) |
| 2 | Classifying | `run.status: classifying` | The outline logo sends out a ring pulse every 1 s; the caption reads "Picking a template…" |
| 3 | Template chosen | `run.template_selected` | The template icon stamps onto the master card (250 ms) |
| 4 | Planning | `master.status: planning` | The logo fills solid and spins once every 1.2 s. Plan rows type in from `master.text` and `plan.ready` |
| 5 | Seats assigned | `plan.ready` | Each plan row gets its bot's mini face (150 ms stagger). Seats with no assignment go to the **bench** |
| 6 | Pop-out | `bot.spawned` (one per bot) | The bot pops from the logo, arcs to its tile (700 ms), lands with a squash, and goes calm → curious. Keep pop-outs **at least 250 ms apart**, even if the events arrive in a burst |
| 7 | Tile boot | the same `bot.spawned` | The tile fades and scales in (0.96 → 1). Its border appears in the bot's color. The viewport shows a "setting up" scene: the character in the center with a "…" bubble |
| 8 | First light | the bot's first `frame` | The frame fades in (200 ms), and the character hops to its first cursor point |
| 9 | Work | `cursor.*`, `tool.*`, … | §9 |

- **Bench.** Sometimes the plan has fewer assignments than the slider count. Each unneeded character then:
  1. pops out and looks around (`o o`, 400 ms)
  2. shrugs (±6° tilt)
  3. goes `n n`
  4. sits on a bench row in the master card labeled "Not needed for this plan"

  This is purely visual; these characters never get `bot.spawned`.
- **Slow browsers.** If no frame arrives within 8 s, the tile says "Browser starting…". Don't show fake progress.

### 9. A bot's home: its own tile

Each tile is that bot's home, and you should be able to tell whose it is at a glance. This extends §6.3 B.

**Header**
- A mini live face (16 px). It mirrors the mood engine's output; don't run a second engine.
- "Plum · Flights".
- An **activity chip**: the tool icon plus a verb from §6.2. It cross-fades on change and holds for at least 400 ms, so fast calls don't flicker.
- A status pill, with text and an icon.
- Steps as "12/40", with a thin progress ring in the bot's color.

**Viewport**
- The frame canvas, with the overlay on top. The overlay holds the character, target box, focus box, ripple, trail, scroll arrow and bubble.
- **Trail (new):** the last 4 click points, as small dots in the bot's color that fade over 4 s. They're cleared on `page.navigated`.

**Caption bar**
- The bot's `why` text, revealed left to right (at most 400 ms). Slide a cover over it with `transform`; don't re-render once per character.
- Sensitive text is masked as `••••`.
- The host name, with a globe icon.

**Activity strip (new)**
- Along the bottom edge: the last 8 tool icons at 12 px, newest on the left, older ones fading to 30%.
- It works as the tile's visible heartbeat and history.

**Tile states** (always shown with text):

| Status | Border | Overlay |
|---|---|---|
| starting | 1 px in the bot's color, fading in | The "setting up" scene |
| working / thinking | 1.5 px in the bot's color | — |
| waiting_user | 3 px in the bot's color, opacity pulsing 0.4 ↔ 1 at 1 Hz | "Needs you" pill; the approval card is pinned to the tile |
| paused (takeover) | 4 px in the bot's color | Banner: "You're in control. Lime is paused." The character sits in a corner with a padlock bubble |
| finished | 1.5 px plus a soft glow | "Done ✓" ribbon; the character parks bottom-right with `^ ^` |
| failed | 1.5 px `#111`, dashed | Frame dimmed (40% white veil); "Failed" pill; the character parks with `x x` |
| stopped | dashed | "Stopped" pill |
| out_of_budget | 1.5 px | "Out of budget" pill with the empty-battery icon |

For the glow, fade the opacity of a pre-blurred element. Never animate `box-shadow`.

**One step: the timing fix**

master.md §7.5 lists the eye look (120 ms), target flash (200 ms) and glide (350 ms) one after another. That adds up to about 670 ms, but the server clicks after `CURSOR_GLIDE_MS` (350 ms). So the three overlap, and everything lands by `d`.

| Event | Animation |
|---|---|
| `cursor.move` (`durationMs` = d) | **t = 0:** the eyes look toward the target (120 ms), and the target box flashes in (opacity 0 → 1 → 0.6, 200 ms). **t = 40 ms:** the glide starts on the bot's curve and ends exactly at **t = d**. Any arrival quirk finishes by d. A new move during a glide retargets from the current position and velocity. |
| `cursor.click` | Snap to the exact (x, y). Squish (the bot's values, 140 ms), a ripple ring in the bot's color (450 ms), a trail dot, and a blip. |
| `cursor.type` | A 1 px jitter per burst of keystrokes. The caption shows the text, masked if sensitive. |
| `cursor.scroll` | A 4 px nudge in the scroll direction, with a faint arrow (300 ms). |
| `cursor.move` after `press` Tab | A small arc hop instead of a glide, plus a dashed focus box in the bot's color. |

Update §7.5 with this overlap when you implement it.

**Mobile and focus**
- **Mobile persona:** the character scales with the phone's inner screen, using the same mapping (§19.5).
- **Focus mode:** characters live in tile coordinates, so they ride along when the tile grows. Bots in the shrunken strip hide their name pills but keep their faces.

### 10. Social life: bots notice each other

| When | Teammates who are calm or curious… |
|---|---|
| `board.delivered` to bot X | The paper plane in the sender's color flies from the board to X (§7.5). X glances toward the board, catches the plane (squash 1.05), turns curious for 600 ms and shows the mail bubble. It then glances briefly toward the sender's tile. |
| Teammate X turns worried | …glance toward X's tile for 500 ms (attention only; no face change) |
| Teammate X finishes | …do one small 3 px hop ("nice one") |
| Teammate X fails | …glance toward X for 500 ms (no hop) |

**Mechanics and limits**
- **Glance direction:** the unit vector from this tile's center to the other tile's center, times 3 px.
  - Tile rectangles come from `getBoundingClientRect`.
  - Cache them, and refresh them on resize or layout change.
- **At most one social reaction per bot every 3 s.**
- **Never** during a glide, a worried or failed face, or a takeover.
- **Reduced motion:** eye glances stay, hops go.

### 11. Reporting to the Master

#### 11.1 The master card is mission control

The master card shows:
- The logo at the top.
- One row per assignment, in fixed slot order. Each row has:
  - the bot's mini live face
  - "Plum · Flights"
  - a status word and a steps bar
  - the title of the bot's latest report, cut to 40 characters
  - a `✓` when done
- The bench row, if any.

The card sits in the sixth grid slot with 5 bots, and at the top of the sidebar with 4 (§6.4).

#### 11.2 Report pellets

When a bot reports, a small object flies from its tile header to its row on the master card. The row flashes in the bot's color (opacity only), and the logo reacts (§11.3).

| Event | Flying object | Row change |
|---|---|---|
| `board.posted` | A 10 px echo dot. The sticky note itself still flies to the board, as in §7.5 | The latest-report title updates |
| `qa.bug` | A bug icon in a dot of the bot's color | The bug count ticks up |
| `approval.requested` | A "?" dot | "Needs you"; the logo tilts 8° toward that tile and holds |
| `bot.error` | A grey smoke dot | "Retrying" or "Failed" |
| `bot.result` | A folded report sheet (a 14 × 18 rounded rectangle with ink lines) | The row fills, `✓` appears, and the steps bar completes |

**Flight mechanics**
- **Path:** a quadratic Bézier with its control point lifted 60 px, over 600 ms ease-in-out. The object scales to 0.6 as it arrives.
- **Implementation:** Motion keyframes on `x` and `y`, sampled from the curve. Don't use CSS `offset-path`.
- **Limits:** at most 6 objects in flight. Beyond that, merge one bot's flights into a single object with a "×N" badge.

#### 11.3 Master logo states

The OpenAI logo has 6-fold symmetry, so a 60° turn looks the same at rest. That makes each "report received" tick feel like a satisfying click without ever leaving the logo crooked.

| State | Trigger | Look |
|---|---|---|
| idle | Launch screen | Outline; slow breathing, scale 1 ↔ 1.02 over 4 s |
| classifying | `run.status: classifying` | Outline, with an expanding ring pulse every 1 s |
| planning | `master.status: planning` | Solid; spins once every 1.2 s (§7.5) |
| monitoring | `master.status: monitoring` | Solid and still, waiting for reports |
| receiving | A pellet lands (while monitoring) | A 60° spring tick (300 ms, slight overshoot), plus a ring pulse in the reporter's color |
| needs you | Any approval pending | A slow ring pulse in the asking bot's color; tilts toward that tile |
| merging | `master.status: merging` | Fast spin for 1.5 s (§7.5) |
| done | `run.result` | The spin slows to upright, with one soft pulse |
| run failed | `run.status: failed` | Outline, no spin, with the text "Run failed" |

- **Stopping the spin:** always ease out to the next multiple of 60°.
- **Pellets during planning or merging** only pulse the logo; they don't tick it.
- **Logo artwork:**
  - Trace the outline and solid SVG paths from the sticker art.
  - If tracing isn't possible, use a placeholder hexagonal knot and flag it.
  - See the brand note in §7.7.

#### 11.4 Merge and team photo

1. On `master.status: merging`, each finished bot's tile dims to 60%. The bot arcs into the Master logo (bots go 150 ms apart) and shrinks into it.
2. Failed bots stay put. Their rows show the gap.
3. The logo spins fast for 1.5 s. On `run.result`, the result drawer slides in.
4. **Team photo (new):** the result drawer's header shows the squad lineup.
   - Finished bots show `^ ^`.
   - Failed bots show `x x`.
   - Bots that ran out of budget show `n n`.
   - The bots hop in one by one.

### 12. User touch (local view effects only)

None of these send anything to the server or the bots, and none are saved or replayed.

- **Eyes follow the pointer.**
  - This happens while the user's pointer is over the tile, the bot is calm or curious, and no glide is running.
  - It's attention priority 3, with an offset of at most 3 px.
- **Boop.** Clicking the character itself, not the page, gives:
  - a squash (1.1 × 0.9) and an ink-heart bubble
  - if the bot is calm, its face goes `^ ^` for 400 ms

  At most one boop per second. Boops are off during takeover, because then every input goes to the browser.
- **Hover tooltip:** the bot's name, its personality, its role and its current activity.

### 13. Effects layer

- **Particles** go on one fixed full-screen canvas with `pointer-events: none`.
  - **Sparkles:** 4-point stars in the bot's color.
  - **Confetti:** small rectangles in the bot's color, ink and white, with gravity and spin, living 1.4 s.
  - **Smoke:** 3–5 grey circles that grow and fade over 700 ms.
- **Particle budget:**
  - at most 60 alive in total, and at most 16 per bot
  - when full, the oldest are removed
- **Canvas sizing:**
  - The canvas is sized at `devicePixelRatio`.
  - Its `requestAnimationFrame` loop runs only while particles are alive.
- **Flying objects** (sticky notes, paper planes, report pellets) live in one fixed overlay layer above the grid and use Motion. At most 6 fly at once.

### 14. Sound (optional; off by default; toggle in the top bar)

- **Synthesize with Web Audio.** No sound files.
- **Sounds:**

  | Moment | Sound |
  |---|---|
  | Click | A 25 ms sine blip at the bot's pitch (§3), gain 0.05 |
  | Found | Two notes going up: the pitch, then 1.5 × the pitch |
  | Approval | A soft 880 Hz ping from the Master |
  | Finish | A three-note arpeggio |
  | Merge | A low filtered-noise whoosh |
- **Limits:**
  - at most 8 sounds per second overall
  - no click blips at 4× replay

### 15. Engineering

#### 15.1 Files

These fit master.md §28.

```
dashboard/src/
├── characters/
│   ├── BotCharacter.tsx     the rig (§4); renders one actor
│   ├── MasterLogo.tsx       outline + solid SVG; states (§11.3)
│   ├── faces.tsx            the 10 faces (master.md §7.3, unchanged)
│   ├── icons.tsx            emote, tool, status and template icons (§6)
│   ├── personality.ts       motion DNA (§3)
│   └── useBotActor.ts       motion values + imperative animations for one bot
├── mood/
│   ├── engine.ts            master.md §7.4 (pure)
│   ├── attention.ts         eye target (pure)
│   ├── emotes.ts            bubble queue (pure)
│   └── *.test.ts
├── director/
│   ├── director.ts          event → one-off animations (glide, ripple, flights, particles, sound)
│   └── geometry.ts          tile/board/master rects, §19.5 mapping, Bézier paths
├── effects/
│   ├── EffectsCanvas.tsx    particles
│   ├── Flights.tsx          sticky notes, planes, pellets
│   └── sound.ts
├── launch/SquadSlider.tsx
└── lab/
    ├── CharacterLab.tsx     /lab route (development only)
    └── fakeRun.ts           seeded fake event streams
```

#### 15.2 Data flow

```
events  (live WebSocket | replay scheduler | fakeRun)
   │
   ├─► reducer (pure, §19.3) ─► Zustand store ─► per-bot selectors ─► tile, face, bubble, pills, chips
   │
   └─► director (side effects) ─► actor handles: glideTo · click · hop · squish · look
                                ─► EffectsCanvas · Flights · sound
```

**State and rendering**
- **The reducer stays pure.** One-off effects (ripples, confetti, flights) go through the director, never through React state.
- **Each tile subscribes only to its own bot's slice** (a Zustand selector with shallow comparison). React Profiler must show no re-renders across bots.
- **Actors register** with the director by bot ID: `registerActor(botId, handle)`.
- **Motion values** are created once per actor and driven with `animate(value, target, options)`. Never update state once per frame.

**Idle loops and timing**
- **Idle float and sway** use CSS keyframes on their own wrapper layer, which the compositor runs cheaply.
  - Each bot gets a negative `animation-delay` from its seeded generator, so no two bots are in phase.
  - Blinks and flourishes use `setTimeout` from the same generator, and are cleared on unmount.
- **Seeded generator:**
  - In a run: `mulberry32(hash(runId + botId))`.
  - On the launch screen: `hash("launch" + botId)`.
- **Time:**
  - The pure layers take `now` as a parameter.
  - The 100 ms ticker from §19.3 handles expiries.
  - Replay passes replay time instead.
- **Replay speed s:**
  - Divide durations by s, with a floor of 60 ms.
  - At 4×, skip idle flourishes and halve particle counts.

**Coordinates**
- Use the §19.5 formula.
- Recompute with `ResizeObserver`.

#### 15.3 Performance rules

- **Target:** 60 fps, with a 95th-percentile frame time of 20 ms or less. That's with 5 bots, 5 live canvases at 8 fps and a confetti burst, in Chrome on the demo laptop.
  - No long task over 50 ms during a run.
  - No layout work inside animation frames.
- **Animate only `transform` and `opacity`.** Never animate these in loops: `width`, `height`, `top`, `left`, `box-shadow`, `filter` or `stroke-dashoffset`.
- **`will-change: transform`** goes only on moving layers: the character root, the body rig and flying objects.
- **Pause when hidden:** stop idle loops and the particle loop while `document.hidden` is true.
- **Icons** are inline React SVG components, so they cost no network requests.

#### 15.4 Reduced motion

This extends §6.7 for `prefers-reduced-motion`.

- **Glides** become a 120 ms fade-jump.
- **Turned off:** hops, squish, wobble, shake, confetti, sparkles and flights. Notes fade in where they land.
- **Slider seats** fade in and out.
- **Still shown:** faces, bubbles, status pills, activity chips and eye glances all keep changing.
- **The Master logo** doesn't spin. It swaps between outline and solid and shows its state as text.

### 16. Character Lab (build this first)

Build a development-only route, `/lab`, where every piece can be seen and stress-tested with no backend and no API cost.

- **Gallery:**
  - all 5 characters in all 10 faces
  - the Master in every state
  - every emote and every tool and status icon

  Show them on white and on a busy fake-webpage background.
- **Event buttons per bot.** Each button fires one event type, with a real `SquadLingsEvent` payload from `packages/shared/src/events.ts`.
- **The squad slider** on its own.
- **Fake run.** `fakeRun(seed, botCount, speed)` generates a believable full run:
  - plan and spawns
  - list, click, type and scroll loops on random targets
  - page loads
  - board posts and deliveries
  - one approval, and one error with a retry
  - finishes and the merge

  It feeds the **real** reducer and director.
- **Load test:** 5 canvases fed generated frames (moving gradients) at 8 fps, so performance numbers are realistic.
- **Overlay:**
  - an FPS meter (`requestAnimationFrame` timing over 1 s windows)
  - a live particle count
- **Toggles:**
  - reduced motion and sound
  - replay speed: 1×, 2× or 4×
  - a mobile-persona tile
- **Deterministic.** The same seed always gives the same run. That also gives the demo one more fallback.

### 17. Acceptance criteria

- [ ] **Sticker match.** All 5 characters match the sticker sheet: color token, sticker edge and all 10 faces.
- [ ] **Accurate clicks.** The ripple center lands within 2 px of the clicked element's center, on desktop and mobile tiles.
- [ ] **Mood tests.** Mood-engine tests cover every row of §7.4: priority, expiry, the 400 ms minimum holds, and permanent happy and failed.
- [ ] **Determinism.** With the same fake-run seed, two live runs and one replay produce the same sequence of faces and bubbles.
- [ ] **Distinct personalities.** A teammate watching one unlabeled tile for 10 s can name the bot from its motion alone.
- [ ] **Out of sync.** No two bots' idle loops line up.
- [ ] **Slider:**
  - Scrubbing 1 → 5 → 1 as fast as possible leaves no stuck, doubled or teleporting characters.
  - The keyboard works, and `aria-valuetext` reads correctly.
- [ ] **Launch sequence:**
  - The beat sheet (§8) plays in order from real events.
  - Pop-outs stay at least 250 ms apart.
  - A plan with fewer assignments sends the extra bots to the bench.
- [ ] **Reporting.** Every report type in §11.2 flies to the right master row. The logo ticks 60° and always comes to rest upright.
- [ ] **Bubbles.** There's at most one bubble per bot, and no bubble ever covers a pointer tip.
- [ ] **Performance:**
  - The §15.3 target is met.
  - React Profiler shows no re-renders across bots.
- [ ] **Reduced motion** is verified with the operating-system setting.
- [ ] **Contrast.** There's no sky-blue or green text on white. Status is always text plus an icon.
- [ ] **Spec updated.** master.md §6–§7 now covers these additions:
  - the slider, motion DNA, the attention layer and emotes
  - the master roster, report pellets and the team photo
  - the §7.5 timing overlap

### 18. Don'ts

- Don't inject anything into web pages. Everything goes in the overlay.
- Don't change a face outside the mood engine. The only exceptions are the launch-screen signature faces and the local boop.
- Don't fake progress. No timer may move a character or fill a steps bar without an event.
- Don't use OS emoji or emoji fonts on characters, bubbles or icons.
- Don't add server event types for this work; everything here comes from the §18.2 catalog. If something truly needs a new event, add it to `packages/shared/src/events.ts` and master.md §18 first.
- Don't add animation libraries other than Motion in the core build (no Lottie, Rive or GSAP). One engine is easier to keep at 60 fps.
- Don't animate layout properties.

### 19. Order of work

1. Lab shell, the static rig (§4), faces and icons.
2. The mood, attention and emote layers (pure), with tests.
3. `useBotActor` and the director: glide, click, type and scroll, with the timing fix.
4. Motion DNA for each character. Check that the bots are easy to tell apart.
5. The squad slider.
6. The launch beat sheet and the Master logo states.
7. Tile UI: header, activity chip, activity strip, trail and states.
8. The master roster, report pellets, merge and team photo.
9. Social reactions and user touch.
10. The effects canvas, sound and reduced motion.
11. A performance pass in the Lab with all 5 load streams, until §17 passes.
12. Update master.md.

**After each step,** report back with:
- a screenshot of `/lab` (capture it with Playwright)
- what changed
- anything in master.md that turned out to be wrong

## PROMPT END
