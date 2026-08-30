import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const architectureReference = resolve(
  import.meta.dirname,
  '../../../docs/notes/project/architecture-reference.md',
);

describe('current architecture reference', () => {
  it('records the current 29-asset release without weakening review-cover warnings', async () => {
    const source = await readFile(architectureReference, 'utf8');

    expect(source).toContain('현재 release는 29 public assets, review cover asset/approval label 0건이다.');
    expect(source).toContain('17 review-cover warning');
    expect(source).not.toContain('현재 release는 18 public assets');
  });
});
