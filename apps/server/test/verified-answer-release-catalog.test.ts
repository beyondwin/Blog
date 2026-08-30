import { describe, expect, it, vi } from 'vitest';
import type { VerifiedActivePublicAnswerReleaseAuthority } from '../src/modules/public-answer/infrastructure/release/verified-answer-release-catalog.js';

import { DeterministicEmbeddingClient } from '../src/modules/public-answer/infrastructure/fixture/deterministic-embedding-client.js';
import * as indexerModule from '../src/modules/public-answer/infrastructure/postgres/postgres-answer-release-indexer.js';
import {
  createFixtureEmbeddingReceipt,
  prepareEmbeddingSet,
} from '../src/modules/public-answer/infrastructure/postgres/postgres-answer-release-indexer.js';
import { assertCompleteActivatedBinding, runIndexAnswerReleaseCli } from '../src/index-answer-release.js';
import postgresConfig from '../vitest.postgres.config.js';
import {
  readVerifiedAnswerReleaseAuthority,
} from '../src/modules/public-answer/infrastructure/release/verified-answer-release-catalog.js';
import {
  runTestPostgresHarnessFromArgv,
  runTestPostgresHarness,
  type HarnessRun,
  type TestPostgresHarnessDependencies,
} from '../scripts/with-test-postgres.mjs';

const authorityFixture = vi.hoisted(() => ({ release: null as any }));
vi.mock('@beyondwin/content/answer-release', () => ({
  async readPublicAnswerCorpusApproval() { return { schemaVersion: 1, entries: [] }; },
  async readActiveAnswerRelease() { return authorityFixture.release; },
  async verifyAnswerReleaseDirectory() { return authorityFixture.release; },
}));
vi.mock('@beyondwin/content/release', () => ({
  async readActiveRelease() { return { manifest: { releaseId: 'content', records: {} }, manifestHash: 'mh', artifactHash: 'ah' }; },
}));

type PlainRelease = {
  contentReleaseId: string;
  answerReleaseId: string;
  manifest: { identity: { contentManifestHash: string } };
  manifestHash: string;
  artifactHash: string;
  corpusApprovalHash: string;
  indexInputs: readonly unknown[];
};

type AssertFalse<T extends false> = T;
type _PlainReleaseCannotCrossAuthorityBoundary = AssertFalse<PlainRelease extends VerifiedActivePublicAnswerReleaseAuthority ? true : false>;

