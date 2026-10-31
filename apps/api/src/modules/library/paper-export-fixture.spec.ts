import type { PaperExportCommand, PaperExportDocument, PaperSelectionItem, PaperSelectionScope } from '@study-agent/contracts';
import { retentionDigest as digest } from '../diagnostics/retention-anchor';
import { preparePaperSelectionChange, paperSelectionItemId, type PaperSelectionAuthorization } from './paper-selection-record';
import { preparePaperSourceExposure, paperSelectionExposureKey } from './paper-source-exposure-record';
import { paperExportSource, paperExportExposureKey, preparePaperExport } from './paper-export-record';

export const at = '2026-10-31T03:00:00.000Z';
export const authorization: PaperSelectionAuthorization = { actorRole: 'parent', actorVersion: 0, learningAccess: null };
export function fixture(student = false, single = false) {
  const actorId = student ? 'learner' : 'parent', scope: PaperSelectionScope = student ? { kind: 'student_self', studentId: 'child' } : { kind: 'private_preparation', studentId: null };
  const auth: PaperSelectionAuthorization = student ? { actorRole: 'student', actorVersion: 0, learningAccess: { studentId: 'child', guardianId: 'parent', accessVersion: 1 } } : authorization;
  const items = [7, 3].map((position, index): PaperSelectionItem => {
    const source = { paperId: `source-${index}`, position, sourceQuestionId: 'paper:original-' + position, detailSha256: digest(`source-${index}`), publicationVersion: 2,
      title: `原卷${index}`, originalPage: index === 0 ? null : 4 };
    return { id: paperSelectionItemId(source), source, research: false };
  });
  const selection = preparePaperSelectionChange({ actorId, authorization: auth, input: { kind: 'create', requestKey: 'selection-one', scope, title: '选题原稿',
    items: items.map(item => { const { title: _title, originalPage: _page, ...identity } = item.source; return identity; }) }, at, previous: null, resolved: items });
  const document: PaperExportDocument = { protocol: 'paper-export-document-v1', title: '  原文题单🙂  ', layout: { answerLines: 2, breakBetweenQuestions: false }, media: [],
    items: items.map(item => ({ id: item.id, source: paperExportSource(item.source), promptHtml: `<p>正文 ${item.source.position}</p>`, optionHtml: [{ label: 'A', html: '<p>甲</p>' }],
      reference: { answerHtml: '<p>原参考</p>', analysisHtml: null } })) };
  const input: Extract<PaperExportCommand, { kind: 'create' }> = { kind: 'create', requestKey: 'export-first', listId: selection.list.id, listRevision: 1,
    listFingerprint: selection.command.result.fingerprint, title: document.title, layout: document.layout, books: single ? ['practice'] : ['practice', 'answers'], formats: single ? ['pdf'] : ['pdf', 'docx'] };
  const exported = preparePaperExport({ actorId, authorization: auth, input, list: selection.list, document, media: [], at });
  const rows: Array<{ collection: string; record_id?: string; body: any }> = [
    { collection: 'users', body: { id: 'parent', role: 'parent' } }, { collection: 'users', body: { id: 'learner', role: 'student' } },
    { collection: 'students', body: { id: 'child', userId: 'learner' } }, { collection: 'paperSelectionLists', body: selection.list },
    { collection: 'paperSelectionCommands', body: selection.command }, { collection: 'paperExports', body: exported.record }, { collection: 'paperExportCommands', body: exported.command },
  ];
  if (student) for (const item of items) for (const kind of ['selection', 'export'] as const) {
    const command = kind === 'selection' ? selection.command : exported.command;
    rows.push({ collection: 'paperSourceExposures', body: preparePaperSourceExposure({ actorId, studentId: 'child', authorization: auth, at,
      input: { kind, requestKey: (kind === 'selection' ? paperSelectionExposureKey : paperExportExposureKey)(command.id, item.source.paperId),
        paperId: item.source.paperId, detailSha256: item.source.detailSha256, publicationVersion: 2,
        positions: [{ position: item.source.position, sourceQuestionId: item.source.sourceQuestionId }], answers: kind === 'export' && input.books.includes('answers'),
        origin: { kind: kind === 'selection' ? 'selection_command' : 'export_command', id: command.id } }, sources: [item.source] }) });
  }
  return { ...exported, selection, rows, auth, input, document, actorId, items };
}
export function sourceMap(document: PaperExportDocument) {
  return document.items.map((item, index) => ({ itemId: item.id, number: index + 1, source: structuredClone(item.source), startPage: index + 1, endPage: index + 1,
    bookmark: 'PaperItem' + String(index + 1).padStart(4, '0'), endBookmark: 'PaperEnd' + String(index + 1).padStart(4, '0'), pdfDestinationName: 'PaperItem' + String(index + 1).padStart(4, '0') }));
}
