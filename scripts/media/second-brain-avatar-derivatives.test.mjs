import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';

import {
  buildSecondBrainAvatarDerivativeCandidates,
  verifyApprovedSecondBrainAvatarDerivatives,
  verifySecondBrainAvatarDerivativeCandidates,
} from './build-second-brain-avatar-derivatives.mjs';

const repositoryRoot = join(import.meta.dirname, '..', '..');
const sourcePath = 'apps/site/public/images/form-and-thought-agent-avatar-v1.png';
const manifestPath = 'docs/notes/project/assets/form-and-thought-second-brain-avatar/decision-manifest.yml';
const intakePath = '.superpowers/media-intake/search-avatar-derivatives';
const receiptPath = `${intakePath}/candidate-receipt.yml`;

let fixtureRoot;
let roots = [];

async function put(root, relativePath, value) {
  const target = join(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, value);
}

async function readYaml(root, relativePath) {
  return parseYaml(await readFile(join(root, relativePath), 'utf8'));
}

async function writeYaml(root, relativePath, value) {
  await put(root, relativePath, stringifyYaml(value, { lineWidth: 0 }));
}

async function cloneFixture() {
  const root = await mkdtemp(join(tmpdir(), 'second-brain-avatar-test-'));
  roots.push(root);
  await cp(fixtureRoot, root, { recursive: true });
  return root;
}

async function approveFixture(root) {
  const receipt = await readYaml(root, receiptPath);
  const receiptBytes = await readFile(join(root, receiptPath));
  for (const derivative of receipt.derivatives) {
    await put(root, derivative.publicPath, await readFile(join(root, intakePath, derivative.file)));
  }

  const manifest = await readYaml(root, manifestPath);
  manifest.derivativeApproval = {
    state: 'approved',
    approvedBy: ['controller', 'independent-visual-reviewer'],
    reviewedCandidateReceipt: {
      name: 'candidate-receipt.yml',
      checksum: `sha256:${createHash('sha256').update(receiptBytes).digest('hex')}`,
    },
    rightsBoundary: receipt.rightsBoundary,
  };
  manifest.derivatives = receipt.derivatives.map(({ candidateId, publicPath, format, width, height, bytes, checksum, options }) => ({
    candidateId,
    publicPath,
    format,
    width,
    height,
    bytes,
    checksum,
    options,
  }));
  await writeYaml(root, manifestPath, manifest);
}

