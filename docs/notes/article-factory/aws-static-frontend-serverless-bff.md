# AWS Static Frontend and Serverless BFF Research Packet

Date: 2026-07-26
Status: verified
Target article: `src/content/articles/aws-static-frontend-serverless-bff.mdx`

## Intake

- Supplied report: `/Users/kws/Downloads/preview (2).html`
- Intake SHA-256: `323139e2d3d17399ed238f813659d82409e8db0d1fe89cb87758d04c129385c3` (54,511 bytes)
- Question: When is S3/CloudFront plus API Gateway/Lambda BFF a sound boundary for an existing Spring backend?
- Editorial boundary: No exact monthly cost without region, traffic, response-size, duration, and networking inputs.

## Source Inventory

| Source | Verified use |
| --- | --- |
| [Next.js Static Exports](https://nextjs.org/docs/app/guides/static-exports) | Current supported/unsupported runtime features |
| [Next.js BFF guide](https://nextjs.org/docs/app/guides/backend-for-frontend) | Backend capabilities are not a full backend replacement |
| [HTTP API quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html) | 30-second integration timeout, 10 MB payload, 10,240-byte header/request-line limit |
| [Lambda payload 2.0](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html) | Cookie and repeated-header representation |
| [Disable execute-api endpoint](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-disable-default-endpoint.html) | Direct-origin bypass control |
| [Lambda VPC networking](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html) | VPC connectivity and loss of default public-internet access |
| [CloudFront OAC for S3](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html) | OAC recommendation and website-endpoint incompatibility |
| [CloudFront cache behaviors](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html) | First-match order and minimum-TTL risk |
| [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/) | Current flat-plan prices, allowances, and feature tiers |
| [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/) | Request/data pricing model |
| [Lambda pricing](https://aws.amazon.com/lambda/pricing/) | Request and duration pricing model |
| [ReadMates ADR 0001](https://github.com/beyondwin/ReadMates/blob/main/docs/development/adr/0001-cloudflare-pages-functions-bff.md) | Project-specific precedent for a stateless browser BFF |

## Evidence Ledger

| Claim | Evidence | Strength |
| --- | --- | --- |
| Static export excludes request-time cookies, ISR, Server Actions, redirects/headers, and several dynamic-route cases. | Next.js current docs, version 16.2.11, updated 2026-07-22 | High |
| API Gateway HTTP API is unsuitable for integrations longer than 30 seconds. | AWS quota documentation | High |
| CloudFront behavior order is security-relevant because first match wins. | AWS cache-behavior docs | High |
| OAC requires a normal S3 bucket origin, not an S3 website endpoint. | AWS OAC docs | High |
| VPC-attached Lambda needs explicit networking for public internet. | AWS Lambda docs | High |
| Flat Pro does not list custom caching/origin-request rules or VPC private origins. | Current CloudFront pricing feature table | High, time-sensitive |
| ReadMates keeps auth/domain/DB in Spring and its BFF stateless. | Accepted project ADR dated 2026-04-21 | High for ReadMates only |

## Blind Spots and Threat Model

- CloudFront-only routing is bypassable unless the API's default endpoint/origin is restricted.
- Same-origin cookie routing reduces CORS work but does not eliminate CSRF.
- SPA error fallback must not rewrite API 401/404 responses to `200 index.html`.
- Lambda concurrency can overload a single downstream EC2.
- A single Spring EC2 remains an availability and rollout single point of failure.
- NAT Gateway, CloudWatch, WAF, Route 53, data transfer, and invalidation can dominate a low-traffic cost model.
- Large uploads should use presigned S3; long AI/streaming tasks need asynchronous or dedicated channels.
- Static deploy order should upload hashed assets before HTML and retain previous assets briefly.

## Editorial Decisions

- Recommend the architecture conditionally, not as an AWS default.
- Choose Vite versus Next.js from runtime needs rather than ecosystem preference.
- Treat BFF as a narrow protocol/security adapter; it must not own database or domain behavior.
- Require an origin-bypass, cookie/header, error, timeout, and VPC connectivity test before expansion.

## Quality Gate Notes

- All limits and plan capabilities are sourced to current official pages.
- Pricing is described as a model, not an invented monthly total.
- ReadMates evidence is identified as project-specific.
- Article must pass `npm run article:quality` and `npm run validate`.
