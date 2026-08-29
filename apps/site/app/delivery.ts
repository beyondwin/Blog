export const SITE_ORIGIN_ENV = 'FORM_THOUGHT_SITE_ORIGIN';
export const LOCAL_SITE_ORIGIN = 'https://form-thought.local.invalid';

export type DeliveryMode = 'local' | 'production';

export const PUBLIC_SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
});

export function resolveSiteOrigin(
  environment: { FORM_THOUGHT_SITE_ORIGIN?: string },
  mode: DeliveryMode,
): string {
  if (mode === 'local' && !environment[SITE_ORIGIN_ENV]) return LOCAL_SITE_ORIGIN;
  const raw = environment[SITE_ORIGIN_ENV];
  let origin: URL;
  try {
    origin = new URL(raw ?? '');
  } catch {
    throw new Error(`${SITE_ORIGIN_ENV} must be one normalized exact HTTPS origin`);
  }
  if (origin.protocol !== 'https:'
    || origin.username
    || origin.password
    || origin.pathname !== '/'
    || origin.search
    || origin.hash
    || origin.origin !== raw) {
    throw new Error(`${SITE_ORIGIN_ENV} must be one normalized exact HTTPS origin`);
  }
  if (mode === 'production' && origin.origin === LOCAL_SITE_ORIGIN) {
    throw new Error(`${SITE_ORIGIN_ENV} must not use the reserved local origin in production`);
  }
  return origin.origin;
}

export function currentSiteOrigin(environment?: NodeJS.ProcessEnv): string {
  const bundled = import.meta.env?.VITE_FORM_THOUGHT_SITE_ORIGIN;
  if (typeof bundled === 'string' && bundled) {
    return resolveSiteOrigin(
      { FORM_THOUGHT_SITE_ORIGIN: bundled },
      bundled === LOCAL_SITE_ORIGIN ? 'local' : 'production',
    );
  }
  const runtimeEnvironment = environment
    ?? (typeof process === 'undefined' ? {} : process.env);
  const explicit = runtimeEnvironment.FORM_THOUGHT_DELIVERY_MODE;
  if (explicit !== undefined && explicit !== 'local' && explicit !== 'production') {
    throw new Error('FORM_THOUGHT_DELIVERY_MODE must be local or production');
  }
  const mode: DeliveryMode = explicit ?? (runtimeEnvironment.NODE_ENV === 'test' ? 'local' : 'production');
  return resolveSiteOrigin(runtimeEnvironment, mode);
}

export function absolutePublicUrl(path: string, origin: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Public URL path must be root-relative');
  return new URL(path, `${origin}/`).href;
}

function xml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function sitemapXml(paths: readonly string[], origin: string): string {
  const urls = [...new Set(paths)].sort((left, right) => left.localeCompare(right));
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((path) => `  <url><loc>${xml(absolutePublicUrl(path, origin))}</loc></url>`).join('\n')
    + '\n</urlset>\n';
}

export function robotsText(origin: string): string {
  return `User-agent: *\nAllow: /\nSitemap: ${absolutePublicUrl('/sitemap.xml', origin)}\n`;
}
