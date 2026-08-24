import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const candidateRoot = resolve(import.meta.dirname, '..');
const mobilePrelude = '@media (max-width:720px) {\n';

function splitRouteSource(source: string) {
  const separator = `\n${mobilePrelude}`;
  const parts = source.split(separator);
  expect(parts).toHaveLength(2);
  expect(parts[1]?.endsWith('}\n')).toBe(true);
  return {
    base: parts[0] ?? '',
    mobile: parts[1]?.slice(0, -2) ?? '',
  };
}

function mobileRules(source: string) {
  expect(source.startsWith(mobilePrelude)).toBe(true);
  expect(source.endsWith('}\n')).toBe(true);
  return source.slice(mobilePrelude.length, -2);
}

function sha256(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

describe('route-scoped critical CSS source accounting', () => {
  it('moves every incumbent rule once into the shared, home, or detail-lane source set', async () => {
    const [
      shared,
      homeAccessibility,
      focus,
      homeSource,
      detail,
      article,
      review,
      memory,
      detailMobileSource,
      articleMobileSource,
      reviewMobileSource,
      motion,
    ] = await Promise.all([
      readFile(join(candidateRoot, 'app/current-parity.shared.css'), 'utf8'),
      readFile(join(candidateRoot, 'app/current-parity.home-accessibility.css'), 'utf8'),
      readFile(join(candidateRoot, 'app/current-parity.focus.css'), 'utf8'),
      readFile(join(candidateRoot, 'app/current-parity.home.css'), 'utf8'),
      readFile(join(candidateRoot, 'app/current-parity.detail.css'), 'utf8'),
      readFile(join(candidateRoot, 'app/current-parity.article.css'), 'utf8'),
      readFile(join(candidateRoot, 'app/current-parity.review.css'), 'utf8'),
      readFile(join(candidateRoot, 'app/current-parity.memory.css'), 'utf8'),
      readFile(join(candidateRoot, 'app/current-parity.detail-mobile.css'), 'utf8'),
      readFile(join(candidateRoot, 'app/current-parity.article-mobile.css'), 'utf8'),
      readFile(join(candidateRoot, 'app/current-parity.review-mobile.css'), 'utf8'),
      readFile(join(candidateRoot, 'app/current-parity.motion.css'), 'utf8'),
    ]);
    const home = splitRouteSource(homeSource);

    const reconstructedIncumbent = [
      shared,
      homeAccessibility,
      focus,
      '\n',
      detail,
      article,
      review,
      memory,
      '\n',
      home.base,
      '\n',
      mobilePrelude,
      mobileRules(detailMobileSource),
      mobileRules(articleMobileSource),
      mobileRules(reviewMobileSource),
      home.mobile,
      '}\n\n',
      motion,
    ].join('');

    expect(sha256(reconstructedIncumbent))
      .toBe('fd626eaf0c04e79c9f49cf3f971ce937e72ebca050836f73e596a9bd2e17ca9a');
    expect(Buffer.byteLength(reconstructedIncumbent)).toBe(14_346);
    expect(
      Buffer.byteLength(shared)
      + Buffer.byteLength(homeAccessibility)
      + Buffer.byteLength(focus)
      + Buffer.byteLength(motion),
    ).toBe(2_054);
    expect(Buffer.byteLength(homeSource)).toBe(7_475);
  });
});
