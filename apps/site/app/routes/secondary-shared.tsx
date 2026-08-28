import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { SiteShell } from '../../src/ui/components/SiteShell';
import { CollectionPage } from '../../src/ui/collections/CollectionPage';
import { SecondaryReadingPage } from '../../src/ui/reading/SecondaryReadingPage';
import { DocumentMetadata, publicMetadataTitle, ResponsivePicture } from '../root';

export type SecondaryCollection = 'analysis' | 'ideas' | 'travel';
type SecondaryRecord = Extract<PublicRecord, { collection: SecondaryCollection }>;

export const SECONDARY_COPY = {
  analysis: { title: '조사', description: '근거를 붙인 출처 분석.', empty: '아직 공개한 출처 분석이 없습니다. 근거를 붙인 기술 글은 글에서 읽습니다.' },
  ideas: { title: '아이디어', description: '아직 다 쓰지 않은 공개 아이디어.', empty: '아직 공개한 아이디어가 없습니다. 다 쓴 글은 글에서 읽습니다.' },
  travel: { title: '여행', description: '장소에서 남은 공개 기록.', empty: '아직 공개한 장면이 없습니다. 다 쓴 글은 글에서 읽습니다.' },
} as const;

export interface SecondaryIndexData { records: import('../../src/ui/collections/RecordRow').RecordSummary[] }
export interface SecondaryDetailData {
  record: SecondaryRecord;
  mediaAsset?: PublicReleaseManifest['assets'][string];
}

export function SecondaryIndexPresentation({
  collection,
  data,
}: {
  collection: SecondaryCollection;
  data: SecondaryIndexData;
}) {
  const copy = SECONDARY_COPY[collection];
  return <><DocumentMetadata canonical={`/${collection}/`} description={copy.empty} title={publicMetadataTitle()} /><SiteShell mode="reading" currentSection={null}><CollectionPage collection={collection} title={copy.title} description={copy.description} emptyMessage={copy.empty} records={data.records} /></SiteShell></>;
}

export function SecondaryDetailPresentation({ data }: { data: SecondaryDetailData }) {
  const media = data.mediaAsset ? <ResponsivePicture asset={data.mediaAsset} alt={data.mediaAsset.alt} className="reading-threshold__media-image" eager sizes="(max-width: 720px) 30vw, 9rem" /> : undefined;
  return <><DocumentMetadata canonical={data.record.href} description={data.record.description} title={publicMetadataTitle(data.record.title)} /><SiteShell mode="reading" currentSection={null}><SecondaryReadingPage record={data.record} media={media} /></SiteShell></>;
}
