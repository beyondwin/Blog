# FORM & THOUGHT font provenance

Selection: stack 2 — Noto Serif KR + Cormorant Garamond + Noto Sans KR. The controller approved this stack after an independent visual review of the durable calibration packet.

All three files are local WOFF2 assets. The public application makes no remote font request.

## Artifacts

| semantic file | role | family / weight | bytes | SHA-256 | fallback |
| --- | --- | --- | ---: | --- | --- |
| `form-thought-display-ko.woff2` | Korean display and reading text | Noto Serif KR 400 | 164,212 | `1a35ac02c8463935de05abf0653f416596367019946389a35ba5c6e4832d3030` | `Noto Serif KR`, `AppleMyungjo`, `Batang`, `serif` |
| `form-thought-wordmark.woff2` | two-line Latin wordmark | Cormorant Garamond 400 | 2,408 | `96ba19a6327e841dcf9fefc29b4827c5cd6dc80c7469aeb80fa70eca7411609f` | `Cormorant Garamond`, `Times New Roman`, `serif` |
| `form-thought-ui-ko.woff2` | Korean UI and metadata | Noto Sans KR 400 | 80,748 | `f79fa2b266ac19f28489051b0ab8a9510c1131943b09d09b47f1538b8f66d15c` | `Noto Sans KR`, `Apple SD Gothic Neo`, `sans-serif` |

Total initial font bytes: 247,368. Each face uses `font-display: swap`. All three roles are above-the-fold on the approved shell, so all three files are preloaded once from `app/root.tsx` with `type="font/woff2"` and anonymous CORS.

## License package and notices

All three semantic artifacts are distributed under the full SIL Open Font License 1.1 in [`OFL-1.1.txt`](OFL-1.1.txt), copied verbatim from the [official SIL plaintext](https://openfontlicense.org/documents/OFL.txt). The committed file is 4,599 bytes with SHA-256 `1d361a8f8e8ce6e68457dcd93fb56e162e6baa3bbb7e7573a290d44399f6b57e`.

| semantic artifact | exact notice from the official upstream OFL file | upstream OFL | packaged license |
| --- | --- | --- | --- |
| `form-thought-display-ko.woff2` | Copyright 2012 Google Inc. All Rights Reserved. | [Noto Serif KR OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifkr/OFL.txt), SHA-256 `5e0da210fb04058a8c0087985d2d456b931c2579811a49655721d3cf0c36b6d6` | `OFL-1.1.txt` |
| `form-thought-wordmark.woff2` | Copyright 2015 the Cormorant Project Authors (github.com/CatharsisFonts/Cormorant) | [Cormorant Garamond OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/OFL.txt), SHA-256 `60700d351cac4650c51f3f9db318d2a420f8b45052dba2715eb5fec41f0f6956` | `OFL-1.1.txt` |
| `form-thought-ui-ko.woff2` | Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source' | [Noto Sans KR OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/OFL.txt), SHA-256 `1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9` | `OFL-1.1.txt` |

The embedded name-table copyright strings are preserved from the official binaries: `(c) 2017-2024 Adobe (http://www.adobe.com/).` for Noto Serif KR, `Copyright 2015 The Cormorant Project Authors (github.com/CatharsisFonts/Cormorant)` for Cormorant Garamond, and `(c) 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'.` for Noto Sans KR.

## Noto Serif KR

- Official source: <https://github.com/google/fonts/tree/main/ofl/notoserifkr>
- Upstream source file: `NotoSerifKR[wght].ttf`
- Upstream source SHA-256: `11f8d5de6f1b79195efba3828aaa2ec95c1178f5ae976fb23c8d53250a9938f3`
- Upstream source bytes: 23,795,420
- License: SIL Open Font License 1.1
- Official license SHA-256: `5e0da210fb04058a8c0087985d2d456b931c2579811a49655721d3cf0c36b6d6`

The variable source was instantiated at weight 400 with its name table updated to the selected instance, then subset to 972 unique current public-corpus and UI code points. The resulting WOFF2 contains 1,360 glyphs, including shaping/recommended glyphs and the full name records required by the selected source. Its internal identity is `Noto Serif KR` / `Regular`, full name `Noto Serif KR Regular`, PostScript name `NotoSerifKR-Regular`, and OS/2 weight 400.

## Cormorant Garamond

- Upstream project: <https://github.com/CatharsisFonts/Cormorant>
- Official Google Fonts source: <https://github.com/google/fonts/tree/main/ofl/cormorantgaramond>
- Official WOFF2 source: Google Fonts CSS API, `Cormorant Garamond` weight 400, exact text `FORM & THOUGHT`
- Source response URL version: `v21`
- License: SIL Open Font License 1.1
- Official license SHA-256: `60700d351cac4650c51f3f9db318d2a420f8b45052dba2715eb5fec41f0f6956`

The semantic file is the unchanged official exact-text WOFF2 response. It contains 13 glyphs and is not locally transformed or recompressed. Its internal identity is `Cormorant Garamond` / `Regular`, full name `Cormorant Garamond Regular`, PostScript name `CormorantGaramond-Regular`, and OS/2 weight 400.

The production wordmark uses weight 400, `-.04em` tracking, and a 20px desktop size. The committed browser calibration uses Canvas `TextMetrics` and measured the two line ink widths as 69.58003px (`FORM &`) and 92.98003px (`THOUGHT`), making the maximum +0.5298% from the calibrated 92.49px reference. This uses `actualBoundingBoxLeft + actualBoundingBoxRight`, not the DOM advance box. The responsive 18px mobile role measured 62.62204px and 83.68204px. The reproducible specimen is `docs/notes/project/assets/form-and-thought-type-calibration/production-calibration.html`, covered by `apps/site/test/font-production-calibration.test.ts` in the pinned Playwright Chromium.

## Noto Sans KR

- Official source: <https://github.com/google/fonts/tree/main/ofl/notosanskr>
- Upstream source file: `NotoSansKR[wght].ttf`
- Upstream source SHA-256: `194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252`
- Upstream source bytes: 10,414,588
- License: SIL Open Font License 1.1
- Official license SHA-256: `1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9`

The variable source was instantiated at weight 400 with its name table updated to the selected instance, then subset with the same 972-code-point public-corpus/UI set. The resulting WOFF2 contains 1,360 glyphs. Its internal identity is `Noto Sans KR` / `Regular`, full name `Noto Sans KR Regular`, PostScript name `NotoSansKR-Regular`, and OS/2 weight 400.

## Reproduction

Subset tooling was ephemeral and is not a project dependency: fontTools 4.59.2 and Brotli 1.1.0. Inputs were the official Google Fonts variable TTF files above. The glyph inventory was the sorted unique printable code-point set from current `src/content`, `apps/site/app`, `apps/site/src`, and `packages/content/src` Markdown/MDX/TypeScript/JSON sources (108 files at selection time).

Both Noto sources were instantiated at `wght=400` with FontTools `varLib.instancer --static --update-name-table --no-recalc-timestamp`, then subset with all layout features, all name records/languages, `.notdef`, recommended glyphs, and WOFF2 Brotli output. The repository's metadata test reads each compressed WOFF2 through the already pinned `fontkitten` parser and asserts family, subfamily, full name, PostScript name, OS/2 weight, and glyph count. Any future public content introducing a code point outside this recorded corpus must regenerate both semantic Korean subsets and update this file's byte counts and checksums.
