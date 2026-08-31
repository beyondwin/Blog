import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import sharp from 'sharp';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const SOURCE_PATH = 'apps/site/public/images/form-and-thought-agent-avatar-v1.png';
const MANIFEST_PATH = 'docs/notes/project/assets/form-and-thought-second-brain-avatar/decision-manifest.yml';
const INTAKE_PATH = '.superpowers/media-intake/search-avatar-derivatives';
const RECEIPT_PATH = `${INTAKE_PATH}/candidate-receipt.yml`;
const EXPECTED_ORIGINAL = Object.freeze({
  checksum: 'sha256:f29c064b1c0f77e5906a9c02e5b8e0a573ae6c44373b99fb75532c90fd481f20',
  width: 1254,
  height: 1254,
  bytes: 1_872_261,
});
const REQUIRED_APPROVERS = Object.freeze(['controller', 'independent-visual-reviewer']);
const MAX_DERIVATIVE_BYTES = 512 * 1024;
const VARIANTS = Object.freeze([
  Object.freeze({
    format: 'avif',
    width: 640,
    options: Object.freeze({
      quality: 55,
      effort: 9,
      chromaSubsampling: '4:4:4',
    }),
  }),
  Object.freeze({
    format: 'avif',
    width: 960,
    options: Object.freeze({
      quality: 55,
      effort: 9,
      chromaSubsampling: '4:4:4',
    }),
  }),
  Object.freeze({
    format: 'webp',
    width: 640,
    options: Object.freeze({ quality: 72, effort: 6, smartSubsample: true }),
  }),
  Object.freeze({
    format: 'webp',
    width: 960,
    options: Object.freeze({ quality: 72, effort: 6, smartSubsample: true }),
  }),
]);

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function encodedFormat(bytes) {
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = bytes.subarray(8, 12).toString('ascii');
    if (brand === 'avif' || brand === 'avis') return 'avif';
  }
  return 'unknown';
}

function assert(condition, message) {
  if (!condition) throw new Error(`second-brain avatar derivatives: ${message}`);
}

function exactKeys(value, keys, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} fields are not exact`);
}

function deepEqual(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((entry, index) => deepEqual(entry, right[index]));
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]));
}

function containedPath(repositoryRoot, relativePath, label) {
  assert(typeof repositoryRoot === 'string' && repositoryRoot.length > 0, 'repository root is required');
  assert(typeof relativePath === 'string' && relativePath.length > 0 && !isAbsolute(relativePath), `${label} path must be relative`);
  const root = resolve(repositoryRoot);
  const target = resolve(root, relativePath);
  const distance = relative(root, target);
  assert(distance !== '..' && !distance.startsWith(`..${sep}`) && !isAbsolute(distance), `${label} escapes the repository`);
  return target;
}

async function assertNoSymlinkComponents(repositoryRoot, target, label, allowMissingLeaf = false) {
  const root = resolve(repositoryRoot);
  const parts = relative(root, target).split(sep).filter(Boolean);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    try {
      const stat = await lstat(current);
      assert(!stat.isSymbolicLink(), `${label} symbolic link is not allowed`);
    } catch (error) {
      if (allowMissingLeaf && index === parts.length - 1 && error?.code === 'ENOENT') return;
      throw error;
    }
  }
}

async function createDirectoryTreeNoFollow(repositoryRoot, relativeDirectory, label) {
  const root = resolve(repositoryRoot);
  const rootStat = await lstat(root);
  assert(rootStat.isDirectory() && !rootStat.isSymbolicLink(), 'repository root must be a real directory');
  let current = root;
  for (const part of relativeDirectory.split('/').filter(Boolean)) {
    current = join(current, part);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (mkdirError) {
        if (mkdirError?.code !== 'EEXIST') throw mkdirError;
      }
      stat = await lstat(current);
    }
    assert(!stat.isSymbolicLink(), `${label} symbolic link is not allowed`);
    assert(stat.isDirectory(), `${label} component must be a directory`);
  }
  return current;
}

async function readRegularFileNoFollow(repositoryRoot, relativePath, label) {
  const target = containedPath(repositoryRoot, relativePath, label);
  let handle;
  try {
    await assertNoSymlinkComponents(repositoryRoot, target, label);
    handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    assert(stat.isFile(), `${label} must be a regular file`);
    return await handle.readFile();
  } catch (error) {
    if (error?.code === 'ELOOP') throw new Error(`second-brain avatar derivatives: ${label} symbolic link is not allowed`);
    throw error;
  } finally {
    await handle?.close();
  }
}

async function ensurePrivateIntakeDirectory(repositoryRoot) {
  const root = resolve(repositoryRoot);
  const directory = containedPath(root, INTAKE_PATH, 'candidate intake');
  const createdDirectory = await createDirectoryTreeNoFollow(root, INTAKE_PATH, 'candidate intake');
  assert(createdDirectory === directory, 'candidate intake path changed during creation');
  await assertNoSymlinkComponents(root, directory, 'candidate intake');
  const resolvedRoot = await realpath(root);
  const resolvedDirectory = await realpath(directory);
  const distance = relative(resolvedRoot, resolvedDirectory);
  assert(distance !== '..' && !distance.startsWith(`..${sep}`) && !isAbsolute(distance), 'candidate intake resolves outside the repository');
  const stat = await lstat(directory);
  assert(stat.isDirectory() && !stat.isSymbolicLink(), 'candidate intake must be a real directory');
  return directory;
}

async function writeAtomicExclusive(repositoryRoot, relativePath, bytes) {
  const target = containedPath(repositoryRoot, relativePath, 'candidate output');
  await ensurePrivateIntakeDirectory(repositoryRoot);
  assert(dirname(target) === containedPath(repositoryRoot, INTAKE_PATH, 'candidate intake'), 'candidate output must stay in the intake directory');
  await assertNoSymlinkComponents(repositoryRoot, target, 'candidate output', true);

  try {
    const targetStat = await lstat(target);
    assert(!targetStat.isSymbolicLink(), 'candidate output symbolic link is not allowed');
    assert(targetStat.isFile(), 'candidate output must be a regular file');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const temporary = `${target}.tmp-${process.pid}-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}`;
  let handle;
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, target);
  } finally {
    await handle?.close();
    await rm(temporary, { force: true });
  }
}

async function readYamlFile(repositoryRoot, relativePath, label) {
  const bytes = await readRegularFileNoFollow(repositoryRoot, relativePath, label);
  return parseYamlBytes(bytes, label);
}

function parseYamlBytes(bytes, label) {
  let value;
  try {
    value = parseYaml(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`second-brain avatar derivatives: ${label} is not valid YAML: ${error.message}`);
  }
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must contain an object`);
  return value;
}

