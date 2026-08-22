import { getEntryHref, type SiteEntry } from '../content';
import { isPublicEntry } from '../content/publication';
import type { ResolvedMedia } from '../content/mediaRegistry';
import type { MemoryThought } from '../memory/publicData';
import { memoryThoughtHref } from '../siteChrome';

export type PublicSceneObjectKind =
  | 'article-media'
  | 'article-excerpt'
  | 'review'
  | 'memory-thought';

export type PublicSceneObjectRole = 'lead' | 'support' | 'context' | 'hint';

export interface PublicSceneObjectRef {
  id: string;
  kind: PublicSceneObjectKind;
  role: PublicSceneObjectRole;
  collection?: 'articles' | 'reviews';
  slug: string;
  mediaId?: string;
  text?: string;
  relationReason: string;
}

export interface PublicSceneDefinition {
  id: string;
  slug: string;
  title: string;
  atmosphere: string;
  lead: PublicSceneObjectRef;
  support: PublicSceneObjectRef[];
  context: PublicSceneObjectRef[];
  approvedAt: string;
  approvedBy: 'author';
  version: number;
}

export interface ResolvedPublicSceneObject extends PublicSceneObjectRef {
  title: string;
  href: string;
  typeLabel: '글' | '책' | '문장' | '그림';
  description: string;
  authors: string[];
  sourceOwner: string;
  metadataLabel: '에세이' | '글' | '책' | '문장';
  dateLabel: string;
  verifiedAt: string;
  media?: ResolvedMedia;
}

export interface PublicSceneViewModel {
  id: string;
  slug: string;
  title: string;
  atmosphere: string;
  approvedAt: string;
  version: number;
  lead: ResolvedPublicSceneObject;
  objects: ResolvedPublicSceneObject[];
}

export interface PublicSceneIssue {
  objectId: string;
  code: 'missing-record' | 'not-public' | 'missing-media' | 'missing-projection';
  message: string;
}

export interface PublicSceneDependencies {
  entries: SiteEntry[];
  thoughts: MemoryThought[];
  resolveMedia: (collection: string, slug: string, id: string) => ResolvedMedia;
}

export interface PublicSceneResolution {
  scene: PublicSceneViewModel;
  issues: PublicSceneIssue[];
}

function sceneDate(value: Date): string {
  return [value.getFullYear(), value.getMonth() + 1, value.getDate()]
    .map((part, index) => index === 0 ? String(part) : String(part).padStart(2, '0'))
    .join('.');
}

function canonicalKey(ref: PublicSceneObjectRef): string {
  return [ref.kind, ref.collection || 'memory', ref.slug, ref.mediaId || '', ref.text || ''].join('|');
}

function issue(ref: PublicSceneObjectRef, code: PublicSceneIssue['code'], message: string) {
  return { objectId: ref.id, code, message } satisfies PublicSceneIssue;
}

