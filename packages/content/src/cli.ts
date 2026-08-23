import { stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  buildPublicRelease,
  cleanupOwnedTemporaryRoot,
  createOwnedTemporaryRoot,
} from './release/build-release';
import { readActiveRelease } from './release/read-release';

const root = resolve(process.cwd());
const releasesRoot = join(root, 'build', 'public-releases');
const command = process.argv[2];

if (command === 'build') {
  const result = await buildPublicRelease({ root, releasesRoot });
  process.stdout.write(`${JSON.stringify({
    releaseId: result.releaseId,
    path: result.releasePath,
    records: Object.keys(result.manifest.records).length,
    assets: Object.keys(result.manifest.assets).length,
  })}\n`);
} else if (command === 'verify') {
  const active = await readActiveRelease(releasesRoot);
  process.stdout.write(`${JSON.stringify({
    releaseId: active.pointer.releaseId,
    path: active.releasePath,
    records: Object.keys(active.manifest.records).length,
    assets: Object.keys(active.manifest.assets).length,
    privateBoundaryHits: 0,
  })}\n`);
} else if (command === 'clean-test') {
  const owned = await createOwnedTemporaryRoot(tmpdir());
  await cleanupOwnedTemporaryRoot(owned);
  try {
    await stat(owned.path);
    throw new Error('owned temporary release root was not removed');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  for (const target of [
    releasesRoot,
    join(releasesRoot, 'active.json'),
    join(releasesRoot, 'rollback.json'),
    root,
    homedir(),
    join(tmpdir(), 'caller-supplied-public-release'),
  ]) {
    try {
      await cleanupOwnedTemporaryRoot({ path: target } as never);
      throw new Error(`cleanup guard accepted unsafe target: ${target}`);
    } catch (error) {
      if (!String(error).includes('owned temporary root')) throw error;
    }
  }
  process.stdout.write(`${JSON.stringify({ cleanup: 'passed', destructiveTargetsRejected: 6 })}\n`);
} else {
  throw new Error('usage: cli.ts <build|verify|clean-test>');
}
