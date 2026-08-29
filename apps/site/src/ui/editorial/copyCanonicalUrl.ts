export interface ClipboardWriter {
  writeText(text: string): Promise<void>;
}

export interface CanonicalUrlContext {
  canonicalHref: string | null;
  documentUrl: string;
}

function browserCanonicalUrlContext(): CanonicalUrlContext | null {
  if (typeof document === 'undefined') return null;
  return {
    canonicalHref: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null,
    documentUrl: document.URL,
  };
}

export function resolveCanonicalUrl(
  recordHref: string,
  context: CanonicalUrlContext | null = browserCanonicalUrlContext(),
): string {
  if (context === null) return recordHref;
  return new URL(context.canonicalHref?.trim() || recordHref, context.documentUrl).href;
}

export async function copyCanonicalUrl(
  url: string,
  clipboard: ClipboardWriter,
  context: CanonicalUrlContext | null = browserCanonicalUrlContext(),
): Promise<'copied' | 'failed'> {
  try {
    await clipboard.writeText(resolveCanonicalUrl(url, context));
    return 'copied';
  } catch {
    return 'failed';
  }
}
