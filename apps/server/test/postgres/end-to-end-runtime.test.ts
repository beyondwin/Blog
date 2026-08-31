import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Pool } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';

import { runFirstSliceOfflineEvaluation } from '../../src/eval-public-answer.js';
import { indexAnswerRelease } from '../../src/index-answer-release.js';

const databaseUrl = process.env.FORM_THOUGHT_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('FORM_THOUGHT_TEST_DATABASE_URL is required');

function evaluationEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    FORM_THOUGHT_PUBLIC_ASK_MODE: 'fixture',
    FORM_THOUGHT_DATABASE_URL: databaseUrl,
    FORM_THOUGHT_CONTENT_RELEASE_ROOT: resolve('build/public-releases'),
    FORM_THOUGHT_ANSWER_RELEASE_ROOT: resolve('build/public-answer-releases'),
    FORM_THOUGHT_CORPUS_APPROVAL_PATH: resolve('src/data/public-answer-corpus-approval.v1.json'),
    FORM_THOUGHT_NETWORK_HMAC_SECRET: 'evaluation-fixture-secret-at-least-32-characters',
  };
}

afterEach(async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
    await pool.query('CREATE SCHEMA public');
  } finally { await pool.end(); }
});

describe('public-answer first-slice database evaluation', () => {
  it('indexes the independently approved fixture release and executes the one runnable case through the real database pipeline', async () => {
    const env = evaluationEnv();
    await indexAnswerRelease(['--embedding-mode=fixture'], env, () => undefined);
    const report = await runFirstSliceOfflineEvaluation(env);
    expect(report).toMatchObject({
      mode: 'first-slice-offline',
      embeddingSource: 'fixture',
      classification: { runnable: 1, deferred: 19 },
      verticalSliceStatus: 'pass',
      corpusMetricStatus: 'not_measured',
      rolloutReadiness: 'not-authorized',
    });
    expect(report.cases.filter((item) => item.status === 'runnable')).toEqual([
      expect.objectContaining({ caseId: 'dev-01-reading-judgment', resultKind: 'answer', grounded: true, contractValid: true }),
    ]);
    const bytes = await readFile(resolve('build/public-answer-eval/first-slice-offline.json'), 'utf8');
    expect(bytes).not.toMatch(/AI 시대에도 왜|question|excerpt|canonicalPath|sourcePath/iu);
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const binding = await pool.query<{ embedding_source: string; count: string }>(
        "SELECT b.embedding_source,count(c.*)::text AS count FROM public_answer_release_bindings b LEFT JOIN public_answer_chunks c USING(binding_id) WHERE b.state='active' GROUP BY b.embedding_source",
      );
      expect(binding.rows).toEqual([{ embedding_source: 'fixture', count: expect.stringMatching(/^[1-9][0-9]*$/u) }]);
    } finally { await pool.end(); }
  });
});
