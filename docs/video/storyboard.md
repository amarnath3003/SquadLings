# SquadLink — One squad. Many minds.

A 48-second, 16:9 launch film with restrained synthesized sound effects. Sample task: “Plan a weekend in Kochi for our team.” The work/result scenes are labeled “Simulated workflow”; findings are illustrative. No live browsing or booking is claimed.

## Visual direction

Use black negative space, large white typography, bold changes of scale, short character close-ups, and purposeful pauses. The user requested an Apple-style introduction and identified the first 15 seconds of [OpenAI DevDay 2026](https://www.youtube.com/watch?v=Fls_onRviPM) as the motion reference. Codex inspected video frames through 15 seconds in Chrome: oversized face → small centered circle with changing glyphs → dispersed dots → title. Our cold open and transitions use that visual rhythm with original paths and the project's own SVG characters. No video frames, audio, OpenAI logo, or third-party footage are included in the deliverable.

| Time | Picture and action | Sound / purpose |
| --- | --- | --- |
| 00–02.6 | An enormous face fills the screen. Quick color/expression changes; a rapid pullback leaves a small circle centered in black. | Two short wake/boop notes. Establish personality through scale. |
| 02.6–06 | “One task.” A request types into a single central bar. | Sparse typing taps. Establish the user's goal. |
| 06–10 | “Your squad.” A cursor selects five teammates using the existing growing stack. Full-squad flames appear; the cursor presses Go. | Five ascending join notes and launch cue. Show selection clearly. |
| 10–14 | Interface fades. Circles cross on curved paths, scatter smaller companions, and expand beyond the frame. One black circle covers everything, then opens the next scene. | Launch/spark notes. Make the characters drive the transition. |
| 14–20 | Three close-ups: Plum reads, Blu types, Lime discovers. Large expressive characters accompany short phrases and one task detail each. | Sparse effects. Give each action room to read. |
| 20–31.5 | Pull back conceptually to all five task windows around Onyx. Colored reports travel inward. Onyx requests a rainy-day backup from Lime, sends a packet outward, and receives staggered completions. Agents celebrate with existing medals. | Report pings, follow-up cue, individual completion notes, merge cue. Show actual coordination in the scripted story. |
| 31.5–38 | “Consider it done.” Onyx presents an example two-day itinerary with five assembled contributions. | Completion chord, then quiet reading time. |
| 38–42 | A second swarm clears the result, fills the screen, resolves through black, and gathers toward the final lineup. | Descending return notes. Close the visual loop. |
| 42–48 | The SquadLink wordmark and tagline hold. Five teammates and Onyx settle, close their eyes, and float “zzz.” | Gentle sleep notes, then a silent tail. |

A [nine-frame storyboard preview](storyboard-preview.jpg) is extracted from the finished MP4.

## Existing elements reused

- `SquadSlider` / `SquadFire`: arrivals, growing stack, count, full-squad fire.
- `BotCharacter` / `useBotActor`: reading, scrolling, typing, discovery, output, victory, breathing, and sleep.
- `MasterCharacter`: Onyx's planning, monitoring, receiving, merging, and done reactions; an optional resting pose was added.
- Shared cast palette and SVG facial glyphs.
- Existing Web Audio effect recipes; no external music or voices.

New work: timeline, close-up compositions, simplified task windows, report/dispatch paths, circle choreography, playback controls, soundtrack assembly, and Chrome/FFmpeg recording.

## Playback and recording

Run `npm run dev`, then open **http://127.0.0.1:5173/film** and choose **Play film**. Sound is enabled by that click and can be switched off. The film starts paused, including under reduced-motion preferences. Scrubbing or Pause stops story progression; character ambient animation remains live. **Restart** resets the story. `?capture` hides controls; `?t=25` previews a timestamp. The fixed 16:9 stage letterboxes to fit smaller windows.

With Node 22.12+ and FFmpeg (H.264/AAC support) available:

```sh
npm run build
npm run preview                   # Leave this running on port 4173
# In a second terminal, from the repository root:
FILM_URL=http://127.0.0.1:4173 npm run film:record
```

Default output: `dashboard/artifacts/video/squadlink-film.mp4`. To select the deliverable location:

```sh
FILM_URL=http://127.0.0.1:4173 \
FILM_OUTPUT="$PWD/docs/video/squadlink-intro.mp4" \
npm run film:record
```

Set `FFMPEG_PATH` to a full executable path if FFmpeg is not on PATH. Chrome is selected automatically on macOS when installed; otherwise install Playwright Chromium with `npx playwright install chromium`, or supply `PLAYWRIGHT_CHANNEL`. The recorder advances the browser clock in fixed 1/30-second steps, samples CSS/Web Animations at that virtual time, and captures every output frame. It renders the existing audio effects offline and muxes an H.264/AAC MP4. Export takes longer than playback; it does not rely on real-time capture performance. Ambient pseudo-random motion can vary across exports, so the file is not claimed to be bit-for-bit reproducible. The recording report and WAV remain in ignored `dashboard/artifacts/video/`.

On this macOS 12 machine, Playwright's bundled FFmpeg installer is unsupported. A local, ignored `imageio-ffmpeg` wheel supplied FFmpeg 7.1 for the export. To reproduce that optional tool setup:

```sh
python3 -m pip install --target dashboard/artifacts/video-tools imageio-ffmpeg==0.6.0
PYTHONPATH=dashboard/artifacts/video-tools python3 -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'
# Use the printed path as FFMPEG_PATH in the recording command.
```

Sources: existing [Playwright](https://playwright.dev/), [FFmpeg](https://ffmpeg.org/), and optional [imageio-ffmpeg](https://github.com/imageio/imageio-ffmpeg). No npm dependency was added for the film.

Checks: `npm run build`, `npm test`, and `npm run test:browser --workspace dashboard -- film.spec.ts`. Human pacing/listening review remains pending; see the changelog for export verification.

## Verified export

On 11 October 2026 (IST), the final production capture recorded all **1,440 frames**, producing **48 seconds at 1920 × 1080 / 30 fps**, H.264 video and 48 kHz mono AAC sound. Chrome reported no page errors. FFmpeg decoded the entire file, detected both black transitions, and confirmed bounded audio. The extracted contact sheet was visually inspected after correcting the global page-width cap. Human pacing/listening review remains pending.

File: `squadlink-intro.mp4` — 4,151,372 bytes. SHA-256:

```text
fb174a0827cc4dda390a2186474ced11a9f65a9afcf7ea21da4c8783d368d43f
```