beforeAll(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), 'second-brain-avatar-base-'));
  roots.push(fixtureRoot);
  await put(fixtureRoot, sourcePath, await readFile(join(repositoryRoot, sourcePath)));
  await put(fixtureRoot, manifestPath, await readFile(join(repositoryRoot, manifestPath)));
  await buildSecondBrainAvatarDerivativeCandidates(fixtureRoot);
}, 120_000);

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe('second-brain avatar derivative candidates', () => {
  it('verifies the exact deterministic candidate set without claiming production approval', async () => {
    const result = await verifySecondBrainAvatarDerivativeCandidates(fixtureRoot);

    expect(result.original).toEqual({
      checksum: 'sha256:f29c064b1c0f77e5906a9c02e5b8e0a573ae6c44373b99fb75532c90fd481f20',
      width: 1254,
      height: 1254,
      bytes: 1_872_261,
    });
    expect(result.derivatives.map(({ format, width }) => ({ format, width }))).toEqual([
      { format: 'avif', width: 640 },
      { format: 'avif', width: 960 },
      { format: 'webp', width: 640 },
      { format: 'webp', width: 960 },
    ]);
    expect(result.derivatives.every((asset) => asset.bytes <= 512 * 1024)).toBe(true);
    expect(result.approval).toEqual({ state: 'pending', approvedBy: [] });
  });

  it('produces byte-identical assets and receipt on a second run', async () => {
    const before = await Promise.all([
      readFile(join(fixtureRoot, receiptPath)),
      ...['avif-640', 'avif-960', 'webp-640', 'webp-960'].map(async (id) => {
        const receipt = await readYaml(fixtureRoot, receiptPath);
        const derivative = receipt.derivatives.find((entry) => entry.candidateId.endsWith(id));
        return readFile(join(fixtureRoot, intakePath, derivative.file));
      }),
    ]);

    await buildSecondBrainAvatarDerivativeCandidates(fixtureRoot);

    const receipt = await readYaml(fixtureRoot, receiptPath);
    const after = await Promise.all([
      readFile(join(fixtureRoot, receiptPath)),
      ...receipt.derivatives.map((entry) => readFile(join(fixtureRoot, intakePath, entry.file))),
    ]);
    expect(after).toEqual(before);
  }, 120_000);

  it('does not follow a symlink in the approved original path', async () => {
    const root = await cloneFixture();
    const images = join(root, 'apps/site/public/images');
    const relocated = join(root, 'apps/site/public/images-real');
    await rename(images, relocated);
    await symlink('images-real', images);

    await expect(buildSecondBrainAvatarDerivativeCandidates(root)).rejects.toThrow(/symbolic link/i);
  });

  it('rejects a symlinked intake parent without mutating the external target', async () => {
    const root = await cloneFixture();
    const outside = await mkdtemp(join(tmpdir(), 'second-brain-avatar-outside-'));
    roots.push(outside);
    await rm(join(root, '.superpowers'), { recursive: true });
    await symlink(outside, join(root, '.superpowers'));

    await expect(buildSecondBrainAvatarDerivativeCandidates(root)).rejects.toThrow(/symbolic link/i);
    expect(await readdir(outside)).toEqual([]);
  });

  it.each([
    ['candidate receipt', async (root) => rm(join(root, receiptPath))],
    [
      'candidate asset',
      async (root) => {
        const receipt = await readYaml(root, receiptPath);
        await rm(join(root, intakePath, receipt.derivatives[0].file));
      },
    ],
  ])('fails closed when the %s is missing', async (_name, removeTarget) => {
    const root = await cloneFixture();
    await removeTarget(root);

    await expect(verifySecondBrainAvatarDerivativeCandidates(root)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails closed when the approved original bytes change', async () => {
    const root = await cloneFixture();
    const bytes = await readFile(join(root, sourcePath));
    bytes[bytes.length - 1] ^= 0xff;
    await writeFile(join(root, sourcePath), bytes);

    await expect(verifySecondBrainAvatarDerivativeCandidates(root)).rejects.toThrow(/approved original/i);
  });

  it.each([
    [
      'wrong original checksum',
      async (root) => {
        const receipt = await readYaml(root, receiptPath);
        receipt.original.checksum = `sha256:${'0'.repeat(64)}`;
        await writeYaml(root, receiptPath, receipt);
      },
      /original checksum/i,
    ],
    [
      'wrong format',
      async (root) => {
        const receipt = await readYaml(root, receiptPath);
        receipt.derivatives[0].format = 'webp';
        await writeYaml(root, receiptPath, receipt);
      },
      /format/i,
    ],
    [
      'wrong dimensions',
      async (root) => {
        const receipt = await readYaml(root, receiptPath);
        receipt.derivatives[0].height = 639;
        await writeYaml(root, receiptPath, receipt);
      },
      /dimensions/i,
    ],
    [
      'asset checksum drift',
      async (root) => {
        const receipt = await readYaml(root, receiptPath);
        const target = join(root, intakePath, receipt.derivatives[0].file);
        const bytes = await readFile(target);
        bytes[0] ^= 0xff;
        await writeFile(target, bytes);
      },
      /checksum/i,
    ],
    [
      '512 KiB overflow',
      async (root) => {
        const receipt = await readYaml(root, receiptPath);
        const asset = Buffer.alloc(512 * 1024 + 1);
        const derivative = receipt.derivatives[0];
        derivative.bytes = asset.byteLength;
        derivative.checksum = `sha256:${createHash('sha256').update(asset).digest('hex')}`;
        await writeFile(join(root, intakePath, derivative.file), asset);
        await writeYaml(root, receiptPath, receipt);
      },
      /512 KiB/i,
    ],
  ])('fails closed for %s', async (_name, mutate, expected) => {
    const root = await cloneFixture();
    await mutate(root);

    await expect(verifySecondBrainAvatarDerivativeCandidates(root)).rejects.toThrow(expected);
  });
});

describe('approved second-brain avatar derivatives', () => {
  it('rejects candidates when independent derivative approval is missing', async () => {
    await expect(verifyApprovedSecondBrainAvatarDerivatives(fixtureRoot)).rejects.toThrow(/derivative approval is missing/i);
  });

  it('verifies only exact public bytes bound to both approval actors', async () => {
    const root = await cloneFixture();
    await approveFixture(root);

    const result = await verifyApprovedSecondBrainAvatarDerivatives(root);

    expect(result.approvedBy).toEqual(['controller', 'independent-visual-reviewer']);
    expect(result.derivatives).toHaveLength(4);
  });

  it('rejects a substituted public derivative even when candidates remain intact', async () => {
    const root = await cloneFixture();
    await approveFixture(root);
    const manifest = await readYaml(root, manifestPath);
    const target = join(root, manifest.derivatives[0].publicPath);
    const bytes = await readFile(target);
    bytes[0] ^= 0xff;
    await writeFile(target, bytes);

    await expect(verifyApprovedSecondBrainAvatarDerivatives(root)).rejects.toThrow(/checksum/i);
  });

  it('rejects a re-encoded public derivative even when its manifest checksum and size are also substituted', async () => {
    const root = await cloneFixture();
    await approveFixture(root);
    const manifest = await readYaml(root, manifestPath);
    const substituted = await sharp(await readFile(join(root, sourcePath)))
      .resize({ width: 640, withoutEnlargement: true })
      .avif({ quality: 35, effort: 4, chromaSubsampling: '4:4:4' })
      .toBuffer();
    const derivative = manifest.derivatives[0];
    derivative.bytes = substituted.byteLength;
    derivative.checksum = `sha256:${createHash('sha256').update(substituted).digest('hex')}`;
    await writeFile(join(root, derivative.publicPath), substituted);
    await writeYaml(root, manifestPath, manifest);

    await expect(verifyApprovedSecondBrainAvatarDerivatives(root)).rejects.toThrow(/reviewed candidate/i);
  });

  it('rejects forged approval actors', async () => {
    const root = await cloneFixture();
    await approveFixture(root);
    const manifest = await readYaml(root, manifestPath);
    manifest.derivativeApproval.approvedBy = ['controller', 'unknown-reviewer'];
    await writeYaml(root, manifestPath, manifest);

    await expect(verifyApprovedSecondBrainAvatarDerivatives(root)).rejects.toThrow(/approval actors/i);
  });
});
