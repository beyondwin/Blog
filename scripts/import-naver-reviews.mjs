import { lstat, mkdir, mkdtemp, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

function resolveBlogId() {
  const blogId = process.env.NAVER_BLOG_ID?.trim();
  if (!blogId) {
    throw new Error('NAVER_BLOG_ID is required');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(blogId)) {
    throw new Error('NAVER_BLOG_ID must be a blog id');
  }
  return blogId;
}

const reviews = [
  ['224317941520', '그들의 생각을 바꾸는 방법', '2026-06-16'],
  ['224303691700', '파리대왕', '2026-06-02'],
  ['224298143317', '블랙스완', '2026-05-27'],
  ['224290483209', '그럼에도 불구하고', '2026-05-19'],
  ['224283462315', '괴테는 모든 것을 말했다', '2026-05-12'],
  ['224259930927', '용의자 X의 헌신', '2026-04-21'],
  ['224253884562', '가난한 찰리의 연감', '2026-04-16'],
  ['224243176870', '예술 도둑', '2026-04-06'],
  ['224228023325', '싯다르타', '2026-03-24'],
  ['224211518026', '아비투스', '2026-03-10'],
  ['224189933156', '내 안에서 나를 만드는 것들', '2026-02-20'],
  ['224178733988', '롤리타', '2026-02-10'],
  ['224160747439', '먼저 온 미래', '2026-01-26'],
  ['224147334654', '우리가 겨울을 지나온 방식', '2026-01-15'],
  ['224136546661', '편의점 인간', '2026-01-06'],
  ['224126488699', '나미야 잡화점의 기적', '2025-12-29'],
  ['224104661846', '냉정한 이타주의자', '2025-12-10'],
  ['224079263345', '팩트풀니스', '2025-11-17'],
];

const slugByLogNo = {
  224317941520: 'changing-their-minds',
  224303691700: 'lord-of-the-flies',
  224298143317: 'black-swan',
  224290483209: 'nevertheless',
  224283462315: 'goethe-said-everything',
  224259930927: 'devotion-of-suspect-x',
  224253884562: 'poor-charlies-almanack',
  224243176870: 'art-thief',
  224228023325: 'siddhartha',
  224211518026: 'habitus',
  224189933156: 'how-adam-smith-can-change-your-life',
  224178733988: 'lolita',
  224160747439: 'future-arrived-first',
  224147334654: 'how-we-crossed-winter',
  224136546661: 'convenience-store-woman',
  224126488699: 'miracles-of-namiya-general-store',
  224104661846: 'doing-good-better',
  224079263345: 'factfulness',
};

function decodeHtml(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function textFromHtml(value) {
  return decodeHtml(value)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\u200b/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function yamlString(value) {
  return JSON.stringify(value);
}

function markdownEscape(value) {
  return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}

function extractParagraphs(html) {
  const container = html.match(/<div class="se-main-container">([\s\S]*?)<div class="post_footer_contents"/)?.[1]
    ?? html.match(/<div class="se-main-container">([\s\S]*?)<div class="social_plugin_property"/)?.[1]
    ?? '';

  const paragraphs = [];
  const paragraphPattern = /<p class="se-text-paragraph[\s\S]*?<\/p>/g;
  const matches = container.matchAll(paragraphPattern);

  for (const match of matches) {
    const text = textFromHtml(match[0]);
    if (text) {
      paragraphs.push(text);
    } else if (paragraphs.at(-1) !== '') {
      paragraphs.push('');
    }
  }

  return paragraphs
    .join('\n\n')
    .replace(/\n{4,}/g, '\n\n')
    .trim();
}

function extractCoverImage(html) {
  const encoded = html.match(/"thumbnail"\s*:\s*"([^"]+)"/)?.[1]
    ?? html.match(/&quot;thumbnail&quot;\s*:\s*&quot;([^&]+)&quot;/)?.[1];

  return encoded ? decodeHtml(encoded).replace(/\\\//g, '/') : '';
}

function buildDescription(body, title) {
  const firstParagraph = body.split(/\n{2,}/).find((paragraph) => paragraph.length > 20);
  if (!firstParagraph) {
    return `${title}을 읽고 남긴 서평.`;
  }
  return firstParagraph.length > 120 ? `${firstParagraph.slice(0, 118)}...` : firstParagraph;
}

async function fetchReview(blogId, logNo) {
  const url = `https://m.blog.naver.com/${blogId}/${logNo}`;
  let lastError;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 beyondwin-review-import/1.0',
          accept: 'text/html,application/xhtml+xml',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
      }

      return response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 900));
    }
  }

  throw lastError;
}

