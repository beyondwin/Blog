import { originsEqual, parseOrigin, type ReadingOrigin } from './origin';

export const ORIGIN_STORAGE_PREFIX = 'bw:origin:';
export const ORIGIN_MAX_AGE_MS = 600_000;
export const ORIGIN_TOKEN_PATTERN = /^[0-9a-f]{32}$/u;

const TOKEN_BYTES = 16;
const TRANSPORT_PARAMETERS = [
  '__bw_from',
  '__bw_focus',
  '__bw_anchor',
  '__bw_query',
  '__bw_token',
] as const;

export interface StoredOrigin {
  origin: ReadingOrigin;
  targetPath: string;
  issuedAt: number;
}

interface LinkTarget {
  href: string;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
}

export interface OriginClickEvent {
  button: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
  currentTarget: LinkTarget;
  preventDefault(): void;
}

export interface OriginClickBrowser {
  location: {
    href: string;
    assign(url: string): void;
  };
  sessionStorage?: {
    setItem(key: string, value: string): void;
  };
  crypto?: {
    getRandomValues(bytes: Uint8Array<ArrayBuffer>): void;
  };
  now(): number;
}

export interface OriginBootstrapBrowser {
  location: { href: string };
  history: {
    state: unknown;
    replaceState(state: unknown, unused: string, url?: string): void;
  };
  sessionStorage?: {
    getItem(key: string): string | null;
    removeItem(key: string): void;
  };
  now(): number;
  referrer?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function relativeUrl(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

function randomToken(crypto: NonNullable<OriginClickBrowser['crypto']>): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function addOriginParameters(url: URL, origin: ReadingOrigin, token: string): void {
  for (const parameter of TRANSPORT_PARAMETERS) url.searchParams.delete(parameter);
  url.searchParams.set('__bw_from', origin.kind);
  switch (origin.kind) {
    case 'scene':
      url.searchParams.set('__bw_focus', origin.focusId);
      break;
    case 'articles':
    case 'reviews':
      url.searchParams.set('__bw_anchor', origin.anchorId);
      break;
    case 'search':
      url.searchParams.set('__bw_query', origin.query);
      url.searchParams.set('__bw_anchor', origin.anchorId);
      break;
    case 'analysis':
    case 'ideas':
    case 'travel':
    case 'tags':
      if (origin.anchorId !== undefined) url.searchParams.set('__bw_anchor', origin.anchorId);
      break;
  }
  url.searchParams.set('__bw_token', token);
}

function isSameTabTarget(target: string | null): boolean {
  return target === null || target === '' || target.toLowerCase() === '_self';
}

export function enhanceOriginClick(
  event: OriginClickEvent,
  originInput: unknown,
  browser: OriginClickBrowser,
): boolean {
  const target = event.currentTarget;
  const rawHref = target.getAttribute('href')?.trim() ?? '';
  if (
    event.defaultPrevented
    || event.button !== 0
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || event.shiftKey
    || !isSameTabTarget(target.getAttribute('target'))
    || target.hasAttribute('download')
    || rawHref.startsWith('//')
    || rawHref.startsWith('\\\\')
  ) return false;

  const origin = parseOrigin(originInput);
  if (origin === null || browser.crypto === undefined || browser.sessionStorage === undefined) return false;

  let current: URL;
  let destination: URL;
  try {
    current = new URL(browser.location.href);
    destination = new URL(rawHref, current);
  } catch {
    return false;
  }
  if (
    !/^https?:$/u.test(destination.protocol)
    || destination.origin !== current.origin
    || TRANSPORT_PARAMETERS.some((parameter) => destination.searchParams.has(parameter))
  ) return false;

  try {
    const token = randomToken(browser.crypto);
    const record: StoredOrigin = {
      origin,
      targetPath: destination.pathname,
      issuedAt: browser.now(),
    };
    browser.sessionStorage.setItem(ORIGIN_STORAGE_PREFIX + token, JSON.stringify(record));
    addOriginParameters(destination, origin, token);
    event.preventDefault();
    browser.location.assign(relativeUrl(destination));
    return true;
  } catch {
    return false;
  }
}

function exactValues(parameters: URLSearchParams, name: string): string[] {
  return parameters.getAll(name);
}

function queryOrigin(parameters: URLSearchParams): ReadingOrigin | null {
  const kinds = exactValues(parameters, '__bw_from');
  if (kinds.length !== 1) return null;
  const focus = exactValues(parameters, '__bw_focus');
  const anchor = exactValues(parameters, '__bw_anchor');
  const query = exactValues(parameters, '__bw_query');

  switch (kinds[0]) {
    case 'scene':
      return focus.length === 1 && anchor.length === 0 && query.length === 0
        ? parseOrigin({ kind: 'scene', focusId: focus[0] })
        : null;
    case 'articles':
    case 'reviews':
      return focus.length === 0 && anchor.length === 1 && query.length === 0
        ? parseOrigin({ kind: kinds[0], anchorId: anchor[0] })
        : null;
    case 'search':
      return focus.length === 0 && anchor.length === 1 && query.length === 1
        ? parseOrigin({ kind: 'search', query: query[0], anchorId: anchor[0] })
        : null;
    case 'analysis':
    case 'ideas':
    case 'travel':
    case 'tags':
      return focus.length === 0 && query.length === 0 && anchor.length <= 1
        ? parseOrigin({ kind: kinds[0], ...(anchor.length === 1 ? { anchorId: anchor[0] } : {}) })
        : null;
    default:
      return null;
  }
}

function isCanonicalOriginRecord(value: unknown, parsed: ReadingOrigin): boolean {
  if (!isRecord(value)) return false;
  const expectedKeys = parsed.kind === 'scene'
    ? ['focusId', 'kind']
    : parsed.kind === 'search'
      ? ['anchorId', 'kind', 'query']
      : 'anchorId' in parsed
        ? ['anchorId', 'kind']
        : ['kind'];
  const actualKeys = Object.keys(value).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    return false;
  }
  return Object.entries(parsed).every(([key, item]) => value[key] === item);
}

function isCleanPathname(value: unknown): value is string {
  if (
    typeof value !== 'string'
    || !value.startsWith('/')
    || value.startsWith('//')
    || /[?#\\\p{Cc}\p{Cf}\p{Cs}]/u.test(value)
  ) return false;
  try {
    return new URL(value, 'https://beyondwin.invalid').pathname === value;
  } catch {
    return false;
  }
}

function parseStoredOrigin(value: string): StoredOrigin | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    return null;
  }
  if (!isRecord(decoded) || Object.keys(decoded).sort().join(',') !== 'issuedAt,origin,targetPath') return null;
  const origin = parseOrigin(decoded.origin);
  if (
    origin === null
    || !isCanonicalOriginRecord(decoded.origin, origin)
    || !isCleanPathname(decoded.targetPath)
    || !Number.isSafeInteger(decoded.issuedAt)
    || (decoded.issuedAt as number) < 0
  ) return null;
  return { origin, targetPath: decoded.targetPath, issuedAt: decoded.issuedAt as number };
}