describe('deterministic fixture embedding preparation', () => {
  it('detaches and recursively freezes verified authority before sealing preparation', async () => {
    const original = {
      releasePath: '/answer/release', answerReleaseId: 'a'.repeat(64), contentReleaseId: 'b'.repeat(64),
      manifest: { identity: { contentManifestHash: `sha256:${'c'.repeat(64)}`, nested: { value: 'original' } } },
      manifestHash: `sha256:${'c'.repeat(64)}`, artifactHash: `sha256:${'d'.repeat(64)}`,
      corpusApprovalHash: `sha256:${'e'.repeat(64)}`,
      chunks: [{ chunkId: '1'.repeat(64), recordId: 'articles/example', canonicalPath: '/articles/example/', headingPath: ['Chunk'] }],
      evidence: [{
        evidenceId: '3'.repeat(64), chunkId: '1'.repeat(64), recordId: 'articles/example', collectionLabel: '기록',
        recordTitle: 'Example', canonicalPath: '/articles/example/',
        locator: { kind: 'heading-paragraph', label: 'Heading', ordinal: 1 }, excerpt: 'text',
        excerptChecksum: `sha256:${'4'.repeat(64)}`,
      }],
      indexInputs: [{
        chunkId: '1'.repeat(64), chunkChecksum: `sha256:${'2'.repeat(64)}`, recordId: 'articles/example',
        canonicalPath: '/articles/example/', title: 'Example', headingPath: ['Heading'], text: 'public text', searchText: 'public text',
      }],
    };
    authorityFixture.release = original;
    const { answer } = await readVerifiedAnswerReleaseAuthority({
      corpusApprovalPath: '/approval', contentReleaseRoot: '/content', answerReleaseRoot: '/answer',
    });
    const prepared = await prepareEmbeddingSet(answer, new DeterministicEmbeddingClient('test'), new AbortController().signal);
    const receipt = createFixtureEmbeddingReceipt(prepared);
    original.manifest.identity.nested.value = 'mutated';
    original.indexInputs[0]!.headingPath[0] = 'mutated';
    expect((answer.manifest.identity as any).nested.value).toBe('original');
    expect(answer.indexInputs[0]!.headingPath).toEqual(['Heading']);
    expect(Object.isFrozen(answer.manifest)).toBe(true);
    expect(() => ((answer.evidence[0]!.locator as { label: string }).label = 'forged')).toThrow(TypeError);
    expect(() => ((answer.indexInputs[0]!.headingPath as string[])[0] = 'forged')).toThrow(TypeError);
    expect(createFixtureEmbeddingReceipt(prepared)).toEqual(receipt);
  });

  it('creates stable finite normalized 3072-dimensional vectors and provenance-bound checksums', async () => {
    const client = new DeterministicEmbeddingClient('test');
    const release = {
      answerReleaseId: 'a'.repeat(64), contentReleaseId: 'b'.repeat(64),
      manifest: { identity: { contentManifestHash: `sha256:${'c'.repeat(64)}` } },
      manifestHash: `sha256:${'c'.repeat(64)}`, artifactHash: `sha256:${'d'.repeat(64)}`,
      corpusApprovalHash: `sha256:${'e'.repeat(64)}`,
      indexInputs: [{
        chunkId: '1'.repeat(64), chunkChecksum: `sha256:${'2'.repeat(64)}`, recordId: 'articles/example',
        collection: 'articles', canonicalPath: '/articles/example/', title: 'Example', headingPath: ['Heading'],
        text: 'Deterministic public text', searchText: 'deterministic public text',
      }],
    } as any;
    const first = await prepareEmbeddingSet(release, client, new AbortController().signal);
    const second = await prepareEmbeddingSet(release, client, new AbortController().signal);
    expect(first).toEqual(second);
    expect(first.vectors[0]?.values).toHaveLength(3072);
    expect(first.vectors[0]?.values.every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...first.vectors[0]!.values)).toBeCloseTo(1, 7);
    expect(first.indexChecksum).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(first.usage).toEqual({ calls: 1, inputTokens: 3, outputTokens: 0, estimatedCostUsdMicros: 0 });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.indexRows)).toBe(true);
    expect(Object.isFrozen(first.indexRows[0])).toBe(true);
    expect(Object.isFrozen(first.indexRows[0]!.headingPath)).toBe(true);
    expect(() => ((first.indexRows[0] as { title: string }).title = 'forged')).toThrow(TypeError);
    expect(() => ((first.indexRows[0]!.headingPath as string[])[0] = 'forged')).toThrow(TypeError);
  });

  it('does not call the embedding client for an empty verified release', async () => {
    let calls = 0;
    const client = {
      model: 'text-embedding-3-large' as const, dimensions: 3072 as const,
      async embed() { calls += 1; throw new Error('must not call'); },
    };
    const prepared = await prepareEmbeddingSet({
      answerReleaseId: 'a'.repeat(64), contentReleaseId: 'b'.repeat(64),
      manifest: { identity: { contentManifestHash: `sha256:${'c'.repeat(64)}` } },
      manifestHash: `sha256:${'c'.repeat(64)}`, artifactHash: `sha256:${'d'.repeat(64)}`,
      corpusApprovalHash: `sha256:${'e'.repeat(64)}`, indexInputs: [],
    } as any, client, new AbortController().signal);
    expect(calls).toBe(0);
    expect(prepared.vectors).toEqual([]);
    expect(prepared.usage).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsdMicros: 0 });
  });

  it('rejects fixture construction in production', () => {
    expect(() => new DeterministicEmbeddingClient('production')).toThrow(/fixture/u);
  });

  it('does not expose a Task 3 provider provenance factory', () => {
    expect(indexerModule).not.toHaveProperty('createProviderEmbeddingReceipt');
  });

  it('reuses vectors only after strict-reopening the exact completed provenance receipt', async () => {
    const client = new DeterministicEmbeddingClient('test');
    const release = {
      answerReleaseId: 'a'.repeat(64), contentReleaseId: 'b'.repeat(64),
      manifest: { identity: { contentManifestHash: `sha256:${'c'.repeat(64)}` } },
      manifestHash: `sha256:${'c'.repeat(64)}`, artifactHash: `sha256:${'d'.repeat(64)}`,
      corpusApprovalHash: `sha256:${'e'.repeat(64)}`,
      indexInputs: [{
        chunkId: '1'.repeat(64), chunkChecksum: `sha256:${'2'.repeat(64)}`, recordId: 'articles/example',
        canonicalPath: '/articles/example/', title: 'Example', headingPath: ['Heading'], text: 'cached text', searchText: 'cached text',
      }],
    } as any;
    const original = await prepareEmbeddingSet(release, client, new AbortController().signal);
    const receipt = createFixtureEmbeddingReceipt(original);
    const cached = await prepareEmbeddingSet(release, {
      model: 'text-embedding-3-large', dimensions: 3072,
      async embed() { throw new Error('cache miss would call adapter'); },
    }, new AbortController().signal, {
      completedCache: {
        receipt,
        async reopenReceipt(hash) { expect(hash).toBe(receipt.receiptHash); return receipt; },
        async lookup(input) {
          expect(input).toEqual({
            chunkChecksum: `sha256:${'2'.repeat(64)}`, model: 'text-embedding-3-large', dimensions: 3072,
            source: 'fixture', receiptHash: receipt.receiptHash,
          });
          return original.vectors[0]!.values;
        },
      },
    });
    expect(cached.vectorSetChecksum).toBe(original.vectorSetChecksum);
    expect(cached.usage).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsdMicros: 0 });

    await expect(prepareEmbeddingSet(release, client, new AbortController().signal, {
      completedCache: {
        receipt,
        async reopenReceipt() { return { ...receipt, answerReleaseId: 'f'.repeat(64) }; },
        async lookup() { return original.vectors[0]!.values; },
      },
    })).rejects.toThrow(/changed on strict reopen/u);
  });
});

