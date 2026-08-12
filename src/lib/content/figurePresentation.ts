import type { MediaItem } from './mediaManifest.mjs';

export interface FigurePresentation {
  caption: string;
  credit: string;
  provenanceLabel: string;
  provenanceHref?: string;
}

export function buildFigurePresentation(item: MediaItem): FigurePresentation {
  const presentation: FigurePresentation = {
    caption: item.caption ?? item.alt,
    credit: item.credit,
    provenanceLabel: item.sourceUrl
      ? `외부 출처 · ${item.verifiedAt}`
      : `저장소 원본 · ${item.sourcePath}`,
  };

  if (item.sourceUrl) presentation.provenanceHref = item.sourceUrl;
  return presentation;
}
