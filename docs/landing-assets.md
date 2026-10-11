# Landing page assets

The landing page is implemented in `web/src/landing/` using React, Motion and the project’s native SVG character components. Its color palette follows the existing shared cast. No stock imagery, external analytics or new runtime dependencies were added.

- **Characters:** existing `web/src/characters/BotCharacter.tsx`, `MasterCharacter.tsx` and `web/shared/cast.ts`, created for SquadLings during the event.
- **Launch film:** `web/public/media/squadlings-intro.mp4` is an unchanged copy of the project’s `docs/video/squadlings-intro.mp4`. The film is loaded when its dialog opens. Original production notes: [storyboard](video/storyboard.md).
- **Bricolage Grotesque:** variable Latin WOFF2 from [Google Fonts](https://fonts.google.com/specimen/Bricolage+Grotesque); [upstream font and license](https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque). The SIL Open Font License is distributed beside the font in `web/public/fonts/bricolage-grotesque-OFL.txt`.
- **DM Sans:** variable Latin WOFF2 from [Google Fonts](https://fonts.google.com/specimen/DM+Sans); [upstream font and license](https://github.com/google/fonts/tree/main/ofl/dmsans). The SIL Open Font License is distributed beside the font in `web/public/fonts/dm-sans-OFL.txt`.

Fonts are served locally, so page loads do not contact Google Fonts. Decorative routes, browser illustrations, icons and stickers are native HTML/CSS/SVG. Task previews use scripted phases and descriptive outcomes; they do not browse, fetch prices or call OpenAI.
