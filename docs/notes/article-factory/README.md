# Article Factory

This folder stores internal research packets for source-grounded public
articles.

Use a packet when the article depends on external sources, GitHub inspection,
official documentation, package metadata, release notes, or social discussion.
The packet preserves what was checked, which claims are strong, and what was
left out.

Create a new packet and article draft with:

```bash
npm run article:new -- "LazyCodex" --title "LazyCodex는 Codex를 어떻게 제품형 개발 하네스로 바꾸는가"
```

Default outputs:

- `docs/notes/article-factory/<slug>.md`
- `src/content/articles/<slug>.mdx`

Before publishing, complete the packet's source inventory, local source
inspection, evidence ledger, junior explanation notes, and quality gate notes.
