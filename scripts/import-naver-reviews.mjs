import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const blogId = 'moveattack';
const outputDirectory = join(process.cwd(), 'src', 'content', 'reviews');

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
  224104661846: 'the-life-you-can-save',
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

async function fetchReview(logNo) {
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

async function main() {
  await mkdir(outputDirectory, { recursive: true });

  for (const [logNo, title, date] of reviews) {
    const html = await fetchReview(logNo);
    const body = extractParagraphs(html);
    const coverImage = extractCoverImage(html);
    const sourceUrl = `https://blog.naver.com/${blogId}/${logNo}`;
    const description = buildDescription(body, title);
    const slug = slugByLogNo[logNo] ?? `naver-review-${logNo}`;
    const filePath = join(outputDirectory, `${slug}.mdx`);
    const content = `---\ntitle: ${yamlString(title)}\ndescription: ${yamlString(description)}\nitemType: "book"\nitemTitle: ${yamlString(title)}\ncompletedAt: "${date}"\ncreatedAt: "${date}"\nupdatedAt: "${date}"\ntags: ["book", "review", "naver-archive"]\nstatus: "published"\nsourceUrl: "${sourceUrl}"\ncoverImage: "${coverImage}"\n---\n\n${markdownEscape(body || `${title}을 읽고 남긴 서평입니다.`)}\n`;

    await writeFile(filePath, content);
    console.log(`Wrote ${filePath}`);
  }
}

await main();
