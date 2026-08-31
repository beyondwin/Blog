import { access, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ENUMERATED_FORBIDDEN_RESPONSE_HEADERS,
  NGINX_VERIFIER_IMAGES,
  createNginxVerifierTemporaryRoot,
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

  it('creates and removes an owned verifier workspace when .superpowers is absent', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..');
    await mkdir(join(repositoryRoot, 'build'), { recursive: true });
    const cleanRoot = await mkdtemp(join(repositoryRoot, 'build/nginx-clean-root-'));
    try {
      await expect(access(join(cleanRoot, '.superpowers'))).rejects.toThrow();
      await expect(createNginxVerifierTemporaryRoot(cleanRoot)).rejects.toThrow(/ignored/iu);
      await expect(access(join(cleanRoot, '.superpowers'))).rejects.toThrow();
      await writeFile(join(cleanRoot, '.gitignore'), '.superpowers/\n', 'utf8');
      await mkdir(join(cleanRoot, 'deploy/reverse-proxy'), { recursive: true });
      await copyFile(
        new URL('../../deploy/reverse-proxy/public-site.conf', import.meta.url),
        join(cleanRoot, 'deploy/reverse-proxy/public-site.conf'),
      );
      const receipt = await verifyPublicAnswerNginx({ repositoryRoot: cleanRoot });
      expect(receipt.configurationValidated).toBe(true);
      await expect(access(join(cleanRoot, '.superpowers'))).rejects.toThrow();
    } finally {
      await rm(cleanRoot, { recursive: true, force: true });
    }
  });

  it('runs the pinned real core Nginx and seals every named hostile header on success and errors', async () => {
    const receipt = await verifyPublicAnswerNginx({ repositoryRoot: resolve(import.meta.dirname, '../..') });
    expect(receipt.nginxVersion).toBe('nginx version: nginx/1.28.0');
    expect(receipt.nginxBuild).toContain('configure arguments:');
    expect(receipt.configurationValidated).toBe(true);
    expect(receipt.accessLogMarkerAbsent).toBe(true);
    expect(receipt.proofScope).toBe('enumerated-forbidden-response-headers-only');
    expect(receipt.statuses).toEqual([200, 409, 429, 503]);
    expect(receipt.validApiHttpRequests).toBe(4);
    expect(receipt.validApiTcpConnections).toBe(4);
    expect(receipt.validApiSocketsClosedBeforeRejected).toBe(true);
    expect(receipt.rejectedApiHttpRequests).toBe(0);
    expect(receipt.rejectedApiTcpConnections).toBe(0);
    expect(receipt).not.toHaveProperty('validApiConnections');
    expect(receipt).not.toHaveProperty('rejectedApiConnections');
    expect(receipt.requestGateBodiesBounded).toBe(true);
    expect(receipt.requestGateStatuses).toEqual({
      query: 404,
      trailingSlash: 404,
      doubleSlash: 404,
      dotSegment: 404,
      encodedSegment: 404,
      wrongMethod: 405,
      wrongHost: 400,
      upgrade: 400,
      health: 404,
      otherApi: 404,
      oversized: 413,
    });
    expect(receipt.forbiddenHeaders).toEqual(EXPECTED_FORBIDDEN);
    expect(receipt.applicationHeaders).toEqual([
      'cache-control', 'content-type', 'retry-after', 'vary',
      'x-answer-release-id', 'x-content-release-id',
    ]);
    expect(receipt.transportHeaders).toEqual(expect.arrayContaining(['connection']));
  }, 120_000);
});
