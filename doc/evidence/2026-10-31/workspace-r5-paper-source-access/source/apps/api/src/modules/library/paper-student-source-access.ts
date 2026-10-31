import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { paperLibraryAuthor, type PaperLibraryActor } from './paper-library-authorization';
import { cleanPaperHtml } from './library-html';
import type { PaperRow } from './library.types';
import type { PaperSourceExposureRecord } from './paper-source-exposure-record';

export const paperDiagnosticMessage = '正在进行正式诊断，原卷正文、参考、媒体和打印暂不可读取。自己的首答和草稿仍保留，请先完成原诊断。';
export function paperDiagnosticRestriction(store: InMemoryStoreService, user: InMemoryUserAccount, studentId?: string | null) {
  if (user.role !== 'student') return null;
  const students = store.select('students', studentId ? { id: studentId, userId: user.id } : { userId: user.id });
  return students.some(student => store.find('diagnosticSessions', { studentId: student.id, status: 'in_progress' })) ? paperDiagnosticMessage : null;
}
export function assertNoStudentPaperDiagnostic(store: InMemoryStoreService, user: InMemoryUserAccount, studentId?: string | null) {
  const reason = paperDiagnosticRestriction(store, user, studentId);
  if (reason) throw new ConflictException({ code: 'paper_diagnostic_in_progress', message: reason });
}
function facts(store: InMemoryStoreService, actor: PaperLibraryActor, paper: PaperRow) {
  const { scope } = paperLibraryAuthor(store, actor);
  if (scope.kind !== 'student_self') return null;
  assertNoStudentPaperDiagnostic(store, actor.user, scope.studentId);
  if (!/^[a-f0-9]{64}$/.test(paper.detail_sha256)) throw new ConflictException('原卷实际摘要无法核对，请先恢复原资料。');
  const publication = store.find('paperPublications', { paperId: paper.id });
  if (publication?.status !== 'published') throw new ForbiddenException('原卷当前没有发布读取资格。');
  const reads = store.select('paperSourceExposures', { actorId: actor.user.id, studentId: scope.studentId }).filter(row => row.input.kind === 'read' &&
    row.input.paperId === paper.id && row.input.detailSha256 === paper.detail_sha256 && row.input.publicationVersion === publication.version);
  return { studentId: scope.studentId, version: publication.version, reads };
}
function covers(reads: PaperSourceExposureRecord[], position: number, sourceQuestionId: string, answers: boolean) {
  return reads.some(row => (!answers || row.result.answers) && (row.result.document || row.result.sources.some(source => source.position === position && source.sourceQuestionId === sourceQuestionId)));
}
export function assertPaperPreviewAccess(store: InMemoryStoreService, actor: PaperLibraryActor, paper: PaperRow,
  slots: readonly { position: number; question_key: string; available: number }[], answers: boolean) {
  const current = facts(store, actor, paper); if (!current) return;
  if (paper.pdf_url && !current.reads.some(row => row.result.document && row.result.answers) ||
      slots.some(slot => slot.available && !covers(current.reads, slot.position, slot.question_key, answers)))
    throw new ForbiddenException({ code: 'paper_source_read_required', message: '请先明确登记当前原卷的准确阅读范围，再读取正文或参考。' });
}
function urls(values: unknown[]) {
  const result = new Set<string>();
  for (const value of values) cleanPaperHtml(typeof value === 'string' ? value : '', url => { result.add(url); return null; });
  return result;
}
export type OriginalPaperAccessItem = { position: number; sourceQuestionId: string; question: Record<string, unknown> | null };
export function assertPaperMediaAccess(store: InMemoryStoreService, actor: PaperLibraryActor, paper: PaperRow, url: string, items: readonly OriginalPaperAccessItem[]) {
  const current = facts(store, actor, paper); if (!current) return;
  const sessions = store.select('paperPracticeSessions', { ownerUserId: actor.user.id, studentId: current.studentId }).filter(session => session.sources.some(source =>
    source.paperId === paper.id && source.detailSha256 === paper.detail_sha256 && source.publicationVersion === current.version && !source.research));
  if (url === paper.pdf_url) {
    if (current.reads.some(row => row.result.document && row.result.answers) || sessions.some(session => session.items.some(item => item.paperId === paper.id && item.kind === 'document' && item.promptMedia.includes(url)))) return;
    throw new ForbiddenException({ code: 'paper_source_read_required', message: '请先明确阅读这份整卷PDF，再读取原始文档。' });
  }
  for (const original of items) {
    if (!original.question) continue;
    const question = original.question, options = Array.isArray(question.options) ? question.options : [];
    const prompts = urls([question.title, ...options.map(option => typeof option === 'string' ? option : option?.title)]), references = urls([question.answer, question.details]);
    if (!prompts.has(url) && !references.has(url)) continue;
    if (prompts.has(url) && covers(current.reads, original.position, original.sourceQuestionId, false) || references.has(url) && covers(current.reads, original.position, original.sourceQuestionId, true)) return;
    // An old learner-owned practice has already reserved this exact original.
    // Keep that fact; do not manufacture source-read rows from browser history.
    if (sessions.some(session => session.items.some(item => item.paperId === paper.id && item.kind === 'question' && item.position === original.position && item.sourceQuestionId === original.sourceQuestionId &&
        (prompts.has(url) && item.promptMedia.includes(url) || references.has(url) && item.revealed && item.firstAnswer && item.referenceMedia.includes(url))))) return;
  }
  throw new ForbiddenException({ code: 'paper_source_read_required', message: '这项资源不在当前已明确阅读的准确正文或参考范围内。' });
}
