# Character colours and design sources

Originally fetched on **10 October 2026 (IST)**; the live website palette was fetched again and verified on **11 October 2026 (IST)**. The user selected the **current DevDay website** as the colour reference.

| Source | Use |
| --- | --- |
| [Official DevDay site](https://devday.openai.com/) | Event colour tokens and neutral black/white UI direction. |
| [Published DevDay stylesheet](https://devday.openai.com/_next/static/css/b17bf04869ddf007.css) | Exact `:root` declarations: `--event-blue: #006aff`, `--event-green: #04b84c`, `--event-purple: #924ff7`, `--event-orange: #ff8549`. This hashed asset URL can change when the official site is rebuilt. |
| [Official DevDay SVG favicon](https://devday.openai.com/icon.svg) | Unmodified local Master artwork in `dashboard/public/openai-devday-icon.svg`. SHA-256: `ed615b8fd9703863918daae6106396a42926fd167abc1bcad4aca860ff0f7ba6`. Project branding/favicon are our own. |
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

The same stylesheet's dark theme declares `--color-background: #000` and `--color-primary-100: #fff`. These exact black/white values define the app's default page and text colours. Local charcoal surfaces, grey borders/labels, and darker status fills complete the interface. `color-scheme: dark` and page metadata keep native controls and browser chrome consistent, including under a light OS preference. The official Master SVG stays unmodified and uses its embedded dark-mode styling. Synthetic page previews share the theme; real streamed images are not recoloured.

SquadLings is the hackathon team's project. OpenAI names and artwork belong to OpenAI; no endorsement is implied.

## Libraries

The dashboard was implemented from scratch in this repository. Dependencies are pinned in the root lockfile: [React](https://react.dev/), [Vite](https://vite.dev/), [Motion](https://motion.dev/docs/react-animation), [Zustand](https://zustand.docs.pmnd.rs/), [TypeScript](https://www.typescriptlang.org/), [Vitest](https://vitest.dev/), and [Playwright](https://playwright.dev/). No generated raster art, third-party character assets, datasets, or pre-built application were imported. Sound is synthesized with Web Audio.