function cleanState(state: unknown): Record<string, unknown> {
  const next = isRecord(state) ? { ...state } : {};
  delete next.bwOrigin;
  delete next.bwHistoryReturnEligible;
  return next;
}

function cleanTransportUrl(url: URL): string {
  for (const parameter of TRANSPORT_PARAMETERS) url.searchParams.delete(parameter);
  return relativeUrl(url);
}

function historyOrigin(state: unknown): ReadingOrigin | null {
  if (!isRecord(state) || state.bwHistoryReturnEligible !== true) return null;
  return parseOrigin(state.bwOrigin);
}

export function bootstrapReadingOrigin(browser: OriginBootstrapBrowser): ReadingOrigin | null {
  let url: URL;
  try {
    url = new URL(browser.location.href);
  } catch {
    return null;
  }

  const hasTransport = TRANSPORT_PARAMETERS.some((parameter) => url.searchParams.has(parameter));
  if (!hasTransport) return historyOrigin(browser.history.state);

  const origin = queryOrigin(url.searchParams);
  const tokens = exactValues(url.searchParams, '__bw_token');
  const token = tokens.length === 1 && ORIGIN_TOKEN_PATTERN.test(tokens[0]) ? tokens[0] : null;
  let stored: StoredOrigin | null = null;
  let tokenDeleted = false;

  if (token !== null && browser.sessionStorage !== undefined) {
    try {
      const serialized = browser.sessionStorage.getItem(ORIGIN_STORAGE_PREFIX + token);
      if (serialized !== null) stored = parseStoredOrigin(serialized);
    } catch {
      stored = null;
    } finally {
      try {
        browser.sessionStorage.removeItem(ORIGIN_STORAGE_PREFIX + token);
        tokenDeleted = true;
      } catch {
        stored = null;
      }
    }
  }

  const age = stored === null ? Number.NaN : browser.now() - stored.issuedAt;
  const valid = origin !== null
    && stored !== null
    && tokenDeleted
    && originsEqual(origin, stored.origin)
    && stored.targetPath === url.pathname
    && age >= 0
    && age <= ORIGIN_MAX_AGE_MS;
  const nextState = cleanState(browser.history.state);
  if (valid) {
    nextState.bwOrigin = origin;
    nextState.bwHistoryReturnEligible = true;
  }

  try {
    browser.history.replaceState(nextState, '', cleanTransportUrl(url));
  } catch {
    return null;
  }
  return valid ? origin : null;
}
