import { join, resolve } from 'node:path';
import { isPublicRecord, type PublicRecord } from '@beyondwin/contracts';
import type { VerifiedActivePublicRelease } from '@beyondwin/content/release';
import {
  PUBLIC_RELEASE_BINDING_ENV,
  readBoundActiveRelease,
} from '../release-binding';

export type CandidateRelease = Pick<VerifiedActivePublicRelease, 'manifest' | 'releasePath'>;
export type CandidateCollection = 'articles' | 'reviews' | 'memory';
export type CandidateRecord<C extends CandidateCollection> = Extract<PublicRecord, { collection: C }>;

function repositoryRoot(): string {
  const cwd = resolve(process.cwd());
  return cwd.endsWith('/spikes/site-react-router') ? resolve(cwd, '../..') : cwd;
}

let verifiedReleasePromise: Promise<VerifiedActivePublicRelease> | undefined;

export function loadVerifiedRelease(): Promise<VerifiedActivePublicRelease> {
  verifiedReleasePromise ??= readBoundActiveRelease(
    join(repositoryRoot(), 'build/public-releases'),
    process.env[PUBLIC_RELEASE_BINDING_ENV],
  );
  return verifiedReleasePromise;
}

function hasRawPublicationState(record: object): record is object & { status?: unknown; draft?: unknown } {
  return Object.hasOwn(record, 'status') || Object.hasOwn(record, 'draft');
}

function hasPublicPublicationState(record: PublicRecord): boolean {
  if (!hasRawPublicationState(record)) return true;
  const state = record as PublicRecord & { status?: unknown; draft?: unknown };
  return isPublicRecord({ status: state.status, draft: state.draft });
}

export function recordsForCollection<C extends CandidateCollection>(
  release: CandidateRelease,
  collection: C,
): Array<CandidateRecord<C>> {
  const records = Object.values(release.manifest.records)
    .filter((record) => record.collection === collection)
    .filter(hasPublicPublicationState)
    .filter((record) => record.href === `/${collection}/${record.id}/`)
    .sort((left, right) => left.id.localeCompare(right.id));
  return records as Array<CandidateRecord<C>>;
}

export function recordForRoute<C extends CandidateCollection>(
  release: CandidateRelease,
  collection: C,
  slug: string,
): CandidateRecord<C> | null {
  const record = release.manifest.records[`${collection}/${slug}`];
  return record?.collection === collection
    && hasPublicPublicationState(record)
    && record.href === `/${collection}/${slug}/`
    ? record as CandidateRecord<C>
    : null;
}

export function decisionSlicePaths(release: CandidateRelease): string[] {
  return [
    '/',
    ...recordsForCollection(release, 'articles').map((record) => record.href),
    ...recordsForCollection(release, 'reviews').map((record) => record.href),
    ...recordsForCollection(release, 'memory').map((record) => record.href),
  ];
}
