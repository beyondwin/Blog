import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadSourceRecords,
  resolveSourceMedia,
} from '../packages/content/src/source-records.ts';

const root = process.cwd();
const inventoryPath = process.env.REVIEW_COVER_RIGHTS_INVENTORY_PATH
  ?? 'docs/notes/project/assets/review-cover-rights/inventory.yml';
const registryPath = 'packages/content/review-cover-redistribution-approvals.json';

const expectedTransitions = [
  {
    from: 'researching',
    to: 'ready-for-independent-review',
    condition: 'exact candidate bytes and applicable redistribution evidence are complete',
  },
  {
    from: 'ready-for-independent-review',
    to: 'approved',
    condition: 'controller and independent-rights-reviewer approve the frozen tuple',
  },
  {
    from: 'ready-for-independent-review',
    to: 'hold',
    condition: 'independent review rejects the frozen tuple',
  },
  {
    from: 'researching',
    to: 'hold',
    condition: 'candidate or redistribution grant is absent or ambiguous',
  },
];

const expected = {
  'art-thief': {
    identity: { title: '예술 도둑', authors: ['마이클 핀클'], publisher: '생각의힘', isbn13: '9791193166659', editionLabel: '생각의힘 2024 초판, 염지선 옮김' },
    media: { sourceUrl: 'https://image.yes24.com/goods/133133202/XL', checksum: 'sha256:2d3a8e4d6cb4828a56dfae42edbb22e6b8c85141df46289ea5fabe978d491671', width: 771, height: 1200 },
  },
  'black-swan': {
    identity: { title: '블랙스완', authors: ['나심 니콜라스 탈레브'], publisher: '동녘사이언스', isbn13: '9788990247674', editionLabel: '동녘사이언스 2018 개정증보판, 차익종·김현구 옮김' },
    media: { sourceUrl: 'https://bnk.kpipa.or.kr/files/onix/book/trd/2018/04/30/s_o_9788990247674.jpg', checksum: 'sha256:2b59925c7925d38b5460450f070be24a22ee34a69dfb7ded04d269998b7d0ebd', width: 458, height: 671 },
  },
  'changing-their-minds': {
    identity: { title: '그들의 생각을 바꾸는 방법', authors: ['데이비드 맥레이니'], publisher: '웅진지식하우스', isbn13: '9788901269405', editionLabel: '웅진지식하우스 2023 종이책, 이수경 옮김' },
    media: { sourceUrl: 'https://image.yes24.com/goods/117664857/XL', checksum: 'sha256:394821abfdccd4283ae779e148c0c521a5baa4c48e9b7518e5f29ebafeb3e4d4', width: 802, height: 1200 },
  },
  'convenience-store-woman': {
    identity: { title: '편의점 인간', authors: ['무라타 사야카'], publisher: '살림출판사', isbn13: '9788952235268', editionLabel: '살림출판사 2016 양장, 김석희 옮김' },
    media: { sourceUrl: 'https://image.yes24.com/goods/33129949/XL', checksum: 'sha256:a4264d7125c3e846cf3da624261846af82d3270fe04a8b9e0752b9389a987cb8', width: 826, height: 1200 },
  },
  'devotion-of-suspect-x': {
    identity: { title: '용의자 X의 헌신', authors: ['히가시노 게이고'], publisher: '현대문학', isbn13: '9788972753698', editionLabel: '현대문학 2006 양장, 양억관 옮김' },
    media: null,
  },
  'doing-good-better': {
    identity: { title: '냉정한 이타주의자', authors: ['윌리엄 맥어스킬'], publisher: '부키', isbn13: '9788960515833', editionLabel: '부키 2017 한국어 초판, 전미영 옮김' },
    media: { sourceUrl: 'https://www.bookie.co.kr/bookimg/97889605158335.jpg', checksum: 'sha256:83c15615cc72eff0d32a02a677d8c6215eb6beb9bacc55cfdf074c2d0f386bf1', width: 1000, height: 1417 },
  },
  factfulness: {
    identity: { title: '팩트풀니스', authors: ['한스 로슬링', '올라 로슬링', '안나 로슬링 뢴룬드'], publisher: '김영사', isbn13: '9788934985068', editionLabel: '김영사 2019판, 이창신 옮김' },
    media: { sourceUrl: 'https://image.yes24.com/goods/69724044/XL', checksum: 'sha256:b33eafae337acb129da7309fda02ead4bbb1f950f5ccbd789806af63f4827caf', width: 787, height: 1200 },
  },
  'future-arrived-first': {
    identity: { title: '먼저 온 미래', authors: ['장강명'], publisher: '동아시아', isbn13: '9788962626605', editionLabel: '동아시아 2025 초판' },
    media: { sourceUrl: 'https://www.kobic.net/bookImage/book/coverImg/202507/9788962626605C001.jpg', checksum: 'sha256:ec4fc247f075c2afeb2c3777b4897ff2166f7e34685bd4940b298de75a12901b', width: 458, height: 703 },
  },
  'goethe-said-everything': {
    identity: { title: '괴테는 모든 것을 말했다', authors: ['스즈키 유이'], publisher: '리프', isbn13: '9791194530701', editionLabel: '리프 2025 한국어 초판, 이지수 옮김' },
    media: { sourceUrl: 'https://image.yes24.com/goods/164510819/XL', checksum: 'sha256:dfa171a06be873225b70434dbfae6e829bf41aff7e2791eea2564248bb42416c', width: 850, height: 1200 },
  },
  habitus: {
    identity: { title: '아비투스', authors: ['도리스 메르틴'], publisher: '다산초당', isbn13: '9791130698366', editionLabel: '다산초당 2023 양장특별판, 배명자 옮김' },
    media: { sourceUrl: 'https://image.yes24.com/goods/118146744/XL', checksum: 'sha256:8f9e221a1ae7fcd14abd42a4b14ed2f895b3274bb7fb171f164bb777f41810fc', width: 857, height: 1200 },
  },
  'how-adam-smith-can-change-your-life': {
    identity: { title: '내 안에서 나를 만드는 것들', authors: ['러셀 로버츠'], publisher: '세계사', isbn13: '9788933870648', editionLabel: '세계사 2015 초판, 이현주 옮김' },
    media: { sourceUrl: 'https://image.yes24.com/goods/22659314/XL', checksum: 'sha256:eea49839231272b1f03fccb2eb88f4dd1467cccaad89085852adeabd23668642', width: 848, height: 1200 },
  },
  'how-we-crossed-winter': {
    identity: { title: '우리가 겨울을 지나온 방식', authors: ['문미순'], publisher: '나무옆의자', isbn13: '9791161571492', editionLabel: '나무옆의자 2023 일반판' },
    media: { sourceUrl: 'https://image.yes24.com/goods/118785110/XL', checksum: 'sha256:12461752be2a87ba403d03e214102ba53492d9cd28e559bc21352e13bba463e6', width: 809, height: 1200 },
  },
  lolita: {
    identity: { title: '롤리타', authors: ['블라디미르 나보코프'], publisher: '문학동네', isbn13: '9788954620437', editionLabel: '문학동네 세계문학전집 105, 2013 무선판, 김진준 옮김' },
    media: { sourceUrl: 'https://image.aladin.co.kr/product/2264/95/cover500/8954620434_3.jpg', checksum: 'sha256:0ac7527f245e52005c2278f818e2b2b06cec07c225c7a7dcbb5d8056057ad51d', width: 500, height: 750 },
  },
  'lord-of-the-flies': {
    identity: { title: '파리대왕', authors: ['윌리엄 골딩'], publisher: '민음사', isbn13: '9788937460197', editionLabel: '민음사 세계문학전집 19, 1999 반양장, 유종호 옮김' },
    media: { sourceUrl: 'https://minumsa.minumsa.com/wp-content/uploads/bookcover/019_%ED%8C%8C%EB%A6%AC%EB%8C%80%EC%99%95-500x842.jpg', checksum: 'sha256:d52e4c5aa9fac202335b4a3a2b324891bfa8ee7aecc79f550df6d205af187308', width: 500, height: 842 },
  },
  'miracles-of-namiya-general-store': {
    identity: { title: '나미야 잡화점의 기적', authors: ['히가시노 게이고'], publisher: '현대문학', isbn13: '9788972756194', editionLabel: '현대문학 2012 원판 양장, 양윤옥 옮김' },
    media: { sourceUrl: 'https://www.hdmh.co.kr/upload/cover/hdmhbooks/%EB%82%98%EB%AF%B8%EC%95%BC%ED%91%9C1.jpg', checksum: 'sha256:13f4e5fa971c971147adcfb7ab6a8f5c734a55569a56e25a13dd19533ab0473b', width: 311, height: 456 },
  },
  nevertheless: {
    identity: { title: '그럼에도 불구하고', authors: ['공지영'], publisher: '위즈덤하우스', isbn13: '9791191119305', editionLabel: '위즈덤하우스 2020 일반판' },
    media: { sourceUrl: 'https://image.yes24.com/goods/93760424/XL', checksum: 'sha256:85212b4b57d272697a81d63646f08217acd331b8177a4fea9fd1a45e60b91259', width: 808, height: 1200 },
  },
  'poor-charlies-almanack': {
    identity: { title: '가난한 찰리의 연감', authors: ['찰리 멍거'], publisher: '김영사', isbn13: '9788934911388', editionLabel: '김영사 2024 공식 번역 양장, 피터 코프먼 엮음, 김태훈 옮김' },
    media: { sourceUrl: 'https://bnk.kpipa.or.kr/files/onix/2024/10/25/s_20241025100452-6275338240267761844.jpg', checksum: 'sha256:3b584afb43774a35d4a9f215fef240356b42d24c127891b32d658a7b30a3569a', width: 600, height: 866 },
  },
  siddhartha: {
    identity: { title: '싯다르타', authors: ['헤르만 헤세'], publisher: '문학동네', isbn13: '9788954654418', editionLabel: '문학동네 세계문학전집 173, 2018 원판, 권혁준 옮김' },
    media: { sourceUrl: 'https://image.yes24.com/goods/67723866/XL', checksum: 'sha256:4e957b1fb0ada2f2582c40cd54215fec63c9ecf2c0c222250be93eda067e8251', width: 801, height: 1200 },
  },
};

