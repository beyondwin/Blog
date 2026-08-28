export type MediaKind = 'book-cover' | 'photo' | 'diagram' | 'screenshot' | 'illustration';

interface MediaItemBase {
  id: string;
  file: string;
  alt: string;
  caption?: string;
  credit: string;
  verifiedAt: string;
  rightsNote: string;
  width?: number;
  height?: number;
  checksum: string;
}

type ExternalProvenance = {
  sourceUrl: string;
  sourcePath?: never;
  sourceKind?: never;
  generation?: never;
};
type RepositoryProvenance = {
  sourceUrl?: never;
  sourcePath: string;
  sourceKind?: never;
  generation?: never;
};
type GeneratedRepositoryProvenance = {
  sourceUrl?: never;
  sourcePath: string;
  sourceKind: 'repository-generated';
  generation: {
    provider: 'openai';
    generator: 'codex-built-in-image-generation';
    model: string;
    modelVersion: string;
    promptVersion: string;
    candidateId: string;
    decisionManifestChecksum: string;
  };
};

export type MediaItem =
  | (MediaItemBase &
      ExternalProvenance & {
        kind: 'book-cover';
        isbn13: string;
        edition: string;
      })
  | (MediaItemBase &
      (ExternalProvenance | RepositoryProvenance | GeneratedRepositoryProvenance) & {
        kind: Exclude<MediaKind, 'book-cover'>;
        isbn13?: string;
        edition?: string;
      });

export interface MediaManifest {
  version: 1;
  items: MediaItem[];
}

export function parseMediaManifest(source: string, path: string): MediaManifest;
export function findMediaItem(manifest: MediaManifest, id: string): MediaItem;