function parseArgs(argv) {
  let outputDirectory = '';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg !== '--output') throw new Error(`unknown argument: ${arg}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error('--output requires a value');
    if (outputDirectory) throw new Error('--output may only be provided once');
    outputDirectory = value;
    index += 1;
  }

  if (!outputDirectory) {
    throw new Error('Usage: NAVER_BLOG_ID=<id> node scripts/import-naver-reviews.mjs --output <new-local-intake-directory>');
  }

  return { outputDirectory };
}

function isInside(parent, target) {
  const pathFromParent = relative(parent, target);
  return pathFromParent === '' || (!pathFromParent.startsWith('..') && !isAbsolute(pathFromParent));
}

async function resolveRepositoryRelativePath(path) {
  const requestedPath = resolve(path);
  const workingDirectory = await realpath(process.cwd());
  let current = requestedPath;
  const segments = [];

  while (true) {
    let info;
    try {
      info = await lstat(current);
      const canonical = await realpath(current);
      if (canonical === workingDirectory) break;
      if (info.isSymbolicLink()) {
        throw new Error(`output path contains a symbolic link: ${current}`);
      }
      if (current !== requestedPath && !info.isDirectory()) {
        throw new Error(`output path component is not a directory: ${current}`);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }

    const parent = dirname(current);
    if (parent === current) {
      throw new Error('--output must resolve inside the current repository');
    }
    segments.push(basename(current));
    current = parent;
  }

  const relativePath = segments.reverse().join(sep);
  if (!relativePath) throw new Error('--output must name a new directory inside the current repository');
  return { relativePath, workingDirectory };
}

async function resolveLocalDestination(outputDirectory) {
  const requestedPath = resolve(process.cwd(), outputDirectory);
  const { relativePath, workingDirectory } = await resolveRepositoryRelativePath(requestedPath);
  const absoluteOutput = resolve(workingDirectory, relativePath);
  const publicRoots = [resolve(workingDirectory, 'src'), resolve(workingDirectory, 'public')];
  if (publicRoots.some((root) => isInside(root, absoluteOutput))) {
    throw new Error('--output must be a local intake directory outside src/ and public/');
  }

  return {
    finalPath: absoluteOutput,
    name: basename(absoluteOutput),
    parentPath: dirname(absoluteOutput),
    relativePath,
    workingDirectory,
  };
}

async function assertDestinationMissing(path) {
  try {
    await lstat(path);
    throw new Error(`output directory already exists: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function prepareCanonicalParent(destination) {
  const parentRelative = relative(destination.workingDirectory, destination.parentPath);
  const segments = parentRelative === '' ? [] : parentRelative.split(sep);
  let current = destination.workingDirectory;

  for (const segment of segments) {
    current = join(current, segment);
    try {
      await mkdir(current);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }

    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error(`output path contains a symbolic link: ${current}`);
    if (!info.isDirectory()) throw new Error(`output path component is not a directory: ${current}`);
    if (await realpath(current) !== current) {
      throw new Error(`output path is not canonical: ${current}`);
    }
  }

  return realpath(destination.parentPath);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const initialDestination = await resolveLocalDestination(args.outputDirectory);
  await assertDestinationMissing(initialDestination.finalPath);
  const blogId = resolveBlogId();
  const records = [];

  for (const [logNo, title, date] of reviews) {
    const html = await fetchReview(blogId, logNo);
    const body = extractParagraphs(html);
    const discoveredCoverUrl = extractCoverImage(html);
    const sourceUrl = `https://blog.naver.com/${blogId}/${logNo}`;
    const description = buildDescription(body, title);
    const slug = slugByLogNo[logNo] ?? `naver-review-${logNo}`;
    const content = `---\ntitle: ${yamlString(title)}\ndescription: ${yamlString(description)}\nitemType: "book"\nitemTitle: ${yamlString(title)}\ncompletedAt: "${date}"\ncreatedAt: "${date}"\nupdatedAt: "${date}"\ntags: ["book", "review", "naver-archive"]\nstatus: "review"\ndraft: true\nsourceUrl: "${sourceUrl}"\n---\n\n${markdownEscape(body || `${title}을 읽고 남긴 서평입니다.`)}\n`;
    records.push({ slug, sourceUrl, discoveredCoverUrl, content });
  }

  const destination = await resolveLocalDestination(args.outputDirectory);
  await assertDestinationMissing(destination.finalPath);
  const canonicalParent = await prepareCanonicalParent(destination);
  const reservedDestination = await resolveLocalDestination(args.outputDirectory);
  if (
    reservedDestination.finalPath !== destination.finalPath
    || await realpath(reservedDestination.parentPath) !== canonicalParent
  ) {
    throw new Error('output parent changed before intake staging');
  }

  let stagingDirectory;
  try {
    stagingDirectory = await mkdtemp(join(canonicalParent, `.${destination.name}-staging-`));
    const canonicalStaging = await realpath(stagingDirectory);
    if (dirname(canonicalStaging) !== canonicalParent || !isInside(canonicalParent, canonicalStaging)) {
      throw new Error('intake staging directory escaped its canonical parent');
    }

    for (const record of records) {
      await writeFile(join(stagingDirectory, `${record.slug}.mdx`), record.content, { flag: 'wx' });
    }

    const report = records.map(({ slug, sourceUrl, discoveredCoverUrl }) => ({
      slug,
      sourceUrl,
      discoveredCoverUrl,
    }));
    await writeFile(
      join(stagingDirectory, 'naver-review-intake.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      { flag: 'wx' },
    );

    const finalDestination = await resolveLocalDestination(args.outputDirectory);
    if (
      finalDestination.finalPath !== destination.finalPath
      || await realpath(finalDestination.parentPath) !== canonicalParent
    ) {
      throw new Error('output parent changed before atomic intake publish');
    }
    const finalStaging = await realpath(stagingDirectory);
    if (dirname(finalStaging) !== canonicalParent || !isInside(canonicalParent, finalStaging)) {
      throw new Error('intake staging directory escaped before atomic publish');
    }
    await assertDestinationMissing(finalDestination.finalPath);
    await rename(stagingDirectory, finalDestination.finalPath);
    stagingDirectory = undefined;

    for (const record of records) {
      console.log(`Wrote ${join(finalDestination.finalPath, `${record.slug}.mdx`)}`);
    }
    console.log(`Wrote ${join(finalDestination.finalPath, 'naver-review-intake.json')}`);
  } catch (error) {
    if (stagingDirectory) await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
}

await main();