const expectedIds = Object.keys(expected).sort();
const controlledStates = new Set(['researching', 'ready-for-independent-review', 'approved', 'hold']);
const directHoldBases = new Set(['absent-candidate', 'ambiguous-candidate', 'absent-grant', 'ambiguous-grant']);

function clone(value) {
  return structuredClone(value);
}

function sourceIdentity(record) {
  return {
    title: record.itemTitle,
    authors: Array.isArray(record.itemAuthor) ? record.itemAuthor : [record.itemAuthor],
    publisher: record.publisher,
    isbn13: record.isbn13,
    editionLabel: record.editionLabel,
    ...(record.publicationYear === undefined ? {} : { publicationYear: record.publicationYear }),
  };
}

function assertValidLedger(candidate, snapshot) {
  expect(candidate.version).toBe(1);
  expect(candidate.redistributionPrinciple).toBe('Product and image URLs identify candidates only; they do not establish public redistribution rights.');
  expect(candidate.workflow?.allowedTransitions).toEqual(expectedTransitions);
  expect(Array.isArray(candidate.records)).toBe(true);

  const ids = candidate.records.map((record) => record.recordId);
  expect(ids).toHaveLength(18);
  expect(new Set(ids).size).toBe(18);
  expect(ids).toEqual(expectedIds);
  expect(ids).not.toContain('example-book-review');
  expect(snapshot.sourceIds).toEqual(expectedIds);

  for (const record of candidate.records) {
    const literal = expected[record.recordId];
    expect(literal, `${record.recordId}: independent literal exists`).toBeDefined();
    expect(record.bibliographicIdentity, `${record.recordId}: inventory identity`).toEqual(literal.identity);
    expect(snapshot.identities[record.recordId], `${record.recordId}: parsed source identity`).toEqual(literal.identity);

    if (literal.media) {
      expect(record.currentMedia, `${record.recordId}: existing media tuple`).toEqual({ state: 'existing', ...literal.media });
      expect(snapshot.media[record.recordId], `${record.recordId}: decoded media tuple`).toEqual(literal.media);
    } else {
      expect(record.currentMedia, `${record.recordId}: absent media tuple`).toEqual({ state: 'absent', reason: 'no source media bundle exists' });
      expect(snapshot.media[record.recordId], `${record.recordId}: no decoded media`).toBeNull();
      expect(record.queuedChecks).toContain('exact-candidate-and-redistribution-grant');
    }

    expect(controlledStates.has(record.state), `${record.recordId}: controlled state`).toBe(true);
    expect(Array.isArray(record.stateHistory), `${record.recordId}: state history`).toBe(true);
    expect(record.stateHistory.length, `${record.recordId}: non-empty state history`).toBeGreaterThan(0);
    expect(record.stateHistory.at(-1)?.state, `${record.recordId}: current state matches history`).toBe(record.state);
    expect(record.stateHistory[0]?.state, `${record.recordId}: history starts at researching`).toBe('researching');

    for (let index = 1; index < record.stateHistory.length; index += 1) {
      const from = record.stateHistory[index - 1]?.state;
      const to = record.stateHistory[index]?.state;
      expect(controlledStates.has(to), `${record.recordId}: history uses controlled state`).toBe(true);
      expect(expectedTransitions.some((transition) => transition.from === from && transition.to === to), `${record.recordId}: legal transition ${from} -> ${to}`).toBe(true);
      if (from === 'researching' && to === 'hold') {
        expect(directHoldBases.has(record.holdBasis), `${record.recordId}: direct hold basis`).toBe(true);
        expect(record.holdReason?.trim(), `${record.recordId}: direct hold reason`).toBeTruthy();
      }
    }

    expect(Array.isArray(record.checkedSources), `${record.recordId}: checked sources`).toBe(true);
    expect(record.checkedSources.length, `${record.recordId}: checked source count`).toBeGreaterThan(0);
    for (const source of record.checkedSources) {
      expect(source.kind?.trim(), `${record.recordId}: source kind`).toBeTruthy();
      expect(source.locator?.trim(), `${record.recordId}: source locator`).toBeTruthy();
      expect(source.finding?.trim(), `${record.recordId}: source finding`).toBeTruthy();
    }
    expect(record.decisionReason?.trim(), `${record.recordId}: decision reason`).toBeTruthy();

    expect(snapshot.approvalArtifacts.decisions[record.recordId], `${record.recordId}: no canonical decision`).toBe(false);
    expect(snapshot.approvalArtifacts.registryIds).not.toContain(record.recordId);
    expect(snapshot.approvalArtifacts.receiptIds).not.toContain(record.recordId);
  }
}

