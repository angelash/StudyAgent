import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { DomainDatabase } from '../../infrastructure/domain-database';
import { retentionDigest as digest } from '../diagnostics/retention-anchor';
import { actualPdf, preparedLibrary, publishedSources, sample } from './paper-library-fixture.spec';
import { paperExportDocumentBytes, PAPER_EXPORT_TASK_KIND } from './paper-export-record';
import { reservePaperExportFile, recordPaperExportRendered, publishPaperExportFile } from './paper-export-file-record';

import { paperLibraryApplication as application, paperLibraryCredential as credential } from './paper-library-app.fixture.spec';
const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex');

describe('actual privacy HTTP, native export files and independent latest deletion ledger', () => {
  it('captures actual export/workspace identities when the author deletes the account and cold-reopens the result', async () => application(async h => {
    const actor = await h.register('paper-private-author'), prepared = await h.prepare(actor.user.id), published = await h.publish(prepared);
    const preview = await h.api(actor.token, 'get', '/privacy/account/deletion-preview'), receipt = await h.api(actor.token, 'post', '/privacy/account/delete',
      { credential, requestKey: 'paper-account-delete', confirmation: preview.confirmation, fingerprint: preview.fingerprint });
    expect(receipt.erasedPaperExports).toHaveLength(1); expect(receipt.erasedPaperExports[0]).toMatchObject({ exportId: prepared.record.id, intentFingerprint: prepared.record.intent.fingerprint });
    const state = (await h.cold()).state as Record<string, any[]>;
    for (const name of ['paperSelectionLists', 'paperSelectionCommands', 'paperExports', 'paperExportCommands']) expect(state[name] ?? []).toHaveLength(0);
    expect(state.paperExportFiles[0]).toMatchObject({ id: published.file.id, state: 'collecting', deletionReceiptId: receipt.id });
    expect(JSON.stringify(state)).not.toContain('QORIGINAL7');
  }), 180000);

  it('applies the actual latest receipt to an older native backup, purges exact private files and preserves the source', async () => application(async h => {
    const actor = await h.register('paper-restore-author'), prepared = await h.prepare(actor.user.id), published = await h.publish(prepared);
    const { createBundle, restoreBundle, verifyBundle } = require(resolve(process.cwd(), '../../scripts/operations/backup.cjs')),
      { exportLedger, makeLedger } = require(resolve(process.cwd(), '../../scripts/operations/privacy-ledger.cjs'));
    const bundle = join(h.directory, 'old-backup'); await createBundle({ dataDir: h.data, destination: bundle }); const verified = await verifyBundle({ bundle });
    expect(verified.manifest.files.filter((file: any) => file.path.startsWith('data/paper-exports/'))).toHaveLength(2);
    const keepTarget = join(h.directory, 'retained-recovered'), kept = await restoreBundle({ bundle, destination: keepTarget }); expect(kept.paperExportFilesRetained).toBe(2);
    expect(sha(readFileSync(join(keepTarget, published.file.workspace, 'artifacts-practice/practice.pdf')))).toBe(actualPdf.sha256);
    const keepDb = new DomainDatabase(join(keepTarget, 'study-agent.sqlite3')); await keepDb.open();
    try { expect(((await keepDb.read()).state.paperExports[0] as any).intent).toEqual(prepared.record.intent); } finally { await keepDb.close(); }
    const preview = await h.api(actor.token, 'get', '/privacy/account/deletion-preview'), receipt = await h.api(actor.token, 'post', '/privacy/account/delete', { credential, requestKey: 'delete-before-native-restore', confirmation: preview.confirmation, fingerprint: preview.fingerprint });
    const ledger = join(h.directory, 'latest-deletions.json'); await exportLedger({ dataDir: h.data, destination: ledger });
    const recovered = join(h.directory, 'recovered'), result = await restoreBundle({ bundle, destination: recovered, deletionLedger: ledger });
    expect(result.paperExportFilesDeleted).toBe(2); expect(result.paperExportFilesRetained).toBe(0);
    const db = new DomainDatabase(join(recovered, 'study-agent.sqlite3')); await db.open(); let state: Record<string, any[]>;
    try { state = (await db.read()).state as Record<string, any[]>; } finally { await db.close(); }
    expect(state.paperExports ?? []).toHaveLength(0); expect(state.paperExportFiles[0]).toMatchObject({ state: 'deleted', deletionReceiptId: receipt.id });
    expect(JSON.stringify(state)).not.toContain('QORIGINAL7'); expect(existsSync(join(recovered, published.file.workspace, 'input.json'))).toBe(false);
    expect(sha(readFileSync(join(h.data, published.file.workspace, 'artifacts-practice/practice.pdf')))).toBe(actualPdf.sha256);
    const forged = JSON.parse(readFileSync(ledger, 'utf8')).entries; forged[0].erasedPaperExports[0].files[0].identityFingerprint = digest('forged-workspace');
    const forgedFile = join(h.directory, 'forged-ledger.json'); writeFileSync(forgedFile, JSON.stringify(makeLedger(forged)));
    await expect(restoreBundle({ bundle, destination: join(h.directory, 'forged-restore'), deletionLedger: forgedFile })).rejects.toThrow('paper_export_deletion_original_missing');
    let unknownPath = '';
    await expect(restoreBundle({ bundle, destination: join(h.directory, 'unknown-preserved'), deletionLedger: ledger, afterPhase: (phase: string) => {
      if (phase === 'files_copied') { unknownPath = join(h.directory, 'unknown-preserved', published.file.workspace, 'unknown.txt'); writeFileSync(unknownPath, 'Unknown fixture must remain'); }
    } })).rejects.toThrow('restore_paper_export_unknown_file');
    expect(readFileSync(unknownPath, 'utf8')).toBe('Unknown fixture must remain');
  }), 240000);

  it('retains the learner originals and exposure facts after one guardian is deleted, then erases them on final student deletion', async () => application(async h => {
    const first = await h.register('paper-first-guardian'), second = await h.register('paper-second-guardian');
    const child = (await h.api(first.token, 'post', '/students', { nickname: '合成共同监护学生', grade: 3, preferredSessionMinutes: 10, defaultVersionMap: { math: 'original', chinese: '', english: '' } })).profile;
    const invitation = await h.api(first.token, 'post', `/students/${child.id}/invitations`, { recipientPrincipal: second.user.principal });
    await h.api(second.token, 'post', `/parents/${second.user.id}/bindings`, { studentId: child.id, inviteToken: invitation.token });
    await h.api(first.token, 'post', `/students/${child.id}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: 'paper-student-access', reason: '合成学生本人授权核对' });
    const access = await h.store.requestContext(() => h.store.find('studentLearningAccess', { studentId: child.id }));
    const prepared = await h.prepare(access.userId, child.id, first.user.id), originals = await h.store.requestContext(() => JSON.stringify({
      lists: h.store.inspect('paperSelectionLists'), commands: h.store.inspect('paperSelectionCommands'), exports: h.store.inspect('paperExports'), exportCommands: h.store.inspect('paperExportCommands'), exposures: h.store.inspect('paperSourceExposures') }));
    const preview = await h.api(first.token, 'get', '/privacy/account/deletion-preview'); expect(preview.retainedChildren.map((row: any) => row.id)).toContain(child.id);
    await h.api(first.token, 'post', '/privacy/account/delete', { credential, requestKey: 'delete-original-guardian', confirmation: preview.confirmation, fingerprint: preview.fingerprint });
    const after = await h.store.requestContext(() => JSON.stringify({ lists: h.store.inspect('paperSelectionLists'), commands: h.store.inspect('paperSelectionCommands'), exports: h.store.inspect('paperExports'), exportCommands: h.store.inspect('paperExportCommands'), exposures: h.store.inspect('paperSourceExposures') }));
    expect(after).toBe(originals); expect((await h.store.tasks.get(prepared.tasks[0].id)).state).toBe('cancelled'); await h.cold();
    const copy = await h.api(second.token, 'post', `/privacy/students/${child.id}/export`, { credential, requestKey: 'copy-retained-learner-facts' });
    const records = copy.students[0].records; expect(records.paperSelectionLists ?? []).toHaveLength(0); expect(records.paperExports ?? []).toHaveLength(0); expect(records.paperSourceExposures).toHaveLength(4);
    const finalPreview = await h.api(second.token, 'get', `/privacy/students/${child.id}/deletion-preview`), erased = await h.api(second.token, 'post', `/privacy/students/${child.id}/delete`,
      { credential, requestKey: 'delete-final-student', confirmation: finalPreview.confirmation, fingerprint: finalPreview.fingerprint });
    expect(erased.erasedPaperExports).toHaveLength(1); const cold = (await h.cold()).state;
    expect(cold.paperExports ?? []).toHaveLength(0); expect(cold.paperSourceExposures ?? []).toHaveLength(0);
  }), 180000);
});
