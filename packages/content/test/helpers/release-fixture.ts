import { createHash } from 'node:crypto';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { stringify as stringifyYaml } from 'yaml';

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

export const fixtureChecksum = `sha256:${createHash('sha256').update(transparentPng).digest('hex')}`;

export type ReviewCoverDecisionMutation =
  | 'hold'
  | 'asset-path'
  | 'asset-checksum'
  | 'dimensions'
  | 'identity-title'
  | 'identity-author-first'
  | 'identity-author-second'
  | 'identity-author-order'
  | 'identity-publisher'
  | 'identity-isbn13'
  | 'identity-edition-label'
  | 'identity-publication-year'
  | 'evidence-type'
  | 'evidence-url'
  | 'evidence-path'
  | 'evidence-path-escape'
  | 'evidence-checksum'
  | 'evidence-checksum-format'
  | 'evidence-retrieved-at'
  | 'evidence-scope'
  | 'evidence-unknown-key';

export type ReviewCoverRegistryMutation =
  | 'missing'
  | 'invalid'
  | 'unregistered'
  | 'decision-checksum'
  | 'source-path'
  | 'source-url'
  | 'identity-title'
  | 'identity-author-first'
  | 'identity-author-second'
  | 'identity-author-order'
  | 'identity-publisher'
  | 'identity-isbn13'
  | 'identity-edition-label'
  | 'identity-publication-year'
  | 'evidence-type'
  | 'evidence-url'
  | 'evidence-path'
  | 'evidence-checksum'
  | 'evidence-retrieved-at'
  | 'evidence-scope';

export type ReviewCoverEvidenceFileMutation =
  | 'missing'
  | 'symlink'
  | 'directory'
  | 'tampered';

