import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const spikeRoot = process.cwd();
const repositoryRoot = resolve(spikeRoot, '../..');
const releasesRoot = join(repositoryRoot, 'build/public-releases');
const active = JSON.parse(await readFile(join(releasesRoot, 'active.json'), 'utf8'));
if (
  !active
  || typeof active.releaseId !== 'string'
  || !/^[a-f0-9]{64}$/u.test(active.releaseId)
  || active.path !== active.releaseId
) {
  throw new Error('Invalid active public-release pointer after verified Next prerender');
}
const releasePath = join(releasesRoot, active.releaseId);
const outputAssets = join(spikeRoot, 'out/assets');

await rm(outputAssets, { recursive: true, force: true });
await mkdir(join(spikeRoot, 'out'), { recursive: true });
await cp(join(releasePath, 'assets'), outputAssets, {
  recursive: true,
  force: false,
  errorOnExist: true,
});
