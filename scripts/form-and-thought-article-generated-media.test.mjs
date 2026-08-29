import { createHash } from 'node:crypto';
import { cp, access, appendFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { recordsForCollection } from '../apps/site/app/release.server.ts';
import { ARTICLE_TOPICS } from '../apps/site/src/ui/articles/articleTopics.ts';
import { buildPublicRelease } from '../packages/content/src/release/build-release.ts';
import { readActiveRelease } from '../packages/content/src/release/read-release.ts';
import { generatedMediaDecisionManifestSchema } from '../packages/content/src/schemas.ts';
import {
  parseGeneratedMediaApprovalRegistry,
} from '../packages/content/src/media/generated-media-approval-registry.mjs';
import { validateMediaRepository } from './validate-media.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = 'packages/content/generated-media-approval-batches.json';
const agentsDecisionPath = 'docs/notes/project/assets/form-and-thought-generated/articles/decision-manifest-agents.yml';
const agentsMediaPath = 'src/assets/content/articles/andrej-karpathy-skills-analysis/media.yml';
const agentsAssetPath = 'src/assets/content/articles/andrej-karpathy-skills-analysis/editorial-hero.png';
const articleBriefsPath = 'docs/notes/project/assets/form-and-thought-generated/articles/topic-family-image-briefs.yml';
const topicRefreshBatchId = 'topic-refresh';
const topicRefreshDecisionPath = 'docs/notes/project/assets/form-and-thought-generated/articles/decision-manifest-topic-refresh.yml';
const topicRefreshContactSheetPath = 'docs/notes/project/assets/form-and-thought-generated/articles/approved-contact-sheet-topic-refresh.png';
const topicRefreshRightsLedgerPath = 'docs/notes/project/assets/form-and-thought-generated/articles/candidate-rights-review-topic-refresh.yml';
const requiredBatches = ['calibration', 'agents', 'design', 'data-search', 'architecture-validation', topicRefreshBatchId];
const selectedCandidates = [
  'H01', 'A03', 'T01',
  'AG01', 'AG02', 'AG03', 'AG04', 'AG05',
  'DS01', 'DS03',
  'DT01',
  'AV01', 'AV02', 'AV03', 'AV05',
  'TR01', 'TR05', 'TR09', 'TR13', 'TR17', 'TR21', 'TR25', 'TR32', 'TR35', 'TR38', 'TR41',
];
const heldCandidates = ['DS02', 'DT02', 'AV04', 'AV06', 'TR29'];
const topicRefreshSelections = [
  ['TR01', 'agents-md-vs-agent-skills-evidence'],
  ['TR05', 'andrej-karpathy-skills-analysis'],
  ['TR09', 'aws-static-frontend-serverless-bff'],
  ['TR13', 'codex-ui-mockup-workflow'],
  ['TR17', 'context-refinement-system-design'],
  ['TR21', 'hermes-agent-persistent-worker-runtime'],
  ['TR25', 'lazycodex-agent-harness-analysis'],
  ['TR32', 'oh-my-pi-deep-review'],
  ['TR35', 'ponytail-agent-minimalism-analysis'],
  ['TR38', 'postgresql-bm25-pg-search'],
  ['TR41', 'uncle-bob-ai-code-review-evidence'],
].map(([candidateId, recordId]) => ({
  candidateId,
  collection: 'articles',
  recordId,
  mediaId: 'editorial-topic-hero',
}));
const topicRefreshRejectedCandidates = [
  'TR02', 'TR06', 'TR10', 'TR14', 'TR18', 'TR22', 'TR26',
  'TR29', 'TR30', 'TR31', 'TR33', 'TR34', 'TR36', 'TR37', 'TR42',
];
const topicRefreshHoldCandidateIds = ['TR29'];
const topicRefreshContactSheetChecksum = 'sha256:a534d6004cefd388951aa5a85fd61b4f2797b090012b096da160a5a1c38fdc7f';
const topicRefreshControllerReceiptChecksum = 'sha256:7640791aec2378d64048a68472ed1f162a2fd64e14611a263b9751c7e22a7164';
const topicRefreshRightsRows = [
  ['TR01', 'agents-md-vs-agent-skills-evidence', 'ea0b37717a5cbc5e009c171269672205c8bf764b8d4dacd54deca53b06b6296e', 'approved'],
  ['TR05', 'andrej-karpathy-skills-analysis', '89a6e70153941986a83580d67b8dec42a4c7c27c632565710422f9b7b369ba74', 'approved'],
  ['TR09', 'aws-static-frontend-serverless-bff', '32228b6b02eaa0257452b1bea5baf37acc79bd7507cb92d7e3a84ffcc4e29264', 'approved'],
  ['TR13', 'codex-ui-mockup-workflow', 'b18b29cecf538f6848d17ad00afb0c2723822784c3979c60ea1fda91b4fb79b0', 'approved'],
  ['TR17', 'context-refinement-system-design', 'df5b5b82658cc9d191f9747a26cf26ca03c75f0ad24ddd281db305e62cd8f5ec', 'approved'],
  ['TR21', 'hermes-agent-persistent-worker-runtime', 'bb9f7764d051d29a1a8f461f7ffb53409d82a6712b3124401c275b05568efa0e', 'approved'],
  ['TR25', 'lazycodex-agent-harness-analysis', '589d0088ab856a11ee7d44417867ea131f3f9c58250888f01f865b6ef14529ad', 'approved'],
  ['TR29', 'oh-my-pi-deep-review', 'cc64489f797f0c57e6ba0191895282a9e8c930158be71af9216937032bd853ed', 'hold'],
  ['TR32', 'oh-my-pi-deep-review', '6fdf396f251a37d38f579d5f03700350dcead2f59166995e193d7a4bfaa23462', 'approved'],
  ['TR35', 'ponytail-agent-minimalism-analysis', '1401bdd29a0aade52ca225467e3e73cc61f045dad85d901c5178d3b4b717d3b3', 'approved'],
  ['TR38', 'postgresql-bm25-pg-search', '7988d77a8369514c4505fbab77734a502842e65d735acc4f13c0401cd37e25c0', 'approved'],
  ['TR41', 'uncle-bob-ai-code-review-evidence', '477e85a8339792aad65dc777fcfa3ea99026468912b4246a0548e1be19120e75', 'approved'],
].map(([candidateId, recordId, checksum, outcome]) => ({ candidateId, recordId, checksum, outcome }));
const topicRefreshRiskFlags = [
  'externalImageInputs',
  'namedOrLivingArtist',
  'recognizablePersonOrProduct',
  'readableMark',
];
const articleDecisions = ['retain', 'replace', 'add'];
const articleFamilies = [
  'people-action',
  'tool-workbench',
  'data-structure',
  'boundary-evidence',
  'design-material',
  'reading-reflection',
];
const cameraDistances = ['close', 'medium', 'wide'];
const genericBriefValue = /^(?:tbd|todo|n\/?a|none|article|content|image|subject|action|대표 이미지|내용에 맞는 이미지)$/iu;
const lockedArticleBriefContract = [
  {
    recordId: 'graphify-code-knowledge-graph-deep-dive',
    decision: 'retain',
    family: 'data-structure',
    cameraDistance: 'wide',
    subject: '높이가 다른 구조 사이에서 멈춘 검은 연결 다리',
    semanticChecksum: 'sha256:8c8eed12160052b2fc6cc9998fda70884f331fad7fa98ad72e4930d4c37ffabf',
  },
  {
    recordId: 'agents-md-vs-agent-skills-evidence',
    decision: 'replace',
    family: 'boundary-evidence',
    cameraDistance: 'close',
    subject: '깊이와 색이 다른 지침 카드 두 장과 분리 보관함',
    semanticChecksum: 'sha256:a459e2491e6dead8f9098a613535e77cfc0b8e727718faa7950ae44b3c96b5db',
    candidateRounds: [['TR01', 'TR02'], ['TR03', 'TR04']],
  },
  {
    recordId: 'ai-design-references',
    decision: 'retain',
    family: 'design-material',
    cameraDistance: 'medium',
    subject: '테라코타와 종이 면 위의 검은 사각 재료 프레임',
    semanticChecksum: 'sha256:70ffe0e1f74b82cd18608138b2f8ad5d58f7a4f04a49ac8efb00800137fa93ea',
  },
  {
    recordId: 'andrej-karpathy-skills-analysis',
    decision: 'replace',
    family: 'people-action',
    cameraDistance: 'wide',
    subject: '손과 네 개의 무문자 점검 토큰이 놓인 목재 작업대',
    semanticChecksum: 'sha256:b8ff45fe7668b6b694bf6346521f39aa4e44d3ed170afa079fc468cd97f2b29e',
    candidateRounds: [['TR05', 'TR06'], ['TR07', 'TR08']],
  },
  {
    recordId: 'aws-static-frontend-serverless-bff',
    decision: 'replace',
    family: 'boundary-evidence',
    cameraDistance: 'medium',
    subject: '서로 다른 재질의 두 구역 사이에 놓인 단일 검수 트레이',
    semanticChecksum: 'sha256:6eea5036d8ad52d920e896b88f9286cc840219e7de17720e2d318fa569313f2c',
    candidateRounds: [['TR09', 'TR10'], ['TR11', 'TR12']],
  },
  {
    recordId: 'codex-ui-mockup-workflow',
    decision: 'add',
    family: 'design-material',
    cameraDistance: 'close',
    subject: '각진 종이 목업과 색상 타일과 재료 조각이 놓인 절단 매트',
    semanticChecksum: 'sha256:79f1abff09d0df548039f19990dda86c58e00bee6d707349d14f320312e31d45',
    candidateRounds: [['TR13', 'TR14'], ['TR15', 'TR16']],
  },
  {
    recordId: 'context-refinement-system-design',
    decision: 'replace',
    family: 'boundary-evidence',
    cameraDistance: 'wide',
    subject: '크기가 다른 입력 조각과 세 갈래 홈이 있는 물리 분류판',
    semanticChecksum: 'sha256:c5e44c548261e7216fadbbc9b1abc23456eab4fb3289933b16b25d457d1e1ff1',
    candidateRounds: [['TR17', 'TR18'], ['TR19', 'TR20']],
  },
  {
    recordId: 'hermes-agent-persistent-worker-runtime',
    decision: 'replace',
    family: 'tool-workbench',
    cameraDistance: 'medium',
    subject: '교체 가능한 도구 모듈과 대기 슬롯이 있는 원형 목재 작업대',
    semanticChecksum: 'sha256:0d2762a72b7114d20500c2199ca5ce7d7577fe724a587864a25563f75fe317ff',
    candidateRounds: [['TR21', 'TR22'], ['TR23', 'TR24']],
  },
  {
    recordId: 'karpathy-delete-everything-keep-graph',
    decision: 'retain',
    family: 'data-structure',
    cameraDistance: 'close',
    subject: '낮은 점검 계단과 테라코타 검사판이 있는 콘크리트 벽',
    semanticChecksum: 'sha256:6108141e310e134fc1705a510e6278e74a26e15ec85a8f2c17807d591eb592f6',
  },
  {
    recordId: 'lazycodex-agent-harness-analysis',
    decision: 'replace',
    family: 'tool-workbench',
    cameraDistance: 'wide',
    subject: '목재 작업대 위의 세 개 고정 지그와 하나의 긴 작업 띠',
    semanticChecksum: 'sha256:f01fe6c5188da8ca912a3726c7e7366bf16ac3995f5278582647c63ee79a2799',
    candidateRounds: [['TR25', 'TR26'], ['TR27', 'TR28']],
  },
  {
    recordId: 'oh-my-pi-deep-review',
    decision: 'add',
    family: 'tool-workbench',
    cameraDistance: 'close',
    subject: '분리 가능한 도구 헤드와 격리 트레이가 있는 금속 작업대',
    semanticChecksum: 'sha256:004f8edeaa179364b7a1f16eb3bbd920ea7707eaa339623458b5a74b04adc298',
    candidateRounds: [['TR29', 'TR30'], ['TR31', 'TR32']],
  },
  {
    recordId: 'open-design-repo-analysis',
    decision: 'retain',
    family: 'design-material',
    cameraDistance: 'medium',
    subject: '검은 목재 상자 안의 다섯 가지 종이와 점토 재료 모듈',
    semanticChecksum: 'sha256:095fe6f66ac31a636daf352d752fb5ed335001b6023ff31a9682e2dd7ad6a7f7',
  },
  {
    recordId: 'pgvector-hybrid-search',
    decision: 'retain',
    family: 'data-structure',
    cameraDistance: 'wide',
    subject: '돌로 된 곡선 길과 검은 직선 길이 만나는 테라코타 원판',
    semanticChecksum: 'sha256:e6b56784e46f86ad85c73a0815944c6a6d4c6d1c71002b4890e084d172bff5c0',
  },
  {
    recordId: 'ponytail-agent-minimalism-analysis',
    decision: 'replace',
    family: 'people-action',
    cameraDistance: 'medium',
    subject: '손과 분리 도구와 하나의 작은 테라코타 쐐기',
    semanticChecksum: 'sha256:76a0eb1a419d2bce3ee2e267dc53fd9b111e52a65c047ea6deeb177476fb5a78',
    candidateRounds: [['TR33', 'TR34'], ['TR35', 'TR36']],
  },
  {
    recordId: 'postgresql-bm25-pg-search',
    decision: 'add',
    family: 'data-structure',
    cameraDistance: 'close',
    subject: '길이와 표면이 다른 검색 조각들이 놓인 비문자 정렬 레일',
    semanticChecksum: 'sha256:77c55e1ba73dac629f21b16a8afd4c3653bf6a9871b868588c1986d3dbc6c661',
    candidateRounds: [['TR37', 'TR38'], ['TR39', 'TR40']],
  },
  {
    recordId: 'shared-ai-conversation-evidence-boundaries',
    decision: 'retain',
    family: 'boundary-evidence',
    cameraDistance: 'wide',
    subject: '두꺼운 벽의 좁은 관찰 틈 너머에 보이는 테라코타 증거 조각',
    semanticChecksum: 'sha256:ace07deafa8c587a75cf94024f12332c3809911b7f9d7717d425303875fb7eac',
  },
  {
    recordId: 'uncle-bob-ai-code-review-evidence',
    decision: 'add',
    family: 'boundary-evidence',
    cameraDistance: 'medium',
    subject: '무문자 측정 지그와 손에 들린 검은 기계 부품',
    semanticChecksum: 'sha256:f0432cb31aa3e7aee7e1d67d791490c70af967e21729067ca0929aec447f871d',
    candidateRounds: [['TR41', 'TR42'], ['TR43', 'TR44']],
  },
];
const lockedDecisionCounts = { retain: 6, replace: 7, add: 4 };
const lockedGenerationCount = 11;
const lockedCandidateIds = [
  'TR01', 'TR02', 'TR03', 'TR04', 'TR05', 'TR06', 'TR07', 'TR08', 'TR09', 'TR10', 'TR11',
  'TR12', 'TR13', 'TR14', 'TR15', 'TR16', 'TR17', 'TR18', 'TR19', 'TR20', 'TR21', 'TR22',
  'TR23', 'TR24', 'TR25', 'TR26', 'TR27', 'TR28', 'TR29', 'TR30', 'TR31', 'TR32', 'TR33',
  'TR34', 'TR35', 'TR36', 'TR37', 'TR38', 'TR39', 'TR40', 'TR41', 'TR42', 'TR43', 'TR44',
];
const roots = [];
let articleBriefEvidencePromise;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function copyPhaseBRepository() {
  const root = await mkdtemp(join(tmpdir(), 'form-thought-article-media-'));
  roots.push(root);
  await Promise.all([
    cp(join(repositoryRoot, 'src'), join(root, 'src'), { recursive: true }),
    cp(join(repositoryRoot, 'docs'), join(root, 'docs'), { recursive: true }),
  ]);
  await mkdir(join(root, 'packages', 'content'), { recursive: true });
  await Promise.all([
    cp(join(repositoryRoot, registryPath), join(root, registryPath)),
    cp(
      join(repositoryRoot, 'packages/content/review-cover-redistribution-approvals.json'),
      join(root, 'packages/content/review-cover-redistribution-approvals.json'),
    ),
  ]);
  // Task 1 ledger tests intentionally exercise the last fully integrated public
  // inventory. Task 3 registers approval evidence before Task 4 promotes bytes.
  const copiedRegistryPath = join(root, registryPath);
  const copiedRegistry = JSON.parse(await readFile(copiedRegistryPath, 'utf8'));
  copiedRegistry.batches = copiedRegistry.batches.filter(({ batchId }) => batchId !== topicRefreshBatchId);
  await writeFile(copiedRegistryPath, `${JSON.stringify(copiedRegistry)}\n`);
  await rm(join(root, topicRefreshDecisionPath), { force: true });
  return root;
}

async function requireAgentsBatch(root) {
  await expect(access(join(root, agentsDecisionPath))).resolves.toBeUndefined();
  await expect(access(join(root, agentsMediaPath))).resolves.toBeUndefined();
  await expect(access(join(root, agentsAssetPath))).resolves.toBeUndefined();
}

async function expectBothGatesToFail(root, pattern) {
  await expect(buildPublicRelease({
    root,
    releasesRoot: join(root, '.test-releases'),
  })).rejects.toThrow(pattern);

  const strict = await validateMediaRepository(root, { strict: true });
  expect(strict.errors).toEqual(expect.arrayContaining([expect.stringMatching(pattern)]));
}

async function loadArticleBriefEvidence() {
  articleBriefEvidencePromise ??= (async () => {
    const root = await copyPhaseBRepository();
    const releasesRoot = join(root, '.test-releases');
    await buildPublicRelease({
      root,
      releasesRoot,
    });
    const verified = await readActiveRelease(releasesRoot);
    return {
      briefs: parseYaml(await readFile(join(root, articleBriefsPath), 'utf8')),
      visibleArticleIds: recordsForCollection(verified, 'articles').map(({ id }) => id),
    };
  })();
  return articleBriefEvidencePromise;
}

function assertLedger(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSame(actual, expected, message) {
  assertLedger(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function assertTopicRefreshApprovalContract({ registry, decisionBytes, contactSheetBytes, rightsLedgerBytes }) {
  const registered = registry.batches.find(({ batchId }) => batchId === topicRefreshBatchId);
  assertLedger(registered, 'topic-refresh batch must be registered');
  assertLedger(registered.decisionManifest === topicRefreshDecisionPath, 'topic-refresh decision path must be exact');
  assertLedger(registered.decisionManifestChecksum === sha256(decisionBytes), 'topic-refresh decision manifest checksum changed');
  assertSame(registered.selections, topicRefreshSelections, 'topic-refresh registered tuples must be exact');

  const canonical = generatedMediaDecisionManifestSchema.parse(parseYaml(decisionBytes.toString('utf8')));
  assertLedger(canonical.batchId === topicRefreshBatchId, 'topic-refresh decision batch ID must be exact');
  assertLedger(canonical.generator.promptVersion === 'form-and-thought-articles-topic-v2', 'topic-refresh prompt version must be exact');
  assertSame(canonical.approval.approvedBy, ['controller', 'independent-visual-reviewer'], 'topic-refresh approval roles must be exact');
  assertSame(canonical.approval.selectedCandidateIds, topicRefreshSelections.map(({ candidateId }) => candidateId), 'topic-refresh selected IDs must be exact');
  assertSame(
    canonical.assets.map(({ candidateId, collection, recordId, mediaId }) => ({ candidateId, collection, recordId, mediaId })),
    topicRefreshSelections,
    'topic-refresh manifest tuples must be exact',
  );
  assertLedger(canonical.rightsReview.state === 'approved', 'topic-refresh rights review must be approved');
  assertLedger(canonical.rightsReview.decision === 'approve-repository-publication', 'topic-refresh publication decision must be exact');
  assertLedger(canonical.approvedContactSheet.path === topicRefreshContactSheetPath, 'topic-refresh contact-sheet path must be exact');
  assertLedger(canonical.approvedContactSheet.checksum === sha256(contactSheetBytes), 'topic-refresh contact-sheet checksum changed');
  assertLedger(canonical.approvedContactSheet.checksum === topicRefreshContactSheetChecksum, 'topic-refresh approved contact-sheet checksum must be exact');
  assertLedger(canonical.approval.evidence.includes(canonical.approvedContactSheet.checksum), 'topic-refresh approval evidence must bind the contact-sheet checksum');
  assertLedger(canonical.approval.evidence.includes(topicRefreshControllerReceiptChecksum), 'topic-refresh approval evidence must bind the corrected controller receipt checksum');
  for (const { candidateId } of topicRefreshSelections) {
    assertLedger(canonical.approval.evidence.includes(candidateId), `topic-refresh approval evidence must bind ${candidateId}`);
  }

  const rightsLedgerChecksum = sha256(rightsLedgerBytes);
  assertLedger(
    canonical.approval.evidence.includes(`${topicRefreshRightsLedgerPath} (${rightsLedgerChecksum})`),
    'topic-refresh approval evidence must bind the exact rights-ledger path and checksum',
  );
  const rightsLedger = parseYaml(rightsLedgerBytes.toString('utf8'));
  assertLedger(rightsLedger.version === 1, 'topic-refresh rights ledger version must be 1');
  assertLedger(rightsLedger.batchId === topicRefreshBatchId, 'topic-refresh rights ledger batch ID must be exact');
  assertSame(
    rightsLedger.sources,
    [
      { url: 'https://openai.com/policies/terms-of-use/', checkedAt: '2026-08-30' },
      { url: 'https://openai.com/policies/service-terms/', checkedAt: '2026-08-30' },
    ],
    'topic-refresh rights sources must be exact and fresh',
  );
  assertSame(
    rightsLedger.candidates.map(({ candidateId, recordId, sha256: checksum, outcome }) => ({ candidateId, recordId, checksum, outcome })),
    topicRefreshRightsRows,
    'topic-refresh rights ledger inventory, checksums, and outcomes must be exact',
  );
  const canonicalIds = new Set(canonical.assets.map(({ candidateId }) => candidateId));
  for (const candidate of rightsLedger.candidates) {
    assertLedger(['approved', 'hold'].includes(candidate.outcome), `rights outcome for ${candidate.candidateId} must be approved or hold`);
    for (const flag of topicRefreshRiskFlags) {
      assertLedger(typeof candidate[flag] === 'boolean', `${candidate.candidateId}.${flag} must be boolean`);
    }
    const raisedRiskFlags = topicRefreshRiskFlags.filter((flag) => candidate[flag]);
    assertLedger(
      candidate.outcome !== 'approved' || raisedRiskFlags.length === 0,
      `approved candidate ${candidate.candidateId} must have every risk flag false`,
    );
    assertLedger(
      candidate.outcome !== 'hold' || raisedRiskFlags.length > 0,
      `HOLD candidate ${candidate.candidateId} must retain a concrete raised risk flag`,
    );
    assertLedger(
      candidate.outcome !== 'hold' || !canonicalIds.has(candidate.candidateId),
      `HOLD candidate ${candidate.candidateId} must remain absent from the canonical manifest`,
    );
  }
  assertSame(
    rightsLedger.candidates.filter(({ outcome }) => outcome === 'approved').map(({ candidateId }) => candidateId),
    topicRefreshSelections.map(({ candidateId }) => candidateId),
    'approved rights partition must exactly match the canonical selections',
  );
  assertSame(
    rightsLedger.candidates.filter(({ outcome }) => outcome === 'hold').map(({ candidateId }) => candidateId),
    topicRefreshHoldCandidateIds,
    'HOLD rights partition must be exact',
  );
  assertSame(rightsLedger.summary.approvedCandidateIds, topicRefreshSelections.map(({ candidateId }) => candidateId), 'approved rights summary must be exact');
  assertSame(rightsLedger.summary.holdCandidateIds, topicRefreshHoldCandidateIds, 'HOLD rights summary must be exact');
  assertLedger(rightsLedger.summary.decision === 'approve-repository-publication', 'rights summary decision must be exact');

  const canonicalCandidates = new Set([
    ...canonical.approval.selectedCandidateIds,
    ...canonical.assets.map(({ candidateId }) => candidateId),
    ...registered.selections.map(({ candidateId }) => candidateId),
  ]);
  for (const candidateId of topicRefreshRejectedCandidates) {
    assertLedger(!canonicalCandidates.has(candidateId), `rejected candidate ${candidateId} must remain absent`);
  }
}

function replaceTopicRefreshDecision(input, decision) {
  input.decisionBytes = Buffer.from(stringifyYaml(decision));
  input.registry.batches.find(({ batchId }) => batchId === topicRefreshBatchId).decisionManifestChecksum = sha256(input.decisionBytes);
}

function replaceTopicRefreshRightsLedger(input, rightsLedger, { rebindEvidence = true } = {}) {
  const previousChecksum = sha256(input.rightsLedgerBytes);
  const nextRightsLedgerBytes = Buffer.from(stringifyYaml(rightsLedger));
  if (rebindEvidence) {
    const decision = parseYaml(input.decisionBytes.toString('utf8'));
    decision.approval.evidence = decision.approval.evidence.replace(previousChecksum, sha256(nextRightsLedgerBytes));
    replaceTopicRefreshDecision(input, decision);
  }
  input.rightsLedgerBytes = nextRightsLedgerBytes;
}

function articleBriefSemanticChecksum(brief) {
  const canonical = JSON.stringify({
    claim: brief.claim,
    mustNotImply: brief.mustNotImply,
    action: brief.action,
    reason: brief.reason,
    focalPoint: brief.focalPoint,
    safeArea: brief.safeArea,
  });
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

function assertConcreteBriefValue(value, field, recordId) {
  assertLedger(typeof value === 'string', `${recordId}.${field} must be a string`);
  const normalized = value.trim();
  assertLedger(normalized.length >= 4, `${recordId}.${field} must be specific`);
  assertLedger(!genericBriefValue.test(normalized), `${recordId}.${field} must not be generic`);
}

function assertNormalizedTuple(value, length, field, recordId) {
  assertLedger(Array.isArray(value) && value.length === length, `${recordId}.${field} must contain ${length} normalized values`);
  for (const coordinate of value) {
    assertLedger(typeof coordinate === 'number', `${recordId}.${field} values must be numbers`);
    assertLedger(coordinate >= 0 && coordinate <= 1, `${recordId}.${field} values must be normalized`);
  }
}

function assertArticleBriefLedger(briefs, visibleArticleIds) {
  assertLedger(briefs.version === 1, 'article brief ledger version must be 1');
  assertLedger(Array.isArray(briefs.articles), 'article brief ledger articles must be an array');
  const recordIds = briefs.articles.map(({ recordId }) => recordId);
  const topicIds = Object.keys(ARTICLE_TOPICS);
  assertLedger(recordIds.length === 17, 'article brief ledger must contain 17 records');
  assertLedger(new Set(recordIds).size === 17, 'article brief ledger record IDs must be unique');
  assertSame([...recordIds].sort(), [...topicIds].sort(), 'article brief ledger must match the topic inventory');
  assertSame(recordIds, visibleArticleIds, 'article brief ledger must match visible release order');

  for (const brief of briefs.articles) {
    assertLedger(articleDecisions.includes(brief.decision), `${brief.recordId}.decision must use controlled vocabulary`);
    assertLedger(articleFamilies.includes(brief.family), `${brief.recordId}.family must use controlled vocabulary`);
    assertLedger(cameraDistances.includes(brief.cameraDistance), `${brief.recordId}.cameraDistance must use controlled vocabulary`);
    for (const field of ['claim', 'mustNotImply', 'action', 'subject', 'reason']) {
      assertConcreteBriefValue(brief[field], field, brief.recordId);
    }

    assertNormalizedTuple(brief.focalPoint, 2, 'focalPoint', brief.recordId);
    assertNormalizedTuple(brief.safeArea, 4, 'safeArea', brief.recordId);
    const [left, top, right, bottom] = brief.safeArea;
    assertLedger(left < right, `${brief.recordId}.safeArea left must precede right`);
    assertLedger(top < bottom, `${brief.recordId}.safeArea top must precede bottom`);
  }

  for (let index = 0; index <= briefs.articles.length - 3; index += 1) {
    const window = briefs.articles.slice(index, index + 3);
    for (const field of ['family', 'cameraDistance', 'subject']) {
      assertLedger(
        new Set(window.map((brief) => brief[field])).size > 1,
        `${field} repeats for ${window.map(({ recordId }) => recordId).join(', ')}`,
      );
    }
  }

  const generationBriefs = briefs.articles.filter(({ decision }) => decision !== 'retain');
  const candidateIds = [];
  for (const brief of briefs.articles) {
    if (brief.decision === 'retain') {
      assertLedger(brief.candidateRounds === undefined, `${brief.recordId} retain must not reserve candidates`);
      continue;
    }
    assertLedger(Array.isArray(brief.candidateRounds) && brief.candidateRounds.length === 2, `${brief.recordId} ${brief.decision} must reserve candidates`);
    for (const round of brief.candidateRounds) {
      assertLedger(Array.isArray(round) && round.length === 2, `${brief.recordId} candidate round must contain two IDs`);
      for (const candidateId of round) {
        assertLedger(/^TR\d{2}$/u.test(candidateId), `${brief.recordId} candidate ID must use TRNN format`);
        candidateIds.push(candidateId);
      }
    }
  }

  assertLedger(candidateIds.length === generationBriefs.length * 4, 'candidate count must match generation records');
  assertLedger(new Set(candidateIds).size === candidateIds.length, 'candidate IDs must be globally unique');
  assertSame(candidateIds, candidateIds.map((_, index) => `TR${String(index + 1).padStart(2, '0')}`), 'candidate IDs must be contiguous in visible generation order');

  const decisionCounts = {
    retain: briefs.articles.filter(({ decision }) => decision === 'retain').length,
    replace: briefs.articles.filter(({ decision }) => decision === 'replace').length,
    add: briefs.articles.filter(({ decision }) => decision === 'add').length,
  };
  assertSame(decisionCounts, lockedDecisionCounts, 'article brief decision counts must remain retain 6, replace 7, add 4');
  assertLedger(generationBriefs.length === lockedGenerationCount, 'article brief generation count must remain 11');
  assertSame(candidateIds, lockedCandidateIds, 'candidate IDs must remain exactly TR01 through TR44');
  assertSame(
    recordIds,
    lockedArticleBriefContract.map(({ recordId }) => recordId),
    'article brief records must remain in locked audit order',
  );

  for (let index = 0; index < briefs.articles.length; index += 1) {
    const brief = briefs.articles[index];
    const locked = lockedArticleBriefContract[index];
    assertLedger(brief.decision === locked.decision, `${brief.recordId} locked decision changed`);
    assertLedger(brief.family === locked.family, `${brief.recordId} locked family changed`);
    assertLedger(brief.cameraDistance === locked.cameraDistance, `${brief.recordId} locked camera distance changed`);
    assertLedger(brief.subject === locked.subject, `${brief.recordId} locked subject changed`);
    assertSame(brief.candidateRounds, locked.candidateRounds, `${brief.recordId} locked candidate rounds changed`);
    assertLedger(
      articleBriefSemanticChecksum(brief) === locked.semanticChecksum,
      `${brief.recordId} semantic checksum changed`,
    );
  }
}

function articleBrief(briefs, recordId) {
  return briefs.articles.find((brief) => brief.recordId === recordId);
}

function renumberCandidateRounds(briefs) {
  let nextCandidate = 1;
  for (const brief of briefs.articles) {
    if (brief.decision === 'retain') continue;
    brief.candidateRounds = [0, 1].map(() => [0, 1].map(() => (
      `TR${String(nextCandidate++).padStart(2, '0')}`
    )));
  }
}

async function expectArticleBriefMutantRejected(mutate, pattern) {
  const { briefs, visibleArticleIds } = await loadArticleBriefEvidence();
  const mutant = structuredClone(briefs);
  mutate(mutant);
  expect(() => assertArticleBriefLedger(mutant, visibleArticleIds)).toThrow(pattern);
}

describe('FORM & THOUGHT article topic-family image-brief ledger', () => {
  it('accepts the complete ledger in verified visible release order', async () => {
    const { briefs, visibleArticleIds } = await loadArticleBriefEvidence();
    expect(() => assertArticleBriefLedger(briefs, visibleArticleIds)).not.toThrow();
  }, 30_000);

  it('rejects visible order drift', async () => {
    await expectArticleBriefMutantRejected((mutant) => {
      [mutant.articles[0], mutant.articles[1]] = [mutant.articles[1], mutant.articles[0]];
    }, /visible release order/i);
  }, 30_000);

  it('rejects a valid-vocabulary decision remap even when counts and IDs remain well formed', async () => {
    await expectArticleBriefMutantRejected((mutant) => {
      const retained = articleBrief(mutant, 'ai-design-references');
      const replaced = articleBrief(mutant, 'agents-md-vs-agent-skills-evidence');
      retained.decision = 'replace';
      replaced.decision = 'retain';
      delete replaced.candidateRounds;
      renumberCandidateRounds(mutant);
    }, /locked decision/i);
  }, 30_000);

  it.each([
    ['family', 'ai-design-references', 'reading-reflection', /locked family/i],
    ['cameraDistance', 'ai-design-references', 'close', /locked camera distance/i],
    ['subject', 'ai-design-references', '검은 프레임 옆에 놓인 각진 종이 표본', /locked subject/i],
  ])('rejects valid-vocabulary %s drift', async (field, recordId, value, pattern) => {
    await expectArticleBriefMutantRejected((mutant) => {
      articleBrief(mutant, recordId)[field] = value;
    }, pattern);
  }, 30_000);

  it.each([
    ['claim', '다른 결론으로 바뀐 충분히 구체적인 핵심 주장이다.'],
    ['mustNotImply', '다른 오독 방지 문장으로 바뀌어도 형식만으로는 탐지할 수 없다.'],
    ['action', '재료 조각을 다른 순서로 뒤집어 놓는다.'],
    ['reason', '다른 근거를 길게 적었지만 승인된 시각 감사와는 무관한 교체 이유다.'],
    ['focalPoint', [0.52, 0.55]],
    ['safeArea', [0.15, 0.10, 0.86, 0.90]],
  ])('rejects canonical semantic drift in %s', async (field, value) => {
    await expectArticleBriefMutantRejected((mutant) => {
      articleBrief(mutant, 'ai-design-references')[field] = value;
    }, /semantic checksum/i);
  }, 30_000);

  it.each([
    ['focal point below zero', (mutant) => { articleBrief(mutant, 'ai-design-references').focalPoint[0] = -0.01; }, /focalPoint values must be normalized/i],
    ['safe area above one', (mutant) => { articleBrief(mutant, 'ai-design-references').safeArea[2] = 1.01; }, /safeArea values must be normalized/i],
    ['safe area horizontal reversal', (mutant) => { articleBrief(mutant, 'ai-design-references').safeArea = [0.9, 0.1, 0.2, 0.8]; }, /left must precede right/i],
    ['safe area vertical reversal', (mutant) => { articleBrief(mutant, 'ai-design-references').safeArea = [0.1, 0.9, 0.8, 0.2]; }, /top must precede bottom/i],
  ])('rejects %s', async (_name, mutate, pattern) => {
    await expectArticleBriefMutantRejected(mutate, pattern);
  }, 30_000);

  it.each([
    ['family', (mutant) => {
      mutant.articles.slice(0, 3).forEach((brief) => { brief.family = 'data-structure'; });
    }],
    ['cameraDistance', (mutant) => {
      mutant.articles.slice(0, 3).forEach((brief) => { brief.cameraDistance = 'wide'; });
    }],
    ['subject', (mutant) => {
      const subject = mutant.articles[0].subject;
      mutant.articles.slice(0, 3).forEach((brief) => { brief.subject = subject; });
    }],
  ])('rejects triple %s repetition', async (field, mutate) => {
    await expectArticleBriefMutantRejected(mutate, new RegExp(`${field} repeats`, 'i'));
  }, 30_000);

  it('rejects candidate rounds on retain records', async () => {
    await expectArticleBriefMutantRejected((mutant) => {
      articleBrief(mutant, 'graphify-code-knowledge-graph-deep-dive').candidateRounds = [['TR45', 'TR46'], ['TR47', 'TR48']];
    }, /retain must not reserve candidates/i);
  }, 30_000);

  it.each([
    ['missing candidate ID', (mutant) => {
      articleBrief(mutant, 'agents-md-vs-agent-skills-evidence').candidateRounds[0].pop();
    }, /round must contain two IDs/i],
    ['duplicate candidate ID', (mutant) => {
      articleBrief(mutant, 'agents-md-vs-agent-skills-evidence').candidateRounds[0][1] = 'TR01';
    }, /globally unique/i],
    ['non-contiguous candidate ID', (mutant) => {
      articleBrief(mutant, 'uncle-bob-ai-code-review-evidence').candidateRounds[1][1] = 'TR45';
    }, /contiguous/i],
    ['renumbered candidate mapping', (mutant) => {
      const first = articleBrief(mutant, 'agents-md-vs-agent-skills-evidence');
      const second = articleBrief(mutant, 'andrej-karpathy-skills-analysis');
      [first.candidateRounds, second.candidateRounds] = [second.candidateRounds, first.candidateRounds];
    }, /contiguous|locked candidate rounds/i],
  ])('rejects %s', async (_name, mutate, pattern) => {
    await expectArticleBriefMutantRejected(mutate, pattern);
  }, 30_000);

  it('rejects a generation-count reduction even when remaining IDs are renumbered contiguously', async () => {
    await expectArticleBriefMutantRejected((mutant) => {
      const target = articleBrief(mutant, 'agents-md-vs-agent-skills-evidence');
      target.decision = 'retain';
      delete target.candidateRounds;
      renumberCandidateRounds(mutant);
    }, /generation count|decision counts/i);
  }, 30_000);
});

describe('FORM & THOUGHT approved article generated-media batches', () => {
  it('registers the exact topic-refresh batch path and byte checksum', async () => {
    const decisionBytes = await readFile(join(repositoryRoot, topicRefreshDecisionPath));
    const registry = parseGeneratedMediaApprovalRegistry(
      await readFile(join(repositoryRoot, registryPath), 'utf8'),
      registryPath,
    );

    expect(registry.batches.find(({ batchId }) => batchId === topicRefreshBatchId)).toMatchObject({
      batchId: topicRefreshBatchId,
      decisionManifest: topicRefreshDecisionPath,
      decisionManifestChecksum: sha256(decisionBytes),
    });
  });

  it('registers the exact approved topic-refresh tuples', async () => {
    const registry = parseGeneratedMediaApprovalRegistry(
      await readFile(join(repositoryRoot, registryPath), 'utf8'),
      registryPath,
    );
    const decision = generatedMediaDecisionManifestSchema.parse(parseYaml(
      await readFile(join(repositoryRoot, topicRefreshDecisionPath), 'utf8'),
    ));

    expect(registry.batches.find(({ batchId }) => batchId === topicRefreshBatchId)?.selections)
      .toEqual(topicRefreshSelections);
    expect(decision.assets.map(({ candidateId, collection, recordId, mediaId }) => ({
      candidateId,
      collection,
      recordId,
      mediaId,
    }))).toEqual(topicRefreshSelections);
  });

  it('keeps every rejected or HOLD candidate absent from the canonical topic-refresh batch', async () => {
    const registry = parseGeneratedMediaApprovalRegistry(
      await readFile(join(repositoryRoot, registryPath), 'utf8'),
      registryPath,
    );
    const decision = generatedMediaDecisionManifestSchema.parse(parseYaml(
      await readFile(join(repositoryRoot, topicRefreshDecisionPath), 'utf8'),
    ));
    const rightsLedger = parseYaml(await readFile(join(repositoryRoot, topicRefreshRightsLedgerPath), 'utf8'));
    const forbidden = [
      ...topicRefreshRejectedCandidates,
      ...rightsLedger.candidates.filter(({ outcome }) => outcome === 'hold').map(({ candidateId }) => candidateId),
    ];
    const canonical = [
      ...registry.batches.find(({ batchId }) => batchId === topicRefreshBatchId).selections.map(({ candidateId }) => candidateId),
      ...decision.approval.selectedCandidateIds,
      ...decision.assets.map(({ candidateId }) => candidateId),
    ];

    expect(canonical).not.toEqual(expect.arrayContaining(forbidden));
  });

  it('validates the complete approved Phase B and topic-refresh evidence contract', async () => {
    const registrySource = await readFile(join(repositoryRoot, registryPath), 'utf8');
    const registry = parseGeneratedMediaApprovalRegistry(
      registrySource,
      registryPath,
    );
    const decisionBytes = await readFile(join(repositoryRoot, topicRefreshDecisionPath));
    const contactSheetBytes = await readFile(join(repositoryRoot, topicRefreshContactSheetPath));
    const rightsLedgerBytes = await readFile(join(repositoryRoot, topicRefreshRightsLedgerPath));

    expect(registry.batches.map((batch) => batch.batchId)).toEqual(requiredBatches);
    expect(registry.batches.flatMap((batch) => batch.selections.map((selection) => selection.candidateId)))
      .toEqual(selectedCandidates);
    expect(registry.batches.flatMap((batch) => batch.selections.map((selection) => selection.candidateId)))
      .not.toEqual(expect.arrayContaining(heldCandidates));
    expect(() => assertTopicRefreshApprovalContract({
      registry,
      decisionBytes,
      contactSheetBytes,
      rightsLedgerBytes,
    })).not.toThrow();
  });

  it.each([
    {
      name: 'decision-manifest byte tamper',
      pattern: /decision manifest checksum changed/i,
      mutate: (input) => {
        input.decisionBytes = Buffer.concat([input.decisionBytes, Buffer.from('\n# tampered\n')]);
      },
    },
    {
      name: 'rejected candidate tuple insertion',
      pattern: /registered tuples must be exact|rejected candidate/i,
      mutate: (input) => {
        input.registry.batches.find(({ batchId }) => batchId === topicRefreshBatchId).selections.push({
          candidateId: 'TR02',
          collection: 'articles',
          recordId: 'agents-md-vs-agent-skills-evidence',
          mediaId: 'editorial-topic-hero',
        });
      },
    },
    {
      name: 'rights-ledger byte tamper',
      pattern: /bind the exact rights-ledger path and checksum/i,
      mutate: (input) => {
        input.rightsLedgerBytes = Buffer.concat([input.rightsLedgerBytes, Buffer.from('\n# tampered\n')]);
      },
    },
    {
      name: 'rights-ledger checksum evidence mutation',
      pattern: /bind the exact rights-ledger path and checksum/i,
      mutate: (input) => {
        const decision = parseYaml(input.decisionBytes.toString('utf8'));
        decision.approval.evidence = decision.approval.evidence.replace(
          sha256(input.rightsLedgerBytes),
          'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        );
        replaceTopicRefreshDecision(input, decision);
      },
    },
    {
      name: 'rights-ledger path evidence mutation',
      pattern: /bind the exact rights-ledger path and checksum/i,
      mutate: (input) => {
        const decision = parseYaml(input.decisionBytes.toString('utf8'));
        decision.approval.evidence = decision.approval.evidence.replace(
          topicRefreshRightsLedgerPath,
          'docs/notes/project/assets/form-and-thought-generated/articles/wrong-rights-ledger.yml',
        );
        replaceTopicRefreshDecision(input, decision);
      },
    },
    {
      name: 'approved summary mutation',
      pattern: /approved rights summary must be exact/i,
      mutate: (input) => {
        const rightsLedger = parseYaml(input.rightsLedgerBytes.toString('utf8'));
        rightsLedger.summary.approvedCandidateIds = rightsLedger.summary.approvedCandidateIds.slice(0, -1);
        replaceTopicRefreshRightsLedger(input, rightsLedger);
      },
    },
    {
      name: 'HOLD summary mutation',
      pattern: /HOLD rights summary must be exact/i,
      mutate: (input) => {
        const rightsLedger = parseYaml(input.rightsLedgerBytes.toString('utf8'));
        rightsLedger.summary.holdCandidateIds = [];
        replaceTopicRefreshRightsLedger(input, rightsLedger);
      },
    },
    {
      name: 'HOLD outcome mutation',
      pattern: /inventory, checksums, and outcomes must be exact|approved candidate TR29 must have every risk flag false/i,
      mutate: (input) => {
        const rightsLedger = parseYaml(input.rightsLedgerBytes.toString('utf8'));
        rightsLedger.candidates.find(({ candidateId }) => candidateId === 'TR29').outcome = 'approved';
        replaceTopicRefreshRightsLedger(input, rightsLedger);
      },
    },
    {
      name: 'HOLD risk contradiction',
      pattern: /HOLD candidate TR29 must retain a concrete raised risk flag/i,
      mutate: (input) => {
        const rightsLedger = parseYaml(input.rightsLedgerBytes.toString('utf8'));
        rightsLedger.candidates.find(({ candidateId }) => candidateId === 'TR29').recognizablePersonOrProduct = false;
        replaceTopicRefreshRightsLedger(input, rightsLedger);
      },
    },
  ])('rejects topic-refresh $name', async ({ mutate, pattern }) => {
    const decisionBytes = await readFile(join(repositoryRoot, topicRefreshDecisionPath));
    const input = {
      registry: parseGeneratedMediaApprovalRegistry(
        await readFile(join(repositoryRoot, registryPath), 'utf8'),
        registryPath,
      ),
      decisionBytes,
      contactSheetBytes: await readFile(join(repositoryRoot, topicRefreshContactSheetPath)),
      rightsLedgerBytes: await readFile(join(repositoryRoot, topicRefreshRightsLedgerPath)),
    };
    mutate(input);
    expect(() => assertTopicRefreshApprovalContract(input)).toThrow(pattern);
  });

  it.each(topicRefreshRiskFlags)('rejects an approved candidate when %s is true', async (riskFlag) => {
    const decisionBytes = await readFile(join(repositoryRoot, topicRefreshDecisionPath));
    const input = {
      registry: parseGeneratedMediaApprovalRegistry(
        await readFile(join(repositoryRoot, registryPath), 'utf8'),
        registryPath,
      ),
      decisionBytes,
      contactSheetBytes: await readFile(join(repositoryRoot, topicRefreshContactSheetPath)),
      rightsLedgerBytes: await readFile(join(repositoryRoot, topicRefreshRightsLedgerPath)),
    };
    const rightsLedger = parseYaml(input.rightsLedgerBytes.toString('utf8'));
    rightsLedger.candidates.find(({ candidateId }) => candidateId === 'TR32')[riskFlag] = true;
    replaceTopicRefreshRightsLedger(input, rightsLedger);

    expect(() => assertTopicRefreshApprovalContract(input))
      .toThrow(/approved candidate TR32 must have every risk flag false/i);
  });

  it.each([
    {
      name: 'required batch deletion',
      pattern: /required generated approval batch.*agents.*missing/i,
      mutate: async (root) => {
        await rm(dirname(join(root, agentsDecisionPath)), { recursive: true });
      },
    },
    {
      name: 'decision manifest tamper',
      pattern: /required generated approval batch.*agents.*checksum changed/i,
      mutate: async (root) => {
        await appendFile(join(root, agentsDecisionPath), '\n# tampered\n');
      },
    },
    {
      name: 'unregistered selection tuple',
      pattern: /required generated approval batch.*agents.*registered selection/i,
      mutate: async (root) => {
        const path = join(root, registryPath);
        const registry = JSON.parse(await readFile(path, 'utf8'));
        registry.batches.find((batch) => batch.batchId === 'agents').selections[0].mediaId = 'unregistered-selection';
        await writeFile(path, `${JSON.stringify(registry)}\n`);
      },
    },
    {
      name: 'HOLD candidate binding',
      pattern: /generated candidate.*does not match|generated candidate.*not in an approved decision/i,
      mutate: async (root) => {
        const path = join(root, agentsMediaPath);
        const media = parseYaml(await readFile(path, 'utf8'));
        media.items[0].generation.candidateId = 'AV04';
        await writeFile(path, stringifyYaml(media, { lineWidth: 0 }));
      },
    },
    {
      name: 'approved source checksum drift',
      pattern: /checksum does not match/i,
      mutate: async (root) => {
        await appendFile(join(root, agentsAssetPath), Buffer.from([0]));
      },
    },
    {
      name: 'generated media downgrade',
      pattern: /repository-generated|sourceKind/i,
      mutate: async (root) => {
        const path = join(root, agentsMediaPath);
        const media = parseYaml(await readFile(path, 'utf8'));
        delete media.items[0].sourceKind;
        delete media.items[0].generation;
        await writeFile(path, stringifyYaml(media, { lineWidth: 0 }));
      },
    },
  ])('fails both immutable release and strict media gates for $name', async ({ mutate, pattern }) => {
    const root = await copyPhaseBRepository();
    await requireAgentsBatch(root);
    await mutate(root);
    await expectBothGatesToFail(root, pattern);
  });
});
