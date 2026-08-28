# FORM & THOUGHT type calibration

Status: selected and integrated. The delegated controller selected stack 2 after reviewing this packet and an independent visual review reached the same conclusion.

## Artifacts

- `type-calibration.html`: the exact typography sheet and runtime measurement script.
- `type-calibration.png`: combined desktop/mobile evidence captured from 1440×900 and 390×844 CSS viewports at DPR 1.
- `production-calibration.html`: deterministic post-selection specimen that loads only the semantic production WOFF2 files and exposes browser-measured ink/wrap data.
- `../form-and-thought-reference/calibration.yml`: reference crops, bitmap-to-CSS calibration, source provenance, checksums, byte counts, measurements, holds, and recommendation.

The HTML loads calibration-only files from ignored `output/form-and-thought-type-calibration/fonts/`. Phase A did not copy any candidate into the public app. After the selection gate, Phase B added only stack 2 under the semantic production filenames documented in `apps/site/public/fonts/LICENSES.md`.

## Fixed specimen

- Wordmark: `FORM & THOUGHT`, two lines, 22px/0.9 desktop and 20px/0.9 mobile.
- Lane: `아티클` in the stack's UI face.
- Title: `AI 시대에, 나는 왜 책을 읽는가`, 48px/1.16 desktop and 38px/1.2 mobile.
- Body: the first two real paragraphs from `src/content/thoughts/why-i-read-in-the-ai-era.mdx`, 17px/1.9 desktop and 16px/1.86 mobile.
- Widths: desktop body is capped at 40em; mobile uses the available 390px viewport after the approved 22px side insets.

## Measurements

| stack | wordmark desktop / mobile | Korean title desktop / mobile | body desktop / mobile | calibration bytes | release status |
| --- | ---: | ---: | ---: | ---: | --- |
| 1. MaruBuri + Cormorant Garamond + Pretendard | 105.73px / 96.13px | 2 / 2 lines | 39.53em / 21.63em | 1,728,644 | HOLD: MaruBuri zip has no exact license text or WOFF2; conversion and redistribution require verification |
| 2. Noto Serif KR + Cormorant Garamond + Noto Sans KR | 105.73px / 96.13px | 2 / 2 lines | 39.53em / 21.63em | 25,608 | clear: all roles are SIL OFL 1.1 and the calibration uses official Google Fonts WOFF2 subsets |
| 3. KoPub Batang + Libre Baskerville + Pretendard | 130.30px / 118.45px | 2 / 2 lines | 39.53em / 21.63em | 12,916,208 | HOLD: KoPub requires separate server-embedding approval, prohibits modification, and supplies no WOFF2 |

The byte column is the exact payload used by this sheet, not a production forecast. Noto and Latin faces use exact-glyph Google Fonts calibration subsets, while MaruBuri and KoPub are unmodified publisher files because their release terms do not support treating locally altered files as approved deployment artifacts. Production subset bytes must be measured only after selection.

## Official source and license review