function resolveObject(
  ref: PublicSceneObjectRef,
  dependencies: PublicSceneDependencies,
): { object?: ResolvedPublicSceneObject; issue?: PublicSceneIssue } {
  if (ref.kind === 'memory-thought') {
    const thought = dependencies.thoughts.find((item) => item.slug === ref.slug);
    if (!thought) {
      return { issue: issue(ref, 'missing-projection', 'thought is not in the public projection') };
    }
    return {
      object: {
        ...ref,
        title: thought.claimKo,
        href: memoryThoughtHref(thought.slug),
        typeLabel: '문장',
        metadataLabel: '문장',
        dateLabel: '',
        description: thought.body,
        authors: [],
        sourceOwner: thought.origin === 'author' ? '직접 남긴 문장' : '공개 문장',
        verifiedAt: '',
      },
    };
  }

  const entry = dependencies.entries.find((item) => (
    item.collection === ref.collection && item.id === ref.slug
  ));
  if (!entry) return { issue: issue(ref, 'missing-record', 'record does not exist') };
  if (!isPublicEntry(entry)) return { issue: issue(ref, 'not-public', 'record is not public') };

  if (ref.kind === 'review') {
    if (entry.collection !== 'reviews') {
      return { issue: issue(ref, 'missing-record', 'review ref does not target a review') };
    }
    const authors = entry.data.itemAuthor
      ? (Array.isArray(entry.data.itemAuthor) ? entry.data.itemAuthor : [entry.data.itemAuthor])
      : [];
    return {
      object: {
        ...ref,
        title: entry.data.itemTitle,
        href: getEntryHref(entry),
        typeLabel: '책',
        metadataLabel: '책',
        dateLabel: sceneDate(entry.data.completedAt || entry.data.createdAt),
        description: entry.data.verdict || entry.data.description,
        authors,
        sourceOwner: authors.join(' · ') || entry.data.publisher || '책',
        verifiedAt: sceneDate(entry.data.updatedAt),
      },
    };
  }

  if (entry.collection !== 'articles') {
    return { issue: issue(ref, 'missing-record', 'article ref does not target an article') };
  }

  const common = {
    href: getEntryHref(entry),
    metadataLabel: entry.data.recordKind === 'essay' ? '에세이' as const : '글' as const,
    dateLabel: sceneDate(entry.data.createdAt),
    authors: [],
    sourceOwner: '직접 쓴 글',
  };

  if (ref.kind === 'article-excerpt') {
    return {
      object: {
        ...ref,
        ...common,
        title: ref.text || entry.data.title,
        typeLabel: '문장',
        description: ref.text || entry.data.description,
        verifiedAt: sceneDate(entry.data.updatedAt),
      },
    };
  }

  if (!ref.mediaId) return { issue: issue(ref, 'missing-media', 'media id is required') };
  try {
    const media = dependencies.resolveMedia(entry.collection, entry.id, ref.mediaId);
    return {
      object: {
        ...ref,
        ...common,
        title: entry.data.title,
        typeLabel: '그림',
        description: media.item.caption || entry.data.description,
        verifiedAt: media.item.verifiedAt,
        media,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { issue: issue(ref, 'missing-media', 'media unavailable: ' + message) };
  }
}

export function resolvePublicScene(
  definition: PublicSceneDefinition,
  dependencies: PublicSceneDependencies,
): PublicSceneResolution {
  if (!definition.approvedAt || definition.approvedBy !== 'author') {
    throw new Error(definition.id + ': author approval is required');
  }

  const refs = [definition.lead, ...definition.support, ...definition.context];
  const ids = new Set<string>();
  const canonical = new Set<string>();
  for (const ref of refs) {
    if (!ref.relationReason.trim()) throw new Error(ref.id + ': relation reason is required');
    if (ids.has(ref.id)) throw new Error(ref.id + ': duplicate object id');
    ids.add(ref.id);
    const key = canonicalKey(ref);
    if (canonical.has(key)) throw new Error(ref.id + ': duplicate canonical object');
    canonical.add(key);
  }

  const issues: PublicSceneIssue[] = [];
  const objects: ResolvedPublicSceneObject[] = [];
  let lead: ResolvedPublicSceneObject | undefined;
  for (const ref of refs) {
    const result = resolveObject(ref, dependencies);
    if (result.issue) {
      if (ref.role === 'lead') throw new Error(ref.id + ': ' + result.issue.message);
      issues.push(result.issue);
      continue;
    }
    if (!result.object) throw new Error(ref.id + ': resolver returned no object');
    objects.push(result.object);
    if (ref.role === 'lead') lead = result.object;
  }
  if (!lead) throw new Error(definition.id + ': lead did not resolve');

  return {
    scene: {
      id: definition.id,
      slug: definition.slug,
      title: definition.title,
      atmosphere: definition.atmosphere,
      approvedAt: definition.approvedAt,
      version: definition.version,
      lead,
      objects,
    },
    issues,
  };
}
