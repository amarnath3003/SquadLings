# SquadLings GitHub banner generation

> Copied from [amarnath3003/SquadLings](https://github.com/amarnath3003/SquadLings) at `cd568c5`. Paths such as `dashboard/` and `packages/shared/` refer to that repository's layout; the matching code here is in `web/src/` and `web/shared/`.

Mode: built-in image generation, refinement, and a subsequent brand-name correction. The initial prompts below record the historical spelling; the final edit corrects the brand to SquadLings. The user-provided image was a visual reference. Final asset: [squadlings-github-banner.png](../assets/squadlings-github-banner.png), 2172 × 724 pixels (3:1).

## Initial prompt

```text
Use case: logo-brand
Asset type: finished wide GitHub README logo banner, landscape 3:1 aspect ratio, ideally 2400 x 800.
Primary request: Create a polished SquadLink project banner using the attached image as a visual reference for flat circular characters with paired typographic eyes against pure black.
Input images: Image 1 is a style reference, not an edit target. Recompose it into an original wide banner.
Scene/backdrop: pure solid black #000000.
Composition: Strong centered white wordmark "SquadLink", very large bold clean modern sans-serif, beautifully kerned and readable. Directly beneath, smaller soft-white tagline "One squad. Many minds." Keep both lines fully visible with ample black negative space and comfortable margins. Frame this central text with a playful balanced constellation of six circles of varying sizes around the outer left/right edges and corners. Some large circles are intentionally cropped by the outer image edge, but never cover the lettering. Keep the center visually quiet. Characters should feel like one expressive squad.
Characters and palette: flat purple #924ff7 circle with black paired ring eyes; orange #ff8549 circle with black paired forward-slash eyes; green #04b84c circle with black paired plus-sign eyes; blue #006aff circle with black paired angled chevron eyes; a smaller pale-blue #A6D8F5 circle with black paired small round eyes; charcoal #262626 circle with white paired up-carets ^ ^. Two simple eye symbols per circle. No mouths or limbs.
Style: crisp flat graphic design, opaque circular fills, smooth clean edges, minimal editorial tech identity, playful yet professional. Match the reference's simplicity and energy.
Text (verbatim): "SquadLink" and "One squad. Many minds."
Constraints: exact spelling and capitalization. Only these two text lines. No OpenAI logo or other brand marks. No gradients, shadows, glow, texture, 3D, borders, connectors, extra badges, or watermarks. Solid black background. Deliver the completed banner, not a mockup.
```

## Final refinement prompt

```text
Refine this generated SquadLink GitHub banner. Preserve the exact composition, dimensions, wordmark, character positions, circle sizes, and paired eye symbols. Correct only the rendering: make the tagline clean, ordinary sans-serif text reading EXACTLY "One squad. Many minds." with no accent marks or decorative strokes above any letters (the m in minds must have nothing above it). Remove all gradients, textures, shading and highlights from every circle and text. Use uniform flat fills: purple #924ff7, orange #ff8549, green #04b84c, blue #006aff, pale blue #A6D8F5, charcoal #262626. Wordmark pure white, tagline #e5e5e5, background pure black. Keep crisp smooth edges. The result must be a clean flat banner with the exact two text lines and no other marks.
```



## Final brand-name correction

The user approved the composition and animation, then corrected the name to **SquadLings**. The existing banner was inspected and edited with the built-in image tool, then copied into the repository. The characters, layout, palette, and tagline were preserved. Exact edit prompt:

```text
Use case: text-localization. Asset type: GitHub logo banner, wide 3:1. Input image is the edit target. Change ONLY the large central brand wordmark from "SquadLink" to exactly "SquadLings" (S q u a d L i n g s), matching the same bold white clean sans-serif lettering. Keep it centered and fit it comfortably within the same central negative space without colliding with any character. Preserve the exact tagline "One squad. Many minds." below it. Preserve the black background, all six colored circle characters, their positions, sizes, expressions, edge cropping, and the existing composition and palette. No new elements, no new logos, no decorative accents. The two text lines must be precisely "SquadLings" and "One squad. Many minds.". Keep the original wide 3:1 banner aspect ratio.
```
