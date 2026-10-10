# Character colours and design sources

Fetched on **10 October 2026 (IST)** from first-party OpenAI sites.

| Source | Use |
| --- | --- |
| [Official DevDay site](https://devday.openai.com/) | Event colour tokens and neutral black/white UI direction. |
| [Published DevDay stylesheet](https://devday.openai.com/_next/static/css/b17bf04869ddf007.css) | Exact `:root` declarations: `--event-blue: #006aff`, `--event-green: #04b84c`, `--event-purple: #924ff7`, `--event-orange: #ff8549`. This hashed asset URL can change when the official site is rebuilt. |
| [OpenAI design guidelines](https://openai.com/brand/) | Brand attribution and logo guidance. The fuller brand portal redirected to an authentication page; no private brand materials were accessed. |
| [User-supplied sticker photo](devday-stickers.jpg) | Circular character geometry, black expression glyphs, and the local Sky blue extension. |

The user requested official colours after web research. These four **event website tokens** replace the photo-derived screen colours in the supplied brief. They are not claimed to be a universal OpenAI corporate palette. Sky `#A6D8F5`, paper `#F8F8F5`, and other supporting neutrals are local design choices. Original sticker values remain in `packages/shared/src/cast.ts` for reference.

SquadLings is the hackathon team's project. OpenAI names and artwork belong to OpenAI; no endorsement is implied.

## Libraries

The dashboard was implemented from scratch in this repository. Dependencies are pinned in the root lockfile: [React](https://react.dev/), [Vite](https://vite.dev/), [Motion](https://motion.dev/docs/react-animation), [Zustand](https://zustand.docs.pmnd.rs/), [TypeScript](https://www.typescriptlang.org/), [Vitest](https://vitest.dev/), and [Playwright](https://playwright.dev/). No generated raster art, third-party character assets, datasets, or pre-built application were imported. Sound is synthesized with Web Audio.
