# FORM & THOUGHT font provenance

Selection: stack 2 — Noto Serif KR + Cormorant Garamond + Noto Sans KR. The controller approved this stack after an independent visual review of the durable calibration packet.

All three files are local WOFF2 assets. The public application makes no remote font request.

## Artifacts

| semantic file | role | family / weight | bytes | SHA-256 | fallback |
| --- | --- | --- | ---: | --- | --- |
| `form-thought-display-ko.woff2` | Korean display and reading text | Noto Serif KR 400 | 164,384 | `e947ea52090b52c69864c431eda9aa4c4dd6cba1877119af927929f812c17c17` | `Noto Serif KR`, `AppleMyungjo`, `Batang`, `serif` |
| `form-thought-wordmark.woff2` | two-line Latin wordmark | Cormorant Garamond 400 | 2,408 | `96ba19a6327e841dcf9fefc29b4827c5cd6dc80c7469aeb80fa70eca7411609f` | `Cormorant Garamond`, `Times New Roman`, `serif` |
| `form-thought-ui-ko.woff2` | Korean UI and metadata | Noto Sans KR 400 | 80,764 | `ca472485e483c69a74dfdaee95d79bdc3a998b6730f627808bc12935088b24d4` | `Noto Sans KR`, `Apple SD Gothic Neo`, `sans-serif` |

Total initial font bytes: 247,556. Each face uses `font-display: swap`. All three roles are above-the-fold on the approved shell, so all three files are preloaded once from `app/root.tsx` with `type="font/woff2"` and anonymous CORS.

## Noto Serif KR

- Official source: <https://github.com/google/fonts/tree/main/ofl/notoserifkr>
- Upstream source file: `NotoSerifKR[wght].ttf`
- Upstream source SHA-256: `11f8d5de6f1b79195efba3828aaa2ec95c1178f5ae976fb23c8d53250a9938f3`
- Upstream source bytes: 23,795,420
- License: SIL Open Font License 1.1
- Official license SHA-256: `5e0da210fb04058a8c0087985d2d456b931c2579811a49655721d3cf0c36b6d6`

The variable source was instantiated at weight 400, then subset to 972 unique current public-corpus and UI code points. The resulting WOFF2 contains 1,360 glyphs, including shaping/recommended glyphs and the full name records required by the selected source.

## Cormorant Garamond

- Upstream project: <https://github.com/CatharsisFonts/Cormorant>
- Official Google Fonts source: <https://github.com/google/fonts/tree/main/ofl/cormorantgaramond>
- Official WOFF2 source: Google Fonts CSS API, `Cormorant Garamond` weight 400, exact text `FORM & THOUGHT`
- Source response URL version: `v21`
- License: SIL Open Font License 1.1
- Official license SHA-256: `60700d351cac4650c51f3f9db318d2a420f8b45052dba2715eb5fec41f0f6956`

The semantic file is the unchanged official exact-text WOFF2 response. It contains 13 glyphs and is not locally transformed or recompressed.

The production wordmark uses weight 400, `-.04em` tracking, and a 20px desktop size. Browser canvas `TextMetrics` measured the two-line production text's maximum optical ink width as 92.98003px (`FORM &`: 52.35813px; `THOUGHT`: 92.98003px), +0.5298% from the calibrated 92.49px reference. This uses `actualBoundingBoxLeft + actualBoundingBoxRight`, not the DOM advance box. The adjacent 19px and 21px checks measured 88.33098px (-4.4967%) and 97.62899px (+5.5563%), respectively.

## Noto Sans KR

- Official source: <https://github.com/google/fonts/tree/main/ofl/notosanskr>
- Upstream source file: `NotoSansKR[wght].ttf`
- Upstream source SHA-256: `194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252`
- Upstream source bytes: 10,414,588
- License: SIL Open Font License 1.1
- Official license SHA-256: `1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9`

The variable source was instantiated at weight 400 and subset with the same 972-code-point public-corpus/UI set. The resulting WOFF2 contains 1,360 glyphs.

## Reproduction

Subset tooling was ephemeral and is not a project dependency: fontTools 4.59.2 and Brotli 1.1.0. Inputs were the official Google Fonts variable TTF files above. The glyph inventory was the sorted unique printable code-point set from current `src/content`, `apps/site/app`, `apps/site/src`, and `packages/content/src` Markdown/MDX/TypeScript/JSON sources (108 files at selection time).

Both Noto sources were instantiated at `wght=400`, then subset with all layout features, all name records/languages, `.notdef`, recommended glyphs, and WOFF2 Brotli output. Any future public content introducing a code point outside this recorded corpus must regenerate both semantic Korean subsets and update this file's byte counts and checksums.
