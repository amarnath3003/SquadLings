# Character colours and design sources

Originally fetched on **10 October 2026 (IST)**; the live website palette was fetched again and verified on **11 October 2026 (IST)**. The user selected the **current DevDay website** as the colour reference.

| Source | Use |
| --- | --- |
| [Official DevDay site](https://devday.openai.com/) | Event colour tokens and neutral black/white UI direction. |
| [Published DevDay stylesheet](https://devday.openai.com/_next/static/css/b17bf04869ddf007.css) | Exact `:root` declarations: `--event-blue: #006aff`, `--event-green: #04b84c`, `--event-purple: #924ff7`, `--event-orange: #ff8549`. This hashed asset URL can change when the official site is rebuilt. |
| [OpenAI design guidelines](https://openai.com/brand/) | Brand attribution and logo guidance. The fuller brand portal redirected to an authentication page; no private brand materials were accessed. |
| [User-supplied sticker photo](devday-stickers.jpg) | Circular character geometry, black expression glyphs, and the local Sky blue extension. |

The user requested official colours after web research. These four **event website tokens** replace the photo-derived screen colours in the supplied brief. They are not claimed to be a universal OpenAI corporate palette. Sky `#A6D8F5` and supporting panel/status colours are local design choices. Original sticker values remain in `packages/shared/src/cast.ts` for reference.

The current website links the stylesheet above (with a deployment query parameter). Its exact declarations are:

```css
--event-blue: #006aff;
--event-green: #04b84c;
--event-purple: #924ff7;
--event-orange: #ff8549;
```

These values already matched the previous character fills; no different official hex values were found in the live website. `DEVDAY_COLORS` in `packages/shared/src/cast.ts` now supplies both the cast and, through `dashboard/src/main.tsx`, the CSS event tokens. Character bodies use a single opaque fill with black expression glyphs. Reflections, highlight strokes, blush overlays, white body rims, ground shadows, colour filters, and glows are removed. Full-squad flames retain their motion as solid event-orange silhouettes. Cards and controls use borders without shadows; day/night room surfaces use solid backgrounds. Gallery/grid patterns remain for background contrast previews.

The same stylesheet's dark theme declares `--color-background: #000` and `--color-primary-100: #fff`. These exact black/white values define the app's default page and text colours. Local charcoal surfaces, grey borders/labels, and darker status fills complete the interface. `color-scheme: dark` and page metadata keep native controls and browser chrome consistent, including under a light OS preference. Synthetic page previews share the theme; real streamed images are not recoloured.

The user's later supplied reference shows a charcoal circle with paired white carets. Original Onyx artwork follows that resting silhouette, using local charcoal `#262626`, the shared symbol geometry, and white glyphs; this is not an official event colour token. Workflow reactions can add mouths/details, as the user clarified. Onyx replaces the previously used DevDay logo; that asset is removed from the dashboard. No additional external artwork was imported.

SquadLings is the hackathon team's project. OpenAI names and artwork belong to OpenAI; no endorsement is implied.

## GitHub banner

The [SquadLink banner](../assets/squadlink-github-banner.png) is a 2172 × 724 PNG generated with Codex's built-in image generation tool from the user's supplied circular-character reference and the repository's existing theme. The requested banner wordmark is **SquadLink** with the tagline **One squad. Many minds.**; the existing application/project name remains SquadLings. The banner includes the five colored teammates and charcoal Onyx, without the OpenAI logo. Generated raster colors are illustrative rather than verified exact palette tokens. The [generation prompts](squadlink-banner-prompt.md) record the creation and lettering correction. Human design review is pending.

## Libraries

The SquadLink launch film reuses the dashboard's SVG cast and sound synthesis. Its motion direction was informed by the user-selected [first 15 seconds of DevDay 2026](https://www.youtube.com/watch?v=Fls_onRviPM), inspected in Chrome. The paths, compositions, typography, and soundtrack assembly are original project code; no reference footage/audio or OpenAI logo is included. See the [storyboard](../video/storyboard.md) for timing and recording-tool sources.

The dashboard was implemented from scratch in this repository. Dependencies are pinned in the root lockfile: [React](https://react.dev/), [Vite](https://vite.dev/), [Motion](https://motion.dev/docs/react-animation), [Zustand](https://zustand.docs.pmnd.rs/), [TypeScript](https://www.typescriptlang.org/), [Vitest](https://vitest.dev/), and [Playwright](https://playwright.dev/). The README banner is generated raster art; dashboard characters remain code-authored SVG. No third-party character assets, datasets, or pre-built application were imported. Sound is synthesized with Web Audio.
