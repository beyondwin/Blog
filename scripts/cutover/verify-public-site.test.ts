import { describe, expect, it } from 'vitest';
import { verifyPublicSiteEvidence, type PublicSiteEvidence } from './verify-public-site.mts';
import { cleanHostCommandEnvironment } from './verify-clean-host.mts';

function blankEvidence(): PublicSiteEvidence {
  return {
    schema_version: 1,
    implementation_commit: '',
    release: null,
    builds: null,
    route_parity: null,
    task14: null,
    local_proxy: null,
    clean_host: null,
    execution_log: [],
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
  it('keeps committed dev dependencies available to fresh npm ci', () => {
    const environment = cleanHostCommandEnvironment({
      PATH: '/node24/bin',
      NODE_ENV: 'production',
      npm_config_production: 'true',
      npm_config_omit: 'dev',
    });
    expect(environment).toMatchObject({ PATH: '/node24/bin' });
    expect(environment).not.toHaveProperty('NODE_ENV');
    expect(environment).not.toHaveProperty('npm_config_production');
    expect(environment).not.toHaveProperty('npm_config_omit');
  });

  it('refuses local eligibility when any required release/build/parity/proxy/clean-host proof is absent', async () => {
    await expect(verifyPublicSiteEvidence(blankEvidence(), { mode: 'local' }))
      .rejects.toThrow(/implementation commit|release|build|parity|proxy|clean-host/iu);
  });

  it('refuses Astro removal on blank production observation fields even with a production flag', async () => {
    await expect(verifyPublicSiteEvidence(blankEvidence(), {
      mode: 'astro-removal',
      authorizeProduction: true,
    })).rejects.toThrow(/production|observation|Astro removal/iu);
  });

  it('never treats the production flag itself as a direct host/release authorization record', async () => {
    const evidence = blankEvidence();
    evidence.production_cutover_authorized = true;
    evidence.production_cutover_at = '2026-08-26T00:00:00.000Z';
    evidence.rollback_drill_at = '2026-08-26T00:05:00.000Z';
    evidence.observation_started_at = '2026-08-26T00:10:00.000Z';
    evidence.observation_completed_at = '2026-08-26T01:10:00.000Z';
    evidence.observation_errors = [];
    evidence.astro_removal_ready = true;
    await expect(verifyPublicSiteEvidence(evidence, {
      mode: 'astro-removal',
      authorizeProduction: true,
    })).rejects.toThrow(/direct authorization/iu);
  });
});