async function inspectOriginal(repositoryRoot) {
  const manifest = await readYamlFile(repositoryRoot, MANIFEST_PATH, 'decision manifest');
  const bytes = await readRegularFileNoFollow(repositoryRoot, SOURCE_PATH, 'approved original');
  const metadata = await sharp(bytes, { failOn: 'warning' }).metadata();
  const original = {
    checksum: sha256(bytes),
    width: metadata.width,
    height: metadata.height,
    bytes: bytes.byteLength,
  };
  assert(deepEqual(original, EXPECTED_ORIGINAL), 'approved original checksum, dimensions, or bytes changed');
  assert(manifest?.asset?.publicPath === SOURCE_PATH, 'decision manifest original path changed');
  assert(manifest?.asset?.checksum === EXPECTED_ORIGINAL.checksum, 'decision manifest original checksum changed');
  assert(
    manifest?.asset?.width === EXPECTED_ORIGINAL.width && manifest?.asset?.height === EXPECTED_ORIGINAL.height,
    'decision manifest original dimensions changed',
  );
  assert(manifest?.asset?.byteSize === EXPECTED_ORIGINAL.bytes, 'decision manifest original bytes changed');
  return { bytes, manifest, original };
}

function candidateIdentity(variant) {
  const stem = 'form-and-thought-agent-avatar-v1';
  return {
    candidateId: `${stem}-${variant.format}-${variant.width}`,
    file: `${stem}-${variant.width}w.${variant.format}`,
    publicPath: `apps/site/public/images/${stem}-${variant.width}w.${variant.format}`,
  };
}

function expectedDerivativeShape(variant) {
  return {
    ...candidateIdentity(variant),
    format: variant.format,
    width: variant.width,
    height: variant.width,
    options: { ...variant.options },
  };
}

function assertDerivativeDeclaration(derivative, variant, label, keys) {
  exactKeys(derivative, keys, label);
  const expected = expectedDerivativeShape(variant);
  assert(derivative.candidateId === expected.candidateId, `${label} candidate ID changed`);
  assert(derivative.file === undefined || derivative.file === expected.file, `${label} file changed`);
  assert(derivative.publicPath === expected.publicPath, `${label} public path changed`);
  assert(derivative.format === expected.format, `${label} format changed`);
  assert(derivative.width === expected.width && derivative.height === expected.height, `${label} dimensions changed`);
  assert(deepEqual(derivative.options, expected.options), `${label} encoder options changed`);
  assert(Number.isSafeInteger(derivative.bytes) && derivative.bytes > 0, `${label} bytes are invalid`);
  assert(derivative.bytes <= MAX_DERIVATIVE_BYTES, `${label} exceeds 512 KiB`);
  assert(/^sha256:[a-f0-9]{64}$/.test(derivative.checksum), `${label} checksum is invalid`);
}

