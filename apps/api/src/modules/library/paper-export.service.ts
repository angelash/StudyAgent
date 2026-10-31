import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { paperExportCommandSchema, paperSelectionIdSchema, paperSelectionRequestKeySchema, type PaperExportCommand } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { retentionDigest as digest } from '../diagnostics/retention-anchor';
import { LibraryRepository } from './library.repository';
import { LibraryService } from './library.service';
import { paperLibraryAuthor, assertPaperDiagnosticAvailable, type PaperLibraryActor } from './paper-library-authorization';
import { resolvePaperSelectionSources } from './paper-selection-source';
import { buildPaperExportDocument } from './paper-export-document-source';
import { paperExportDocumentSha256, paperExportExposureKey, preparePaperExport, preparePaperExportControl, type PaperExportRecord } from './paper-export-record';
import { preparePaperSourceExposure } from './paper-source-exposure-record';
import { PaperExportRuntimeService, type PaperExportPreflight } from './paper-export-runtime.service';
import type { TaskRow } from '../../infrastructure/task-repository';
import { resolve } from 'node:path';
import { acquireStudioFileLease } from '../../infrastructure/studio-file-coordination';
import { studyDataRoot } from '../../infrastructure/workspace-paths';
import { openVerifiedLibraryMedia } from './verified-library-media';
import { paperExportBookSchema, paperExportFormatSchema } from '@study-agent/contracts';

