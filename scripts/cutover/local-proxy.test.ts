import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertOwnedCutoverPath,
  checkExactDrillPorts,
  parseProxyArguments,
  prepareStateFile,
  proxyCheckPayload,
  writeProxyTarget,
} from './local-proxy.mts';

const createdRoots: string[] = [];

async function cutoverRoot(): Promise<string> {
  const root = await mkdtemp('/tmp/beyondwin-cutover.');
  createdRoots.push(root);
  return root;
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('local cutover proxy safety', () => {
  it('accepts only exact loopback HTTP endpoints and rejects duplicate or unknown arguments', () => {
    const valid = [
      '--listen', '127.0.0.1:4390',
      '--react', 'http://127.0.0.1:4391',
      '--astro', 'http://127.0.0.1:4392',
      '--state', '/tmp/beyondwin-cutover.example/target',
      '--pid-file', '/tmp/beyondwin-cutover.example/proxy.pid',
    ];
    expect(parseProxyArguments(valid)).toMatchObject({
      listen: { host: '127.0.0.1', port: 4390 },
      react: new URL('http://127.0.0.1:4391'),
      astro: new URL('http://127.0.0.1:4392'),
    });
    expect(() => parseProxyArguments([...valid, '--listen', '127.0.0.1:4400'])).toThrow('duplicate');
    expect(() => parseProxyArguments([...valid, '--extra', 'value'])).toThrow('unknown');
    expect(() => parseProxyArguments(valid.map((value) => value === 'http://127.0.0.1:4391'
      ? 'http://example.com:4391'
      : value))).toThrow('loopback');
    expect(() => parseProxyArguments(valid.map((value) => value === 'http://127.0.0.1:4392'
      ? 'https://127.0.0.1:4392'
      : value))).toThrow('HTTP');
  });

  it('confines state and PID files to one real owned cutover directory', async () => {
    const root = await cutoverRoot();
    const outside = await mkdtemp('/tmp/beyondwin-outside.');
    createdRoots.push(outside);
    await expect(assertOwnedCutoverPath(join(root, 'target'))).resolves.toBe(root);
    await expect(assertOwnedCutoverPath(join(root, '..', 'escaped'))).rejects.toThrow('cutover');
    await symlink(outside, join(root, 'linked'));
    await expect(assertOwnedCutoverPath(join(root, 'linked', 'target'))).rejects.toThrow(/cutover|symbolic|real path/iu);
    await mkdir(join(root, 'directory-state'));
    await expect(prepareStateFile(join(root, 'directory-state'))).rejects.toThrow('regular');
  });

  it('initializes an absent state to react and refuses invalid or symlinked state', async () => {
    const root = await cutoverRoot();
    const state = join(root, 'target');
    await expect(prepareStateFile(state)).resolves.toBe('react');
    expect(await readFile(state, 'utf8')).toBe('react\n');
    await writeFile(state, 'invalid\n');
    await expect(prepareStateFile(state)).rejects.toThrow('react or astro');
    const link = join(root, 'linked-target');
    await symlink(state, link);
    await expect(prepareStateFile(link)).rejects.toThrow('symbolic');
  });

  it('checks all three exact drill ports and never stops an occupant', async () => {
    const visited: number[] = [];
    await expect(checkExactDrillPorts(async (port) => {
      visited.push(port);
      return port !== 4391;
    })).rejects.toThrow('4391');
    expect(visited).toEqual([4390, 4391, 4392]);
  });

  it('reports the actual existing valid state during check mode', async () => {
    const root = await cutoverRoot();
    const state = join(root, 'target');
    await prepareStateFile(state);
    await writeProxyTarget(state, 'astro');
    expect(proxyCheckPayload(await prepareStateFile(state))).toEqual({
      check: 'passed',
      ports: [4390, 4391, 4392],
      state: 'astro',
    });
  });
});