export async function writeReviewCoverFixture(
  root: string,
  options: {
    approved?: boolean;
    kind?: 'book-cover' | 'illustration' | 'photo';
    mutation?: ReviewCoverDecisionMutation;
    omitDecision?: boolean;
    receiptChecksum?: string;
    rightsNote?: string;
    approvalRoles?: string[];
    legacySelfDeclaredEvidence?: boolean;
    registryMutation?: ReviewCoverRegistryMutation;
    evidenceFileMutation?: ReviewCoverEvidenceFileMutation;
    evidenceKind?: 'redistribution-license' | 'written-permission';
    omitPublicationYear?: boolean;
    evidenceUrl?: string;
    sourceUrl?: string;
  } = {},
): Promise<{
  decisionPath: string;
  evidencePath: string;
  evidenceChecksum: string;
  mediaChecksum: string;
  registryPath: string;
}> {
  const recordId = 'approved-review';
  const mediaId = 'cover';
  const file = 'cover.png';
  const isbn13 = '9788990247674';
  const edition = 'Test Publisher 2026 edition';
  const publicationYear = 2026;
  const mediaDirectory = `src/assets/content/reviews/${recordId}`;
  const sourceAssetPath = `${mediaDirectory}/${file}`;
  const decisionPath = `docs/notes/project/assets/review-cover-rights/${recordId}/redistribution-decision.yml`;
  const canonicalEvidencePath = `docs/notes/project/assets/review-cover-rights/${recordId}/rights-evidence.txt`;
  const registryPath = 'packages/content/review-cover-redistribution-approvals.json';
  const coverBytes = await sharp({
    create: {
      width: 320,
      height: 480,
      channels: 4,
      background: { r: 28, g: 22, b: 18, alpha: 1 },
    },
  }).png().toBuffer();
  const mediaChecksum = `sha256:${createHash('sha256').update(coverBytes).digest('hex')}`;
  const evidenceBytes = Buffer.from('Fixture redistribution grant for exact approved-review cover bytes.\n');
  const evidenceChecksum = `sha256:${createHash('sha256').update(evidenceBytes).digest('hex')}`;
  const mutation = options.mutation;
  const approved = options.approved ?? true;
  const bibliographicIdentity = {
    title: mutation === 'identity-title' ? 'Different book title' : 'Approved review',
    authors: mutation === 'identity-author-first'
      ? ['Different Author', 'Second Author']
      : mutation === 'identity-author-second'
        ? ['Test Author', 'Different Second Author']
        : mutation === 'identity-author-order'
          ? ['Second Author', 'Test Author']
          : ['Test Author', 'Second Author'],
    publisher: mutation === 'identity-publisher' ? 'Different Publisher' : 'Test Publisher',
    isbn13: mutation === 'identity-isbn13' ? '9788934985068' : isbn13,
    editionLabel: mutation === 'identity-edition-label' ? 'Different edition' : edition,
    ...(!options.omitPublicationYear ? {
      publicationYear: mutation === 'identity-publication-year' ? 2025 : publicationYear,
    } : {}),
  };
  const evidenceType = options.evidenceKind ?? 'redistribution-license';
  const rightsEvidence = {
    type: mutation === 'evidence-type' ? 'unsupported-grant' : evidenceType,
    ...(evidenceType === 'redistribution-license' ? {
      evidenceUrl: mutation === 'evidence-url'
        ? 'file:///tmp/forged-rights-evidence'
        : options.evidenceUrl ?? 'https://example.com/redistribution-license',
    } : {}),
    evidencePath: mutation === 'evidence-path'
      ? `docs/notes/project/assets/review-cover-rights/${recordId}/rights-evidence.md`
      : mutation === 'evidence-path-escape'
        ? `docs/notes/project/assets/review-cover-rights/${recordId}/../rights-evidence.txt`
        : canonicalEvidencePath,
    evidenceChecksum: mutation === 'evidence-checksum'
      ? `sha256:${'e'.repeat(64)}`
      : mutation === 'evidence-checksum-format'
        ? 'sha256:not-a-valid-checksum'
        : evidenceChecksum,
    retrievedAt: mutation === 'evidence-retrieved-at' ? '2026-02-30' : '2026-08-29',
    scope: mutation === 'evidence-scope'
      ? 'website display only'
      : 'public website redistribution of the exact cover asset',
    ...(mutation === 'evidence-unknown-key' ? { privateCorrespondence: 'must be rejected' } : {}),
  };
  const decision = {
    version: 1,
    state: mutation === 'hold' || !approved ? 'hold' : 'approved',
    decision: mutation === 'hold' || !approved ? 'hold' : 'approve-public-redistribution',
    recordId,
    mediaId,
    asset: {
      path: mutation === 'asset-path' ? `${mediaDirectory}/forged.png` : sourceAssetPath,
      checksum: mutation === 'asset-checksum' ? `sha256:${'b'.repeat(64)}` : mediaChecksum,
      width: mutation === 'dimensions' ? 319 : 320,
      height: 480,
      kind: 'book-cover',
    },
    bibliographicIdentity,
    rightsEvidence,
    ...(options.legacySelfDeclaredEvidence ? {
      evidence: {
        decidedAt: '2026-08-29',
        decidedBy: 'attacker-self-declared',
        sources: [{ url: 'https://example.com/invented-rights-evidence', checkedAt: '2026-08-29' }],
        note: 'An attacker-controlled URL and note must never authorize redistribution.',
      },
    } : {
      approval: {
        approvedBy: options.approvalRoles ?? ['controller', 'independent-rights-reviewer'],
        recordedAt: '2026-08-29',
      },
    }),
  };
  const decisionBytes = stringifyYaml(decision, { lineWidth: 0 });
  const decisionChecksum = `sha256:${createHash('sha256').update(decisionBytes).digest('hex')}`;

  await mkdir(join(root, ...mediaDirectory.split('/')), { recursive: true });
  await writeFile(join(root, ...sourceAssetPath.split('/')), coverBytes);
  const evidenceAbsolutePath = join(root, ...canonicalEvidencePath.split('/'));
  if (options.evidenceFileMutation !== 'missing') {
    await mkdir(join(root, ...canonicalEvidencePath.split('/')).replace(/\/rights-evidence\.txt$/u, ''), { recursive: true });
    if (options.evidenceFileMutation === 'symlink') {
      const externalEvidence = join(root, 'external-rights-evidence.txt');
      await writeFile(externalEvidence, evidenceBytes);
      await symlink(externalEvidence, evidenceAbsolutePath);
    } else if (options.evidenceFileMutation === 'directory') {
      await mkdir(evidenceAbsolutePath, { recursive: true });
    } else {
      await writeFile(
        evidenceAbsolutePath,
        options.evidenceFileMutation === 'tampered' ? Buffer.from('tampered rights evidence\n') : evidenceBytes,
      );
    }
  }
  if (!options.omitDecision) {
    await mkdir(join(root, ...decisionPath.split('/')).replace(/\/redistribution-decision\.yml$/u, ''), { recursive: true });
    await writeFile(join(root, ...decisionPath.split('/')), decisionBytes);
  }
  await mkdir(join(root, 'packages', 'content'), { recursive: true });
  const registeredSource = {
    path: options.registryMutation === 'source-path' ? `${mediaDirectory}/forged.png` : decision.asset.path,
    checksum: decision.asset.checksum,
    width: decision.asset.width,
    height: decision.asset.height,
    kind: decision.asset.kind,
    sourceUrl: options.registryMutation === 'source-url'
      ? 'https://example.com/forged-cover-source.png'
      : options.sourceUrl ?? 'https://example.com/approved-cover.png',
    verifiedAt: '2026-08-29',
    bibliographicIdentity: {
      ...bibliographicIdentity,
      ...(options.registryMutation === 'identity-title' ? { title: 'Registry title mismatch' } : {}),
      ...(options.registryMutation === 'identity-author-first' ? { authors: ['Registry Author', 'Second Author'] } : {}),
      ...(options.registryMutation === 'identity-author-second' ? { authors: ['Test Author', 'Registry Second Author'] } : {}),
      ...(options.registryMutation === 'identity-author-order' ? { authors: [...bibliographicIdentity.authors].reverse() } : {}),
      ...(options.registryMutation === 'identity-publisher' ? { publisher: 'Registry Publisher' } : {}),
      ...(options.registryMutation === 'identity-isbn13' ? { isbn13: '9788934985068' } : {}),
      ...(options.registryMutation === 'identity-edition-label' ? { editionLabel: 'Registry edition' } : {}),
      ...(options.registryMutation === 'identity-publication-year' ? { publicationYear: 2024 } : {}),
    },
    rightsEvidence: {
      ...rightsEvidence,
      ...(options.registryMutation === 'evidence-type' ? { type: 'written-permission', evidenceUrl: undefined } : {}),
      ...(options.registryMutation === 'evidence-url' ? { evidenceUrl: 'https://example.com/other-license' } : {}),
      ...(options.registryMutation === 'evidence-path' ? { evidencePath: canonicalEvidencePath.replace('.txt', '.pdf') } : {}),
      ...(options.registryMutation === 'evidence-checksum' ? { evidenceChecksum: `sha256:${'f'.repeat(64)}` } : {}),
      ...(options.registryMutation === 'evidence-retrieved-at' ? { retrievedAt: '2026-08-28' } : {}),
      ...(options.registryMutation === 'evidence-scope' ? { scope: 'website display only' } : {}),
    },
  };
  const registry = {
    version: 1,
    approvals: options.registryMutation === 'unregistered' ? [] : [{
      collection: 'reviews',
      recordId,
      mediaId,
      decisionDocument: decisionPath,
      decisionChecksum: options.registryMutation === 'decision-checksum'
        ? `sha256:${'d'.repeat(64)}`
        : decisionChecksum,
      source: registeredSource,
    }],
  };
  if (options.registryMutation === 'missing') {
    await rm(join(root, ...registryPath.split('/')), { force: true });
  } else if (options.registryMutation === 'invalid') {
    await writeFile(join(root, ...registryPath.split('/')), '{"version":1,"approvals":"tampered"}\n');
  } else {
    await writeFile(join(root, ...registryPath.split('/')), `${JSON.stringify(registry)}\n`);
  }
  await writeFile(join(root, ...mediaDirectory.split('/'), 'media.yml'), stringifyYaml({
    version: 1,
    items: [{
      id: mediaId,
      file,
      kind: options.kind ?? 'book-cover',
      alt: '승인 테스트 판본 표지',
      credit: 'Test bookseller',
      sourceUrl: options.sourceUrl ?? 'https://example.com/approved-cover.png',
      isbn13,
      edition,
      verifiedAt: '2026-08-29',
      rightsNote: options.rightsNote ?? 'Free text never grants redistribution rights.',
      width: 320,
      height: 480,
      checksum: mediaChecksum,
      ...(approved ? {
        redistributionApproval: {
          decisionDocument: decisionPath,
          decisionChecksum: options.receiptChecksum ?? decisionChecksum,
        },
      } : {}),
    }],
  }, { lineWidth: 0 }));
  await writeFile(join(root, 'src', 'content', 'reviews', `${recordId}.mdx`), [
    '---',
    'title: Approved review',
    'description: A review cover approval fixture.',
    'createdAt: "2026-08-29"',
    'updatedAt: "2026-08-29"',
    'status: published',
    'draft: false',
    'itemType: book',
    'itemTitle: Approved review',
    'itemAuthor: [Test Author, Second Author]',
    `isbn13: "${isbn13}"`,
    'publisher: Test Publisher',
    `editionLabel: ${edition}`,
    ...(!options.omitPublicationYear ? [`publicationYear: ${publicationYear}`] : []),
    'readEditionVerified: true',
    'verdict: The verdict remains visible.',
    'coverState: verified',
    `coverMedia: ${mediaId}`,
    '---',
    '',
    'The review body remains visible.',
    '',
  ].join('\n'));

  return {
    decisionPath,
    evidencePath: canonicalEvidencePath,
    evidenceChecksum,
    mediaChecksum,
    registryPath,
  };
}