async function verifyDerivativeBytes(repositoryRoot, relativePath, derivative, label) {
  const bytes = await readRegularFileNoFollow(repositoryRoot, relativePath, label);
  assert(bytes.byteLength === derivative.bytes, `${label} byte size changed`);
  assert(bytes.byteLength <= MAX_DERIVATIVE_BYTES, `${label} exceeds 512 KiB`);
  assert(sha256(bytes) === derivative.checksum, `${label} checksum changed`);
  const metadata = await sharp(bytes, { failOn: 'warning' }).metadata();
  assert(encodedFormat(bytes) === derivative.format, `${label} encoded format changed`);
  assert(metadata.width === derivative.width && metadata.height === derivative.height, `${label} encoded dimensions changed`);
}

export async function buildSecondBrainAvatarDerivativeCandidates(repositoryRoot) {
  const { bytes: sourceBytes, manifest, original } = await inspectOriginal(repositoryRoot);
  const derivatives = [];

  for (const variant of VARIANTS) {
    const identity = candidateIdentity(variant);
    const output = await sharp(sourceBytes, { failOn: 'warning' })
      .rotate()
      .resize({ width: variant.width, withoutEnlargement: true })
      .toFormat(variant.format, variant.options)
      .toBuffer();
    const metadata = await sharp(output, { failOn: 'warning' }).metadata();
    assert(encodedFormat(output) === variant.format, `${identity.candidateId} encoder returned the wrong format`);
    assert(metadata.width === variant.width && metadata.height === variant.width, `${identity.candidateId} encoder returned the wrong dimensions`);
    assert(output.byteLength <= MAX_DERIVATIVE_BYTES, `${identity.candidateId} exceeds 512 KiB`);

    await writeAtomicExclusive(repositoryRoot, `${INTAKE_PATH}/${identity.file}`, output);
    derivatives.push({
      ...identity,
      format: variant.format,
      width: metadata.width,
      height: metadata.height,
      bytes: output.byteLength,
      checksum: sha256(output),
      options: { ...variant.options },
    });
  }

  const receipt = {
    version: 1,
    assetId: 'form-and-thought-agent-avatar-v1',
    state: 'review-candidate',
    original: {
      path: SOURCE_PATH,
      ...original,
    },
    encoder: {
      name: 'sharp',
      version: sharp.versions.sharp,
    },
    derivatives,
    approval: {
      state: 'pending',
      approvedBy: [],
    },
    rightsBoundary: manifest.rightsBoundary,
  };
  const receiptBytes = Buffer.from(stringifyYaml(receipt, { lineWidth: 0 }), 'utf8');
  await writeAtomicExclusive(repositoryRoot, RECEIPT_PATH, receiptBytes);
  return receipt;
}

function validateCandidateReceiptProjection(receipt, manifest, original) {
  exactKeys(receipt, ['version', 'assetId', 'state', 'original', 'encoder', 'derivatives', 'approval', 'rightsBoundary'], 'candidate receipt');
  assert(
    receipt.version === 1 && receipt.assetId === 'form-and-thought-agent-avatar-v1' && receipt.state === 'review-candidate',
    'candidate receipt identity changed',
  );
  exactKeys(receipt.original, ['path', 'checksum', 'width', 'height', 'bytes'], 'candidate receipt original');
  assert(receipt.original.path === SOURCE_PATH, 'candidate receipt original path changed');
  assert(
    deepEqual(
      {
        checksum: receipt.original.checksum,
        width: receipt.original.width,
        height: receipt.original.height,
        bytes: receipt.original.bytes,
      },
      original,
    ),
    'candidate receipt original checksum, dimensions, or bytes changed',
  );
  exactKeys(receipt.encoder, ['name', 'version'], 'candidate receipt encoder');
  assert(receipt.encoder.name === 'sharp' && receipt.encoder.version === sharp.versions.sharp, 'candidate receipt Sharp version changed');
  exactKeys(receipt.approval, ['state', 'approvedBy'], 'candidate receipt approval');
  assert(
    receipt.approval.state === 'pending' && Array.isArray(receipt.approval.approvedBy) && receipt.approval.approvedBy.length === 0,
    'candidate receipt must not claim approval',
  );
  assert(deepEqual(receipt.rightsBoundary, manifest.rightsBoundary), 'candidate receipt rights caveat changed');
  assert(Array.isArray(receipt.derivatives) && receipt.derivatives.length === VARIANTS.length, 'candidate receipt must contain exactly four derivatives');

  for (const [index, variant] of VARIANTS.entries()) {
    const derivative = receipt.derivatives[index];
    const label = `candidate ${index + 1}`;
    assertDerivativeDeclaration(derivative, variant, label, ['candidateId', 'file', 'publicPath', 'format', 'width', 'height', 'bytes', 'checksum', 'options']);
  }

  return {
    original,
    derivatives: receipt.derivatives,
    approval: receipt.approval,
    rightsBoundary: receipt.rightsBoundary,
    receipt,
  };
}

