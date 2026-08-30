import { createHash } from 'node:crypto';
import {
  link,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import {
  publicAnswerEvidenceSchema,
  type PublicAnswerChunk,
  type PublicAnswerCorpusApproval,
  type PublicAnswerEvidence,
} from '@beyondwin/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  buildPublicAnswerRelease,
  cleanupOwnedAnswerTemporaryRoot,
  createOwnedAnswerTemporaryRoot,
} from '../src/answer-release/build-answer-release';
import { canonicalJsonLine, sha256Checksum, sha256Hex } from '../src/answer-release/identity';
import {
  readActiveAnswerRelease,
  verifyAnswerReleaseDirectory,
} from '../src/answer-release/read-answer-release';
import {
  canonicalCompactJson,
  canonicalPrettyJson,
  createAnswerReleaseFixture,
  evidenceForChunk,
  readAnswerManifest,
  rechunk,
  rehashAnswerRelease,
  writeAnswerReleaseFixture,
  writeCanonicalNdjson,
  writeProjection,
  type BuiltAnswerReleaseFixture,
} from './helpers/answer-release-fixture';

const fileRace = vi.hoisted(() => ({
  afterOpen: undefined as undefined | ((path: string) => Promise<boolean>),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      const hook = fileRace.afterOpen;
      if (hook && await hook(String(args[0]))) fileRace.afterOpen = undefined;
      return handle;
    },
  };
});

async function expectBothReject(
  fixture: BuiltAnswerReleaseFixture,
  releasePath = fixture.releasePath,
  approval: PublicAnswerCorpusApproval = fixture.approval,
): Promise<void> {
  await expect(verifyAnswerReleaseDirectory(releasePath, fixture.contentRelease, approval)).rejects.toThrow();
  await expect(readActiveAnswerRelease(
    fixture.answerReleasesRoot,
    fixture.contentRelease,
    approval,
  )).rejects.toThrow();
}

async function rows<T>(path: string): Promise<T[]> {
  const bytes = await readFile(path, 'utf8');
  return bytes === '' ? [] : bytes.trimEnd().split('\n').map((line) => JSON.parse(line) as T);
}

async function rewriteManifest(
  releasePath: string,
  mutate: (manifest: Awaited<ReturnType<typeof readAnswerManifest>>) => void,
): Promise<void> {
  const manifest = await readAnswerManifest(releasePath);
  mutate(manifest);
  await writeFile(join(releasePath, 'manifest.json'), canonicalPrettyJson(manifest));
}

function reidentifyEvidence(item: PublicAnswerEvidence): PublicAnswerEvidence {
  const excerptChecksum = sha256Checksum(item.excerpt);
  return {
    ...item,
    excerptChecksum,
    evidenceId: sha256Hex(canonicalJsonLine({
      version: 'public-blocks-v1',
      chunkId: item.chunkId,
      start: 0,
      end: Array.from(item.excerpt).length,
      excerptChecksum,
    })),
  };
}