describe('fixture index CLI boundary', () => {
  it('rejects corruption in every persisted binding/provenance field', () => {
    const authority = {
      bindingId: '11111111-1111-4111-8111-111111111111', contentReleaseId: 'a'.repeat(64),
      answerReleaseId: 'b'.repeat(64), contentManifestHash: `sha256:${'1'.repeat(64)}`,
      answerManifestHash: `sha256:${'2'.repeat(64)}`, answerArtifactHash: `sha256:${'3'.repeat(64)}`,
      corpusApprovalHash: `sha256:${'4'.repeat(64)}`, embeddingModel: 'text-embedding-3-large' as const,
      embeddingDimensions: 3072 as const, embeddingSource: 'fixture' as const,
      embeddingReceiptHash: `sha256:${'5'.repeat(64)}`, chunkCount: 17,
      indexChecksum: `sha256:${'6'.repeat(64)}`,
    };
    const row = {
      binding_id: authority.bindingId, content_release_id: authority.contentReleaseId,
      answer_release_id: authority.answerReleaseId, content_manifest_hash: authority.contentManifestHash,
      answer_manifest_hash: authority.answerManifestHash, answer_artifact_hash: authority.answerArtifactHash,
      embedding_model: authority.embeddingModel, embedding_dimensions: authority.embeddingDimensions,
      embedding_source: authority.embeddingSource, embedding_receipt_hash: authority.embeddingReceiptHash,
      chunk_count: authority.chunkCount, index_checksum: authority.indexChecksum, state: 'active',
    };
    expect(() => assertCompleteActivatedBinding(row, authority)).not.toThrow();
    for (const key of Object.keys(row) as Array<keyof typeof row>) {
      expect(() => assertCompleteActivatedBinding({ ...row, [key]: key === 'chunk_count' ? 99 : 'corrupt' }, authority), key)
        .toThrow(/complete binding reread mismatch/u);
    }
    expect(() => assertCompleteActivatedBinding(
      row,
      { ...authority, corpusApprovalHash: `sha256:${'9'.repeat(64)}` },
      authority.corpusApprovalHash,
    ))
      .toThrow(/approval/u);
  });

  it('prints only an allowlisted failure kind when internals contain sensitive details', async () => {
    let stderr = '';
    const exitCode = await runIndexAnswerReleaseCli([], {}, {
      stdout() { throw new Error('unexpected stdout'); },
      stderr(value) { stderr += value; },
    }, async () => { throw new Error('postgresql://secret@host/db /Users/example/private.json'); });
    expect(exitCode).toBe(1);
    expect(stderr).toBe('{"kind":"failure"}\n');
    expect(stderr).not.toMatch(/secret|postgres|Users|private/u);
  });
});

