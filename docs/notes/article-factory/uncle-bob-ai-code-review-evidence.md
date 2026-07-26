# Uncle Bob AI Code Review Evidence Packet

Date: 2026-07-26
Status: verified-with-runtime-limit
Target article: `src/content/articles/uncle-bob-ai-code-review-evidence.mdx`

## Intake

- Supplied report: `/Users/kws/Downloads/uncle_bob_ai_code_review_analysis.html`
- Intake SHA-256: `c2848def68604a4b74ef728506cf06d1e4ccd5e4c06b8aae59074b0575bb309b` (50,399 bytes)
- Referenced social post: `https://x.com/unclebobmartin/status/2080257779395154409`
- Canonical implementation: `https://github.com/unclebob/crap4java`
- Question: Can CRAP-backed automated verification justify not reading AI-generated code?

## Local Source Inspection

- Shallow clone: temporary directory outside the repository
- Inspected commit: `69b561209f130ece728f19b0001e90df5a117c3a`
- Commit date/message: 2026-03-13, “Refresh Java tool READMEs”
- Files inspected: `pom.xml`, CLI/application, Java method parser, complexity counter, JaCoCo parser, CRAP analyzer/calculator, corresponding specifications.
- Maven was unavailable on the machine (`mvn: command not found`), so the upstream JUnit suite was not claimed as run.
- Production sources were compiled with JDK 25 using `javac --release 17`; a focused temporary harness was compiled and executed.

## Reproduction Evidence

Observed output:

```text
methods=[MethodDescriptor[name=outer,startLine=3,endLine=11,complexity=2], MethodDescriptor[name=inner,startLine=13,endLine=13,complexity=2]]
unknownScore=null
maxCrap=0.0
thresholdExceeded=false
nearestCoverage=100.0
```

Interpretation:

- Member-class method was collected.
- Constructor, anonymous-class method, and local-class method were omitted.
- Lambda branching contributed to the containing method.
- Missing coverage remained unknown; numeric maximum fell to 0 and passed.
- A missing exact coverage key can fall back to nearest same-class/same-name line without a JVM descriptor.

## Evidence Ledger

| Claim | Evidence | Strength |
| --- | --- | --- |
| Formula is `CC² × (1-coverage)³ + CC`. | Current calculator source and spec | High |
| Current gate fails only above 8.0. | Current CLI/application source | High |
| No numeric score means max 0 and pass. | Current source, spec, and harness | High |
| Coverage uses JaCoCo instruction counters. | Current parser source and JaCoCo docs | High |
| Unknown coverage passing is specified behavior, not proven accidental defect. | Current spec | High |
| CRAP cannot prove authorization, architecture, concurrency, or test-oracle correctness. | Metric inputs and excluded system properties | High as scope analysis |

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
- A missing JaCoCo report is fail-open under the current specification.
- Security, migrations, public contracts, performance, observability, and recovery require separate review.
- The social post's exact wording was not needed for code-derived claims and is not quoted as independently verified.

## Editorial Decisions

- Reframe “do not read code” as risk-based review.
- Recommend automation-heavy review only for low-blast-radius changes with independent tests.
- Preserve human review for high-risk security, money, privacy, data, concurrency, and architecture boundaries.

## Quality Gate Notes

- Runtime limitations are disclosed.
- Source behavior and policy recommendation are separated.
- Article must pass `npm run article:quality` and `npm run validate`.
