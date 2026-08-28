# FORM & THOUGHT representative vertical slice evidence

- Decision date: 2026-08-29
- Final visual review: **APPROVE**
- Approved routes: `/`, `/articles/`, `/articles/graphify-code-knowledge-graph-deep-dive/`
- Task 7 pre-commit Git revision: `b6bd63f3687d414ad184b89156df675e8df3ca22`
- Program branch: `codex/form-and-thought-implementation`
- Program fork point against local `main`: `540bc624db18959ba921bf89c664d3436c503aba`
- Immutable public release: `4ab93f41ecceea2617d97a0cca890dd49118347651ff1b764e2a42523929d565`
- Release records/assets/private-boundary result: `43 / 26 / 0`

This note seals the browser-approved representative slice required by Task 7
of the accepted FORM & THOUGHT implementation plan. It records a local visual
baseline only. It does not authorize publishing, deployment, production
traffic changes, push, merge, broader component expansion, or replacement of
truthful content with reference-only material.

## Capture and snapshot protocol

`playwright.form-thought.config.ts` owns one isolated production preview at
`127.0.0.1:4397`, sets `reuseExistingServer: false`, and runs one Chromium
worker. Each run executes this chain before testing:

```text
public-release:build
public-release:verify
site:build
site:preview -- --host 127.0.0.1 --port 4397
```

The capture environment used Node `v24.18.0`, Playwright `1.62.1`, and
Chromium `151.0.7922.34` revision `1234`. Screenshot assertions disable
animations, hide the caret, and use CSS-pixel scale. The portable path template
is:

```text
{testDir}/{testFileName}-snapshots/{arg}{ext}
```

It deliberately omits platform and project-name tokens. Only the three
calibrated screens presented for approval are tracked as goldens. The
responsive matrix, annotated rectangles, JSON measurements, and side-by-side
contact sheets remain regenerated ignored evidence under
`output/playwright/form-and-thought-reference-comparison/`.

## Approved goldens and reference bindings

| Route | CSS viewport | Reference ID and calibrated region | Approved golden | Golden SHA-256 |
| --- | --- | --- | --- | --- |
| `/` | 1440x1080 | `reference-05-home`; bitmap 1448x1086; crop `75,45,1298,996` | `tests/e2e/form-thought-visual.spec.ts-snapshots/home-calibrated-1440x1080.png` | `84d7c0596a70688199377cfb122a4bd85a46a9e345204abd84274d0623fc59ce` |
| `/articles/` | 1080x1440 | `reference-04-article-index`; bitmap 1086x1448; crop `47,39,992,1367` | `tests/e2e/form-thought-visual.spec.ts-snapshots/articles-calibrated-1080x1440.png` | `d57c7df3ad05f9478cf6540b6d39b18872088afe08870d914ea72a8497116d91` |
| `/articles/graphify-code-knowledge-graph-deep-dive/` | 1120x1400 | `reference-03-detail`; bitmap 1122x1402; crop `29,28,1062,1342` | `tests/e2e/form-thought-visual.spec.ts-snapshots/article-detail-calibrated-1120x1400.png` | `91d4fd0648d4c7b6c3b2d7331dc20c680a7cb6b10ff606d4fd2dd5c2b50f3ead` |

Reference file hashes:

```text
reference-05-home.png          a69c3f0fcc1803f781c2be4a4c4965b49296325bc51c6361cb7e505f7c609086
reference-04-article-index.png 2b2371ef6b500ffbac0e5c668b56af7329f65c82b231be41a164128067b111dd
reference-03-detail.png        adc16c2b4ea1bfda448ca7f433a6464ec023639f2d51811a7089ecb591bbb8ee
```

The approved golden hashes are byte-identical to the corresponding unannotated
calibrated captures generated during the approval run.

## Calibrated geometry

All three calibrated screens and every responsive measurement report zero
horizontal overflow.

| Surface | Shell and header | Major blocks |
| --- | --- | --- |
| Home 1440x1080 | shell `x=80 w=1280`; header `x=144 w=1152 h=104` | hero `w=1280 h=769.25`; copy `w=588.796875` (46%); media `w=691.1875` (54%); first pick `w=369.328125 h=250` |
| Articles 1080x1440 | shell `x=32 w=1016`; header `x=80 w=920 h=92` | heading `x=86 w=908 h=106.8125`; filters `h=85`; first row `w=908 h=250`; media/copy/date `335.953125 / 444.9375 / 127.109375` |
| Detail 1120x1400 | shell `x=32 w=1056`; header `x=80 w=960 h=92` | hero `w=1056 h=490`; introduction `w=644.15625` (61%); media `w=411.828125` (39%); action/prose columns `104 / 784` |

The responsive contract also captures all three routes at `1440x900`,
`768x900`, `390x844`, and `320x844`. The last size is the documented CSS
reflow proxy for a 640 CSS-pixel viewport at 200% zoom. At 390px, the detail
orders introduction, media, actions, and prose vertically. At 768px, the first
article media spans two rows while copy and date share the second column. At
320px, every route retains a 320px shell and zero overflow.

The final article first-row containment measurements are:

| Capture | Row boundary | Maximum child bottom | Clearance | Copy client/scroll | Date client/scroll |
| --- | ---: | ---: | ---: | ---: | ---: |
| calibrated 1080x1440 | 630.609375 | 629.609375 | 1px | 249/249 | 249/249 |
| wide 1440x900 | 683.515625 | 682.515625 | 1px | 249/249 | 249/249 |
| intermediate 768x900 | 641 | 640 | 1px | 213/213 | 50/50 |
| mobile 390x844 | 911.78125 | 910.78125 | 1px | 197/197 | 50/50 |
| 320px/200% proxy | 880.125 | 879.125 | 1px | 222/222 | 50/50 |