type Create = Extract<PaperExportCommand, { kind: 'create' }>;
const same = (a: unknown, b: unknown) => digest(a) === digest(b);
const changed = () => new ConflictException('准确清单修订、来源或导出任务已变化；请保留完整命令后读取原结果核对。');
@Injectable()
export class PaperExportService {
  constructor(private readonly store: InMemoryStoreService, private readonly repo: LibraryRepository, private readonly library: LibraryService,
    private readonly runtime: PaperExportRuntimeService) {}
  private selection(request: PaperLibraryActor, input: Pick<Create, 'listId' | 'listRevision' | 'listFingerprint'>) {
    const list = this.store.find('paperSelectionLists', { id: input.listId, actorId: request.user.id });
    if (!list) throw new NotFoundException('原选题清单不存在或不属于当前账号。');
    const author = paperLibraryAuthor(this.store, request, list.scope), saved = list.history[input.listRevision - 1];
    if (!saved || saved.fingerprint !== input.listFingerprint || !saved.snapshot.items.length) throw changed();
    const resolved = resolvePaperSelectionSources({ user: request.user, sources: saved.snapshot.items.map(item => {
      const { title: _title, originalPage: _page, ...source } = item.source; return source;
    }), repo: this.repo, paper: id => this.library.practiceSource(request.user, id), publication: id => this.store.find('paperPublications', { paperId: id }) });
    if (!same(resolved.map(row => row.item), saved.snapshot.items)) throw changed();
    return { list, saved, resolved, ...author };
  }
  private require(request: PaperLibraryActor, id: string) {
    validate(paperSelectionIdSchema, id);
    const record = this.store.find('paperExports', { id, actorId: request.user.id });
    if (!record) throw new NotFoundException('导出不存在或不属于当前账号。');
    paperLibraryAuthor(this.store, request, record.scope); return record;
  }
  private availability(request: PaperLibraryActor, record: PaperExportRecord) {
    try { const original = this.selection(request, record.intent); assertPaperDiagnosticAvailable(this.store, original.scope); return { available: true, reason: '' }; }
    catch { return { available: false, reason: '当前来源、发布或学习资格不可用，或正在进行正式诊断；原命令及冻结版本保持。' }; }
  }
  private async view(request: PaperLibraryActor, record: PaperExportRecord) {
    const availability = this.availability(request, record), slots = await Promise.all(record.slots.map(async slot => {
      const task = await this.store.tasks.get(slot.taskId); if (!task) throw changed();
      return { book: slot.book, format: slot.format, taskId: slot.taskId, state: task.state, version: task.version, generation: task.generation,
        stage: task.progress.stage === 'reserved' || task.progress.stage === 'rendered' ? task.progress.stage : null,
        errorCode: task.errorCode && /^paper_export_[a-z0-9_]{1,80}$/.test(task.errorCode) ? task.errorCode : null,
        publication: slot.published ? { sha256: slot.published.sha256, bytes: slot.published.bytes, pageCount: slot.published.pageCount, generation: slot.published.generation, publishedAt: slot.published.publishedAt } : null,
        downloadUrl: availability.available && slot.published && task.state === 'succeeded' ? '/api/library/exports/' + encodeURIComponent(record.id) + '/files/' + slot.book + '/' + slot.format : null };
    }));
    return { id: record.id, scope: structuredClone(record.scope), createdAt: record.createdAt, title: record.intent.document.title, layout: structuredClone(record.intent.document.layout),
      listId: record.intent.listId, listRevision: record.intent.listRevision, listFingerprint: record.intent.listFingerprint, intentFingerprint: record.intent.fingerprint,
      documentSha256: record.intent.documentSha256, itemCount: record.intent.document.items.length, availability, slots };
  }
  async list(request: PaperLibraryActor, value: unknown) {
    const query = validate(z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(30).default(20) }).strict(), value);
    const { scope } = paperLibraryAuthor(this.store, request), rows = this.store.select('paperExports', { actorId: request.user.id }).filter(row => same(row.scope, scope)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    return { ...query, total: rows.length, items: await Promise.all(rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map(row => this.view(request, row))) };
  }
  async get(request: PaperLibraryActor, id: string) { return this.view(request, this.require(request, id)); }
  async commandResult(request: PaperLibraryActor, key: string) {
    validate(paperSelectionRequestKeySchema, key);
    const row = this.store.find('paperExportCommands', { actorId: request.user.id, requestKey: key });
    if (!row) { paperLibraryAuthor(this.store, request); return null; }
    paperLibraryAuthor(this.store, request, row.scope);
    return { input: structuredClone(row.input), result: structuredClone(row.result), current: await this.view(request, this.require(request, row.result.exportId)) };
  }
  private async prepare(request: PaperLibraryActor, input: Create) {
    const original = this.selection(request, input); assertPaperDiagnosticAvailable(this.store, original.scope);
    const built = await buildPaperExportDocument({ title: input.title, layout: input.layout, resolved: original.resolved, repo: this.repo });
    const report = await this.runtime.preflight(built);
    // Expensive file reads and Python await outside the domain lock. The fresh
    // snapshot checks their actual author/source, while final native writes CAS
    // the original request dependencies in the same queue/exposure transaction.
    await this.store.requestContext(() => {
      const latest = this.selection(request, input); assertPaperDiagnosticAvailable(this.store, latest.scope);
      if (!same(latest.authorization, original.authorization) || !same(latest.resolved, original.resolved)) throw changed();
    });
    return { ...original, built, report };
  }
  async preflight(request: PaperLibraryActor, value: unknown) {
    const input = validate(paperExportCommandSchema, value); if (input.kind !== 'create') throw changed();
    const { report, built } = await this.prepare(request, input);
    return { ...report, listId: input.listId, listRevision: input.listRevision, listFingerprint: input.listFingerprint, documentSha256: paperExportDocumentSha256(built.document) };
  }
  private assertBooks(input: Create, report: PaperExportPreflight) {
    const refused = input.books.filter(book => !report.books[book].available);
    if (refused.length) throw new ConflictException({ code: 'paper_export_book_unavailable', message: '所选册当前不能完整导出，请保留完整稿并核对逐册预检原因。', books: report.books });
  }
  private createExposure(record: PaperExportRecord, commandId: string, at: string) {
    if (record.scope.kind !== 'student_self') return;
    const list = this.store.find('paperSelectionLists', { id: record.intent.listId })!, selected = list.history[record.intent.listRevision - 1].snapshot.items;
    const groups = new Map<string, typeof selected>();
    for (const item of selected) { const entries = groups.get(item.source.paperId) ?? []; entries.push(item); groups.set(item.source.paperId, entries); }
    for (const [paperId, items] of groups) { const source = items[0].source;
      this.store.append('paperSourceExposures', preparePaperSourceExposure({ actorId: record.actorId, studentId: record.scope.studentId, authorization: record.authorization, at,
        input: { kind: 'export', requestKey: paperExportExposureKey(commandId, paperId), paperId, detailSha256: source.detailSha256, publicationVersion: source.publicationVersion!,
          positions: items.map(item => ({ position: item.source.position, sourceQuestionId: item.source.sourceQuestionId })), answers: record.intent.books.includes('answers'), origin: { kind: 'export_command', id: commandId } }, sources: items.map(item => item.source) }));
    }
  }
  async command(request: PaperLibraryActor, value: unknown) {
    const input = validate(paperExportCommandSchema, value), prior = this.store.find('paperExportCommands', { actorId: request.user.id, requestKey: input.requestKey });
    if (prior) { paperLibraryAuthor(this.store, request, prior.scope); if (!same(prior.input, input)) throw changed(); return structuredClone(prior.result); }
    if (input.kind === 'create') {
      const prepared = await this.prepare(request, input); this.assertBooks(input, prepared.report);
      const at = new Date().toISOString(), result = preparePaperExport({ actorId: request.user.id, authorization: prepared.authorization, input,
        list: prepared.list, document: prepared.built.document, media: prepared.built.media, at });
      this.store.append('paperExports', result.record); this.store.append('paperExportCommands', result.command); this.createExposure(result.record, result.command.id, at);
      for (const task of result.tasks) await this.store.enqueueTask(task);
      return structuredClone(result.command.result);
    }
    const record = this.require(request, input.exportId), { authorization } = paperLibraryAuthor(this.store, request, record.scope);
    if (input.kind === 'retry') {
      const first = this.store.find('paperExportCommands', { id: record.intent.commandId }); if (!first || first.input.kind !== 'create') throw changed();
      const prepared = await this.prepare(request, first.input); this.assertBooks(first.input, prepared.report);
      if (!same(prepared.built.document, record.intent.document) || !same(prepared.built.media, record.intent.media)) throw changed();
    }
    const slot = record.slots.find(slot => slot.book === input.book && slot.format === input.format), task = slot && await this.store.tasks.get(slot.taskId); if (!task) throw changed();
    let prepared: ReturnType<typeof preparePaperExportControl>;
    try { prepared = preparePaperExportControl({ actorId: request.user.id, authorization, input, record, task, at: new Date().toISOString() }); }
    catch { throw changed(); }
    this.store.append('paperExportCommands', prepared.command); await this.store.controlTask(prepared.operation); return structuredClone(prepared.command.result);
  }
  /** A durable worker has an original authorization snapshot, never a forged
   * browser session. Recheck it and its actual source dependencies each time. */
  work(task: TaskRow) {
    const record = this.store.find('paperExports', { id: String(task.payload.exportId), actorId: task.ownerUserId });
    if (!record || record.intent.fingerprint !== task.payload.intentFingerprint || !record.slots.some(slot => slot.taskId === task.id && slot.book === task.payload.book && slot.format === task.payload.format && !slot.published)) throw changed();
    const activation = this.store.select('paperExportCommands', { actorId: record.actorId }).find(command => command.input.kind === 'retry' && command.result.kind === 'retry' && command.result.taskId === task.id && command.result.generation === task.generation);
    const authorization = activation?.authorization ?? record.authorization, user = this.store.find('users', { id: record.actorId, status: 'active', role: authorization.actorRole });
    if (!user || (user.version ?? 1) !== authorization.actorVersion) throw changed();
    if (record.scope.kind === 'student_self') {
      const access = authorization.learningAccess, guardian = access && this.store.find('users', { id: access.guardianId, status: 'active', role: ['parent', 'admin'] });
      if (!access || !guardian || !this.store.find('students', { id: record.scope.studentId, userId: user.id }) || !this.store.find('studentLearningAccess', { studentId: record.scope.studentId, userId: user.id, status: 'enabled', version: access.accessVersion }) ||
          guardian.role !== 'admin' && !this.store.find('bindings', { studentId: record.scope.studentId, parentUserId: guardian.id, status: 'active' })) throw changed();
    }
    assertPaperDiagnosticAvailable(this.store, record.scope);
    const list = this.store.find('paperSelectionLists', { id: record.intent.listId, actorId: record.actorId }), saved = list?.history[record.intent.listRevision - 1];
    if (!saved || saved.fingerprint !== record.intent.listFingerprint) throw changed();
    const resolved = resolvePaperSelectionSources({ user, sources: saved.snapshot.items.map(item => { const { title: _title, originalPage: _page, ...source } = item.source; return source; }),
      repo: this.repo, paper: id => this.library.practiceSource(user, id), publication: id => this.store.find('paperPublications', { paperId: id }) });
    if (!same(resolved.map(row => row.item), saved.snapshot.items)) throw changed();
    return { record, resolved };
  }
  async workerDocument(task: TaskRow) {
    const original = this.work(task), built = await buildPaperExportDocument({ title: original.record.intent.document.title, layout: original.record.intent.document.layout, resolved: original.resolved, repo: this.repo });
    if (!same(built.document, original.record.intent.document) || !same(built.media, original.record.intent.media)) throw changed();
    return built;
  }
  async file(request: PaperLibraryActor, id: string, selectedBook: unknown, selectedFormat: unknown, signal?: AbortSignal) {
    const book = validate(paperExportBookSchema, selectedBook), format = validate(paperExportFormatSchema, selectedFormat);
    const grant = async () => {
      const record = this.require(request, id), original = this.selection(request, record.intent); assertPaperDiagnosticAvailable(this.store, original.scope);
      const slot = record.slots.find(slot => slot.book === book && slot.format === format), published = slot?.published;
      const file = published && this.store.find('paperExportFiles', { id: published.fileId, exportId: record.id, state: 'available', generation: published.generation });
      const task = slot && await this.store.tasks.get(slot.taskId);
      if (!published || !file?.output || !task || task.state !== 'succeeded' || task.generation !== published.generation || task.result?.fileId !== file.id ||
          file.output.book !== book || file.output.format !== format || file.output.sha256 !== published.sha256 || file.output.bytes !== published.bytes) throw changed();
      return { file, publication: published, original, record, identity: digest({ exportId: record.id, intentFingerprint: record.intent.fingerprint, published, file, task: { id: task.id, version: task.version, generation: task.generation, result: task.result } }) };
    };
    const initial = await grant(), root = studyDataRoot(), release = await acquireStudioFileLease(root, 'paper-export', initial.file.workspace.split('/')[1]);
    let opened: Awaited<ReturnType<typeof openVerifiedLibraryMedia>> | undefined;
    try {
      const built = await buildPaperExportDocument({ title: initial.record.intent.document.title, layout: initial.record.intent.document.layout,
        resolved: initial.original.resolved, repo: this.repo, signal });
      if (!same(built.media, initial.record.intent.media) || !same(built.document, initial.record.intent.document)) throw changed();
      opened = await openVerifiedLibraryMedia({ path: resolve(root, initial.file.workspace, 'artifacts-' + book, book + '.' + format), size: initial.publication.bytes, sha256: initial.publication.sha256 }, signal);
      const current = await this.store.requestContext(grant); if (signal?.aborted || current.identity !== initial.identity) throw changed();
      return { ...opened, type: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        disposition: (format === 'pdf' ? 'inline' : 'attachment') + '; filename="studyagent-' + book + '.' + format + '"', release };
    } catch (error) { await opened?.handle.close(); await release(); throw error; }
  }
}
