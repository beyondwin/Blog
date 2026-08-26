# AWS Static Frontend and Serverless BFF Research Packet

Date: 2026-08-26
Status: verified
Target article: `src/content/articles/aws-static-frontend-serverless-bff.mdx`

## Intake

- Supplied report: `/Users/user/Downloads/preview (2).html`
- Previously recorded SHA-256: `323139e2d3d17399ed238f813659d82409e8db0d1fe89cb87758d04c129385c3` (54,511 bytes)
- 2026-08-26 re-check: the intake file was not present. Contents were not reconstructed.
- Question: When is S3/CloudFront plus API Gateway/Lambda BFF a sound boundary for an existing Spring backend?
- Editorial boundary: No exact monthly cost without region, traffic, response-size, duration, and networking inputs. Treat the supplied HTML as an intake artifact; use official docs for published claims.

## Source Inventory

| Source | Type | Verified use |
| --- | --- | --- |
| [Next.js Static Exports](https://nextjs.org/docs/app/guides/static-exports) | Official docs | Version 16.3.3, lastUpdated 2026-08-25. Supported/unsupported runtime features, including `dynamicParams: true`, Intercepting Routes, and `force-static` GET Route Handlers. |
| [Next.js BFF guide](https://nextjs.org/docs/app/guides/backend-for-frontend) | Official docs | Version 16.3.3, lastUpdated 2026-06-25. Backend capabilities are not a full backend replacement. Stronger in `export` mode because request-time Route Handlers, proxy, and rewrites are unsupported. |
| [HTTP API quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html) | Official docs | 30-second integration timeout (cannot be increased), 10 MB payload, 10,240-byte header/request-line limit. Unchanged as of 2026-08-26. |
| [Lambda payload 2.0](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html) | Official docs | Duplicate headers combined with commas; cookies as a separate field; each response cookie becomes a `set-cookie` header. |
| [Disable execute-api endpoint](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-disable-default-endpoint.html) | Official docs | Direct-origin bypass control for the default HTTP API endpoint. |
| [Lambda VPC networking](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html) | Official docs | VPC connectivity and loss of default public-internet access. Connecting a function to a public subnet does not give it internet access. |
| [CloudFront OAC for S3](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html) | Official docs | OAC recommendation and website-endpoint incompatibility. |
| [CloudFront cache behaviors](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html) | Official docs | First-match order and minimum-TTL override of `no-cache` / `no-store` / `private`. |
| [CloudFront flat-rate pricing plans](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html) | Official docs | Feature table used for custom caching rules, custom origin-request rules, and VPC private origins. Free/Pro omit those three; Business+ includes them. |
| [Lambda function URL OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html) | Official docs | PUT/POST require client-computed SHA-256 in `x-amz-content-sha256`. CloudFront origin docs require the function URL to be publicly accessible. |
| [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/) | Official pricing | 2026-08-26 check: Free $0, Pro $15, Business $200, Premium $1,000. Feature rows on the marketing table are image-like; feature claims are taken from the developer-guide table, not invented from the marketing image. PAYG remains an alternative. |
| [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/) | Official pricing | Request and data-transfer pricing model. No invented monthly total. |
| [Lambda pricing](https://aws.amazon.com/lambda/pricing/) | Official pricing | Request and duration pricing model. NAT/VPC extra charges remain out of band. |
| [ReadMates ADR 0001](https://github.com/beyondwin/ReadMates/blob/main/docs/development/adr/0001-cloudflare-pages-functions-bff.md) | Project ADR | Public on 2026-08-26. Accepted 2026-04-21. Project-specific precedent for a stateless browser BFF, not a universal AWS rule. |

## Local Source Inspection

- The supplied HTML was not available on 2026-08-26. Prior inspection notes were not treated as a live primary source.
- ReadMates ADR was reachable as a public GitHub file. Claims stay scoped to that project: Vite SPA + Pages Functions same origin; BFF forwards cookies and injects internal secret; Spring owns auth, domain, and DB.
- CloudFront marketing pricing page still lists Pro at $15/month. The feature-availability claims in the article come from the official flat-rate plan table, because the marketing feature matrix is not a reliable text source.

## Evidence Ledger

| Claim | Evidence | Strength |
| --- | --- | --- |
| Static export excludes request-time cookies, ISR, Server Actions, redirects/headers/proxy, Intercepting Routes, `dynamicParams: true` routes, and dynamic routes without `generateStaticParams`. Route Handlers need `dynamic = 'force-static'` GET. | Next.js static-export docs, version 16.3.3, lastUpdated 2026-08-25 | High |
| Next.js backend capabilities are not a full backend replacement; static export removes request-time Route Handlers, proxy, and rewrites. | Next.js BFF guide, 2026-08-26 re-read | High |
| API Gateway HTTP API is unsuitable for integrations longer than 30 seconds; the timeout cannot be increased. Payload limit remains 10 MB. | AWS HTTP API quota documentation, 2026-08-26 | High |
| CloudFront behavior order is security-relevant because first match wins. Minimum TTL greater than 0 can override `no-cache` / `no-store` / `private`. | AWS cache-behavior docs | High |
| OAC requires a normal S3 bucket origin, not an S3 website endpoint. | AWS OAC docs | High |
| VPC-attached Lambda needs explicit networking for public internet. A public subnet does not restore internet access. | AWS Lambda VPC docs | High |
| Flat-rate Free and Pro do not include custom caching rules, custom origin-request rules, or VPC private origins. Pro is listed at $15/month. | CloudFront flat-rate plan docs + pricing page, checked 2026-08-26 | High, time-sensitive |
| Lambda Function URL + CloudFront OAC is a poor default for a browser BFF because PUT/POST need a client SHA-256 header and the function URL origin must be publicly accessible. | CloudFront Lambda function URL OAC docs, 2026-08-26 | High |
| ReadMates keeps auth/domain/DB in Spring and its BFF stateless. | Accepted project ADR dated 2026-04-21, public as of 2026-08-26 | High for ReadMates only |

## Blind Spots and Threat Model

- CloudFront-only routing is bypassable unless the API's default endpoint/origin is restricted.
- Same-origin cookie routing reduces CORS work but does not eliminate CSRF.
- SPA error fallback must not rewrite API 401/404 responses to `200 index.html`.
- Lambda concurrency can overload a single downstream EC2.
- A single Spring EC2 remains an availability and rollout single point of failure.
- NAT Gateway, CloudWatch, WAF, Route 53, data transfer, and invalidation can dominate a low-traffic cost model.
- Large uploads should use presigned S3; long AI/streaming tasks need asynchronous or dedicated channels.
- Static deploy order should upload hashed assets before HTML and retain previous assets briefly.
- CloudFront Free/Pro can still host multiple cache behaviors (5/10). The gap is custom cache and origin-request policies, not the existence of an `/api/*` path.
- The local intake HTML is missing; no report-only claims were added from memory.

## Editorial Decisions

- Recommend the architecture conditionally, not as an AWS default.
- Choose Vite versus Next.js from runtime needs rather than ecosystem preference.
- Treat BFF as a narrow protocol/security adapter; it must not own database or domain behavior.
- Keep ReadMates as project-specific precedent. Do not generalize Cloudflare Pages Functions constraints into AWS rules.
- Date CloudFront plan prices and feature availability to 2026-08-26. Do not invent a monthly total.
- Require an origin-bypass, cookie/header, error, timeout, and VPC connectivity test before expansion.
- Local published after verification.

## Quality Gate Notes

- All limits and plan capabilities are sourced to official pages re-read on 2026-08-26.
- Pricing is described as a model, not an invented monthly total. Time-sensitive CloudFront plan numbers are dated.
- ReadMates evidence is identified as project-specific. The ADR was public; no internals were invented beyond the accepted ADR text.
- Local intake path is omitted from the public article because the file is not a publishable primary source and was missing at re-check.
- Article must pass `node scripts/validate-content.mjs` and `npm run article:quality` before the published route check.