The automated contract permits `0.5px` subpixel variance and requires every
first-row child bottom to stay at or before the parent/next-row boundary. Copy
and date `scrollHeight` must also fit their `clientHeight`; no hidden overflow,
clipping, line clamp, ellipsis, or content deletion is used.

## Computed visual values

| Surface/role | Family | Size/line height | Tracking | Color | Media behavior |
| --- | --- | --- | --- | --- | --- |
| Shared wordmark, light pages | FORM THOUGHT Wordmark | 20/18px | -0.8px | `rgb(17, 16, 15)` | n/a |
| Home title | FORM THOUGHT Display | 68/80.24px | -2.04px | `rgb(247, 243, 237)` | n/a |
| Home body | FORM THOUGHT Display | 17/31.45px | normal | `rgb(247, 243, 237)` | n/a |
| Home hero image | FORM THOUGHT UI | n/a | n/a | n/a | `cover`; `78% 64%` |
| Article-index title | FORM THOUGHT Display | 54/62.64px | -1.62px | `rgb(17, 16, 15)` | n/a |
| First article title | FORM THOUGHT Display | 28.08/35.1px | -0.702px | `rgb(17, 16, 15)` | n/a |
| First article summary | FORM THOUGHT UI | 15/24.75px | normal | `rgb(94, 85, 78)` | n/a |
| Detail title | FORM THOUGHT Display | 56/64.96px | -1.68px | `rgb(255, 255, 255)` | n/a |
| Detail prose | FORM THOUGHT Display | 17/32.3px | normal | `rgb(17, 16, 15)` | n/a |
| Detail hero image | FORM THOUGHT UI | n/a | n/a | n/a | `cover`; `53% 49%` |

The machine-generated JSON additionally records every named block rectangle,
font weight, background and border color, border radius, shadow, object fit,
and object position. Those ignored records are reproducible from the tracked
test and are not treated as durable goldens.

## Authorized truthful-data exceptions

The final reviewer approved these visible differences from the synthetic
reference material because ADR-0007 forbids invented content and unapproved
media:

1. The real Graphify Home title wraps to four lines and makes the hero
   `769.25px` high; the reference uses shorter synthetic copy.
2. The real article index has one rights-approved media row followed by 16
   intentionally text-led rows; repeated reference illustrations were not
   fabricated or substituted.
3. The real Graphify detail has no supporting figure corresponding to the
   reference-only figure; the approved hero and actual article body remain
   intact.

These are content-truth exceptions, not permissions to relax shell, type,
spacing, responsive, accessibility, no-JavaScript, or overflow contracts.

## Correction and review ledger

### Visual pass 1

The first bounded parity pass corrected only the Task 6 article-index slice:

- desktop article rows were fixed at the approved 250px density;
- list copy padding and title scale were bounded to stabilize real wrapping;
- the 768–899px media/copy/date composition became a two-column, two-row grid.

The first-row measurement changed from `251.8125px` at the calibrated viewport
and approximately `288.84px` at 1440px to the approved 250px desktop row. The
768px copy/date x-offset changed from `275.21875px` to exact alignment.
Independent review then found one remaining blocker: at 1440px the row children
extended beyond the fixed parent and crossed the next rule.

### Visual pass 2

The final allowed pass reproduced child bottom `692.765625px` against parent
and next-row boundary `683.515625px`, a `9.25px` intrusion. The root cause was
the copy block's 259.25px automatic minimum height. Capping only vertical copy
padding at the existing 32px spacing value preserved the 250px row, all text,
line heights, the 20px content gap, horizontal padding, crop, and color. Final
child bottom is `682.515625px`, one pixel inside the rule, with copy/date
`clientHeight === scrollHeight === 249`.

After this second pass, the controller and independent visual reviewer returned
final **APPROVE**. No third correction pass was requested or performed.

## Verification ledger

Snapshot TDD established a real RED before baseline creation:

```text
A snapshot doesn't exist at .../home-calibrated-1440x1080.png
A snapshot doesn't exist at .../articles-calibrated-1080x1440.png
A snapshot doesn't exist at .../article-detail-calibrated-1120x1400.png
1 failed
```

Update-free focused verification then passed:

```text
npx playwright test --config=playwright.form-thought.config.ts \
  tests/e2e/form-thought-visual.spec.ts \
  --grep "calibrated canonical comparisons"
1 passed (24.2s)
```

The final update-free Task 7 suite passed against the same owned production
preview and immutable release:

```text
npx playwright test --config=playwright.form-thought.config.ts \
  tests/e2e/accessibility.spec.ts \
  tests/e2e/mobile-navigation.spec.ts \
  tests/e2e/no-js.spec.ts \
  tests/e2e/form-thought-visual.spec.ts
22 passed (40.9s)
```

This covers serious/critical Axe checks, visible focus, clean console and page
errors, image loading, public/private boundary checks, desktop/intermediate/
mobile navigation, modal focus containment/restoration, reduced motion,
no-JavaScript canonical navigation and article ledger, calibrated snapshots,
responsive geometry, text containment, and horizontal overflow.

The repository-wide `npm run validate` remains non-green only at the already
assigned Task 14 legacy Astro/Public Atlas boundary: `mediaRegistry.test.ts`
and two parity suites still request removed `reading-desk-cobalt`. In the last
fresh run, 81 files and 698 tests passed; three files and one test failed, with
three skipped. Agent/content/article/memory checks passed, and strict media
validation passed with 17 pre-existing review-cover redistribution warnings.
The React release/build/browser path recorded above is green; no legacy media
or renderer behavior was restored to conceal the transitional failures.

The production site build also emits the known non-failing macOS duplicate
Sharp/libvips `GNotificationCenterDelegate` warning. No dependency changed in
Task 7.
