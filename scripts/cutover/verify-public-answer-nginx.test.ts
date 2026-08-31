import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ENUMERATED_FORBIDDEN_RESPONSE_HEADERS,
  NGINX_VERIFIER_IMAGES,
  parseNginxVerifierArguments,
  selectNginxVerifierImage,
  verifyPublicAnswerNginx,
} from './verify-public-answer-nginx.mts';

const EXPECTED_FORBIDDEN = [
  'Set-Cookie',
  'Location',
  'Access-Control-Allow-Origin',
  'Access-Control-Allow-Credentials',
  'Access-Control-Expose-Headers',
  'Access-Control-Allow-Headers',
  'Access-Control-Allow-Methods',
  'Access-Control-Max-Age',
  'Access-Control-Request-Headers',
  'Access-Control-Request-Method',
  'Server',
  'X-Powered-By',
  'X-Beyondwin-Forbidden-Sentinel',
] as const;

describe('prepared public-answer core-Nginx verifier', () => {
  it('pins one immutable image per supported architecture and rejects overrides', () => {
    expect(NGINX_VERIFIER_IMAGES).toEqual({
      'linux/amd64': 'docker.io/library/nginx:1.28.0-alpine@sha256:09ab424a8c788f8d0fe3a64429f6d19dfa526885c8609b748d0943a75dcb9f8c',
      'linux/arm64': 'docker.io/library/nginx:1.28.0-alpine@sha256:e8552debd77891036e8928d45f6f6e6d9eee56ce720668c0cdd723f963c3a5c5',
    });
    expect(selectNginxVerifierImage('darwin', 'arm64')).toEqual({
      image: NGINX_VERIFIER_IMAGES['linux/arm64'],
      platform: 'linux/arm64',
    });
    expect(selectNginxVerifierImage('linux', 'x64')).toEqual({
      image: NGINX_VERIFIER_IMAGES['linux/amd64'],
      platform: 'linux/amd64',
    });
    expect(() => selectNginxVerifierImage('darwin', 's390x')).toThrow(/unsupported/iu);
    expect(parseNginxVerifierArguments([])).toEqual({});
    expect(() => parseNginxVerifierArguments(['--image', 'nginx:latest'])).toThrow(/override|argument/iu);
  });

  it('keeps the config and verifier on the same deliberately finite forbidden set', () => {
    expect(ENUMERATED_FORBIDDEN_RESPONSE_HEADERS).toEqual(EXPECTED_FORBIDDEN);
  });

  it('runs the pinned real core Nginx and seals every named hostile header on success and errors', async () => {
    const receipt = await verifyPublicAnswerNginx({ repositoryRoot: resolve(import.meta.dirname, '../..') });
    expect(receipt.nginxVersion).toBe('nginx version: nginx/1.28.0');
    expect(receipt.nginxBuild).toContain('configure arguments:');
    expect(receipt.configurationValidated).toBe(true);
    expect(receipt.proofScope).toBe('enumerated-forbidden-response-headers-only');
    expect(receipt.statuses).toEqual([200, 409, 429, 503]);
    expect(receipt.forbiddenHeaders).toEqual(EXPECTED_FORBIDDEN);
    expect(receipt.applicationHeaders).toEqual([
      'cache-control', 'content-type', 'retry-after', 'vary',
      'x-answer-release-id', 'x-content-release-id',
    ]);
    expect(receipt.transportHeaders).toEqual(expect.arrayContaining(['connection']));
  }, 120_000);
});
