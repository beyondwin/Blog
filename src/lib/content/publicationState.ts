type PublicStateEntry = {
  data?: {
    status?: unknown;
    draft?: unknown;
  };
};

export function isPublicEntry(entry: PublicStateEntry): boolean {
  return entry.data?.status === 'published' && entry.data.draft === false;
}
