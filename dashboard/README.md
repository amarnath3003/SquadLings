# SquadLings Character Studio

Local frontend for the character/animation brief in `docs/Rough/characters-animation-prompt.md`. No backend, key, or paid API is needed.

From the repository root, with **Node.js 22.12 or newer**:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/** for the studio or **http://127.0.0.1:5173/lab** for its development Lab entry. The `/lab` label/link is development-only. The build still includes the explicitly simulated studio demonstration.

## Demo

1. Meet Plum, Lime, Tango, Blu, and Sky. Select a character and try an expression or boop.
2. Change squad size with the slider, arrow keys, Home/End, or PageUp/PageDown. Pick Trip Planner, QA Swarm, or Auto.
3. Play a sample run. Watch the tiles, shared board, and reports to the Master.
4. Use event buttons to try a particular reaction. Approval controls act only on this simulated run.
5. Inspect all 50 expressions, the emote set, activity icons, and Master states in Face gallery.
6. Toggle reduced motion and sound. In Squad in action, choose 1×/2×/4× speed, a deterministic seed, 8 fps synthetic load streams, or mobile Tango for the next run.

Browser pages and findings are synthetic and labelled **SIMULATED**. The estimate in the squad builder is the supplied spec's real-run planning estimate, not measured cost. The Lab makes no API calls.

## Commands

```sh
npm run check          # TypeScript
npm run build          # TypeScript + production bundle in dashboard/dist
npm test               # Pure logic tests (added with the verification milestone)
npm run test:browser   # Browser checks (added with the verification milestone)
```

Use Node 22 for both installation and commands. Node 18 can skip Vite's native optional dependency and cannot run the current toolchain. If this happens, switch Node versions and run `npm install --include=optional`.

## Backend handoff

- `packages/shared/src/types.ts` matches the supplied master spec §26. `events.ts` implements §18's complete catalogue, with `SwarmEvent` and `SquadLingsEvent` as equivalent names.
- `store/reducer.ts` and `mood/*` are pure functions taking explicit event time. Zustand selectors isolate bot slices. Frames are excluded from the store.
- `director/director.ts` routes cursor events to registered actors; `components/FrameCanvas.tsx` exposes `drawFrame` for JPEG frames. The Lab controller currently sends typed events to the same reducer/director.
- The Vite development proxy reserves `/api` and `/ws` for `127.0.0.1:8787`. It does not connect automatically. Backend transport, snapshot hydration, real approval actions, and replay recording are separate work.
- Preserve event coordinates in original viewport pixels. The overlay maps to its own inner canvas using `ResizeObserver`, including mobile.
- Colour sources and the intentional update from the brief are recorded in [brand-sources.md](../docs/reference/brand-sources.md).

## Verification status

First milestone: TypeScript and production build passed using Node 22.23.3. The studio served HTTP 200, rendered in installed Google Chrome using Playwright, and produced `dashboard/artifacts/studio.png` without page errors. Latest Playwright's bundled Chromium cannot be installed on this host's macOS 12; installed Chrome is available for browser verification.

Full mood tests, interaction checks, remaining launch choreography, and measured laptop performance are being verified in the next milestone. No 60 fps certification or live backend success is claimed.