export async function writeReleaseFixture(
  root: string,
  options: {
    title?: string;
    privateFrontmatter?: string;
    featuredMedia?: boolean;
    figureMarkup?: string;
    mediaWidth?: number;
    mediaHeight?: number;
  } = {},
): Promise<void> {
  const title = options.title ?? 'Public fixture';
  const mediaWidth = options.mediaWidth ?? 1;
  const mediaHeight = options.mediaHeight ?? 1;
  const mediaBytes = mediaWidth === 1 && mediaHeight === 1
    ? transparentPng
    : await sharp({
      create: {
        width: mediaWidth,
        height: mediaHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }).png().toBuffer();
  const mediaChecksum = `sha256:${createHash('sha256').update(mediaBytes).digest('hex')}`;
  const contentRoot = join(root, 'src', 'content');
  const mediaRoot = join(root, 'src', 'assets', 'content', 'articles', 'public-fixture');

  await Promise.all([
    ...['analysis', 'articles', 'ideas', 'reviews', 'travel', 'thoughts'].map((collection) => (
      mkdir(join(contentRoot, collection), { recursive: true })
    )),
    mkdir(join(root, 'src', 'data'), { recursive: true }),
    mkdir(join(root, 'packages', 'content'), { recursive: true }),
    mkdir(mediaRoot, { recursive: true }),
  ]);

  await writeFile(join(contentRoot, 'articles', 'public-fixture.mdx'), [
    '---',
    `title: "${title}"`,
    'description: "A renderer-neutral public fixture."',
    'createdAt: "2026-08-23"',
    'updatedAt: "2026-08-23"',
    'tags: ["fixture"]',
    'status: "published"',
    'draft: false',
    'recordKind: "essay"',
    ...(options.featuredMedia === false ? [] : ['featuredMedia: "hero"']),
    ...(options.privateFrontmatter ? [options.privateFrontmatter] : []),
    '---',
    '',
    '## Stable heading',
    '',
    '| Contract | State |',
    '| --- | --- |',
    '| Public | Ready |',
    '',
    options.figureMarkup ?? '<Figure media="hero" />',
    '',
    '<Callout title="Decision">Only allowlisted output is released.</Callout>',
    '',
  ].join('\n'));

  await writeFile(join(mediaRoot, 'hero.png'), mediaBytes);
  await writeFile(join(mediaRoot, 'media.yml'), [
    'version: 1',
    'items:',
    '  - id: hero',
    '    file: hero.png',
    '    kind: illustration',
    '    alt: A one-pixel public fixture',
    '    caption: Deterministic fixture media',
    '    credit: beyondwin test',
    '    sourceUrl: https://example.com/public-fixture',
    '    verifiedAt: "2026-08-23"',
    '    rightsNote: Generated test fixture',
    `    width: ${mediaWidth}`,
    `    height: ${mediaHeight}`,
    `    checksum: ${mediaChecksum}`,
    '',
  ].join('\n'));

  await writeFile(join(root, 'src', 'data', 'memory.public.json'), JSON.stringify({
    generatedAt: null,
    thoughts: [],
    sources: [],
    edges: [],
  }));
  await writeFile(
    join(root, 'packages', 'content', 'generated-media-approval-batches.json'),
    '{"version":1,"batches":[]}\n',
  );
  await writeFile(
    join(root, 'packages', 'content', 'review-cover-redistribution-approvals.json'),
    '{"version":1,"approvals":[]}\n',
  );
}
