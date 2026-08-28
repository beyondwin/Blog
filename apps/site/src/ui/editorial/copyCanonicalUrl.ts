export interface ClipboardWriter {
  writeText(text: string): Promise<void>;
}

export async function copyCanonicalUrl(
  url: string,
  clipboard: ClipboardWriter,
): Promise<'copied' | 'failed'> {
  try {
    await clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
