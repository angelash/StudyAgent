import { mkdirSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { PaperExportDocument, PaperSelectionItem, PaperSelectionScope } from '@study-agent/contracts';
import { DomainDatabase } from '../../infrastructure/domain-database';
import { fixture } from './paper-export-fixture.spec';
import { paperExportExposureKey, preparePaperExport } from './paper-export-record';
import { preparePaperSelectionChange, type PaperSelectionAuthorization } from './paper-selection-record';
import { paperSelectionExposureKey, preparePaperSourceExposure } from './paper-source-exposure-record';

export let repository = resolve(__dirname); while (!existsSync(join(repository, '.git')) && dirname(repository) !== repository) repository = dirname(repository);
export const sample = join(repository, 'doc/evidence/2026-10-31/workspace-r5-export-records-and-outbox');
export const sampleReceipt = JSON.parse(readFileSync(join(sample, 'receipt.json'), 'utf8'));
export const actualDocument: PaperExportDocument = JSON.parse(gunzipSync(readFileSync(join(sample, 'inputs/renderer-input.json.gz'))).toString('utf8'));
export const actualPdf = sampleReceipt.actualFinalBridge.files.find((file: any) => file.format === 'pdf');
export const actualDocx = sampleReceipt.actualFinalBridge.files.find((file: any) => file.format === 'docx');
export function preparedLibrary(actorId: string, authorization: PaperSelectionAuthorization, studentId: string | null = null, suffix = 'first', format: 'pdf' | 'docx' = 'pdf') {
  const template = fixture(studentId !== null, true), at = new Date().toISOString();
  const scope: PaperSelectionScope = studentId === null ? { kind: 'private_preparation', studentId: null } : { kind: 'student_self', studentId };
  const selection = preparePaperSelectionChange({ actorId, authorization, input: { kind: 'create', requestKey: 'selection-' + suffix, scope, title: '合成原清单',
    items: template.items.map(item => { const { title: _title, originalPage: _page, ...identity } = item.source; return identity; }) }, at, previous: null, resolved: template.items });
  const document = structuredClone(actualDocument), exported = preparePaperExport({ actorId, authorization, input: { ...template.input, requestKey: 'export-' + suffix,
    listId: selection.list.id, listFingerprint: selection.command.result.fingerprint, title: document.title, layout: document.layout, formats: [format] }, list: selection.list, document, media: [], at });
  const exposures = [];
  if (studentId !== null) for (const item of template.items) for (const kind of ['selection', 'export'] as const) {
    const command = kind === 'selection' ? selection.command : exported.command;
    exposures.push(preparePaperSourceExposure({ actorId, studentId, authorization, at,
      input: { kind, requestKey: (kind === 'selection' ? paperSelectionExposureKey : paperExportExposureKey)(command.id, item.source.paperId), paperId: item.source.paperId,
        detailSha256: item.source.detailSha256, publicationVersion: item.source.publicationVersion!, positions: [{ position: item.source.position, sourceQuestionId: item.source.sourceQuestionId }],
        answers: false, origin: { kind: kind === 'selection' ? 'selection_command' : 'export_command', id: command.id } }, sources: [item.source] }));
  }
  return { selection, ...exported, exposures, document, items: template.items, authorization, actorId };
}
export function publishedSources(items: PaperSelectionItem[]) { return items.map(item => ({ id: 'publication-' + item.source.paperId, paperId: item.source.paperId, version: item.source.publicationVersion,
  status: 'published', detailSha256: item.source.detailSha256 })); }
export function addPrepared(state: Record<string, any[]>, prepared: ReturnType<typeof preparedLibrary>) {
  for (const [name, values] of Object.entries({ paperSelectionLists: [prepared.selection.list], paperSelectionCommands: [prepared.selection.command],
    paperExports: [prepared.record], paperExportCommands: [prepared.command], paperSourceExposures: prepared.exposures })) state[name] = [...state[name] ?? [], ...values];
}
export function libraryInitialState(prepared: ReturnType<typeof preparedLibrary>) {
  const state: Record<string, any[]> = {
    users: [{ id: 'parent', principal: 'library-parent', role: 'parent', status: 'active', version: 0 }, { id: 'learner', principal: '@learner/library', role: 'student', status: 'active', version: 0 }],
    students: [{ id: 'child', userId: 'learner', nickname: '合成学生' }], studentLearningAccess: [{ id: 'access-child', studentId: 'child', userId: 'learner', status: 'enabled', version: 1 }],
    bindings: [{ id: 'binding-child', studentId: 'child', parentUserId: 'parent', status: 'active' }], paperPublications: publishedSources(prepared.items),
  }; addPrepared(state, prepared); return state;
}
export async function libraryDatabase(student = false) {
  const qa = resolve(process.cwd(), '../../data/qa/paper-library-persistence-tests'); mkdirSync(qa, { recursive: true });
  const directory = mkdtempSync(join(qa, 'sqlite-')), location = join(directory, 'study-agent.sqlite3'), db = new DomainDatabase(location); await db.open();
  const authorization: PaperSelectionAuthorization = student ? { actorRole: 'student', actorVersion: 0, learningAccess: { studentId: 'child', guardianId: 'parent', accessVersion: 1 } } : { actorRole: 'parent', actorVersion: 0, learningAccess: null };
  const prepared = preparedLibrary(student ? 'learner' : 'parent', authorization, student ? 'child' : null), state = libraryInitialState(prepared);
  await db.commit(await db.read(), state, { enqueue: prepared.tasks });
  return { ...prepared, db, directory, location, state: async () => (await db.read()).state as Record<string, any[]>, close: () => db.close() };
}
