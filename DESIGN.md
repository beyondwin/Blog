# Design

## Design System Overview

`beyondwin` is a Paper Command Journal: a technical article index on a white paper canvas, built from black ink, graphite metadata, hairline separators, and one cyan-blue signal accent. It should feel closer to a focused developer publication than to an AI SaaS landing page.

Mood phrase: paper-white technical journal, command-line precision, editorial restraint.

## Color

Use OKLCH tokens only in authored CSS.

- Page canvas is white paper: `--bg` and `--surface` stay white.
- Primary text is black or near-black ink.
- Secondary text is neutral graphite.
- Separators are very light gray hairlines.
- Use one cyan-blue action/signal accent for links, selected labels, focus, and the brand mark.
- Do not use purple-blue AI gradients, multiple accent colors, heavy shadows, glass blur panels, or large tinted decorative backgrounds.

## Typography

Use system and locally safe fonts for Korean coverage and performance:

- Sans/display/body: `ui-sans-serif`, `Apple SD Gothic Neo`, `Noto Sans KR`, `Pretendard`, system UI.
- Mono/code: `ui-monospace`, SFMono-Regular, Menlo, Consolas.
- Serif should not drive the redesign; keep it only where an existing long-form surface already benefits from it.

Rules:

- Use weight, scale, and whitespace before color for hierarchy.
- Keep letter spacing at `0` for Korean body and headings.
- Keep reading measure around 64-72ch.
- Keep collection and card headings compact enough for long Korean and English technical titles.

## Layout

- Shell width: 1200px max with responsive gutters.
- Home page: masthead, featured technical article, start-here list, lane index, topic rack, then latest row index.
- Collection pages: compact title, description, count where available, and scan-friendly row lists.
- Detail pages: centered article body with optional metadata side panels for review and analysis.
- Use hairlines and whitespace for separation instead of heavy cards, shadows, gradients, or glass.
- Use row previews for text-heavy article collections.

## Components

- `SiteHeader`: sticky editorial header with brand, small CSS-only mark, and primary lane navigation.
- `ContentCard`: reusable row preview with type, date, title, description, tags, and a quiet read affordance.
- `StatusBadge`: compact semantic label using the single cyan-blue signal accent.
- `Callout`: prose-level note component that stays flat and border-defined.
- Article layouts: shared prose shell with collection-specific metadata.
- Category/landing sections: plain section bands, row lists, and topic racks, not nested cards.

## Motion

Use light transition on hover/focus for links and rows. Do not hide content behind animation. Respect `prefers-reduced-motion`.

## Content Model

Keep route and content model unchanged.

Public writing lanes:

- `articles`: development articles and technical essays.
- `reviews`: book, course, article, tool, and media reviews.
- `ideas`: short product, engineering, and personal idea notes.
- `travel`: travel essays and place notes.
- `analysis`: source-grounded generated or assisted analysis.
- `memory`: public projection of the private memory system.

Each lane must have a stable route, empty state, and reusable MDX frontmatter.
