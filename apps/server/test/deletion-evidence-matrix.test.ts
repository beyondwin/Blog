import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

import { canonicalProviderJson, providerChecksum } from '../src/modules/public-answer/infrastructure/openai/provider-json.js';
import { parseArtifactPurgeEvidence, readArtifactPurgeEvidence } from '../src/modules/public-answer/infrastructure/release/artifact-purge-evidence.js';
import { parseBackupExpiryEvidence, readBackupExpiryEvidence } from '../src/modules/public-answer/infrastructure/release/backup-expiry-evidence.js';
import { assertDeletionEvidenceBindings, parseDeletionEvidenceReceipt } from '../src/modules/public-answer/infrastructure/release/deletion-evidence-receipt.js';

const roots:string[]=[];afterEach(async()=>{const{rm}=await import('node:fs/promises');await Promise.all(roots.splice(0).map((root)=>rm(root,{recursive:true,force:true})));});
const now=new Date('2026-08-30T01:00:00.000Z');
function backup(){return{schemaVersion:1,entityKind:'record',entityId:'articles/example',tombstoneHash:`sha256:${'1'.repeat(64)}`,affectedContentReleaseId:'a'.repeat(64),affectedAnswerReleaseId:'b'.repeat(64),affectedAnswerManifestHash:`sha256:${'2'.repeat(64)}`,affectedAnswerArtifactHash:`sha256:${'3'.repeat(64)}`,backupOwnerId:'owner:archive',backupSetId:'set:2026-08',backupDisposition:'expires',backupExpiresAt:'2026-09-30T00:00:00.000Z',verifiedAt:'2026-08-30T00:00:00.000Z',custodianIdentityHash:`sha256:${'4'.repeat(64)}`,verifierIdentityHash:`sha256:${'5'.repeat(64)}`,externalEvidenceChecksum:`sha256:${'6'.repeat(64)}`};}
function purge(){const b=backup();return{schemaVersion:1,entityKind:b.entityKind,entityId:b.entityId,tombstoneHash:b.tombstoneHash,affectedContentReleaseId:b.affectedContentReleaseId,affectedAnswerReleaseId:b.affectedAnswerReleaseId,affectedAnswerManifestHash:b.affectedAnswerManifestHash,affectedAnswerArtifactHash:b.affectedAnswerArtifactHash,releaseDirectoryDisposition:'removed',removedArtifactFileChecksums:[],backupEvidenceFile:`${'7'.repeat(64)}.json`,backupEvidenceChecksum:`sha256:${'7'.repeat(64)}`,verifiedAt:b.verifiedAt,custodianIdentityHash:b.custodianIdentityHash,verifierIdentityHash:b.verifierIdentityHash,externalEvidenceChecksum:`sha256:${'8'.repeat(64)}`};}
function deletion(){const b=backup();return{schemaVersion:1,entityKind:b.entityKind,entityId:b.entityId,tombstoneHash:b.tombstoneHash,affectedContentReleaseId:b.affectedContentReleaseId,affectedAnswerReleaseId:b.affectedAnswerReleaseId,affectedAnswerManifestHash:b.affectedAnswerManifestHash,affectedAnswerArtifactHash:b.affectedAnswerArtifactHash,replacementContentReleaseId:'c'.repeat(64),replacementAnswerReleaseId:'d'.repeat(64),replacementAnswerManifestHash:`sha256:${'8'.repeat(64)}`,replacementAnswerArtifactHash:`sha256:${'9'.repeat(64)}`,replacementBindingId:'11111111-1111-4111-8111-111111111111',purgeEvidenceFile:`${'6'.repeat(64)}.json`,backupEvidenceFile:`${'7'.repeat(64)}.json`,artifactPurgeEvidenceChecksum:`sha256:${'6'.repeat(64)}`,backupEvidenceChecksum:`sha256:${'7'.repeat(64)}`,backupExpiresAt:b.backupExpiresAt,verifiedAt:b.verifiedAt,verifierIdentityHash:b.verifierIdentityHash};}

