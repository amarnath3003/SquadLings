# SquadLings sound design

> Copied from [amarnath3003/SquadLings](https://github.com/amarnath3003/SquadLings) at `cd568c5`. Paths such as `dashboard/` and `packages/shared/` refer to that repository's layout; the matching code here is in `web/src/` and `web/shared/`.

The demo synthesizes sound locally with Web Audio: no microphone, speech service, downloaded clips, or new library. These are original electronic cartoon voices. Captions carry understandable task information.

## Controls and defaults

Each page load starts muted. Enable the toolbar speaker, then use **Sound settings** for master volume (35% initially), UI/workflow effects, bot voices, and idle chatter. Disabling voices also disables idle chatter. The mix is saved in local storage at `squadlings.audio.v1`; the enabled state is never saved. Storage failure leaves the current visit's settings usable.

In **Face gallery**, choose a reaction and use **Listen to Plum/Lime/Tango/Blu/Sky**, or activate an expression to hear its matching reaction. Thirteen reaction families each have three syllable variants, cycled across utterances.

| Bot | Base pitch | Voice character |
| --- | --- | --- |
| Plum | 330 Hz | Restrained, dry, breathy, skeptical |
| Lime | 440 Hz | Quick, bright, inquisitive |
| Tango | 262 Hz | Low, mellow, unhurried |
| Blu | 392 Hz | Clipped, energetic, determined |
| Sky | 523 Hz | Light, melodic, cheerful |

Vowel-filter transitions, pitch contours, vibrato, noise breaths, and syllable timing distinguish the cast. Reaction order: greeting, working, waiting, question, discovery, frustration, success, failure, affection, surprise, laughter, sleep, wake. The mouthless SVG design remains; a halo marks playback and becomes static with reduced motion.

## Coverage

| Trigger | Feedback |
| --- | --- |
| Buttons, links, tabs, selects, checkboxes, ranges, disclosures, dialog close | Activation, selection, on/off, tick, open/close motifs |
| Circle squad slider | Pitch ticks, staggered join/greeting, departing sleep voice, full-team ready cue |
| Run creation, planning, ready, merge, completion | Launch, low Master motif, ready, merge, final flourish |
| Spawn, status changes, reading, navigation, typing, scrolling, loading/waiting | Greeting, focused babble, activity textures, questioning/waiting murmurs |
| Board posts, delivery, QA bugs | Posting/discovery, delivery/acknowledgment, bug/surprise |
| Approvals and resolution/expiry | Question ping, approved/skipped/caution with a matching voice |
| Errors, retries, blocks, budget exhaustion | Failure/retry/caution, frustration/failure voices |
| Pause, resume, takeover | Pause/resume motifs and acknowledgment |
| Boop, meet, pickup/release, group play, nap/wake | Affection, greeting, surprise, laughter, discovery, sleep/wake |

Hover, focus, pointer motion, frames, usage updates, unchanged options, disabled controls, and text keystrokes are silent. No music or persistent loading/sleep loop plays.

## Integration and limits

- `effects/sound.ts` owns playback, preferences, channels, the queue, cancellable sequences, and speaking state. `audio/catalogue.ts`, `audio/synthesis.ts`, and `audio/policy.ts` hold recipes, rendering, and admission rules.
- `consumeEvent` calls `handleAudioEvent` after duplicate rejection and before reduction; previous state resolves tool/approval ownership. Audio does not depend on actor registration. Incoming backend JSON still requires transport validation.
- Components call `playUi`, `playVoice`, `voiceSequence`, and `stopAudio`. The shared interaction listener covers ordinary controls. `data-audio="off"` prevents duplicate generic feedback; a cue name overrides it. Special character/workflow controls provide their own sounds.
- Maximum: one bot voice, four effects, eight starts per rolling second. Urgent voices interrupt lower priorities. Queued touch/milestone voices are capped at two and expire after 800 ms. Routine voices have a four-second per-bot cooldown. Idle voices require fifteen seconds between starts and three seconds without foreground audio.
- Authored group and circle-slider wake sequences stagger voices by 700 ms. Reduced-motion assembly keeps this natural audio timing while selecting the circles immediately. New group actions cancel the old sequence; urgent workflow cues cancel room/preview audio. Routine effects thin at 2x, and routine audio is suppressed at 4x; voice pitch/duration remain natural.
- Mute and tab hiding cancel active/scheduled audio. Reset/stop cancels workflow audio; room unmount/offscreen suspension cancels room audio. Returning to a tab does not replay missed events. Initialization/suspension failures leave muted controls and a retry message.
- Each utterance reuses one vocal tract across its syllables. Speaking-state updates are isolated to the halo, avoiding SVG/actor re-renders. Separate effects/voice gains feed master gain and a compressor. Envelopes and short cancellation fades avoid hard waveform cuts; finished nodes are disconnected. The context starts/resumes from explicit user activation.

## Verification and listening review

Run `npm test` and `npm run test:browser`. Offline rendering checks cover every voice/reaction/variant and effect: finite/non-silent samples, peaks, durations, and silent tails. They produce ignored artifacts:

- `dashboard/artifacts/audio-rendering.json`: measurements.
- `dashboard/artifacts/voice-audition.wav`: all five bots, each playing the thirteen reactions above (variant zero), with gaps.

After building and starting `npm run preview`, run sound-enabled performance samples from the repository root:

```sh
PREVIEW_URL=http://127.0.0.1:4173 PERF_AUDIO=1 PERF_SCENE=studio npm run perf
PREVIEW_URL=http://127.0.0.1:4173 PERF_AUDIO=1 PERF_SCENE=run npm run perf
```

Reports: `dashboard/artifacts/performance-studio-audio.json` and `performance-run-audio.json`. On Node 24.14.1 / Chrome 150, at 1440 × 1000 over 20 seconds with sound enabled, the final studio sample measured 55.9 fps / 33.3 ms p95, zero long tasks over 50 ms, and zero page errors; the five-stream sample measured 58.7 fps / 16.8 ms p95, two long tasks (maximum 128 ms), and zero page errors. Speech was observed during both samples. Headless synthetic samples do not certify actual audio hardware, perceived voice quality, or live backend performance.

Human listening review is pending. Audition on laptop speakers and headphones, then check a full workflow for distinct personalities, comfortable volume, clear alerts, repetitive patterns, and clean endings. Automated rendering cannot establish these qualities.

## Technical references

- [MDN: Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices/) — user activation, control, synthesized sources.
- [MDN: stopping scheduled sources](https://developer.mozilla.org/en-US/docs/Web/API/AudioScheduledSourceNode/stop) — cancellation.
- [MDN: DynamicsCompressorNode](https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode) — dynamic-range control.

The pitches originate in the supplied character brief. All cue melodies and voice recipes were authored for this project during implementation.
