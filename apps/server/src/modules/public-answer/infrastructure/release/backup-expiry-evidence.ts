import { exactObject, providerChecksum, strictOpenCanonicalJson } from '../openai/provider-json.js';

const HASH = /^sha256:[a-f0-9]{64}$/u; const ID = /^[a-f0-9]{64}$/u;
function validEntity(kind: unknown,id: unknown): boolean{return kind==='record'?typeof id==='string'&&/^(?:articles|reviews|thoughts)\/[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id):kind==='evidence'&&typeof id==='string'&&ID.test(id);}
export interface BackupExpiryEvidence {
  schemaVersion: 1; entityKind: 'record' | 'evidence'; entityId: string; tombstoneHash: string;
  affectedContentReleaseId: string; affectedAnswerReleaseId: string; affectedAnswerManifestHash: string; affectedAnswerArtifactHash: string;
  backupOwnerId: string; backupSetId: string; backupDisposition: 'expires'; backupExpiresAt: string; verifiedAt: string;
  custodianIdentityHash: string; verifierIdentityHash: string; externalEvidenceChecksum: string;
}
const keys = ['schemaVersion','entityKind','entityId','tombstoneHash','affectedContentReleaseId','affectedAnswerReleaseId','affectedAnswerManifestHash','affectedAnswerArtifactHash','backupOwnerId','backupSetId','backupDisposition','backupExpiresAt','verifiedAt','custodianIdentityHash','verifierIdentityHash','externalEvidenceChecksum'];
export function parseBackupExpiryEvidence(value: unknown, now = new Date()): Readonly<BackupExpiryEvidence> {
  const item = exactObject(value, keys) as unknown as BackupExpiryEvidence;
  const times = [item.verifiedAt, item.backupExpiresAt];
  if (item.schemaVersion !== 1 || !validEntity(item.entityKind,item.entityId) || !HASH.test(item.tombstoneHash)
    || !ID.test(item.affectedContentReleaseId) || !ID.test(item.affectedAnswerReleaseId)
    || ![item.affectedAnswerManifestHash,item.affectedAnswerArtifactHash,item.custodianIdentityHash,item.verifierIdentityHash,item.externalEvidenceChecksum].every((entry) => HASH.test(entry))
    || !/^owner:[A-Za-z0-9._-]{1,128}$/u.test(item.backupOwnerId) || !/^set:[A-Za-z0-9._-]{1,128}$/u.test(item.backupSetId)
    || item.backupDisposition !== 'expires' || times.some((time) => !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(time) || Number.isNaN(Date.parse(time)))
    || Date.parse(item.verifiedAt) > now.getTime() || Date.parse(item.backupExpiresAt) <= Date.parse(item.verifiedAt)) throw new Error('backup expiry evidence is invalid');
  return Object.freeze({ ...item });
}
export async function readBackupExpiryEvidence(root: string, fileName: string, now = new Date()) {
  const opened = await strictOpenCanonicalJson(root, fileName, 128 * 1024); const evidence = parseBackupExpiryEvidence(opened.value, now);
  return Object.freeze({ evidence, checksum: opened.checksum });
}
export function backupEvidenceFileChecksum(bytes: string | Buffer): string { return providerChecksum(bytes); }
