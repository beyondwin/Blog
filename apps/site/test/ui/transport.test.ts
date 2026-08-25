import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { OriginLink } from '../../src/ui/navigation/OriginLink';
import { navigateToReadingOrigin } from '../../src/ui/navigation/fallback';
import {
  bootstrapReadingOrigin,
  enhanceOriginClick,
  ORIGIN_MAX_AGE_MS,
  ORIGIN_STORAGE_PREFIX,
} from '../../src/ui/navigation/transport';

const TOKEN = '000102030405060708090a0b0c0d0e0f';
const ORIGIN = { kind: 'search', query: 'AI 판단', anchorId: 'result-2' } as const;

function clickFixture(options: {
  href?: string;
  target?: string | null;
  download?: boolean;
  button?: number;
  modified?: boolean;
  defaultPrevented?: boolean;
} = {}) {
  const preventDefault = vi.fn();
  const attributes = new Map<string, string>();
  attributes.set('href', options.href ?? '/articles/safe/');
  if (options.target !== undefined && options.target !== null) attributes.set('target', options.target);
  if (options.download) attributes.set('download', '');
  return {
    event: {
      button: options.button ?? 0,
      altKey: options.modified ?? false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      defaultPrevented: options.defaultPrevented ?? false,
      currentTarget: {
        href: new URL(options.href ?? '/articles/safe/', 'https://beyondwin.test/current/').href,
        getAttribute: (name: string) => attributes.get(name) ?? null,
        hasAttribute: (name: string) => attributes.has(name),
      },
      preventDefault,
    },
    preventDefault,
  };
}

function clickBrowser(overrides: Record<string, unknown> = {}) {
  const storage = new Map<string, string>();
  const setItem = vi.fn((key: string, value: string) => storage.set(key, value));
  const assign = vi.fn();
  const getRandomValues = vi.fn((bytes: Uint8Array) => {
    bytes.forEach((_, index) => { bytes[index] = index; });
    return bytes;
  });
  return {
    browser: {
      location: { href: 'https://beyondwin.test/search/?q=AI', assign },
      sessionStorage: { setItem },
      crypto: { getRandomValues },
      now: () => 1_000_000,
      ...overrides,
    },
    storage,
    setItem,
    assign,
    getRandomValues,
  };
}

function transportUrl(token = TOKEN, origin = ORIGIN) {
  const url = new URL('https://beyondwin.test/articles/safe/?keep=1#body');
  url.searchParams.set('__bw_from', origin.kind);
  url.searchParams.set('__bw_query', origin.query);
  url.searchParams.set('__bw_anchor', origin.anchorId);
  url.searchParams.set('__bw_token', token);
  return url.href;
}

function bootstrapBrowser(options: {
  href?: string;
  stored?: string | null;
  now?: number;
  state?: unknown;
  referrer?: string;
  getDenied?: boolean;
  removeDenied?: boolean;
} = {}) {
  const removeItem = vi.fn(() => {
    if (options.removeDenied) throw new Error('denied');
  });
  const getItem = vi.fn(() => {
    if (options.getDenied) throw new Error('denied');
    return options.stored === undefined
      ? JSON.stringify({ origin: ORIGIN, targetPath: '/articles/safe/', issuedAt: 1_000_000 })
      : options.stored;
  });
  const replaceState = vi.fn();
  return {
    browser: {
      location: { href: options.href ?? transportUrl() },
      history: { state: options.state ?? { keep: 'state' }, replaceState },
      sessionStorage: { getItem, removeItem },
      now: () => options.now ?? 1_000_000,
      referrer: options.referrer,
    },
    getItem,
    removeItem,
    replaceState,
  };
}

describe('OriginLink and click transport', () => {
  it('server-renders only a clean canonical anchor without transport state', () => {
    const html = renderToStaticMarkup(createElement(OriginLink, {
      href: '/articles/safe/',
      origin: ORIGIN,
      children: '읽기',
    }));
    expect(html).toBe('<a href="/articles/safe/">읽기</a>');
    expect(html).not.toMatch(/__bw_|bw:origin|AI%20/u);
  });

  it('writes exactly 128 random bits and the exact record before navigating', () => {
    const { event, preventDefault } = clickFixture();
    const fixture = clickBrowser();
    expect(enhanceOriginClick(event, ORIGIN, fixture.browser)).toBe(true);
    expect(fixture.getRandomValues).toHaveBeenCalledOnce();
    expect(fixture.getRandomValues.mock.calls[0]?.[0]).toBeInstanceOf(Uint8Array);
    expect(fixture.getRandomValues.mock.calls[0]?.[0]).toHaveLength(16);
    expect(fixture.setItem).toHaveBeenCalledWith(
      ORIGIN_STORAGE_PREFIX + TOKEN,
      JSON.stringify({ origin: ORIGIN, targetPath: '/articles/safe/', issuedAt: 1_000_000 }),
    );
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(fixture.assign).toHaveBeenCalledOnce();
    const destination = new URL(fixture.assign.mock.calls[0]?.[0] as string, 'https://beyondwin.test');
    expect(destination.pathname).toBe('/articles/safe/');
    expect(destination.searchParams.get('__bw_from')).toBe('search');
    expect(destination.searchParams.get('__bw_query')).toBe('AI 판단');
    expect(destination.searchParams.get('__bw_anchor')).toBe('result-2');
    expect(destination.searchParams.get('__bw_token')).toBe(TOKEN);
    expect(destination.href).not.toContain('returnUrl');
  });

  it.each([
    ['modified click', { modified: true }],
    ['non-primary click', { button: 1 }],
    ['new tab', { target: '_blank' }],
    ['download', { download: true }],
    ['prevented event', { defaultPrevented: true }],
    ['external URL', { href: 'https://external.test/article/' }],
    ['protocol-relative URL', { href: '//beyondwin.test/articles/safe/' }],
  ])('keeps normal browser behavior for %s', (_name, options) => {
    const { event, preventDefault } = clickFixture(options);
    const fixture = clickBrowser();
    expect(enhanceOriginClick(event, ORIGIN, fixture.browser)).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(fixture.setItem).not.toHaveBeenCalled();
    expect(fixture.assign).not.toHaveBeenCalled();
  });

  it.each(['crypto', 'storage write'] as const)('keeps normal behavior when %s is unavailable', (failure) => {
    const { event, preventDefault } = clickFixture();
    const fixture = clickBrowser(failure === 'crypto'
      ? { crypto: undefined }
      : { sessionStorage: { setItem: () => { throw new Error('denied'); } } });
    expect(enhanceOriginClick(event, ORIGIN, fixture.browser)).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(fixture.assign).not.toHaveBeenCalled();
  });
});

