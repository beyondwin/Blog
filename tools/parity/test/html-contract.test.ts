import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { captureAstroBaseline } from '../src/capture-astro-baseline';
import { assertAstroBaselinesMatch, type AstroBaseline } from '../src/html-contract';

async function readCheckedInBaseline(): Promise<AstroBaseline> {
  const path = join(process.cwd(), 'tests/fixtures/parity/astro-public-baseline.json');
  return JSON.parse(await readFile(path, 'utf8')) as AstroBaseline;
}

describe('Astro public HTML contract', () => {
  it('matches the checked-in public baseline', async () => {
    assertAstroBaselinesMatch(await readCheckedInBaseline(), await captureAstroBaseline(process.cwd()));
  });

  it('identifies title drift by route and field', async () => {
    const expected = await readCheckedInBaseline();
    const mutated = structuredClone(expected);
    mutated.routes[0].title = 'unexpected title';

    expect(() => assertAstroBaselinesMatch(mutated, expected)).toThrow(
      new RegExp(`Route ${mutated.routes[0].path}: title drifted`),
    );
  });
});
