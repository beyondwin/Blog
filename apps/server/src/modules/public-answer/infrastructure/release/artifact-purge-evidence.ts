import { exactObject, strictOpenCanonicalJson } from '../openai/provider-json.js';

const HASH = /^sha256:[a-f0-9]{64}$/u; const ID = /^[a-f0-9]{64}$/u;
export interface ArtifactPurgeEvidence {
  schemaVersion: 1; entityKind: 'record' | 'evidence'; entityId: string; tombstoneHash: string;
  affectedContentReleaseId: string; affectedAnswerReleaseId: string; affectedAnswerManifestHash: string; affectedAnswerArtifactHash: string;
  releaseDirectoryDisposition: 'removed'; removedArtifactFileChecksums: readonly string[];
  backupEvidenceFile: string; backupEvidenceChecksum: string; verifiedAt: string;
  custodianIdentityHash: string; verifierIdentityHash: string; externalEvidenceChecksum: string;
}
const keys = ['schemaVersion','entityKind','entityId','tombstoneHash','affectedContentReleaseId','affectedAnswerReleaseId','affectedAnswerManifestHash','affectedAnswerArtifactHash','releaseDirectoryDisposition','removedArtifactFileChecksums','backupEvidenceFile','backupEvidenceChecksum','verifiedAt','custodianIdentityHash','verifierIdentityHash','externalEvidenceChecksum'];
export function parseArtifactPurgeEvidence(value: unknown, now = new Date()): Readonly<ArtifactPurgeEvidence> {
  const item = exactObject(value, keys) as unknown as ArtifactPurgeEvidence;
  if (item.schemaVersion !== 1 || !['record','evidence'].includes(item.entityKind) || !item.entityId || !HASH.test(item.tombstoneHash)
    || !ID.test(item.affectedContentReleaseId) || !ID.test(item.affectedAnswerReleaseId)
    || ![item.affectedAnswerManifestHash,item.affectedAnswerArtifactHash,item.backupEvidenceChecksum,item.custodianIdentityHash,item.verifierIdentityHash,item.externalEvidenceChecksum].every((entry) => HASH.test(entry))
    || item.releaseDirectoryDisposition !== 'removed' || !Array.isArray(item.removedArtifactFileChecksums)
    || item.removedArtifactFileChecksums.some((entry) => !HASH.test(entry))
    || [...item.removedArtifactFileChecksums].sort().join('\0') !== item.removedArtifactFileChecksums.join('\0')
    || !/^[a-f0-9]{64}\.json$/u.test(item.backupEvidenceFile)
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(item.verifiedAt) || Date.parse(item.verifiedAt) > now.getTime()) throw new Error('artifact purge evidence is invalid');
  return Object.freeze({ ...item, removedArtifactFileChecksums: Object.freeze([...item.removedArtifactFileChecksums]) });
}
export async function readArtifactPurgeEvidence(root: string, fileName: string, now = new Date()) {
  const opened = await strictOpenCanonicalJson(root, fileName, 256 * 1024); const evidence = parseArtifactPurgeEvidence(opened.value, now);
  return Object.freeze({ evidence, checksum: opened.checksum });
}