export async function verifySecondBrainAvatarDerivativeCandidates(repositoryRoot) {
  const { manifest, original } = await inspectOriginal(repositoryRoot);
  const receipt = await readYamlFile(repositoryRoot, RECEIPT_PATH, 'candidate receipt');
  const result = validateCandidateReceiptProjection(receipt, manifest, original);
  for (const [index, derivative] of receipt.derivatives.entries()) {
    await verifyDerivativeBytes(repositoryRoot, `${INTAKE_PATH}/${derivative.file}`, derivative, `candidate ${index + 1}`);
  }
  return {
    original: result.original,
    derivatives: result.derivatives,
    approval: result.approval,
    rightsBoundary: result.rightsBoundary,
  };
}

function approvedDerivativeFromCandidate(candidate) {
  const { candidateId, publicPath, format, width, height, bytes, checksum, options } = candidate;
  return { candidateId, publicPath, format, width, height, bytes, checksum, options };
}

export async function verifyApprovedSecondBrainAvatarDerivatives(repositoryRoot) {
  const { manifest, original } = await inspectOriginal(repositoryRoot);
  const approval = manifest.derivativeApproval;
  assert(approval?.state === 'approved', 'derivative approval is missing');
  exactKeys(approval, ['state', 'approvedBy', 'reviewedCandidateReceipt', 'rightsBoundary'], 'derivative approval');
  assert(deepEqual(approval.approvedBy, REQUIRED_APPROVERS), 'derivative approval actors are not exact');
  assert(deepEqual(approval.rightsBoundary, manifest.rightsBoundary), 'derivative approval rights caveat changed');
  const reviewedReceipt = approval.reviewedCandidateReceipt;
  exactKeys(reviewedReceipt, ['name', 'checksum', 'receipt', 'approvedBy'], 'reviewed candidate receipt reference');
  assert(reviewedReceipt.name === 'candidate-receipt.yml', 'reviewed candidate receipt name changed');
  assert(/^sha256:[a-f0-9]{64}$/.test(reviewedReceipt.checksum), 'reviewed candidate receipt checksum is invalid');
  assert(deepEqual(reviewedReceipt.approvedBy, REQUIRED_APPROVERS), 'reviewed candidate receipt approval actors are not exact');
  assert(deepEqual(reviewedReceipt.approvedBy, approval.approvedBy), 'reviewed candidate receipt approval actors do not match the durable approval');
  const embeddedReceiptBytes = Buffer.from(stringifyYaml(reviewedReceipt.receipt, { lineWidth: 0 }), 'utf8');
  assert(sha256(embeddedReceiptBytes) === reviewedReceipt.checksum, 'reviewed candidate receipt checksum changed');
  const reviewedCandidates = validateCandidateReceiptProjection(reviewedReceipt.receipt, manifest, original);
  assert(Array.isArray(manifest.derivatives) && manifest.derivatives.length === VARIANTS.length, 'approved manifest must contain exactly four derivatives');

  for (const [index, variant] of VARIANTS.entries()) {
    const derivative = manifest.derivatives[index];
    const label = `approved derivative ${index + 1}`;
    assertDerivativeDeclaration(derivative, variant, label, ['candidateId', 'publicPath', 'format', 'width', 'height', 'bytes', 'checksum', 'options']);
    assert(
      deepEqual(derivative, approvedDerivativeFromCandidate(reviewedCandidates.receipt.derivatives[index])),
      `${label} does not match the reviewed candidate receipt`,
    );
    await verifyDerivativeBytes(repositoryRoot, derivative.publicPath, derivative, label);
  }

  return {
    original,
    derivatives: manifest.derivatives,
    approvedBy: approval.approvedBy,
    rightsBoundary: approval.rightsBoundary,
  };
}

async function runCli() {
  const repositoryRoot = process.cwd();
  const mode = process.argv[2] ?? 'build';
  if (mode === 'build') {
    const result = await buildSecondBrainAvatarDerivativeCandidates(repositoryRoot);
    console.log(`Prepared ${result.derivatives.length} review-only avatar candidates in ${INTAKE_PATH}.`);
    return;
  }
  if (mode === 'verify-candidates') {
    const result = await verifySecondBrainAvatarDerivativeCandidates(repositoryRoot);
    console.log(`Verified ${result.derivatives.length} review-only avatar candidates; approval remains pending.`);
    return;
  }
  if (mode === 'verify-approved') {
    const result = await verifyApprovedSecondBrainAvatarDerivatives(repositoryRoot);
    console.log(`Verified ${result.derivatives.length} approved public avatar derivatives.`);
    return;
  }
  throw new Error(`unknown mode: ${mode}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runCli();
}
