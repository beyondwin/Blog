# Public renderer comparison and promotion evidence

- Decision date: 2026-08-25
- Base commit: `8d81bc20946dc089cad1dd21f042426e43feb88b`
- Result: React Router Framework Mode selected and promoted to `apps/site`
- Machine-verifiable report: [public-renderer-report.json](public-renderer-report.json)

This note records the Task 8 decision only. It does not claim the redesigned reading UX, full-route migration, traffic cutover, Astro removal, deployment, or publication.

## Selection result

The strict selector chose React Router with no preference override. React Router had zero mandatory failures. Next.js had seven mandatory failures: one article desktop LCP failure and six detail-route initial-JavaScript failures. The rejected Next.js source remains intact under `spikes/rejected/site-next`; it was not deleted.

The decision ran on macOS `darwin arm64` release `25.5.0`, Node `v24.18.0`, npm `11.16.0`, `@playwright/test` `1.62.1`, Chromium `151.0.7922.34`, revision `1234`. Both candidates consumed immutable public release `84167f3be46bb747359c29e864516165bbd4212945498089ea1adb6ea4b59c7b`.

## Sealed raw inputs

| Renderer | Raw report SHA-256 | Source commit | Evidence commit | Source-closure SHA-256 | Output artifact SHA-256 |
| --- | --- | --- | --- | --- | --- |
| Astro | `1e90c4632e31574cb024a185686770bc32cdccdd81dc0c102d62cbcd3e13d085` | `fd884c1627312250db85da1a0596e406175072aa` | `05d791f67e01f3b9ae639da2ddc529053de1505e` | `95376d39b48c49d5e75640827485ca8af3c7404a5ed8332927128974cbd8b84f` | `0a7687d29d5c8207f31f1883e1a95bacff38eb255d23e744cd5a7bc183220c37` |
| Next.js | `b791c84b7101baa9744de38a6337d83cb6135807989bc5d1804bdf8f87c7a3a7` | `05d791f67e01f3b9ae639da2ddc529053de1505e` | `c0ac142435de441e26bfadce70120af68a19fde0` | `fdc1e66f3ad87bf13af08d46e27031dbb30a3ba69263265b11c3f01812684137` | `294f0190bb5db9d61f1555ea534ab4904190c4ab7378dc42c171d2dd366e2747` |
| React Router | `1100f38af4682ff9fd414fbfca9649f00a01ed57ba90bd85f70eac5a37d734a3` | `2fd496f0ba2d534e814b59d26318e7b61c5aa418` | `8d81bc20946dc089cad1dd21f042426e43feb88b` | `9257454194e43311c5fb5f0505295a4bb2ba49b0d1495a439b780a9273e53266` | `d6b2df739e03d66985e3d6c790c37651b65d66c694c498137b7ae13f43a233a8` |

The strict reopen recomputes schema-v2 summaries, source closure, capture harness, renderer manifest, public-release binding, and artifact identity from the committed evidence rather than trusting a stored pass flag.

## Raw sample references

Every comparison run uses the same three raw captures and the same four routes at desktop `1440x960` and mobile `390x844`:

| Route index | Route | Per-viewport JSON pointers in each raw capture |
| --- | --- | --- |
| 0 | `/` | `/routes/0/measurements/{0,1}/samples/0` through `/samples/4` |
| 1 | `/articles/why-i-read-in-the-ai-era/` | `/routes/1/measurements/{0,1}/samples/0` through `/samples/4` |
| 2 | `/reviews/black-swan/` | `/routes/2/measurements/{0,1}/samples/0` through `/samples/4` |
| 3 | `/memory/agent-harnesses-are-operating-systems/` | `/routes/3/measurements/{0,1}/samples/0` through `/samples/4` |

For each route, measurement index `0` is desktop and index `1` is mobile. The machine report expands every pattern above into all five exact JSON pointers for Astro, Next.js, and React Router in each of the three runs. Thus each run directly references 120 cold route/viewport samples, not copied aggregates.

## Deterministic commands and hashes

From the exact clean base, the command `npm run parity:compare-renderers` ran exactly three times. Each byte-identical report had SHA-256 `b793548f4d0e963fd1b118ae553fa5edf3ff57b43f0296041d7192094c784f30` and independently derived `react-router`. The command `npm run parity:select-renderer` then ran exactly once; its stdout SHA-256 was `d126bb6713f78ec7e4eccbf995a814ca52e14f3ea442cfdfdf992b12672542ba` and its exact result was `{"winner":"react-router"}`. No preference or manual override input exists in either command or the durable report.

## Mandatory and quality calculations

| Candidate | Mandatory failures | LCP median / MAD | Initial JS gzip median / MAD | Image bytes median / MAD | Clean build median / MAD |
| --- | ---: | ---: | ---: | ---: | ---: |
| Next.js | 7 | 22 / 0 ms | 1,101,124 / 0 B | 625,152 / 0 B | 5,843 / 14 ms |
| React Router | 0 | 20 / 0 ms | 810,874 / 0 B | 625,152 / 0 B | 2,444 / 27 ms |

Next.js did not win any accepted advantage category:

- LCP improvement was `-2ms`; the required relative, absolute, and variance margins were `2ms`, `75ms`, and `0ms`.
- JavaScript improvement was `-290,250B`; the required relative, absolute, and variance margins were `121,631.1B`, `10,240B`, and `0B`.
- Image improvement was `0B` for equal displayed dimensions and format; the required relative margin was `93,772.8B`.
- Build improvement was `-3,399ms`; the required relative and variance margins were `488.8ms` and `54ms`. Both candidates were reproducible across three identical artifact hashes.

The machine report retains the seven exact Next.js failure strings, every build artifact hash, responsive-image contract, and full calculation operands.

## Promotion boundary

The selected 31 tracked React Router files moved from `spikes/site-react-router` to `apps/site`. The selected package is `@beyondwin/site`. The rejected 16-file Next.js tracked source tree moved from `spikes/site-next` to `spikes/rejected/site-next` and has source-tree SHA-256 `b93d96fd2ed3ed879838d6de791afa42c6a310b95dd19b7047fe39437d7617f7` over Git mode, object identity, and raw path framing.

Exact rejected tracked files:

```text
.gitignore
app/articles/[slug]/page.tsx
app/current-parity.css
app/layout.tsx
app/memory/[slug]/page.tsx
app/page.tsx
app/reviews/[slug]/page.tsx
build-static-export.ts
next-env.d.ts
next.config.ts
package.json
public/favicon.svg
release-binding.ts
test/routes.test.tsx
test/static-export.test.ts
tsconfig.json
```

No active manifest or lock entry contains Next.js or `@next/*`. Root React scripts are `site:dev`, `site:build`, `site:preview`, and `site:test`; Astro remains available only under `legacy:*`. The rejected source is outside workspaces and active test/typecheck/build inputs.

Ignored build/cache/dependency trees were not mixed into either tracked move. Six existing trees were preserved byte-for-byte under `.superpowers/sdd/public-reading-continuity-implementation-plan/preserved-task8-generated/`. The machine report records each original path, preserved path, entry count, byte count, and tree hash. They were neither deleted nor admitted to the rejected tracked-source inventory.

## Independent recomputation

`npm run parity:verify-selection` verifies the final workspace contract and reconstructs the selection from the sealed raw captures named above. It also verifies the durable report, rejected tracked-source list/hash, selected manifest hash, exact three-run identity, one selector result, public-release binding, and no-override flag. After the Task 8 commit, `npm run parity:verify-selection -- --require-clean` additionally requires a clean tracked worktree.
