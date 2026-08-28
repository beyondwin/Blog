import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const validatorPath = fileURLToPath(new URL('./validate-content.mjs', import.meta.url));
const temporaryRoots = [];

async function fixture(files) {
  const root = await mkdtemp(join(tmpdir(), 'content-contract-'));
  temporaryRoots.push(root);
  for (const [path, source] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, '..'), { recursive: true });
    await writeFile(absolutePath, source);
  }
  return root;
}

const shared = `title: "기록"
description: "공개 설명"
createdAt: "2026-08-13"
updatedAt: "2026-08-13"
tags: []
status: "published"
draft: false`;

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('content validation publication invariants', () => {
  it('rejects an entry whose updatedAt precedes createdAt', async () => {
    const root = await fixture({
      'src/content/articles/reversed.mdx': `---
${shared.replace('updatedAt: "2026-08-13"', 'updatedAt: "2026-08-12"')}
---
본문`,
    });

    await expect(execFileAsync(process.execPath, [validatorPath], { cwd: root })).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('updatedAt must be on or after createdAt'),
    });
  });

  it('rejects published reviews without complete bibliography, verdict, and coherent cover state', async () => {
    const root = await fixture({
      'src/content/reviews/missing-bibliography.mdx': `---
${shared}
itemType: "book"
itemTitle: "책"
coverState: "hold"
---
본문`,
      'src/content/reviews/verified-without-cover.mdx': `---
${shared}
itemType: "book"
itemTitle: "책2"
itemAuthor: "저자"
isbn13: "9788934985068"
publisher: "출판사"
verdict: "판단"
coverState: "verified"
---
본문`,
      'src/content/reviews/hold-with-cover.mdx': `---
${shared}
itemType: "book"
itemTitle: "책3"
itemAuthor: "저자"
isbn13: "9788934985068"
publisher: "출판사"
verdict: "판단"
coverState: "hold"
coverMedia: "cover"
---
본문`,
      'src/content/reviews/invalid-cover-state.mdx': `---
${shared}
itemType: "book"
itemTitle: "책4"
itemAuthor: "저자"
isbn13: "9788934985068"
publisher: "출판사"
verdict: "판단"
coverState: "unknown"
---
본문`,
    });

    await expect(execFileAsync(process.execPath, [validatorPath], { cwd: root })).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('published review requires itemAuthor, isbn13, publisher, verdict, and coverState'),
    });
    await expect(execFileAsync(process.execPath, [validatorPath], { cwd: root })).rejects.toMatchObject({
      stderr: expect.stringContaining('coverState verified requires coverMedia'),
    });
    await expect(execFileAsync(process.execPath, [validatorPath], { cwd: root })).rejects.toMatchObject({
      stderr: expect.stringContaining('coverState hold forbids coverMedia'),
    });
    await expect(execFileAsync(process.execPath, [validatorPath], { cwd: root })).rejects.toMatchObject({
      stderr: expect.stringContaining('coverState Invalid option'),
    });
  });

  it('rejects published travel without privacy review and lead media', async () => {
    const root = await fixture({
      'src/content/travel/public-scene.mdx': `---
${shared}
location: "Seoul"
privacyReviewed: false
---
본문`,
    });

    await expect(execFileAsync(process.execPath, [validatorPath], { cwd: root })).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('published travel requires privacyReviewed true and leadMedia'),
    });
  });

  it('does not impose publication-only fields on review and travel drafts', async () => {
    const draft = shared.replace('status: "published"\ndraft: false', 'status: "review"\ndraft: true');
    const root = await fixture({
      'src/content/reviews/example-review.mdx': `---
${draft}
itemType: "book"
itemTitle: "초안"
---
본문`,
      'src/content/travel/example-travel.mdx': `---
${draft}
location: "Seoul"
---
본문`,
    });

    await expect(execFileAsync(process.execPath, [validatorPath], { cwd: root })).resolves.toMatchObject({
      stdout: expect.stringContaining('Content validation passed'),
    });
  });
});
