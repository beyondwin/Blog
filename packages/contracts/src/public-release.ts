import { publicRecordSchema, type PublicRecord } from './content';

export interface PublicationState {
  status?: unknown;
  draft?: unknown;
}

export function isPublicRecord(record: PublicationState): boolean {
  return record.status === 'published' && record.draft === false;
}

export function parsePublicRecord(input: unknown): PublicRecord {
  return publicRecordSchema.parse(input);
}