describe('public answer release filesystem and canonical boundary', { timeout: 30_000 }, () => {
  it('rejects release-file and active-pointer symlinks', async () => {
    const chunksFixture = await writeAnswerReleaseFixture();
    const externalChunks = join(chunksFixture.sandbox, 'external-chunks.ndjson');
    await writeFile(externalChunks, await readFile(join(chunksFixture.releasePath, 'chunks.ndjson')));
    await rm(join(chunksFixture.releasePath, 'chunks.ndjson'));
    await symlink(externalChunks, join(chunksFixture.releasePath, 'chunks.ndjson'));
    await expectBothReject(chunksFixture);

    const pointerFixture = await writeAnswerReleaseFixture();
    const externalPointer = join(pointerFixture.sandbox, 'external-active.json');
    await writeFile(externalPointer, await readFile(join(pointerFixture.answerReleasesRoot, 'active.json')));
    await rm(join(pointerFixture.answerReleasesRoot, 'active.json'));
    await symlink(externalPointer, join(pointerFixture.answerReleasesRoot, 'active.json'));
    await expect(readActiveAnswerRelease(
      pointerFixture.answerReleasesRoot,
      pointerFixture.contentRelease,
      pointerFixture.approval,
    )).rejects.toThrow(/symbolic|link|nofollow|containment/i);
  });

  it('rejects a release directory symlink and an active pointer containment escape', async () => {
    const linked = await writeAnswerReleaseFixture();
    const alias = join(linked.sandbox, 'release-alias');
    await symlink(linked.releasePath, alias, 'dir');
    await expect(verifyAnswerReleaseDirectory(alias, linked.contentRelease, linked.approval))
      .rejects.toThrow(/symbolic|directory|containment/i);

    const escaped = await writeAnswerReleaseFixture();
    const pointer = JSON.parse(await readFile(join(escaped.answerReleasesRoot, 'active.json'), 'utf8')) as {
      path: string;
    };
    pointer.path = `../${escaped.contentRelease.manifest.releaseId}/${escaped.answerReleaseId}`;
    await writeFile(join(escaped.answerReleasesRoot, 'active.json'), canonicalPrettyJson(pointer));
    await expect(readActiveAnswerRelease(
      escaped.answerReleasesRoot,
      escaped.contentRelease,
      escaped.approval,
    )).rejects.toThrow(/path|escape|invalid/i);
  });

  it('rejects a symlinked content-ID ancestor even when the final release directory is real', async () => {
    const fixture = await writeAnswerReleaseFixture();
    const contentDirectory = join(fixture.answerReleasesRoot, fixture.contentRelease.manifest.releaseId);
    const displaced = join(fixture.sandbox, 'displaced-content-directory');
    await rename(contentDirectory, displaced);
    await symlink(displaced, contentDirectory, 'dir');

    await expect(verifyAnswerReleaseDirectory(
      join(contentDirectory, fixture.answerReleaseId),
      fixture.contentRelease,
      fixture.approval,
    )).rejects.toThrow(/symbolic|containment|directory/i);
    await expect(readActiveAnswerRelease(
      fixture.answerReleasesRoot,
      fixture.contentRelease,
      fixture.approval,
    )).rejects.toThrow(/symbolic|containment|directory/i);
  });

  it.each([
    ['unexpected file', async (fixture: BuiltAnswerReleaseFixture) => writeFile(join(fixture.releasePath, 'unexpected.json'), '{}\n')],
    ['missing file', async (fixture: BuiltAnswerReleaseFixture) => rm(join(fixture.releasePath, 'evidence.ndjson'))],
    ['altered bytes', async (fixture: BuiltAnswerReleaseFixture) => writeFile(join(fixture.releasePath, 'chunks.ndjson'), '{}\n')],
    ['descriptor bytes', async (fixture: BuiltAnswerReleaseFixture) => rewriteManifest(fixture.releasePath, (manifest) => { manifest.files.chunks.bytes += 1; })],
    ['descriptor checksum', async (fixture: BuiltAnswerReleaseFixture) => rewriteManifest(fixture.releasePath, (manifest) => { manifest.files.chunks.checksum = `sha256:${'f'.repeat(64)}`; })],
    ['descriptor row count', async (fixture: BuiltAnswerReleaseFixture) => rewriteManifest(fixture.releasePath, (manifest) => { manifest.files.chunks.count += 1; })],
  ] as const)('rejects %s without returning a verified value', async (_case, mutate) => {
    const fixture = await writeAnswerReleaseFixture();
    await mutate(fixture);
    await expectBothReject(fixture);
  });

  it('rejects non-canonical order and duplicate IDs even when descriptors and release ID are rehashed', async () => {
    const reversed = await writeAnswerReleaseFixture({ prose: 'First public block.\n\nSecond public block.' });
    const reversedChunks = (await rows<PublicAnswerChunk>(join(reversed.releasePath, 'chunks.ndjson'))).reverse();
    await writeCanonicalNdjson(join(reversed.releasePath, 'chunks.ndjson'), reversedChunks);
    const reversedPath = await rehashAnswerRelease(reversed.releasePath);
    await expectBothReject(reversed, reversedPath);

    const duplicated = await writeAnswerReleaseFixture();
    const chunks = await rows<PublicAnswerChunk>(join(duplicated.releasePath, 'chunks.ndjson'));
    await writeCanonicalNdjson(join(duplicated.releasePath, 'chunks.ndjson'), [chunks[0]!, chunks[0]!]);
    const duplicatePath = await rehashAnswerRelease(duplicated.releasePath);
    await expectBothReject(duplicated, duplicatePath);
  });

  it.each(['contentReleaseId', 'contentManifestHash', 'contentArtifactHash'] as const)(
    'rejects a fully rehashed identity with a forged %s',
    async (field) => {
      const fixture = await writeAnswerReleaseFixture();
      await rewriteManifest(fixture.releasePath, (manifest) => {
        manifest.identity[field] = field === 'contentReleaseId'
          ? 'e'.repeat(64)
          : `sha256:${'e'.repeat(64)}`;
      });
      const forgedPath = await rehashAnswerRelease(fixture.releasePath);
      await expectBothReject(fixture, forgedPath);
    },
  );

  it('requires the independently supplied approval receipt rather than a manifest self-claim', async () => {
    const fixture = await writeAnswerReleaseFixture({ secondRecord: true });
    const reversed: PublicAnswerCorpusApproval = {
      schemaVersion: 1,
      entries: [...fixture.approval.entries].reverse(),
    };
    const missing: PublicAnswerCorpusApproval = {
      schemaVersion: 1,
      entries: [{ recordId: 'thoughts/missing-record', recordChecksum: `sha256:${'a'.repeat(64)}` }],
    };
    const drifted: PublicAnswerCorpusApproval = {
      schemaVersion: 1,
      entries: [{ ...fixture.approval.entries[0]!, recordChecksum: `sha256:${'b'.repeat(64)}` }],
    };
    for (const approval of [reversed, missing, drifted]) await expectBothReject(fixture, fixture.releasePath, approval);

    const selfClaim = await writeAnswerReleaseFixture();
    const forgedApproval: PublicAnswerCorpusApproval = {
      schemaVersion: 1,
      entries: [{ recordId: 'articles/unlisted-record', recordChecksum: `sha256:${'c'.repeat(64)}` }],
    };
    await rewriteManifest(selfClaim.releasePath, (manifest) => {
      manifest.identity.corpusApprovalHash = sha256Checksum(canonicalJsonLine(forgedApproval));
    });
    const forgedPath = await rehashAnswerRelease(selfClaim.releasePath);
    await expectBothReject(selfClaim, forgedPath, selfClaim.approval);
  });

  it.each([
    ['privatePath', '/Users/example/private.md'],
    ['rawPrompt', 'private instruction'],
    ['embedding', [0.1, -0.2]],
    ['bodyHtml', '<p>private</p>'],
    ['markdown', '[private](https://example.com)'],
    ['status', 'published'],
    ['draft', false],
    ['includeInAnswers', true],
    ['provider', 'private-provider'],
    ['providerOutput', 'private output'],
    ['vector', [0.1]],
  ] as const)('rejects the structural field %s', async (field, value) => {
    const fixture = await writeAnswerReleaseFixture();
    const chunks = await rows<Record<string, unknown>>(join(fixture.releasePath, 'chunks.ndjson'));
    chunks[0]![field] = value;
    await writeCanonicalNdjson(join(fixture.releasePath, 'chunks.ndjson'), chunks);
    const forgedPath = await rehashAnswerRelease(fixture.releasePath);
    await expectBothReject(fixture, forgedPath);
  });

  it.each([
    ['private locator', 'memory/thoughts/secret.md'],
    ['serialized raw prompt', '{"rawPrompt":"private"}'],
    ['serialized vector', '{"embedding":[0.1]}'],
    ['HTML', '<strong>private</strong>'],
    ['Markdown', '[private](https://example.com)'],
    ['inline Markdown', '`private code`'],
  ] as const)('rejects %s hidden in a string value', async (_case, value) => {
    const fixture = await writeAnswerReleaseFixture();
    const chunks = await rows<PublicAnswerChunk>(join(fixture.releasePath, 'chunks.ndjson'));
    chunks[0] = { ...chunks[0]!, text: value };
    await writeCanonicalNdjson(join(fixture.releasePath, 'chunks.ndjson'), chunks);
    const forgedPath = await rehashAnswerRelease(fixture.releasePath);
    await expectBothReject(fixture, forgedPath);
  });

  it.each([
    ['asterisk emphasis', '\\*private\\*'],
    ['underscore emphasis', '\\_private\\_'],
    ['strikethrough', '\\~\\~private\\~\\~'],
    ['horizontal rule', '&#45;&#45;&#45;'],
    ['HTML comment', '&lt;!-- private --&gt;'],
  ] as const)('rejects approved public prose that materializes literal %s markup', async (_case, prose) => {
    const fixture = await createAnswerReleaseFixture({ prose });

    await expect(buildPublicAnswerRelease({
      contentRelease: fixture.contentRelease,
      approval: fixture.approval,
      answerReleasesRoot: fixture.answerReleasesRoot,
    })).rejects.toThrow(/markup|HTML|Markdown|boundary/i);
  });

  it.each([
    'Public prose uses version 1.2 — scope_provider safely.',
    'Public math says 3 * 4 and snake_case remains plain.',
    'The sequence x---y is punctuation inside a token.',
  ])('preserves legitimate punctuation in approved public prose: %s', async (prose) => {
    const fixture = await createAnswerReleaseFixture({ prose });

    await expect(buildPublicAnswerRelease({
      contentRelease: fixture.contentRelease,
      approval: fixture.approval,
      answerReleasesRoot: fixture.answerReleasesRoot,
    })).resolves.toMatchObject({ answerReleaseId: expect.stringMatching(/^[a-f0-9]{64}$/u) });
  });

  it.each([
    ['multiline asterisk emphasis', '*multi\nline*'],
    ['multiline underscore emphasis', '_multi\nline_'],
    ['four-space indented code', 'Public\n    private'],
    ['five-space indented code', 'Public\n     private'],
    ['tab-indented code', 'Public\n\tprivate'],
    ['space-tab indented code', 'Public\n  \tprivate'],
    ['empty ATX heading', '#'],
    ['CRLF empty ATX heading', '#\r\nPublic'],
    ['multiline code span', '`multi\nline`'],
    ['multiline strong emphasis', '**multi\nline**'],
    ['multiline strikethrough', '~~multi\nline~~'],
    ['setext heading', 'Heading\n==='],
    ['ordered list', 'Public\n1. private'],
    ['empty unordered list item', 'Public\n-'],
    ['task list', 'Public\n- [ ] private'],
    ['fenced code block', 'Public\n```text\nprivate\n```'],
    ['reference definition', 'Public\n[private]: https://example.com'],
    ['GFM table delimiter', 'Public\n| --- | --- |'],
    ['hard line break', 'Public  \nprivate'],
    ['HTML CDATA section', '<![CDATA[private]]>'],
  ] as const)('rejects approved public title containing %s', async (_case, title) => {
    const fixture = await createAnswerReleaseFixture({ title });

    await expect(buildPublicAnswerRelease({
      contentRelease: fixture.contentRelease,
      approval: fixture.approval,
      answerReleasesRoot: fixture.answerReleasesRoot,
    })).rejects.toThrow(/markup|HTML|Markdown|boundary/i);
  });

  it.each([
    'C# is a language, not an empty heading.',
    'Public\n  continuation with two-space indentation.',
    'An unmatched ` character is plain punctuation.',
    'A * B and under_score remain literal prose.',
    `Public path ends with two slashes \\\\
next.`,
  ])('preserves adjacent plain title punctuation: %s', async (title) => {
    const fixture = await createAnswerReleaseFixture({ title });

    await expect(buildPublicAnswerRelease({
      contentRelease: fixture.contentRelease,
      approval: fixture.approval,
      answerReleasesRoot: fixture.answerReleasesRoot,
    })).resolves.toMatchObject({ answerReleaseId: expect.stringMatching(/^[a-f0-9]{64}$/u) });
  });

  it('allows private-looking vocabulary only as dynamic lexical terms produced from safe public prose', async () => {
    const fixture = await writeAnswerReleaseFixture({
      prose: 'Embedding provider vector scope are ordinary public technical terms.',
    });

    expect(Object.keys(fixture.active.lexicalIndex.postings)).toEqual(expect.arrayContaining([
      'embedding', 'provider', 'vector', 'scope',
    ]));
    expect(fixture.active.privateBoundaryHits).toEqual([]);
  });

  it('rejects a file hard link and detects an inode replacement after no-follow open', async () => {
    const hardLinked = await writeAnswerReleaseFixture();
    await link(join(hardLinked.releasePath, 'chunks.ndjson'), join(hardLinked.sandbox, 'linked-chunks.ndjson'));
    await expectBothReject(hardLinked);

    const raced = await writeAnswerReleaseFixture();
    const chunksPath = join(raced.releasePath, 'chunks.ndjson');
    fileRace.afterOpen = async (path) => {
      if (path !== chunksPath) return false;
      await rename(chunksPath, `${chunksPath}.displaced`);
      await writeFile(chunksPath, '{}\n');
      return true;
    };
    try {
      await expect(verifyAnswerReleaseDirectory(raced.releasePath, raced.contentRelease, raced.approval))
        .rejects.toThrow(/inode|changed|regular|canonical/i);
      expect(fileRace.afterOpen).toBeUndefined();
    } finally {
      fileRace.afterOpen = undefined;
    }
  });

  it('detects an active pointer inode replacement after no-follow open', async () => {
    const fixture = await writeAnswerReleaseFixture();
    const activePath = join(fixture.answerReleasesRoot, 'active.json');
    fileRace.afterOpen = async (path) => {
      if (path !== activePath) return false;
      await rename(activePath, `${activePath}.displaced`);
      await writeFile(activePath, '{}\n');
      return true;
    };
    try {
      await expect(readActiveAnswerRelease(
        fixture.answerReleasesRoot,
        fixture.contentRelease,
        fixture.approval,
      )).rejects.toThrow(/inode|changed|canonical|schema|regular|single-link/i);
      expect(fileRace.afterOpen).toBeUndefined();
    } finally {
      fileRace.afterOpen = undefined;
    }
  });

  it('rejects a symlinked active pointer temporary path without touching its target', async () => {
    const fixture = await writeAnswerReleaseFixture();
    const sentinel = join(fixture.sandbox, 'active-pointer-sentinel.json');
    await writeFile(sentinel, 'sentinel\n');
    await symlink(sentinel, join(fixture.answerReleasesRoot, 'active.json.tmp'));

    await expect(buildPublicAnswerRelease({
      contentRelease: fixture.contentRelease,
      approval: fixture.approval,
      answerReleasesRoot: fixture.answerReleasesRoot,
    })).rejects.toThrow(/temporary|symbolic|link/i);
    expect(await readFile(sentinel, 'utf8')).toBe('sentinel\n');
  });

  it('limits recursive cleanup to an unforgeable owner-created temporary-root capability', async () => {
    const fixture = await writeAnswerReleaseFixture();
    const owned = await createOwnedAnswerTemporaryRoot(fixture.answerReleasesRoot);
    await writeFile(join(owned.path, 'scratch.txt'), 'temporary\n');

    await expect(cleanupOwnedAnswerTemporaryRoot({ path: owned.path })).rejects.toThrow(/owned|capability|temporary/i);
    for (const path of [fixture.answerReleasesRoot, fixture.releasePath, fixture.sandbox]) {
      await expect(cleanupOwnedAnswerTemporaryRoot({ path })).rejects.toThrow(/owned|capability|temporary/i);
    }
    await cleanupOwnedAnswerTemporaryRoot(owned);
    await expect(readFile(join(owned.path, 'scratch.txt'))).rejects.toThrow();
    await expect(cleanupOwnedAnswerTemporaryRoot(owned)).rejects.toThrow(/owned|capability|temporary/i);
  });

  it('checks current-user ownership for release roots and files', async () => {
    const fixture = await writeAnswerReleaseFixture();
    if (typeof process.getuid !== 'function') return;
    const actualUid = process.getuid();
    const spy = vi.spyOn(process, 'getuid').mockReturnValue(actualUid + 1);
    try {
      await expectBothReject(fixture);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('authority-backed semantic re-derivation', { timeout: 30_000 }, () => {
  it('rejects safe-looking replacement text after every dependent artifact and ID is rehashed', async () => {
    const fixture = await writeAnswerReleaseFixture();
    const chunks = await rows<PublicAnswerChunk>(join(fixture.releasePath, 'chunks.ndjson'));
    chunks[0] = rechunk({ text: 'A forged but safe public sentence.' }, chunks[0]!);
    await writeProjection(fixture.releasePath, chunks);
    const forgedPath = await rehashAnswerRelease(fixture.releasePath);
    await expectBothReject(fixture, forgedPath);
  });

  it.each(['checksum', 'chunkId'] as const)('rejects a parseable chunk %s mutation', async (field) => {
    const fixture = await writeAnswerReleaseFixture();
    const chunks = await rows<PublicAnswerChunk>(join(fixture.releasePath, 'chunks.ndjson'));
    chunks[0] = { ...chunks[0]!, [field]: field === 'checksum' ? `sha256:${'e'.repeat(64)}` : 'e'.repeat(64) };
    await writeCanonicalNdjson(join(fixture.releasePath, 'chunks.ndjson'), chunks);
    const forgedPath = await rehashAnswerRelease(fixture.releasePath);
    await expectBothReject(fixture, forgedPath);
  });

  it.each([
    ['collection', { collection: 'thoughts', recordId: 'thoughts/public-fixture', canonicalPath: '/thoughts/public-fixture/' }],
    ['canonicalPath', { canonicalPath: '/articles/forged-path/' }],
    ['title', { title: 'Forged public title' }],
  ] as const)('rejects a fully rehashed chunk %s forgery', async (_case, overrides) => {
    const fixture = await writeAnswerReleaseFixture();
    const chunks = await rows<PublicAnswerChunk>(join(fixture.releasePath, 'chunks.ndjson'));
    chunks[0] = rechunk(overrides as Partial<PublicAnswerChunk>, chunks[0]!);
    await writeProjection(fixture.releasePath, chunks);
    const forgedPath = await rehashAnswerRelease(fixture.releasePath);
    await expectBothReject(fixture, forgedPath);
  });

  it.each([
    ['recordId', (item: PublicAnswerEvidence) => ({ ...item, recordId: 'thoughts/forged-record' })],
    ['collectionLabel', (item: PublicAnswerEvidence) => ({ ...item, collectionLabel: '위조 모음' })],
    ['recordTitle', (item: PublicAnswerEvidence) => ({ ...item, recordTitle: '위조 제목' })],
    ['canonicalPath', (item: PublicAnswerEvidence) => ({ ...item, canonicalPath: '/thoughts/forged-record/' })],
    ['locator kind', (item: PublicAnswerEvidence) => ({ ...item, locator: { ...item.locator, kind: 'evidence-page' as const } })],
    ['locator label', (item: PublicAnswerEvidence) => ({ ...item, locator: { ...item.locator, label: '위조 위치' } })],
    ['locator ordinal', (item: PublicAnswerEvidence) => ({ ...item, locator: { ...item.locator, ordinal: item.locator.ordinal + 1 } })],
    ['excerpt', (item: PublicAnswerEvidence) => ({ ...item, excerpt: '위조되었지만 안전해 보이는 발췌입니다.' })],
  ] as const)('rejects a fully rehashed evidence %s forgery', async (_case, mutate) => {
    const fixture = await writeAnswerReleaseFixture();
    const chunks = await rows<PublicAnswerChunk>(join(fixture.releasePath, 'chunks.ndjson'));
    const evidence = chunks.map(evidenceForChunk);
    evidence[0] = reidentifyEvidence(mutate(evidence[0]!));
    await writeProjection(fixture.releasePath, chunks, evidence);
    const forgedPath = await rehashAnswerRelease(fixture.releasePath);
    await expectBothReject(fixture, forgedPath);
  });

  it('rejects a fully rehashed evidence excerpt checksum forgery', async () => {
    const fixture = await writeAnswerReleaseFixture();
    const chunks = await rows<PublicAnswerChunk>(join(fixture.releasePath, 'chunks.ndjson'));
    const evidence = chunks.map(evidenceForChunk);
    const originalEvidenceId = evidence[0]!.evidenceId;
    const excerptChecksum = `sha256:${'f'.repeat(64)}`;
    const evidenceIdentityBytes = canonicalCompactJson({
      end: Array.from(evidence[0]!.excerpt).length,
      excerptChecksum,
      chunkId: evidence[0]!.chunkId,
      start: 0,
      version: 'public-blocks-v1',
    });
    const independentlyDerivedEvidenceId = createHash('sha256')
      .update(evidenceIdentityBytes)
      .digest('hex');
    evidence[0] = publicAnswerEvidenceSchema.parse({
      ...evidence[0]!,
      excerptChecksum,
      evidenceId: independentlyDerivedEvidenceId,
    });
    expect(evidenceIdentityBytes).toBe(JSON.stringify({
      chunkId: evidence[0]!.chunkId,
      end: Array.from(evidence[0]!.excerpt).length,
      excerptChecksum,
      start: 0,
      version: 'public-blocks-v1',
    }));
    expect(evidence[0]!.evidenceId).toBe(independentlyDerivedEvidenceId);
    expect(evidence[0]!.evidenceId).not.toBe(originalEvidenceId);
    await writeProjection(fixture.releasePath, chunks, evidence);
    const forgedPath = await rehashAnswerRelease(fixture.releasePath);
    await expect(verifyAnswerReleaseDirectory(forgedPath, fixture.contentRelease, fixture.approval))
      .rejects.toThrow(/evidence\.ndjson.*authority-derived canonical artifact/i);
    await expect(readActiveAnswerRelease(
      fixture.answerReleasesRoot,
      fixture.contentRelease,
      fixture.approval,
    )).rejects.toThrow(/evidence\.ndjson.*authority-derived canonical artifact/i);
  });

  it('rejects answer-only rows whether the fully rehashed manifest falsely reports zero or explicitly reports nonzero', async () => {
    for (const explicitCount of [false, true]) {
      const fixture = await writeAnswerReleaseFixture();
      const evidencePathId = 'd'.repeat(64);
      const base = fixture.active.chunks[0]!;
      const answerOnly = rechunk({
        chunkId: undefined,
        recordId: 'answer-only/forged-capsule',
        collection: 'answer-only',
        canonicalPath: `/evidence/${evidencePathId}/`,
        title: 'Forged capsule',
        headingPath: [],
        ordinal: 1,
        text: 'Forged answer-only material.',
      }, base);
      await writeProjection(fixture.releasePath, [...fixture.active.chunks, answerOnly]);
      let forgedPath = await rehashAnswerRelease(fixture.releasePath);
      if (explicitCount) {
        await rewriteManifest(forgedPath, (manifest) => {
          (manifest.counts as { answerOnly: number }).answerOnly = 1;
        });
      }
      await expectBothReject(fixture, forgedPath);
    }
  });

  it('rejects 257 fully rehashed chunks for one approved record', async () => {
    const fixture = await writeAnswerReleaseFixture();
    const base = fixture.active.chunks[0]!;
    const chunks = Array.from({ length: 257 }, (_, index) => rechunk({
      chunkId: undefined,
      ordinal: index + 1,
      text: `Forged block ${index + 1}.`,
    }, base));
    await writeProjection(fixture.releasePath, chunks);
    const forgedPath = await rehashAnswerRelease(fixture.releasePath);
    await expectBothReject(fixture, forgedPath);
  });
});

describe('empty approval fail-closed boundary', { timeout: 30_000 }, () => {
  it('rejects fully rehashed inserted or stale rows under explicit empty authority', async () => {
    const nonEmpty = await writeAnswerReleaseFixture();
    const emptyApproval = { schemaVersion: 1 as const, entries: [] };
    const emptyBuilt = await import('../src/answer-release/build-answer-release').then(({ buildPublicAnswerRelease }) => (
      buildPublicAnswerRelease({
        contentRelease: nonEmpty.contentRelease,
        approval: emptyApproval,
        answerReleasesRoot: nonEmpty.answerReleasesRoot,
      })
    ));
    const chunks = nonEmpty.active.chunks;
    const evidence = nonEmpty.active.evidence;
    await writeProjection(emptyBuilt.releasePath, chunks, evidence);
    const stalePath = await rehashAnswerRelease(emptyBuilt.releasePath);
    const fixture = { ...nonEmpty, releasePath: stalePath, answerReleaseId: stalePath.split('/').at(-1)! };
    await expectBothReject(fixture, stalePath, emptyApproval);
  });

  it.each(['count', 'bytes'] as const)('rejects a falsified empty NDJSON descriptor %s', async (field) => {
    const fixture = await writeAnswerReleaseFixture({ emptyApproval: true });
    await rewriteManifest(fixture.releasePath, (manifest) => {
      manifest.files.chunks[field] = 1;
    });
    await expectBothReject(fixture);
  });

  it.each(['document', 'posting'] as const)('rejects a nonempty lexical %s under empty authority', async (kind) => {
    const fixture = await writeAnswerReleaseFixture({ emptyApproval: true });
    const lexical = {
      schemaVersion: 1,
      normalizerVersion: 'nfkc-lower-hangul-ngram-v1',
      documents: kind === 'document' ? [{ chunkId: 'a'.repeat(64), length: 1 }] : [],
      postings: kind === 'posting' ? { forged: [{ document: 0, frequency: 1 }] } : {},
    };
    await writeFile(join(fixture.releasePath, 'lexical-index.json'), canonicalPrettyJson(lexical));
    const forgedPath = await rehashAnswerRelease(fixture.releasePath);
    await expectBothReject(fixture, forgedPath);
  });
});
