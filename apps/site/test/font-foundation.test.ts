import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { create, type Font } from 'fontkitten';
import { describe, expect, it } from 'vitest';

const candidateRoot = resolve(import.meta.dirname, '..');

function readFont(buffer: Buffer): Font {
  const font = create(buffer);
  if (font.isCollection) throw new Error('Expected a single semantic web font');
  return font;
}

describe('FORM & THOUGHT font release evidence', () => {
  it('packages the canonical OFL 1.1 text and associates exact upstream notices with every artifact', async () => {
    const licensePath = join(candidateRoot, 'public/fonts/OFL-1.1.txt');
    const present = await stat(licensePath).then(() => true, () => false);
    expect(present).toBe(true);
    if (!present) return;

    const [license, evidence] = await Promise.all([
      readFile(licensePath, 'utf8'),
      readFile(join(candidateRoot, 'public/fonts/LICENSES.md'), 'utf8'),
    ]);
    expect(createHash('sha256').update(license).digest('hex')).toBe('1d361a8f8e8ce6e68457dcd93fb56e162e6baa3bbb7e7573a290d44399f6b57e');
    expect(license).toContain('SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007');
    expect(license).toContain('PERMISSION & CONDITIONS');
    expect(license).toContain('TERMINATION');
    expect(license).toContain('DISCLAIMER');
    expect(license.trimEnd().endsWith('OTHER DEALINGS IN THE FONT SOFTWARE.')).toBe(true);

    for (const notice of [
      'Copyright 2012 Google Inc. All Rights Reserved.',
      "Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'",
      'Copyright 2015 the Cormorant Project Authors (github.com/CatharsisFonts/Cormorant)',
    ]) {
      expect(evidence).toContain(notice);
    }
    for (const file of [
      'form-thought-display-ko.woff2',
      'form-thought-wordmark.woff2',
      'form-thought-ui-ko.woff2',
    ]) {
      const row = evidence.split('\n').find((line) => (
        line.includes(`| \`${file}\` |`) && line.includes('Copyright')
      ));
      expect(row).toContain('`OFL-1.1.txt`');
    }
  });

  it('ships truthful Regular/400 name and OS/2 metadata with the recorded glyph counts', async () => {
    const expected = [
      {
        file: 'form-thought-display-ko.woff2',
        family: 'Noto Serif KR',
        fullName: 'Noto Serif KR Regular',
        postscriptName: 'NotoSerifKR-Regular',
        glyphs: 1360,
      },
      {
        file: 'form-thought-wordmark.woff2',
        family: 'Cormorant Garamond',
        fullName: 'Cormorant Garamond Regular',
        postscriptName: 'CormorantGaramond-Regular',
        glyphs: 13,
      },
      {
        file: 'form-thought-ui-ko.woff2',
        family: 'Noto Sans KR',
        fullName: 'Noto Sans KR Regular',
        postscriptName: 'NotoSansKR-Regular',
        glyphs: 1360,
      },
    ];

    for (const item of expected) {
      const font = readFont(await readFile(join(candidateRoot, 'public/fonts', item.file)));
      expect({
        family: font.familyName,
        subfamily: font.subfamilyName,
        fullName: font.fullName,
        postscriptName: font.postscriptName,
        os2Weight: font['OS/2'].usWeightClass,
        glyphs: font.numGlyphs,
      }).toEqual({
        family: item.family,
        subfamily: 'Regular',
        fullName: item.fullName,
        postscriptName: item.postscriptName,
        os2Weight: 400,
        glyphs: item.glyphs,
      });
    }
  });
});
