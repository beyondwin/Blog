import { link, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createLocalProviderAuthorization,
  readLocalProviderAuthorization,
  writeLocalProviderAuthorization,
} from '../src/config/local-provider-authorization.js';
import { PROVIDER_MODEL_POLICY } from '../src/modules/public-answer/infrastructure/openai/provider-model-policy.js';

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: '2026-09-02T00:00:00.000Z',
    policyHash: PROVIDER_MODEL_POLICY.policyHash,
    monthlyHardCapMicroUsd: 1_000_000,
    ...overrides,
  };
}

describe('local provider authorization', () => {
  it('canonicalizes owner-loopback non-ZDR identity without secrets or answer text', () => {
    const authorization = createLocalProviderAuthorization({
      createdAt: '2026-09-02T00:00:00.000Z',
      policyHash: PROVIDER_MODEL_POLICY.policyHash,
      monthlyHardCapMicroUsd: 1_000_000,
    });
    expect(authorization).toMatchObject({
      schemaVersion: 1,
      kind: 'local-non-zdr',
      scope: 'owner-loopback-development',
      endpoints: ['/v1/embeddings', '/v1/responses'],
      generationModel: 'gpt-5.6-luna',
      reasoningEffort: 'high',
      monthlyHardCapMicroUsd: 1_000_000,
    });
    expect(authorization.policyHash).toBe(PROVIDER_MODEL_POLICY.policyHash);
    expect(JSON.stringify(authorization)).not.toMatch(/api[_-]?key|question|answer|excerpt/iu);
    expect(Object.isFrozen(authorization)).toBe(true);
    expect(Object.isFrozen(authorization.endpoints)).toBe(true);
  });

  it('strict-writes and reopens canonical bytes with the current Luna policy identity', async () => {
    const root = await mkdtemp(join(tmpdir(), 'local-auth-')); roots.push(root);
    const path = join(root, 'authorization.json');
    const authorization = createLocalProviderAuthorization(validInput());
    await writeLocalProviderAuthorization(path, authorization);
    await expect(readLocalProviderAuthorization(path)).resolves.toEqual(authorization);
  });

  it.each([
    ['unknown input field', { store: false }],
    ['wrong policy hash', { policyHash: `sha256:${'0'.repeat(64)}` }],
    ['wrong cap', { monthlyHardCapMicroUsd: 2_000_000 }],
    ['invalid createdAt', { createdAt: '2026-09-02' }],
  ] as const)('rejects create with %s', (_label, overrides) => {
    expect(() => createLocalProviderAuthorization(validInput(overrides))).toThrow();
  });

  it('rejects symlinks, extra links, unknown fields, non-canonical bytes, and policy drift', async () => {
    const root = await mkdtemp(join(tmpdir(), 'local-auth-reject-')); roots.push(root);
    const valid = createLocalProviderAuthorization(validInput());
    const canonical = `${JSON.stringify(valid, null, 2)}\n`;

    const symlinkPath = join(root, 'link.json');
    const target = join(root, 'target.json');
    await writeFile(target, canonical);
    await symlink(target, symlinkPath);
    await expect(readLocalProviderAuthorization(symlinkPath)).rejects.toThrow(/symbolic/u);

    const linked = join(root, 'hardlinked.json');
    await writeFile(linked, canonical);
    await link(linked, join(root, 'other-link.json'));
    await expect(readLocalProviderAuthorization(linked)).rejects.toThrow(/owned regular file/u);

    for (const [name, body] of [
      ['unknown', { ...valid, store: false }],
      ['zdr-kind', { ...valid, kind: 'zero-data-retention' }],
      ['endpoint-gap', { ...valid, endpoints: ['/v1/embeddings'] }],
      ['model', { ...valid, generationModel: 'gpt-5.4-mini-2026-03-17' }],
      ['reasoning', { ...valid, reasoningEffort: 'none' }],
      ['cap', { ...valid, monthlyHardCapMicroUsd: 999_999 }],
      ['policy', { ...valid, policyHash: `sha256:${'f'.repeat(64)}` }],
      ['scope', { ...valid, scope: 'production' }],
    ] as const) {
      const path = join(root, `${name}.json`);
      await writeFile(path, `${JSON.stringify(body, null, 2)}\n`);
      await expect(readLocalProviderAuthorization(path)).rejects.toThrow();
    }

    const nonCanonical = join(root, 'non-canonical.json');
    await writeFile(nonCanonical, JSON.stringify(valid));
    await expect(readLocalProviderAuthorization(nonCanonical)).rejects.toThrow(/canonical/u);
  });

  it('does not treat store:false as zero-data-retention', async () => {
    const root = await mkdtemp(join(tmpdir(), 'local-auth-store-')); roots.push(root);
    const valid = createLocalProviderAuthorization(validInput());
    const path = join(root, 'store-false.json');
    await writeFile(path, `${JSON.stringify({ ...valid, store: false, status: 'zero-data-retention' }, null, 2)}\n`);
    await expect(readLocalProviderAuthorization(path)).rejects.toThrow(/missing or unknown fields/u);
  });
});