async function repositorySnapshot() {
  const records = (await loadSourceRecords(root))
    .filter((record) => record.collection === 'reviews' && record.status === 'published' && record.draft !== true);
  const identities = {};
  const media = {};
  const receiptIds = [];

  for (const record of records) {
    identities[record.id] = sourceIdentity(record);
    if (!record.coverMedia) {
      media[record.id] = null;
      continue;
    }
    const resolved = await resolveSourceMedia(root, 'reviews', record.id, record.coverMedia);
    const manifestPath = `src/assets/content/reviews/${record.id}/media.yml`;
    const manifest = parseYaml(await readFile(join(root, manifestPath), 'utf8'));
    const item = manifest.items.find((entry) => entry.id === record.coverMedia);
    media[record.id] = {
      sourceUrl: item.sourceUrl,
      checksum: resolved.checksum,
      width: resolved.width,
      height: resolved.height,
    };
    if (item.redistributionApproval) receiptIds.push(record.id);
  }

  const registry = JSON.parse(await readFile(join(root, registryPath), 'utf8'));
  return {
    sourceIds: records.map((record) => record.id).sort(),
    identities,
    media,
    approvalArtifacts: {
      decisions: Object.fromEntries(expectedIds.map((id) => [
        id,
        existsSync(join(root, `docs/notes/project/assets/review-cover-rights/${id}/redistribution-decision.yml`)),
      ])),
      registryIds: registry.approvals.map((approval) => approval.recordId),
      receiptIds,
    },
  };
}