| family | official source | license finding |
| --- | --- | --- |
| MaruBuri | [Naver Hangeul font page](https://hangeul.naver.com/fonts/search?f=maru) and [publisher zip](https://campaign-cdn.pstatic.net/0/hangeul/2022/zip_v2/maruburi.zip) | Official page labels it open-license and commercially usable. Exact redistribution text is not bundled, so a derived WOFF2 is held. |
| Cormorant Garamond | [upstream repository](https://github.com/CatharsisFonts/Cormorant), [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/cormorantgaramond) | SIL Open Font License 1.1. |
| Pretendard | [upstream repository](https://github.com/orioncactus/pretendard), [v1.3.9 release](https://github.com/orioncactus/pretendard/releases/tag/v1.3.9) | SIL Open Font License 1.1; official release contains WOFF2. |
| Noto Serif KR | [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/notoserifkr) | SIL Open Font License 1.1. |
| Noto Sans KR | [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/notosanskr) | SIL Open Font License 1.1. |
| KoPub Batang | [Korean Publishers Association page](https://www.kopus.org/biz-electronic-font2/), [license PDF](https://www.kopus.org/wp-content/uploads/2021/04/서체_라이선스.pdf) | Custom license; publisher says server embedding needs separate approval and modification is prohibited. |
| Libre Baskerville | [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/librebaskerville) | SIL Open Font License 1.1. |

Every exact filename, SHA-256, byte count, and subset note is recorded in `calibration.yml`.

## Reference calibration

All seven manifest checksums were re-run and matched. The primary page-shell crops are recorded without changing the manifest's route authority. The odd generated bitmap sizes are mapped to comparison CSS viewports instead of being silently treated as CSS pixels:

- 1122×1402 portrait references → 1120×1400 CSS comparison viewport.
- 1086×1448 article index → 1080×1440 CSS comparison viewport.
- 1448×1086 home → 1440×1080 CSS comparison viewport.
- `reference-06` keeps its two manifest regions as 840×933 and 841×933 comparison viewports.
- `reference-07` remains a secondary composite tone board and has no CSS viewport.

The home reference wordmark's measured light-ink bounding box is 93×39 bitmap pixels (92.49 CSS px wide after calibration). It is an ink bound, not a DOM advance box, so it is evidence for silhouette comparison rather than a false one-to-one width claim.

## Mechanical and visual review

- All seven requested faces rendered from the recorded files; `document.fonts.ready` completed before capture.
- Desktop and mobile title wraps are stable at two lines for every stack.
- The 390px capture has `scrollWidth === 390`; there is no horizontal overflow.
- Stack 3's Libre Baskerville wordmark advance is 23.24% wider than the Cormorant wordmark at the same role size and is visibly farther from the narrow reference silhouette.
- Stack 1 has the warmest and most reference-like Korean page color, but its deployment artifact is not license-clear yet.
- Stack 2 is slightly more formal and neutral than MaruBuri, but preserves the high-contrast editorial hierarchy, stable wrap, clean Korean body texture, and the only complete license-clear WOFF2 route.
- Stack 3 is visually the heaviest in Korean, widest in the wordmark, and blocked for web embedding.

One spec tension is independent of stack selection: at a 390px viewport, 22px side insets and a 16px CJK body yield 346px / 16px = 21.63em. The visual spec's simultaneous `27–34` Korean-character mobile measure, `20–24px` side inset, and `16–17px` body size cannot all hold at 390px. The capture preserves the approved inset and font-size constraints and reports the resulting measure rather than hiding the conflict.

## Recommendation for the delegated gate

Recommend stack 2: Noto Serif KR + Cormorant Garamond + Noto Sans KR.

It is the only candidate with no license or conversion HOLD across all three roles, matches the reference's narrow two-line wordmark more closely than stack 3, preserves the representative Korean title at two lines on both target viewports, and carries body text without collision or overflow. Stack 1 remains the visual runner-up if the controller later obtains a release-clear MaruBuri WOFF2 route.

## Selection and production verification

The delegated controller selected stack 2: Noto Serif KR 400 + Cormorant Garamond 400 + Noto Sans KR 400. The independent visual reviewer agreed with the recommendation. The release files are SIL OFL 1.1 assets sourced only from the official upstream/Google Fonts channels recorded in `apps/site/public/fonts/LICENSES.md`.

| semantic file | bytes | SHA-256 |
| --- | ---: | --- |
| `form-thought-display-ko.woff2` | 164,212 | `1a35ac02c8463935de05abf0653f416596367019946389a35ba5c6e4832d3030` |
| `form-thought-wordmark.woff2` | 2,408 | `96ba19a6327e841dcf9fefc29b4827c5cd6dc80c7469aeb80fa70eca7411609f` |
| `form-thought-ui-ko.woff2` | 80,748 | `f79fa2b266ac19f28489051b0ab8a9510c1131943b09d09b47f1538b8f66d15c` |

The three files total 247,368 bytes. They use `font-display: swap`, are preloaded once as anonymous `font/woff2`, and the public application makes no remote font request. The Korean binaries report Regular family/full/PostScript names, OS/2 weight 400, and 1,360 glyphs each; the wordmark reports Regular/400 and 13 glyphs. A compressed-WOFF2 metadata test enforces those values.

The reference's calibrated wordmark ink width is 92.49px. The committed production specimen uses the semantic Cormorant file and actual left/right Canvas ink bounds rather than DOM advance width. At weight 400, 20px, and `-.04em` tracking, fresh Chromium measurements were 69.58003px for `FORM &` and 92.98003px for `THOUGHT`. The maximum is +0.5298% from the reference and inside the controller's ±4% tolerance. At the responsive 18px role, the lines measured 62.62204px and 83.68204px.

The same fresh run recorded a two-line Korean title at both 1440×900 and 390×844. The two representative body paragraphs render as 1/1 lines on desktop and 2/2 on mobile. Desktop body measure is 37.65em in the production specimen grid; mobile remains the ruled 21.63em. `apps/site/test/font-production-calibration.test.ts` starts an isolated local server, launches the repository-pinned Playwright Chromium, and asserts the optical tolerance and exact responsive line counts.

The controller also resolved the 390px measure tension in favor of the original layout constraints: retain 22px side insets and 16px body text. The resulting measured body width remains 21.63em; the implementation does not shrink the text or introduce overflow to manufacture a larger character count.

## Reproduction

1. Download each publisher artifact from the official links above and verify the source checksums in `calibration.yml`.
2. Extract the exact recorded source filenames into ignored `output/form-and-thought-type-calibration/fonts/`. Fetch the recorded Google Fonts exact-text WOFF2 subsets for the four calibration subset files.
3. Serve the repository root on an unused local port; the capture used `python3 -m http.server 43717 --bind 127.0.0.1`.
4. Open `type-calibration.html` in Chromium 152, resize to 1440×900 and 390×844, wait for `document.fonts.ready`, and capture the `main` element at CSS scale.
5. Place the 1280px desktop sheet and 390px mobile sheet side by side with a 24px `#E8E1D8` gutter. The expected combined PNG checksum is `069bf580dac6a4b69f4f1d6797e7fc371accb2ca51f087bd4705ebc70a8eb2b2`.
6. Run `npm exec vitest run apps/site/test/font-production-calibration.test.ts` to serve `production-calibration.html` in isolation and reproduce the selected production measurements in the pinned Chromium.