describe('deletion evidence negative matrix',()=>{
  it('accepts the complete strict public-answer record ID contract',()=>{
    expect(parseDeletionEvidenceReceipt({...deletion(),entityId:'answer-only/example'},now).entityId).toBe('answer-only/example');
    expect(parseArtifactPurgeEvidence({...purge(),entityId:'answer-only/example'},now).entityId).toBe('answer-only/example');
    expect(parseBackupExpiryEvidence({...backup(),entityId:'answer-only/example'},now).entityId).toBe('answer-only/example');
  });
  it.each([
    ['record id',()=>parseDeletionEvidenceReceipt({...deletion(),entityId:'not/a/record'},now)],
    ['evidence id',()=>parseDeletionEvidenceReceipt({...deletion(),entityKind:'evidence',entityId:'not-a-hash'},now)],
    ['replacement binding',()=>parseDeletionEvidenceReceipt({...deletion(),replacementBindingId:'not-uuid'},now)],
    ['owner',()=>parseBackupExpiryEvidence({...backup(),backupOwnerId:'raw owner'},now)],
    ['set',()=>parseBackupExpiryEvidence({...backup(),backupSetId:'raw set'},now)],
    ['disposition',()=>parseBackupExpiryEvidence({...backup(),backupDisposition:'deleted'},now)],
    ['expiry',()=>parseBackupExpiryEvidence({...backup(),backupExpiresAt:'2026-08-29T00:00:00.000Z'},now)],
    ['expired backup',()=>parseBackupExpiryEvidence({...backup(),backupExpiresAt:'2026-08-30T00:30:00.000Z'},now)],
    ['purge backup-only field',()=>parseArtifactPurgeEvidence({...purge(),backupOwnerId:'owner:archive'},now)],
    ['purge disposition',()=>parseArtifactPurgeEvidence({...purge(),releaseDirectoryDisposition:'retained'},now)],
  ])('rejects %s mismatch',(_label,run)=>{expect(run).toThrow();});

  it.each([
    ['entity kind',{purge:{entityKind:'evidence'}}],
    ['entity id',{backup:{entityId:'articles/other'}}],
    ['tombstone',{purge:{tombstoneHash:`sha256:${'0'.repeat(64)}`}}],
    ['affected content release',{backup:{affectedContentReleaseId:'0'.repeat(64)}}],
    ['affected answer release',{purge:{affectedAnswerReleaseId:'0'.repeat(64)}}],
    ['affected answer manifest',{backup:{affectedAnswerManifestHash:`sha256:${'0'.repeat(64)}`}}],
    ['affected answer artifact',{purge:{affectedAnswerArtifactHash:`sha256:${'0'.repeat(64)}`}}],
    ['purge checksum',{purgeChecksum:`sha256:${'0'.repeat(64)}`}],
    ['backup checksum',{backupChecksum:`sha256:${'0'.repeat(64)}`}],
    ['backup file',{purge:{backupEvidenceFile:`${'0'.repeat(64)}.json`}}],
    ['verifiedAt',{purge:{verifiedAt:'2026-08-30T00:00:01.000Z'}}],
    ['expiry',{backup:{backupExpiresAt:'2026-10-01T00:00:00.000Z'}}],
    ['custodian',{backup:{custodianIdentityHash:`sha256:${'0'.repeat(64)}`}}],
    ['verifier',{purge:{verifierIdentityHash:`sha256:${'0'.repeat(64)}`}}],
  ])('cross-binds %s across all named artifacts',(_label,mutation)=>{const receipt=parseDeletionEvidenceReceipt(deletion(),now);const p={...purge(),...(mutation as any).purge};const b={...backup(),...(mutation as any).backup};expect(()=>assertDeletionEvidenceBindings(receipt,p as any,b as any,(mutation as any).purgeChecksum??receipt.artifactPurgeEvidenceChecksum,(mutation as any).backupChecksum??receipt.backupEvidenceChecksum)).toThrow();});

  it('rejects copied names, forged noncanonical bytes, traversal, parent symlinks, and special files',async()=>{
    const root=await mkdtemp(join(tmpdir(),'deletion-matrix-'));roots.push(root);const bytes=`${canonicalProviderJson(backup())}\n`;const sum=providerChecksum(Buffer.from(bytes));
    await writeFile(join(root,`${'0'.repeat(64)}.json`),bytes);await expect(readBackupExpiryEvidence(root,`${'0'.repeat(64)}.json`,now)).rejects.toThrow(/file name/u);
    await expect(readBackupExpiryEvidence(root,`${'9'.repeat(64)}.json`,now)).rejects.toThrow();
    await writeFile(join(root,`${sum.slice(7)}.json`),`${JSON.stringify(backup(),null,2)}\n`);await expect(readBackupExpiryEvidence(root,`${sum.slice(7)}.json`,now)).rejects.toThrow(/canonical|file name/u);
    await expect(readBackupExpiryEvidence(root,'../outside.json',now)).rejects.toThrow();
    const outside=await mkdtemp(join(tmpdir(),'deletion-outside-'));roots.push(outside);await writeFile(join(outside,`${sum.slice(7)}.json`),bytes);const linked=join(root,'linked');await symlink(outside,linked);await expect(readBackupExpiryEvidence(linked,`${sum.slice(7)}.json`,now)).rejects.toThrow(/escaped|root|canonical/u);
    const fifo=`${'f'.repeat(64)}.json`;await promisify(execFile)('mkfifo',[join(root,fifo)]);await expect(readArtifactPurgeEvidence(root,fifo,now)).rejects.toThrow(/regular/u);
  });
});
