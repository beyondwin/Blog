# Uncle Bob AI Code Review Evidence Packet

Date: 2026-08-26
Status: verified-with-runtime-limit
Target article: `src/content/articles/uncle-bob-ai-code-review-evidence.mdx`

## Intake

- Supplied report: `/Users/user/Downloads/uncle_bob_ai_code_review_analysis.html`
- Previously recorded SHA-256: `c2848def68604a4b74ef728506cf06d1e4ccd5e4c06b8aae59074b0575bb309b` (50,399 bytes)
- 2026-08-26 re-check: the intake file was not present. Contents were not reconstructed.
- Referenced social post: `https://x.com/unclebobmartin/status/2080257779395154409`
- Canonical implementation: `https://github.com/unclebob/crap4java`
- Question: Can CRAP-backed automated verification justify not reading AI-generated code?

## Source Inventory

| Source | Type | Verified use |
| --- | --- | --- |
| [unclebob/crap4java](https://github.com/unclebob/crap4java) | Official repository | 2026-08-26 re-read. Default branch `main`. HEAD still [`69b561209f130ece728f19b0001e90df5a117c3a`](https://github.com/unclebob/crap4java/commit/69b561209f130ece728f19b0001e90df5a117c3a) (2026-03-13, “Refresh Java tool READMEs”). Formula, Java 17 / JUnit 5.10.2 / JaCoCo 0.8.12, threshold `> 8.0`, missing XML as `N/A`. |
| [crap4java spec.md](https://github.com/unclebob/crap4java/blob/main/spec.md) | Official specification | Root `spec.md`, not `tree/main/spec`. Excludes constructors, abstract methods, anonymous-class methods. Unknown numeric scores → max `0.0` and pass. Coverage-command failure is fail-fast; missing XML after generation is a warning, not a gate failure. |
| Calculator / parser / CLI / JaCoCo sources at that commit | Implementation | `CrapScore`, `JavaMethodParser`, `JacocoCoverageParser`, `CrapAnalyzer`, `CliApplication`, `CoverageRunner`, `Main.maxCrap`. Instruction counters, `class#method:line` exact-then-nearest lookup, `visitMethod` does not descend. |
| [Uncle Bob Martin, 2026-07-23](https://x.com/unclebobmartin/status/2080257779395154409) | Claim source (discourse) | Reachable on 2026-08-26. Strategy is not reading agent-written code and surrounding agents with unit tests, Gherkin, QA procedures, quality metrics, mutation testing, and coverage. Not implementation proof that CRAP is sufficient. |
| [JaCoCo Coverage Counters](https://www.jacoco.org/jacoco/trunk/doc/counters.html) | Official documentation | Instruction coverage is independent of debug information and is not branch coverage. |
| [PIT Mutation Testing](https://pitest.org/) | Official product documentation | Line/branch coverage does not prove tests detect faults. Complementary sensor, not a crap4java feature. |
| Supplied HTML report | Intake artifact | Missing on 2026-08-26; not re-inspected. Not a publishable primary source. |

## Local Source Inspection

- Shallow clone: temporary directory outside the repository
- Inspected commit: `69b561209f130ece728f19b0001e90df5a117c3a` (unchanged on 2026-08-26)
- Commit date/message: 2026-03-13, “Refresh Java tool READMEs”
- Files inspected: `pom.xml`, `README.md`, `spec.md`, CLI/application, Java method parser, complexity counter, JaCoCo parser, CRAP analyzer/calculator, corresponding tests.
- Maven was unavailable (`mvn: command not found`). The upstream JUnit suite was not run and is not claimed as run.
- JDK 25 / `javac` were present. The 2026-07-26 focused harness was not re-executed; its observed output is kept as historical.

## Reproduction Evidence

Historical observed output, 2026-07-26 focused `javac --release 17` harness. Not re-run on 2026-08-26. Numbers were not invented.

```text
methods=[MethodDescriptor[name=outer,startLine=3,endLine=11,complexity=2], MethodDescriptor[name=inner,startLine=13,endLine=13,complexity=2]]
unknownScore=null
maxCrap=0.0
thresholdExceeded=false
nearestCoverage=100.0
```

Interpretation, re-checked against the same commit's source and spec on 2026-08-26:

- Member-class method was collected.
- Constructor, anonymous-class method, and local-class method were omitted. Spec names constructors, abstract methods, and anonymous-class methods; local-class omission follows `visitMethod` not descending.
- Lambda branching contributed to the containing method.
- Missing coverage remained unknown; numeric maximum fell to 0 and passed.
- A missing exact coverage key can fall back to nearest same-class/same-name line without a JVM descriptor.
- Coverage command failure (`mvn` non-zero) is fail-fast. Missing JaCoCo XML after a finished command is fail-open.

## Evidence Ledger

| Claim | Evidence | Strength |
| --- | --- | --- |
| Formula is `CC² × (1-coverage)³ + CC`. | Current calculator source, spec, and README | High |
| Current gate fails only above 8.0. | Current CLI/application source and spec | High |
| No numeric score means max 0 and pass. | Current source, spec, and historical harness | High |
| Coverage uses JaCoCo instruction counters. | Current parser source and JaCoCo docs | High |
| Unknown coverage passing is specified behavior, not proven accidental defect. | Current spec §12 and §14 | High |
| Coverage-command failure is fail-fast; missing XML after generation is a warning. | `CoverageRunner` and spec §7.3 / §14 | High |
| CRAP cannot prove authorization, architecture, concurrency, or test-oracle correctness. | Metric inputs and excluded system properties | High as scope analysis |
| Uncle Bob's public strategy is a constraint suite, not CRAP alone. | 2026-07-23 post, reachable 2026-08-26 | High for the claim text; not implementation proof |

## CRAP Threshold Calculation

For a maximum score of 8:

| CC | Minimum coverage |
| ---: | ---: |
| 1–2 | 0% |
| 3 | 17.8% |
| 4 | 37.1% |
| 5 | 50.7% |
| 6 | 61.9% |
| 7 | 72.7% |
| 8 | 100% |
| 9+ | Impossible |

## Blind Spots and Counterevidence

- Instruction coverage is not branch coverage or assertion quality.
- Overloads, synthetic methods, and shifted line mappings can be misassociated.
- Constructors and some nested executable code are outside the current method set.
- A missing JaCoCo report after a finished coverage command is fail-open under the current specification.
- Security, migrations, public contracts, performance, observability, and recovery require separate review.
- The social post is the claim source. It does not prove that CRAP, or any one metric, makes reading AI code unnecessary.
- Maven tests and the 2026-07-26 harness were not re-run on 2026-08-26.

## Editorial Decisions

- Reframe “do not read code” as risk-based review.
- Treat CRAP as one sensor in a larger constraint suite, not as a license to skip reading.
- Recommend automation-heavy review only for low-blast-radius changes with independent tests.
- Preserve human review for high-risk security, money, privacy, data, concurrency, and architecture boundaries.
- Keep historical harness numbers labeled historical; do not invent replacements.
- Local published after verification.

## Quality Gate Notes

- Runtime limitations are disclosed: no Maven, historical harness only.
- Source behavior and policy recommendation are separated.
- Public `## 확인한 자료` uses the canonical repo, `spec.md`, the reachable claim post, JaCoCo docs, and PIT. The missing local intake path is omitted.
- Check date 2026-08-26.
- Article must pass `node scripts/validate-content.mjs` and `npm run article:quality` before the published route check.
