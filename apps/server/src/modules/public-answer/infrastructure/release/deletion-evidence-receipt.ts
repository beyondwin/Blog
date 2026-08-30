import { exactObject, strictOpenCanonicalJson } from '../openai/provider-json.js';
import { readArtifactPurgeEvidence, type ArtifactPurgeEvidence } from './artifact-purge-evidence.js';
import { readBackupExpiryEvidence, type BackupExpiryEvidence } from './backup-expiry-evidence.js';

const HASH = /^sha256:[a-f0-9]{64}$/u; const ID = /^[a-f0-9]{64}$/u; const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
function validEntity(kind: unknown,id: unknown): boolean{return kind==='record'?typeof id==='string'&&/^(?:articles|reviews|thoughts)\/[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id):kind==='evidence'&&typeof id==='string'&&ID.test(id);}
export interface DeletionEvidenceReceipt {
  schemaVersion: 1; entityKind: 'record' | 'evidence'; entityId: string; tombstoneHash: string;
  affectedContentReleaseId: string; affectedAnswerReleaseId: string; affectedAnswerManifestHash: string; affectedAnswerArtifactHash: string;
  replacementContentReleaseId: string; replacementAnswerReleaseId: string; replacementAnswerManifestHash: string; replacementAnswerArtifactHash: string;
  replacementBindingId: string; purgeEvidenceFile: string; backupEvidenceFile: string;
  artifactPurgeEvidenceChecksum: string; backupEvidenceChecksum: string; backupExpiresAt: string; verifiedAt: string; verifierIdentityHash: string;
}
const keys = ['schemaVersion','entityKind','entityId','tombstoneHash','affectedContentReleaseId','affectedAnswerReleaseId','affectedAnswerManifestHash','affectedAnswerArtifactHash','replacementContentReleaseId','replacementAnswerReleaseId','replacementAnswerManifestHash','replacementAnswerArtifactHash','replacementBindingId','purgeEvidenceFile','backupEvidenceFile','artifactPurgeEvidenceChecksum','backupEvidenceChecksum','backupExpiresAt','verifiedAt','verifierIdentityHash'];
export function parseDeletionEvidenceReceipt(value: unknown, now = new Date()): Readonly<DeletionEvidenceReceipt> {
  const item = exactObject(value, keys) as unknown as DeletionEvidenceReceipt;
  if (item.schemaVersion !== 1 || !validEntity(item.entityKind,item.entityId) || !HASH.test(item.tombstoneHash)
    || ![item.affectedContentReleaseId,item.affectedAnswerReleaseId,item.replacementContentReleaseId,item.replacementAnswerReleaseId].every((entry) => ID.test(entry))
    || ![item.affectedAnswerManifestHash,item.affectedAnswerArtifactHash,item.replacementAnswerManifestHash,item.replacementAnswerArtifactHash,item.artifactPurgeEvidenceChecksum,item.backupEvidenceChecksum,item.verifierIdentityHash].every((entry) => HASH.test(entry))
    || !UUID.test(item.replacementBindingId) || !/^[a-f0-9]{64}\.json$/u.test(item.purgeEvidenceFile) || !/^[a-f0-9]{64}\.json$/u.test(item.backupEvidenceFile)
    || ![item.backupExpiresAt,item.verifiedAt].every((time) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(time) && !Number.isNaN(Date.parse(time)))
    || Date.parse(item.verifiedAt) > now.getTime() || Date.parse(item.backupExpiresAt) <= now.getTime()) throw new Error('deletion evidence receipt is invalid or expired');
  return Object.freeze({ ...item });
}

export function assertDeletionEvidenceBindings(receipt:DeletionEvidenceReceipt,purge:ArtifactPurgeEvidence,backup:BackupExpiryEvidence,purgeChecksum:string,backupChecksum:string):void{
  const shared = ['entityKind','entityId','tombstoneHash','affectedContentReleaseId','affectedAnswerReleaseId','affectedAnswerManifestHash','affectedAnswerArtifactHash'] as const;
  for (const key of shared) if (purge[key] !== receipt[key] || backup[key] !== receipt[key]) throw new Error(`deletion evidence ${key} mismatch`);
  if (purgeChecksum !== receipt.artifactPurgeEvidenceChecksum || backupChecksum !== receipt.backupEvidenceChecksum
    || purge.backupEvidenceFile !== receipt.backupEvidenceFile || purge.backupEvidenceChecksum !== receipt.backupEvidenceChecksum
    || backup.backupExpiresAt !== receipt.backupExpiresAt || purge.backupExpiresAt!==receipt.backupExpiresAt
    || purge.backupOwnerId!==backup.backupOwnerId||purge.backupSetId!==backup.backupSetId
    || purge.backupDisposition!==backup.backupDisposition
    || purge.verifiedAt!==receipt.verifiedAt||backup.verifiedAt!==receipt.verifiedAt
    || purge.verifierIdentityHash !== receipt.verifierIdentityHash
    || backup.verifierIdentityHash !== receipt.verifierIdentityHash || purge.custodianIdentityHash !== backup.custodianIdentityHash) {
    throw new Error('deletion evidence named artifacts do not bind receipt');
  }
}

export async function readDeletionEvidenceBundle(root: string, fileName: string, now = new Date()) {
  const receiptFile = await strictOpenCanonicalJson(root, fileName, 256 * 1024); const receipt = parseDeletionEvidenceReceipt(receiptFile.value, now);
  const purge = await readArtifactPurgeEvidence(root, receipt.purgeEvidenceFile, now);
  const backup = await readBackupExpiryEvidence(root, receipt.backupEvidenceFile, now);
  assertDeletionEvidenceBindings(receipt,purge.evidence,backup.evidence,purge.checksum,backup.checksum);
  return Object.freeze({ receipt, deletionReceiptHash: receiptFile.checksum, purge: purge.evidence, backup: backup.evidence });
}