describe('disposable Postgres harness contract', () => {
  function harness(overrides: Partial<TestPostgresHarnessDependencies> = {}) {
    const calls: HarnessRun[] = [];
    const dependencies: TestPostgresHarnessDependencies = {
      repositoryRoot: '/repo', composeFile: '/repo/apps/server/compose.test.yml',
      postgresConfig: '/repo/apps/server/vitest.postgres.config.ts', vitestEntrypoint: '/repo/node_modules/vitest/vitest.mjs',
      projectName: 'task-123', env: {}, execPath: '/node24/bin/node',
      async discover() { return ['migration-and-binding.test.ts']; },
      async run(input) { calls.push(input); return input.args.includes('port') ? '127.0.0.1:45678\n' : ''; },
      ...overrides,
    };
    return { calls, dependencies };
  }

  it('uses repository-root cwd, the dedicated serial config, and always cleans a successful child', async () => {
    const { calls, dependencies } = harness();
    await runTestPostgresHarness('test', dependencies);
    expect(calls.every((call) => call.cwd === '/repo')).toBe(true);
    const child = calls.find((call) => call.command === '/node24/bin/node')!;
    expect(child.args).toEqual(['/repo/node_modules/vitest/vitest.mjs', 'run', '--config', '/repo/apps/server/vitest.postgres.config.ts']);
    expect(child.env.FORM_THOUGHT_TEST_DATABASE_URL).toContain('127.0.0.1:45678');
    expect(calls.at(-1)?.args.slice(-2)).toEqual(['-v', '--remove-orphans']);
    expect(postgresConfig.root).toBe(process.cwd());
    expect(postgresConfig.test?.include).toEqual(['apps/server/test/postgres/**/*.test.ts']);
    expect(postgresConfig.test?.passWithNoTests).toBe(false);
    expect(postgresConfig.test?.fileParallelism).toBe(false);
  });

  it('fails zero discovery before Compose and cleans after an injected child failure', async () => {
    const zero = harness({ async discover() { return []; } });
    await expect(runTestPostgresHarness('test', zero.dependencies)).rejects.toThrow(/zero owned tests/u);
    expect(zero.calls).toEqual([]);

    const failed = harness({
      async run(input) {
        failed.calls.push(input);
        if (input.args.includes('port')) return '127.0.0.1:45678\n';
        if (input.command === '/node24/bin/node') throw new Error('injected child failure');
        return '';
      },
    });
    await expect(runTestPostgresHarness('test', failed.dependencies)).rejects.toThrow(/injected child/u);
    expect(failed.calls.at(-1)?.args.slice(-2)).toEqual(['-v', '--remove-orphans']);
  });

  it.each([
    [[]],
    [['unknown']],
    [['test', 'extra']],
  ])('rejects invalid full argv %j before discovery or Compose', async (argv) => {
    let discoveries = 0;
    const invalid = harness({ async discover() { discoveries += 1; return ['owned.test.ts']; } });
    await expect(runTestPostgresHarnessFromArgv(argv, invalid.dependencies)).rejects.toThrow(/exactly one mode/u);
    expect(discoveries).toBe(0);
    expect(invalid.calls).toEqual([]);
  });
});
