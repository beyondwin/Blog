import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { validateMediaRepository } from './validate-media.mjs';
import { writeReviewCoverFixture } from '../packages/content/test/helpers/release-fixture.ts';

const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeRepository() {
  const root = await mkdtemp(join(tmpdir(), 'validate-media-'));
  roots.push(root);
  await put(root, 'src/data/memory.public.json', '{"thoughts":[]}\n');
  await put(root, 'packages/content/generated-media-approval-batches.json', '{"version":1,"batches":[]}\n');
  await put(root, 'packages/content/review-cover-redistribution-approvals.json', '{"version":1,"approvals":[]}\n');
  return root;
}

async function put(root, relativePath, contents) {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validPng(width = 1, height = 1) {
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes.writeUInt32BE(crc32(bytes.subarray(12, 29)), 29);
  return bytes;
}

function withoutPngChunk(bytes, type) {
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    if (bytes.toString('ascii', offset + 4, offset + 8) === type) {
      return Buffer.concat([bytes.subarray(0, offset), bytes.subarray(chunkEnd)]);
    }
    offset = chunkEnd;
  }
  throw new Error(`missing PNG chunk ${type}`);
}

function jpeg(width, height) {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

function checksum(contents) {
  return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
}

function mediaManifest(items) {
  return `version: 1\nitems:\n${items.map((item) => `  - id: ${item.id}\n    file: ${item.file}\n    kind: ${item.kind}\n    alt: ${item.alt ?? '설명'}\n    credit: ${item.credit ?? '작성자'}\n    ${item.sourcePath ? `sourcePath: ${item.sourcePath}` : `sourceUrl: ${item.sourceUrl ?? 'https://example.com/source'}`}\n${item.isbn13 ? `    isbn13: "${item.isbn13}"\n` : ''}${item.edition ? `    edition: ${item.edition}\n` : ''}    verifiedAt: "${item.verifiedAt ?? '2026-08-12'}"\n    rightsNote: ${item.rightsNote ?? '재배포 권리 별도 확인 필요'}\n    checksum: ${item.checksum}\n`).join('')}`;
}

async function writeApprovedGeneratedInventory(root, mutation = 'valid') {
  const evidencePath = 'docs/notes/project/assets/form-and-thought-generated/calibration/decision-manifest.yml';
  const contactPath = 'docs/notes/project/assets/form-and-thought-generated/calibration/approved-contact-sheet.png';
  const sourcePath = 'src/assets/content/articles/note/unfeatured.png';
  const heroImage = validPng(1, 1);
  const image = validPng(2, 1);
  const thirdImage = validPng(3, 1);
  const contact = Buffer.from('approved contact sheet');
  const rightsNote = 'Repository publication approved with caveat: non-exclusive generated output; copyrightability/uniqueness not guaranteed';
  await put(root, contactPath, contact);
  const decision = {
    version: 1,
    batchId: 'calibration',
    generator: {
      provider: 'openai',
      generator: 'codex-built-in-image-generation',
      model: 'not-exposed-by-built-in-tool',
      modelVersion: 'not-exposed-by-built-in-tool',
      promptVersion: 'form-and-thought-calibration-v1',
      generatedAt: '2026-08-29T02:53:35+09:00',
    },
    approval: {
      state: 'approved',
      selectedCandidateIds: ['H01', 'A03', 'T01'],
      approvedBy: mutation === 'duplicate-roles'
        ? ['controller', 'controller', 'independent-visual-reviewer']
        : ['controller', 'independent-visual-reviewer'],
      recordedAt: '2026-08-29T03:24:41+09:00',
      evidence: 'Fixed test approval evidence.',
    },
    rightsReview: {
      state: 'approved',
      decision: 'approve-repository-publication',
      checkedAt: '2026-08-29',
      decidedBy: 'controller',
      caveat: 'non-exclusive generated output; copyrightability/uniqueness not guaranteed',
      sources: [{ url: 'https://openai.com/policies/terms-of-use', checkedAt: '2026-08-29' }],
      inspection: {
        externalImageInputs: false,
        namedOrLivingArtist: false,
        recognizablePersonOrProduct: false,
        readableMark: false,
      },
    },
    approvedContactSheet: { path: contactPath, checksum: checksum(contact) },
    assets: [
      {
        candidateId: 'H01',
        slot: 'homeHero',
        collection: 'articles',
        recordId: 'note',
        mediaId: 'hero',
        file: 'hero.png',
        sourcePath: 'src/assets/content/articles/note/hero.png',
        checksum: checksum(heroImage),
        width: 1,
        height: 1,
      },
      {
        candidateId: 'A03',
        slot: 'homePick/indexLandscape',
        collection: 'articles',
        recordId: 'note',
        mediaId: 'unfeatured',
        file: 'unfeatured.png',
        sourcePath: mutation === 'decision-path-tamper'
          ? 'src/assets/content/articles/note/tampered.png'
          : sourcePath,
        checksum: mutation === 'decision-checksum-tamper' ? `sha256:${'b'.repeat(64)}` : checksum(image),
        width: 2,
        height: 1,
      },
      {
        candidateId: 'T01',
        slot: 'detailHero',
        collection: 'articles',
        recordId: 'note',
        mediaId: 'third',
        file: 'third.png',
        sourcePath: 'src/assets/content/articles/note/third.png',
        checksum: checksum(thirdImage),
        width: 3,
        height: 1,
      },
    ],
  };
  const decisionBytes = stringifyYaml(decision, { lineWidth: 0 });
  await put(root, evidencePath, decisionBytes);
  await put(root, 'packages/content/generated-media-approval-batches.json', `${JSON.stringify({
    version: 1,
    batches: [{
      batchId: 'calibration',
      decisionManifest: evidencePath,
      decisionManifestChecksum: checksum(decisionBytes),
      selections: decision.assets.map(({ candidateId, collection, recordId, mediaId }) => ({
        candidateId,
        collection,
        recordId,
        mediaId,
      })),
    }],
  })}\n`);

  const item = {
    id: 'unfeatured',
    file: 'unfeatured.png',
    kind: 'illustration',
    alt: 'Approved unfeatured image',
    credit: 'beyondwin test',
    sourcePath: evidencePath,
    sourceKind: 'repository-generated',
    generation: {
      provider: 'openai',
      generator: 'codex-built-in-image-generation',
      model: 'not-exposed-by-built-in-tool',
      modelVersion: 'not-exposed-by-built-in-tool',
      promptVersion: 'form-and-thought-calibration-v1',
      candidateId: 'A03',
      decisionManifestChecksum: checksum(decisionBytes),
    },
    verifiedAt: '2026-08-29',
    rightsNote,
    width: 2,
    height: 1,
    checksum: checksum(image),
  };
  const boundItem = (id, file, candidateId, width, bytes) => ({
    ...item,
    id,
    file,
    generation: { ...item.generation, candidateId },
    width,
    checksum: checksum(bytes),
  });
  const items = [
    boundItem('hero', 'hero.png', 'H01', 1, heroImage),
    boundItem('third', 'third.png', 'T01', 3, thirdImage),
  ];
  await put(root, 'src/assets/content/articles/note/hero.png', heroImage);
  await put(root, 'src/assets/content/articles/note/third.png', thirdImage);
  if (mutation !== 'orphaned') {
    if (mutation === 'downgraded') {
      item.sourcePath = 'docs/source.md';
      delete item.sourceKind;
      delete item.generation;
      await put(root, 'docs/source.md', '# ordinary source\n');
    }
    items.push(item);
    await put(root, sourcePath, image);
  }
  if (mutation === 'ordinary-path-reuse') {
    items.push({
      ...item,
      id: 'ordinary-reuse',
      sourcePath: 'docs/source.md',
      sourceKind: undefined,
      generation: undefined,
    });
    await put(root, 'docs/source.md', '# ordinary source\n');
  }
  if (mutation === 'candidate-reuse') {
    const impostor = validPng(4, 1);
    items.push({ ...item, id: 'impostor', file: 'impostor.png', width: 4, checksum: checksum(impostor) });
    await put(root, 'src/assets/content/articles/note/impostor.png', impostor);
  }
  await put(root, 'src/assets/content/articles/note/media.yml', stringifyYaml({ version: 1, items }, { lineWidth: 0 }));
}

describe('repository media validation', () => {
  it('reports missing manifest ids, orphan assets, checksum drift, hotlinks, and broken relationships', async () => {
    const root = await makeRepository();
    const cover = jpeg(320, 480);
    await put(root, 'src/content/reviews/book.mdx', `---\ncoverState: verified\ncoverMedia: cover\n---\n`);
    await put(root, 'src/content/articles/note.mdx', `---\nrelationships:\n  - target: articles/missing\n    relation: related\n    reason: 관련 기록\n---\n![remote](https://example.com/hotlink.png)\n`);
    await put(root, 'src/assets/content/reviews/book/cover.jpg', cover);
    await put(root, 'src/assets/content/reviews/book/orphan.jpg', jpeg(320, 480));
    await put(root, 'src/assets/content/reviews/book/media.yml', mediaManifest([{ id: 'other', file: 'cover.jpg', kind: 'photo', checksum: `sha256:${'0'.repeat(64)}` }]));

    const result = await validateMediaRepository(root);

    expect(result.errors).toContain('src/content/reviews/book.mdx: coverMedia "cover" has no media manifest item');
    expect(result.errors).toContain('src/assets/content/reviews/book/orphan.jpg: asset is not declared in media.yml');
    expect(result.errors).toContain('src/content/articles/note.mdx: remote image hotlink is not allowed');
    expect(result.errors).toContain('src/assets/content/reviews/book/cover.jpg: checksum does not match media.yml');
    expect(result.errors).toContain('src/content/articles/note.mdx: relationship target "articles/missing" does not exist');
  });

  it('accepts local PNG and JPEG media and public-memory relationships', async () => {
    const root = await makeRepository();
    const diagram = validPng();
    const cover = jpeg(320, 480);
    await put(root, 'docs/source.md', '# Source\n');
    await put(root, 'src/data/memory.public.json', '{"thoughts":[{"slug":"public-thought"}]}\n');
    await put(root, 'src/content/articles/note.md', `---\nfeaturedMedia: diagram\nrelationships:\n  - target: memory/public-thought\n    relation: related\n    reason: 공개 기억\n---\n`);
    await put(root, 'src/assets/content/articles/note/diagram.png', diagram);
    await put(root, 'src/assets/content/articles/note/media.yml', mediaManifest([{ id: 'diagram', file: 'diagram.png', kind: 'diagram', sourcePath: 'docs/source.md', checksum: checksum(diagram) }]));
    await put(root, 'src/content/reviews/book.mdx', `---\ncoverState: verified\ncoverMedia: cover\n---\n`);
    await put(root, 'src/assets/content/reviews/book/cover.jpg', cover);
    await put(root, 'src/assets/content/reviews/book/media.yml', mediaManifest([{ id: 'cover', file: 'cover.jpg', kind: 'book-cover', isbn13: '9788934985068', edition: '한국어판', checksum: checksum(cover) }]));

    const result = await validateMediaRepository(root);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      'src/assets/content/reviews/book/cover.jpg: redistribution rights are not independently verified',
    ]);
  });

  it('rejects a review coverMedia reference that disguises its bytes as a non-cover kind', async () => {
    const root = await makeRepository();
    await mkdir(join(root, 'src', 'content', 'reviews'), { recursive: true });
    await writeReviewCoverFixture(root, { approved: false, kind: 'illustration' });

    expect((await validateMediaRepository(root, { strict: true })).errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/coverMedia.*kind.*book-cover/i),
    ]));
  });

  it('accepts an approved review cover only through its canonical checksum-bound decision', async () => {
    const root = await makeRepository();
    await mkdir(join(root, 'src', 'content', 'reviews'), { recursive: true });
    await writeReviewCoverFixture(root);

    const result = await validateMediaRepository(root, { strict: true });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('rejects an attacker-recomputed self-declared cover decision that is absent from the independent registry', async () => {
    const root = await makeRepository();
    await mkdir(join(root, 'src', 'content', 'reviews'), { recursive: true });
    await writeReviewCoverFixture(root, { registryMutation: 'unregistered' });

    expect((await validateMediaRepository(root, { strict: true })).errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/not registered for independent approval/i),
    ]));
  });

  it.each([
    ['missing role', ['controller']],
    ['duplicate role', ['controller', 'controller']],
    ['extra role', ['controller', 'independent-rights-reviewer', 'publisher']],
    ['spoofed role', ['controller', 'independent-rights-reviewer ']],
  ])('rejects review-cover approval roles with %s', async (_name, approvalRoles) => {
    const root = await makeRepository();
    await mkdir(join(root, 'src', 'content', 'reviews'), { recursive: true });
    await writeReviewCoverFixture(root, { approvalRoles });

    expect((await validateMediaRepository(root, { strict: true })).errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/approvedBy.*exactly.*controller.*independent-rights-reviewer/i),
    ]));
  });

  it.each([
    ['missing', 'missing', /approval registry is missing/i],
    ['tampered shape', 'invalid', /approval registry.*expected array/i],
    ['unregistered decision', 'unregistered', /not registered for independent approval/i],
    ['tampered decision checksum', 'decision-checksum', /registry decision checksum.*match/i],
    ['wrong source tuple', 'source-path', /registry source path.*match/i],
    ['wrong source URL', 'source-url', /registry source sourceUrl.*match/i],
  ])('rejects a %s review-cover approval registry', async (_name, registryMutation, error) => {
    const root = await makeRepository();
    await mkdir(join(root, 'src', 'content', 'reviews'), { recursive: true });
    await writeReviewCoverFixture(root, { registryMutation });

    expect((await validateMediaRepository(root, { strict: true })).errors).toEqual(expect.arrayContaining([
      expect.stringMatching(error),
    ]));
  });

  it('rejects unregistered extra review-cover decision evidence even when no media item claims it', async () => {
    const root = await makeRepository();
    const path = 'docs/notes/project/assets/review-cover-rights/rogue-review/redistribution-decision.yml';
    await put(root, path, 'version: 1\n');

    expect((await validateMediaRepository(root, { strict: true })).errors).toContain(
      `unregistered review cover decision evidence: ${path}`,
    );
  });

  it('accepts generated-media provenance only through a canonical approved decision inventory', async () => {
    const root = await makeRepository();
    await writeApprovedGeneratedInventory(root);

    expect((await validateMediaRepository(root, { strict: true })).errors).toEqual([]);
  });

  it.each([
    ['downgraded selected asset', 'downgraded', /approved generated asset.*unfeatured.*repository-generated/i],
    ['orphaned selected asset', 'orphaned', /approved generated asset.*unfeatured.*missing/i],
    ['tampered selected checksum', 'decision-checksum-tamper', /approved generated asset.*unfeatured.*checksum/i],
    ['tampered selected source path', 'decision-path-tamper', /approved generated asset.*unfeatured.*sourcePath/i],
    ['ordinary approved-path reuse', 'ordinary-path-reuse', /ordinary media.*approved generated source path/i],
    ['duplicate candidate claim', 'candidate-reuse', /generated candidate.*A03.*claimed more than once/i],
    ['duplicate exact approval role', 'duplicate-roles', /approvedBy.*controller.*independent-visual-reviewer/i],
  ])('reverse inventory rejects %s', async (_name, mutation, error) => {
    const root = await makeRepository();
    await writeApprovedGeneratedInventory(root, mutation);

    expect((await validateMediaRepository(root, { strict: true })).errors).toEqual(expect.arrayContaining([
      expect.stringMatching(error),
    ]));
  });

  it('fails closed when the registered batch directory is deleted and all three selected sources are downgraded', async () => {
    const root = await makeRepository();
    await writeApprovedGeneratedInventory(root);
    const mediaPath = 'src/assets/content/articles/note/media.yml';
    const media = parseYaml(await readFile(join(root, mediaPath), 'utf8'));
    await put(root, 'docs/source.md', '# ordinary source\n');
    for (const item of media.items) {
      delete item.sourceKind;
      delete item.generation;
      item.sourcePath = 'docs/source.md';
    }
    await put(root, mediaPath, stringifyYaml(media, { lineWidth: 0 }));
    await rm(join(root, 'docs/notes/project/assets/form-and-thought-generated/calibration'), { recursive: true });

    expect((await validateMediaRepository(root, { strict: true })).errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/required generated approval batch.*calibration.*missing/i),
    ]));
  });

  it('fails closed when a required registered decision manifest is missing', async () => {
    const root = await makeRepository();
    await writeApprovedGeneratedInventory(root);
    await rm(join(root, 'docs/notes/project/assets/form-and-thought-generated/calibration/decision-manifest.yml'));

    expect((await validateMediaRepository(root, { strict: true })).errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/required generated approval batch.*calibration.*manifest.*missing/i),
    ]));
  });

  it('rejects an unregistered generated approval batch', async () => {
    const root = await makeRepository();
    await writeApprovedGeneratedInventory(root);
    const original = parseYaml(await readFile(join(root, 'docs/notes/project/assets/form-and-thought-generated/calibration/decision-manifest.yml'), 'utf8'));
    original.batchId = 'unregistered';
    original.approvedContactSheet.path = 'docs/notes/project/assets/form-and-thought-generated/unregistered/approved-contact-sheet.png';
    const contact = Buffer.from('unregistered contact');
    original.approvedContactSheet.checksum = checksum(contact);
    await put(root, original.approvedContactSheet.path, contact);
    await put(root, 'docs/notes/project/assets/form-and-thought-generated/unregistered/decision-manifest.yml', stringifyYaml(original, { lineWidth: 0 }));

    expect((await validateMediaRepository(root, { strict: true })).errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/unregistered generated approval batch.*unregistered/i),
    ]));
  });

  it('fails closed when a registered selected tuple does not exist in the decision manifest', async () => {
    const root = await makeRepository();
    await writeApprovedGeneratedInventory(root);
    const registryPath = 'packages/content/generated-media-approval-batches.json';
    const registry = JSON.parse(await readFile(join(root, registryPath), 'utf8'));
    registry.batches[0].selections[1].mediaId = 'missing-selection';
    await put(root, registryPath, `${JSON.stringify(registry)}\n`);

    expect((await validateMediaRepository(root, { strict: true })).errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/required generated approval batch.*calibration.*registered selection/i),
    ]));
  });

  it('keeps ordinary media compatible through an explicit empty generated approval registry', async () => {
    const root = await makeRepository();
    const image = validPng();
    await put(root, 'docs/source.md', '# source\n');
    await put(root, 'src/assets/content/articles/note/ordinary.png', image);
    await put(root, 'src/assets/content/articles/note/media.yml', mediaManifest([{
      id: 'ordinary', file: 'ordinary.png', kind: 'illustration', sourcePath: 'docs/source.md', checksum: checksum(image),
    }]));

    expect((await validateMediaRepository(root, { strict: true })).errors).toEqual([]);
  });

  it.each([
    ['generation metadata', '    sourceKind: repository-generated\n'],
    ['the repository-generated source kind', `    generation:\n      provider: openai\n      generator: codex-built-in-image-generation\n      model: not-exposed-by-built-in-tool\n      modelVersion: not-exposed-by-built-in-tool\n      promptVersion: form-and-thought-calibration-v1\n      candidateId: A03\n      decisionManifestChecksum: sha256:${'a'.repeat(64)}\n`],
  ])('rejects decision-bound media that omits %s', async (_name, generatedBlock) => {
    const root = await makeRepository();
    const image = validPng();
    const evidencePath = 'docs/notes/project/assets/form-and-thought-generated/calibration/decision-manifest.yml';
    await put(root, evidencePath, 'version: 1\n');
    await put(root, 'src/content/articles/note.mdx', '---\nfeaturedMedia: generated\n---\n');
    await put(root, 'src/assets/content/articles/note/generated.png', image);
    const manifest = mediaManifest([{
      id: 'generated',
      file: 'generated.png',
      kind: 'illustration',
      sourcePath: evidencePath,
      checksum: checksum(image),
    }]).replace('    verifiedAt:', `${generatedBlock}    verifiedAt:`);
    await put(root, 'src/assets/content/articles/note/media.yml', manifest);

    expect((await validateMediaRepository(root, { strict: true })).errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/repository-generated.*sourceKind.*generation|decision-bound.*repository-generated/i),
    ]));
  });

  it('rejects unsupported media extensions while parsing before reading the declared asset', async () => {
    const root = await makeRepository();
    await put(root, 'src/assets/content/articles/note/media.yml', mediaManifest([
      {
        id: 'diagram',
        file: 'diagram.svg',
        kind: 'diagram',
        sourcePath: 'docs/source.md',
        checksum: `sha256:${'0'.repeat(64)}`,
      },
    ]));

    expect((await validateMediaRepository(root)).errors).toEqual([
      'src/assets/content/articles/note/media.yml: file must use a lowercase .jpg, .jpeg, .png, .webp or .avif extension',
    ]);
  });

  it('treats legacy cover URLs as warnings until strict mode', async () => {
    const root = await makeRepository();
    await put(root, 'src/content/reviews/book.mdx', `---\ncoverImage: https://example.com/cover.jpg\n---\n`);

    expect(await validateMediaRepository(root)).toEqual({
      errors: [],
      warnings: ['src/content/reviews/book.mdx: legacy coverImage is deprecated; use coverMedia'],
    });
    expect((await validateMediaRepository(root, { strict: true })).errors).toContain(
      'src/content/reviews/book.mdx: legacy coverImage is not allowed in strict mode',
    );
  });

  it('detects Markdown and HTML remote image hotlinks without rejecting ordinary links', async () => {
    const root = await makeRepository();
    await put(root, 'src/content/articles/note.mdx', `---\ntitle: Note\n---\n[allowed](https://example.com)\n<img alt="remote" src='http://example.com/a.jpg'>\n`);

    expect((await validateMediaRepository(root)).errors).toEqual([
      'src/content/articles/note.mdx: remote image hotlink is not allowed',
    ]);
  });

  it('enforces verified and hold cover states', async () => {
    const root = await makeRepository();
    await put(root, 'src/content/reviews/verified.mdx', `---\ncoverState: verified\n---\n`);
    await put(root, 'src/content/reviews/hold.mdx', `---\ncoverState: hold\ncoverMedia: cover\ncoverImage: https://example.com/cover.jpg\n---\n`);

    expect((await validateMediaRepository(root)).errors).toEqual([
      'src/content/reviews/hold.mdx: coverState "hold" forbids coverImage',
      'src/content/reviews/hold.mdx: coverState "hold" forbids coverMedia',
      'src/content/reviews/verified.mdx: coverState "verified" requires coverMedia',
    ]);
  });

  it('reports missing manifest metadata and duplicate checksums deterministically', async () => {
    const root = await makeRepository();
    const image = validPng(640, 480);
    await put(root, 'src/assets/content/articles/note/a.png', image);
    await put(root, 'src/assets/content/articles/note/b.png', image);
    const valid = mediaManifest([
      { id: 'a', file: 'a.png', kind: 'diagram', sourcePath: 'docs/source.md', checksum: checksum(image) },
      { id: 'b', file: 'b.png', kind: 'diagram', sourcePath: 'docs/source.md', checksum: checksum(image) },
    ]);
    await put(root, 'src/assets/content/articles/note/media.yml', valid.replace('    alt: 설명\n', ''));

    const result = await validateMediaRepository(root);

    expect(result.errors).toContain('src/assets/content/articles/note/media.yml: media item "a" is missing required field "alt"');
    expect(result.errors).toContain(`src/assets/content/articles/note/media.yml: checksum ${checksum(image)} is declared by multiple media items: "a", "b"`);
    expect(result.errors).toEqual([...result.errors].sort());
  });

  it('validates source paths and raster dimensions from file headers', async () => {
    const root = await makeRepository();
    const smallCover = jpeg(299, 500);
    const huge = validPng(4001, 3000);
    const zero = validPng(0, 100);
    await put(root, 'src/assets/content/reviews/book/small.jpg', smallCover);
    await put(root, 'src/assets/content/reviews/book/huge.png', huge);
    await put(root, 'src/assets/content/reviews/book/zero.png', zero);
    await put(root, 'src/assets/content/reviews/book/media.yml', mediaManifest([
      { id: 'small', file: 'small.jpg', kind: 'book-cover', isbn13: '9788934985068', edition: '한국어판', checksum: checksum(smallCover) },
      { id: 'huge', file: 'huge.png', kind: 'photo', sourcePath: 'docs/missing.md', checksum: checksum(huge) },
      { id: 'zero', file: 'zero.png', kind: 'diagram', sourcePath: 'docs/missing.md', checksum: checksum(zero) },
    ]));

    const result = await validateMediaRepository(root);

    expect(result.errors).toContain('src/assets/content/reviews/book/small.jpg: book cover width 299px is below 300px');
    expect(result.errors).toContain('src/assets/content/reviews/book/huge.png: raster dimensions 4001x3000 exceed 12 megapixels');
    expect(result.errors).toContain('src/assets/content/reviews/book/zero.png: raster dimensions must be greater than zero');
    expect(result.errors).toContain('src/assets/content/reviews/book/media.yml: sourcePath "docs/missing.md" does not exist');
  });

  it('does not follow content symlinks into private memory or outside the repository', async () => {
    const root = await makeRepository();
    const outside = await mkdtemp(join(tmpdir(), 'validate-media-outside-'));
    roots.push(outside);
    await put(root, 'memory/private.mdx', `---\n---\n![secret](https://example.com/private.png)\n`);
    await put(outside, 'outside.mdx', `---\n---\n![outside](https://example.com/outside.png)\n`);
    await mkdir(join(root, 'src/content/articles'), { recursive: true });
    await symlink(join(root, 'memory/private.mdx'), join(root, 'src/content/articles/private.mdx'));
    await symlink(join(outside, 'outside.mdx'), join(root, 'src/content/articles/outside.mdx'));

    expect((await validateMediaRepository(root)).errors).toEqual([
      'src/content/articles/outside.mdx: symbolic link is not allowed',
      'src/content/articles/private.mdx: symbolic link is not allowed',
    ]);
  });

  it('does not follow a media manifest symlink outside the asset subtree', async () => {
    const root = await makeRepository();
    await put(root, 'docs/external-media.yml', 'version: 1\nitems: []\n');
    await mkdir(join(root, 'src/assets/content/articles/note'), { recursive: true });
    await symlink(join(root, 'docs/external-media.yml'), join(root, 'src/assets/content/articles/note/media.yml'));

    expect((await validateMediaRepository(root)).errors).toEqual([
      'src/assets/content/articles/note/media.yml: symbolic link is not allowed',
    ]);
  });

  it('does not follow declared asset symlinks outside their manifest directory', async () => {
    const root = await makeRepository();
    const privateImage = validPng();
    await put(root, 'docs/source.md', '# Source\n');
    await put(root, 'memory/private.png', privateImage);
    await put(root, 'src/assets/content/reviews/other/outside.png', privateImage);
    await mkdir(join(root, 'src/assets/content/reviews/book'), { recursive: true });
    await symlink(join(root, 'memory/private.png'), join(root, 'src/assets/content/reviews/book/private.png'));
    await symlink(
      join(root, 'src/assets/content/reviews/other/outside.png'),
      join(root, 'src/assets/content/reviews/book/outside.png'),
    );
    await put(root, 'src/assets/content/reviews/book/media.yml', mediaManifest([
      { id: 'private', file: 'private.png', kind: 'photo', sourcePath: 'docs/source.md', checksum: checksum(privateImage) },
      { id: 'outside', file: 'outside.png', kind: 'photo', sourcePath: 'docs/source.md', checksum: checksum(privateImage) },
    ]));

    expect((await validateMediaRepository(root)).errors).toEqual([
      `src/assets/content/reviews/book/media.yml: checksum ${checksum(privateImage)} is declared by multiple media items: "outside", "private"`,
      'src/assets/content/reviews/book/outside.png: symbolic link is not allowed',
      'src/assets/content/reviews/book/private.png: symbolic link is not allowed',
      'src/assets/content/reviews/other/outside.png: asset is not declared in media.yml',
    ]);
  });

  it('rejects a truncated PNG that contains only signature and partial IHDR data', async () => {
    const root = await makeRepository();
    const truncated = validPng(640, 480).subarray(0, 24);
    await put(root, 'src/assets/content/articles/note/truncated.png', truncated);
    await put(root, 'src/assets/content/articles/note/media.yml', mediaManifest([
      { id: 'truncated', file: 'truncated.png', kind: 'diagram', sourcePath: 'docs/missing.md', checksum: checksum(truncated) },
    ]));

    expect((await validateMediaRepository(root)).errors).toContain(
      'src/assets/content/articles/note/truncated.png: cannot read PNG dimensions from file header',
    );
  });

  it('rejects a PNG with a bad IHDR CRC', async () => {
    const root = await makeRepository();
    const invalid = validPng(640, 480);
    invalid[29] ^= 0xff;
    await put(root, 'src/assets/content/articles/note/invalid.png', invalid);
    await put(root, 'src/assets/content/articles/note/media.yml', mediaManifest([
      { id: 'invalid', file: 'invalid.png', kind: 'diagram', sourcePath: 'docs/missing.md', checksum: checksum(invalid) },
    ]));

    expect((await validateMediaRepository(root)).errors).toContain(
      'src/assets/content/articles/note/invalid.png: cannot read PNG dimensions from file header',
    );
  });

  it('rejects a PNG without an IDAT chunk', async () => {
    const root = await makeRepository();
    const invalid = withoutPngChunk(validPng(640, 480), 'IDAT');
    await put(root, 'src/assets/content/articles/note/invalid.png', invalid);
    await put(root, 'src/assets/content/articles/note/media.yml', mediaManifest([
      { id: 'invalid', file: 'invalid.png', kind: 'diagram', sourcePath: 'docs/missing.md', checksum: checksum(invalid) },
    ]));

    expect((await validateMediaRepository(root)).errors).toContain(
      'src/assets/content/articles/note/invalid.png: cannot read PNG dimensions from file header',
    );
  });

  it('rejects a PNG without a terminal IEND chunk', async () => {
    const root = await makeRepository();
    const invalid = withoutPngChunk(validPng(640, 480), 'IEND');
    await put(root, 'src/assets/content/articles/note/invalid.png', invalid);
    await put(root, 'src/assets/content/articles/note/media.yml', mediaManifest([
      { id: 'invalid', file: 'invalid.png', kind: 'diagram', sourcePath: 'docs/missing.md', checksum: checksum(invalid) },
    ]));

    expect((await validateMediaRepository(root)).errors).toContain(
      'src/assets/content/articles/note/invalid.png: cannot read PNG dimensions from file header',
    );
  });

  it('rejects a PNG truncated inside a chunk', async () => {
    const root = await makeRepository();
    const complete = validPng(640, 480);
    const invalid = complete.subarray(0, complete.length - 3);
    await put(root, 'src/assets/content/articles/note/invalid.png', invalid);
    await put(root, 'src/assets/content/articles/note/media.yml', mediaManifest([
      { id: 'invalid', file: 'invalid.png', kind: 'diagram', sourcePath: 'docs/missing.md', checksum: checksum(invalid) },
    ]));

    expect((await validateMediaRepository(root)).errors).toContain(
      'src/assets/content/articles/note/invalid.png: cannot read PNG dimensions from file header',
    );
  });

  it('rejects a JPEG truncated after its SOF dimensions without an EOI marker', async () => {
    const root = await makeRepository();
    const truncated = jpeg(640, 480).subarray(0, -2);
    await put(root, 'src/assets/content/articles/note/truncated.jpg', truncated);
    await put(root, 'src/assets/content/articles/note/media.yml', mediaManifest([
      { id: 'truncated', file: 'truncated.jpg', kind: 'photo', sourcePath: 'docs/missing.md', checksum: checksum(truncated) },
    ]));

    expect((await validateMediaRepository(root)).errors).toContain(
      'src/assets/content/articles/note/truncated.jpg: cannot read JPG dimensions from file header',
    );
  });

  it('rejects raster dimensions that drift from an explicit manifest declaration', async () => {
    const root = await makeRepository();
    const image = validPng(640, 480);
    await put(root, 'docs/source.md', '# source\n');
    await put(root, 'src/assets/content/articles/note/diagram.png', image);
    const manifest = mediaManifest([{
      id: 'diagram', file: 'diagram.png', kind: 'diagram', sourcePath: 'docs/source.md', checksum: checksum(image),
    }]).replace('    checksum:', '    width: 800\n    height: 600\n    checksum:');
    await put(root, 'src/assets/content/articles/note/media.yml', manifest);

    expect((await validateMediaRepository(root)).errors).toContain(
      'src/assets/content/articles/note/diagram.png: raster dimensions 640x480 do not match media.yml 800x600',
    );
  });
});