describe('detail origin bootstrap', () => {
  it('consumes a matching record, merges history state, and cleans the URL with no referrer', () => {
    const fixture = bootstrapBrowser({ referrer: undefined });
    expect(bootstrapReadingOrigin(fixture.browser)).toEqual(ORIGIN);
    expect(fixture.removeItem).toHaveBeenCalledOnce();
    expect(fixture.removeItem).toHaveBeenCalledWith(ORIGIN_STORAGE_PREFIX + TOKEN);
    expect(fixture.replaceState).toHaveBeenCalledWith({
      keep: 'state',
      bwOrigin: ORIGIN,
      bwHistoryReturnEligible: true,
    }, '', '/articles/safe/?keep=1#body');
  });

  it.each([
    ['cross-origin referrer', { referrer: 'https://external.test/source/' }],
    ['inclusive 10-minute age', { now: 1_000_000 + ORIGIN_MAX_AGE_MS }],
  ])('accepts valid proof with %s', (_name, options) => {
    const fixture = bootstrapBrowser(options);
    expect(bootstrapReadingOrigin(fixture.browser)).toEqual(ORIGIN);
  });

  it('fails closed on token deletion denial and uses the safe collection fallback', () => {
    const fixture = bootstrapBrowser({ removeDenied: true });
    expect(bootstrapReadingOrigin(fixture.browser)).toBeNull();
    expect(fixture.removeItem).toHaveBeenCalledOnce();
    expect(fixture.replaceState).toHaveBeenCalledWith(
      { keep: 'state' },
      '',
      '/articles/safe/?keep=1#body',
    );

    const cleanedState = fixture.replaceState.mock.calls[0]?.[0];
    const back = vi.fn();
    const assign = vi.fn();
    expect(navigateToReadingOrigin({ history: { state: cleanedState, back }, location: { assign } }, 'articles'))
      .toBe('fallback');
    expect(back).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith('/articles/');
    expect(JSON.stringify(fixture.replaceState.mock.calls[0])).not.toMatch(/__bw_|bwOrigin|bwHistoryReturnEligible/u);
  });

  it.each([
    ['over 10 minutes', { now: 1_000_000 + ORIGIN_MAX_AGE_MS + 1 }],
    ['future timestamp', { now: 999_999 }],
    ['target mismatch', { stored: JSON.stringify({ origin: ORIGIN, targetPath: '/reviews/other/', issuedAt: 1_000_000 }) }],
    ['query mismatch', { stored: JSON.stringify({ origin: { ...ORIGIN, query: 'other' }, targetPath: '/articles/safe/', issuedAt: 1_000_000 }) }],
    ['copied or reused URL', { stored: null }],
    ['malformed JSON', { stored: '{not json' }],
    ['invalid stored schema', { stored: JSON.stringify({ origin: ORIGIN, targetPath: '/articles/safe/', issuedAt: 1_000_000, returnUrl: 'https://evil.test' }) }],
    ['storage read denial', { getDenied: true }],
  ])('rejects %s, consumes the attempt, and removes eligibility', (_name, options) => {
    const fixture = bootstrapBrowser({ ...options, state: { keep: true, bwOrigin: ORIGIN, bwHistoryReturnEligible: true } });
    expect(bootstrapReadingOrigin(fixture.browser)).toBeNull();
    expect(fixture.removeItem).toHaveBeenCalledOnce();
    expect(fixture.replaceState).toHaveBeenCalledWith({ keep: true }, '', '/articles/safe/?keep=1#body');
  });

  it('rejects an invalid token format without reading storage and still cleans the URL', () => {
    const fixture = bootstrapBrowser({ href: transportUrl('short') });
    expect(bootstrapReadingOrigin(fixture.browser)).toBeNull();
    expect(fixture.getItem).not.toHaveBeenCalled();
    expect(fixture.removeItem).not.toHaveBeenCalled();
    expect(fixture.replaceState).toHaveBeenCalledWith({ keep: 'state' }, '', '/articles/safe/?keep=1#body');
  });

  it('keeps the validated history marker across refresh after one-time token deletion', () => {
    const state = { keep: true, bwOrigin: ORIGIN, bwHistoryReturnEligible: true };
    const fixture = bootstrapBrowser({ href: 'https://beyondwin.test/articles/safe/#body', state });
    expect(bootstrapReadingOrigin(fixture.browser)).toEqual(ORIGIN);
    expect(fixture.getItem).not.toHaveBeenCalled();
    expect(fixture.removeItem).not.toHaveBeenCalled();
    expect(fixture.replaceState).not.toHaveBeenCalled();
  });
});