let ledger;
let snapshot;

beforeAll(async () => {
  try {
    ledger = parseYaml(await readFile(join(root, inventoryPath), 'utf8'));
  } catch (error) {
    throw new Error(`${inventoryPath}: required research inventory is missing`, { cause: error });
  }
  snapshot = await repositorySnapshot();
});

describe('review cover rights research inventory', () => {
  it('exhaustively binds the 18 public review identities and current media bytes', () => {
    assertValidLedger(ledger, snapshot);
    expect(ledger.records.filter((record) => record.currentMedia.state === 'existing')).toHaveLength(17);
    expect(ledger.records.filter((record) => record.currentMedia.state === 'absent').map((record) => record.recordId)).toEqual(['devotion-of-suspect-x']);
  });

  it('seeds every record in researching without a canonical approval artifact', () => {
    expect(ledger.records.map((record) => record.state)).toEqual(Array(18).fill('researching'));
    expect(Object.values(snapshot.approvalArtifacts.decisions)).not.toContain(true);
    expect(snapshot.approvalArtifacts.registryIds).toEqual([]);
    expect(snapshot.approvalArtifacts.receiptIds).toEqual([]);
  });

  it.each([
    ['drops a public ID', (value) => value.records.pop()],
    ['adds the example record', (value) => value.records.push({ ...clone(value.records[0]), recordId: 'example-book-review' })],
    ['reorders public IDs', (value) => { [value.records[0], value.records[1]] = [value.records[1], value.records[0]]; }],
    ['changes an exact title', (value) => { value.records[0].bibliographicIdentity.title = '다른 제목'; }],
    ['changes author order', (value) => { value.records.find((record) => record.recordId === 'factfulness').bibliographicIdentity.authors.reverse(); }],
    ['changes a publisher', (value) => { value.records[0].bibliographicIdentity.publisher = '다른 출판사'; }],
    ['changes an ISBN', (value) => { value.records[0].bibliographicIdentity.isbn13 = '9780000000000'; }],
    ['changes an edition label', (value) => { value.records[0].bibliographicIdentity.editionLabel = '다른 판본'; }],
    ['invents an optional publication year', (value) => { value.records[0].bibliographicIdentity.publicationYear = 2024; }],
    ['changes a source URL', (value) => { value.records[0].currentMedia.sourceUrl = 'https://example.com/cover.jpg'; }],
    ['changes a checksum', (value) => { value.records[0].currentMedia.checksum = `sha256:${'0'.repeat(64)}`; }],
    ['changes decoded dimensions', (value) => { value.records[0].currentMedia.width += 1; }],
    ['changes decoded height', (value) => { value.records[0].currentMedia.height += 1; }],
    ['changes an existing media state', (value) => { value.records[0].currentMedia.state = 'absent'; }],
    ['invents absent media facts', (value) => { value.records.find((record) => record.recordId === 'devotion-of-suspect-x').currentMedia = { state: 'existing', sourceUrl: 'https://example.com/cover.jpg', checksum: `sha256:${'0'.repeat(64)}`, width: 1, height: 1 }; }],
    ['uses an uncontrolled state', (value) => { value.records[0].state = 'verified'; value.records[0].stateHistory[0].state = 'verified'; }],
    ['skips independent review before approval', (value) => { value.records[0].state = 'approved'; value.records[0].stateHistory.push({ state: 'approved', recordedAt: '2026-08-30' }); }],
    ['directly holds without a constrained basis', (value) => { value.records[0].state = 'hold'; value.records[0].stateHistory.push({ state: 'hold', recordedAt: '2026-08-30' }); }],
    ['removes checked sources', (value) => { value.records[0].checkedSources = []; }],
    ['removes a decision reason', (value) => { value.records[0].decisionReason = ''; }],
    ['changes the controlled state graph', (value) => { value.workflow.allowedTransitions.pop(); }],
    ['treats a product URL as a grant', (value) => { value.redistributionPrinciple = 'Product URLs establish redistribution rights.'; }],
  ])('rejects drift that %s', (_label, mutate) => {
    const changed = clone(ledger);
    mutate(changed);
    expect(() => assertValidLedger(changed, snapshot)).toThrow();
  });

  it.each([
    ['canonical decision', (value) => { value.decisions['art-thief'] = true; }],
    ['approval registry tuple', (value) => { value.registryIds.push('art-thief'); }],
    ['media receipt', (value) => { value.receiptIds.push('art-thief'); }],
  ])('rejects a premature %s', (_label, mutate) => {
    const changedSnapshot = clone(snapshot);
    mutate(changedSnapshot.approvalArtifacts);
    expect(() => assertValidLedger(ledger, changedSnapshot)).toThrow();
  });

  it('rejects a published review corpus outside the exact 18 IDs', () => {
    const changedSnapshot = clone(snapshot);
    changedSnapshot.sourceIds = [...expectedIds, 'example-book-review'];
    expect(() => assertValidLedger(ledger, changedSnapshot)).toThrow();
  });
});
