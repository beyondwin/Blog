import { describe, expect, it } from 'vitest';
import {
  assertProductionGate,
  verifyPublicSiteEvidence,
  type PublicSiteEvidence,
} from './verify-public-site.mts';
import { cleanHostCommandEnvironment } from './verify-clean-host.mts';

function blankEvidence(): PublicSiteEvidence {
  return {
    schema_version: 2,
    implementation_commit: '',
    release: null,
    builds: null,
    route_parity: null,
    task14: null,
    local_proxy: null,
    clean_host: null,
    execution_log: [],
    production_host: null,
    production_cutover_authorized: false,
    production_cutover_at: null,
    rollback_drill_at: null,
    observation_started_at: null,
    observation_completed_at: null,
    observation_errors: null,
    astro_removal_ready: false,
  };
}

describe('public cutover evidence refusal gate', () => {
  it('uses an explicit task-owned clean-host allowlist under hostile ambient input', () => {
    const environment = cleanHostCommandEnvironment({
      PATH: '/hostile/bin',
      NODE_ENV: 'production',
      npm_config_production: 'true',
      npm_config_omit: 'dev',
      HTTPS_PROXY: 'http://secret.example',
      NPM_TOKEN: 'secret',
      OPENAI_API_KEY: 'secret',
      npm_config_registry: 'https://secret.example',
      npm_config_userconfig: '/Users/example/.npmrc',
    }, {
      tempRoot: '/tmp/beyondwin-clean-host.test',
      phase: 'install',
    });
    expect(Object.keys(environment).sort()).toEqual([
      'CI', 'NO_COLOR', 'NPM_CONFIG_AUDIT', 'NPM_CONFIG_CACHE', 'NPM_CONFIG_FUND',
      'NPM_CONFIG_UPDATE_NOTIFIER', 'NPM_CONFIG_USERCONFIG', 'PATH', 'TMPDIR', 'TZ',
      'XDG_CACHE_HOME', 'XDG_CONFIG_HOME',
    ]);
    expect(environment.PATH).toBe('/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin');
    expect(environment.NPM_CONFIG_USERCONFIG).toBe('/tmp/beyondwin-clean-host.test/config/npmrc');
    expect(JSON.stringify(environment)).not.toMatch(/secret|proxy|token|api_key|production|omit/iu);
  });

  it('refuses local eligibility when any required release/build/parity/proxy/clean-host proof is absent', async () => {
    await expect(verifyPublicSiteEvidence(blankEvidence(), { mode: 'local' }))
      .rejects.toThrow(/commit|release|build|parity|proxy|clean-host/iu);
  });

  it('refuses Astro removal on blank production observation fields even with a production flag', async () => {
    await expect(verifyPublicSiteEvidence(blankEvidence(), {
      mode: 'astro-removal',
      authorizeProduction: true,
      productionHost: 'https://public.example',
      now: new Date('2026-08-26T02:00:00.000Z'),
    })).rejects.toThrow(/production|observation|Astro removal/iu);
  });

  it('never treats the production flag itself as a direct host/release authorization record', async () => {
    const evidence = blankEvidence();
    evidence.release = {
      release_id: 'a'.repeat(64),
      active_pointer_hash: `sha256:${'b'.repeat(64)}`,
      manifest_hash: `sha256:${'c'.repeat(64)}`,
      artifact_hash: `sha256:${'d'.repeat(64)}`,
    };
    evidence.production_cutover_authorized = true;
    evidence.production_host = 'https://public.example';
    evidence.production_cutover_at = '2026-08-26T00:00:00.000Z';
    evidence.rollback_drill_at = '2026-08-26T00:05:00.000Z';
    evidence.observation_started_at = '2026-08-26T00:10:00.000Z';
    evidence.observation_completed_at = '2026-08-26T01:10:00.000Z';
    evidence.observation_errors = [];
    evidence.astro_removal_ready = true;
    await expect(verifyPublicSiteEvidence(evidence, {
      mode: 'astro-removal',
      authorizeProduction: true,
      productionHost: 'https://public.example',
      now: new Date('2026-08-26T02:00:00.000Z'),
    })).rejects.toThrow(/direct[_ ]user[_ ]production[_ ]authorization/iu);
  });

  it('requires an exact HTTPS host and typed host/release/time-bound direct authorization', () => {
    const evidence = blankEvidence();
    evidence.release = {
      release_id: 'a'.repeat(64),
      active_pointer_hash: `sha256:${'b'.repeat(64)}`,
      manifest_hash: `sha256:${'c'.repeat(64)}`,
      artifact_hash: `sha256:${'d'.repeat(64)}`,
    };
    evidence.production_cutover_authorized = true;
    evidence.production_host = 'https://public.example';
    evidence.production_cutover_at = '2026-08-25T00:00:00.000Z';
    evidence.rollback_drill_at = '2026-08-25T00:05:00.000Z';
    evidence.observation_started_at = '2026-08-25T00:10:00.000Z';
    evidence.observation_completed_at = '2026-08-25T01:10:00.000Z';
    evidence.observation_errors = [];
    evidence.astro_removal_ready = true;
    evidence.execution_log = [{
      schema_version: 1,
      event_kind: 'direct_user_production_authorization',
      host: 'https://public.example',
      release_id: 'a'.repeat(64),
      authorized_at: '2026-08-24T23:59:00.000Z',
    }, {
      schema_version: 1,
      event_kind: 'production_cutover',
      host: 'https://public.example',
      release_id: 'a'.repeat(64),
      at: '2026-08-25T00:00:00.000Z',
    }, {
      schema_version: 1,
      event_kind: 'production_rollback_drill',
      host: 'https://public.example',
      release_id: 'a'.repeat(64),
      at: '2026-08-25T00:05:00.000Z',
    }, {
      schema_version: 1,
      event_kind: 'production_observation_started',
      host: 'https://public.example',
      release_id: 'a'.repeat(64),
      at: '2026-08-25T00:10:00.000Z',
    }, {
      schema_version: 1,
      event_kind: 'production_observation_completed',
      host: 'https://public.example',
      release_id: 'a'.repeat(64),
      at: '2026-08-25T01:10:00.000Z',
      blocking_errors: [],
    }];
    expect(() => assertProductionGate(evidence, {
      mode: 'astro-removal',
      authorizeProduction: true,
      productionHost: 'https://public.example',
      now: new Date('2026-08-26T00:00:00.000Z'),
    })).not.toThrow();
    expect(() => assertProductionGate(evidence, {
      mode: 'astro-removal',
      authorizeProduction: true,
      productionHost: 'https://other.example',
      now: new Date('2026-08-26T00:00:00.000Z'),
    })).toThrow(/host/iu);
    const future = structuredClone(evidence);
    future.observation_completed_at = '2026-08-27T00:00:00.000Z';
    expect(() => assertProductionGate(future, {
      mode: 'astro-removal',
      authorizeProduction: true,
      productionHost: 'https://public.example',
      now: new Date('2026-08-26T00:00:00.000Z'),
    })).toThrow(/future|timestamp|ordered/iu);
  });
});
