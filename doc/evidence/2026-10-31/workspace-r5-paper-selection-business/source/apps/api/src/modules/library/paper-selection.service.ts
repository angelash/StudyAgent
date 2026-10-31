import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { paperSelectionCommandSchema, paperSelectionIdSchema, paperSelectionRequestKeySchema, paperSelectionSourceIdentitySchema,
  paperSourceReadCommandSchema, type PaperSelectionCommand, type PaperSelectionListView, type PaperSelectionSourceIdentity } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { retentionDigest as digest } from '../diagnostics/retention-anchor';
import { LibraryRepository } from './library.repository';
import { LibraryService } from './library.service';
import { paperLibraryAuthor, assertPaperDiagnosticAvailable, type PaperLibraryActor } from './paper-library-authorization';
import { preparePaperSelectionChange, type PaperSelectionListRecord } from './paper-selection-record';
import { resolvePaperSelectionSources } from './paper-selection-source';
import { paperSelectionExposureKey, preparePaperSourceExposure } from './paper-source-exposure-record';

const same = (left: unknown, right: unknown) => digest(left) === digest(right);
@Injectable()
export class PaperSelectionService {
  constructor(private readonly store: InMemoryStoreService, private readonly repo: LibraryRepository, private readonly library: LibraryService) {}

  /** Cache archive bytes only within this synchronous request projection. Every
   * new business command gets a fresh complete archive SHA verification. */
  private resolver(request: PaperLibraryActor) {
    const originals = new Map<string, ReturnType<LibraryRepository['verifiedSelectionDetail']>>(), slots = new Map<string, ReturnType<LibraryRepository['items']>>();
    return (sources: readonly PaperSelectionSourceIdentity[]) => resolvePaperSelectionSources({ user: request.user, sources,
      paper: id => this.library.practiceSource(request.user, id), publication: id => this.store.find('paperPublications', { paperId: id }),
      repo: {
        items: id => { if (!slots.has(id)) slots.set(id, this.repo.items(id)); return slots.get(id)!; },
        verifiedSelectionDetail: (id, sha) => { const key = JSON.stringify([id, sha]); if (!originals.has(key)) originals.set(key, this.repo.verifiedSelectionDetail(id, sha)); return originals.get(key)!; },
      },
    });
  }
  private require(request: PaperLibraryActor, id: string) {
    validate(paperSelectionIdSchema, id);
    const row = this.store.find('paperSelectionLists', { id, actorId: request.user.id });
    if (!row) throw new NotFoundException('选题清单不存在或不属于当前账号。');
    paperLibraryAuthor(this.store, request, row.scope); return row;
  }
  private view(request: PaperLibraryActor, row: PaperSelectionListRecord): PaperSelectionListView {
    const saved = row.history.at(-1)!, resolve = this.resolver(request);
    return { id: row.id, scope: structuredClone(row.scope), revision: row.revision, fingerprint: saved.fingerprint,
      createdAt: row.createdAt, updatedAt: row.updatedAt, title: saved.snapshot.title,
      items: saved.snapshot.items.map(item => {
        let availability = { available: true, reason: '' };
        try {
          const { title: _title, originalPage: _page, ...identity } = item.source;
          if (!same(resolve([identity])[0].item, item)) availability = { available: false, reason: '原卷来源信息已变化，请保留原题位并重新核对。' };
        } catch { availability = { available: false, reason: '原卷、发布版本或准确题位当前不可用；原清单和原请求仍保留。' }; }
        return { ...structuredClone(item), availability };
      }) };
  }
  list(request: PaperLibraryActor, input: unknown) {
    const query = validate(z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(30).default(20) }).strict(), input);
    const { scope } = paperLibraryAuthor(this.store, request);
    const rows = this.store.select('paperSelectionLists', { actorId: request.user.id }).filter(row => same(row.scope, scope))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    return { page: query.page, pageSize: query.pageSize, total: rows.length, items: rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map(row => this.view(request, row)) };
  }
  get(request: PaperLibraryActor, id: string) { return this.view(request, this.require(request, id)); }
  commandResult(request: PaperLibraryActor, key: string) {
    validate(paperSelectionRequestKeySchema, key);
    const row = this.store.find('paperSelectionCommands', { actorId: request.user.id, requestKey: key });
    if (!row) { paperLibraryAuthor(this.store, request); return null; }
    paperLibraryAuthor(this.store, request, row.scope);
    return { input: structuredClone(row.input), result: structuredClone(row.result), current: this.view(request, this.require(request, row.result.listId)) };
  }
  command(request: PaperLibraryActor, value: unknown) {
    const input = validate(paperSelectionCommandSchema, value), prior = this.store.find('paperSelectionCommands', { actorId: request.user.id, requestKey: input.requestKey });
    // Original receipts are recoverable during a diagnosis/source withdrawal;
    // recovery neither edits a list nor creates a second exposure.
    if (prior) {
      paperLibraryAuthor(this.store, request, prior.scope);
      if (!same(input, prior.input)) throw new ConflictException('这个原请求键已经用于另一份完整命令，请先核对原结果。');
      return structuredClone(prior.result);
    }
    const previous = input.kind === 'revise' ? this.require(request, input.listId) : null;
    const { scope, authorization } = paperLibraryAuthor(this.store, request, input.kind === 'create' ? input.scope : previous!.scope);
    if (input.items.length) assertPaperDiagnosticAvailable(this.store, scope);
    const resolved = this.resolver(request)(input.items).map(row => row.item), at = new Date().toISOString();
    let prepared: ReturnType<typeof preparePaperSelectionChange>;
    try { prepared = preparePaperSelectionChange({ actorId: request.user.id, authorization, input, previous, resolved, at }); }
    catch (error) {
      if (error instanceof Error && ['paper_selection_revision_conflict', 'paper_selection_revision_limit', 'paper_selection_original_time_changed'].includes(error.message))
        throw new ConflictException('清单修订或保留上限已变化，请保留完整稿并读取原清单后再确认。');
      throw error;
    }
    if (previous) Object.assign(previous, prepared.list); else this.store.append('paperSelectionLists', prepared.list);
    this.store.append('paperSelectionCommands', prepared.command);
    if (scope.kind === 'student_self') {
      const groups = new Map<string, typeof resolved>();
      for (const item of resolved) { const items = groups.get(item.source.paperId) ?? []; items.push(item); groups.set(item.source.paperId, items); }
      for (const [paperId, items] of groups) {
        const source = items[0].source;
        this.store.append('paperSourceExposures', preparePaperSourceExposure({ actorId: request.user.id, studentId: scope.studentId, authorization, at,
          input: { kind: 'selection', requestKey: paperSelectionExposureKey(prepared.command.id, paperId), paperId, detailSha256: source.detailSha256,
            publicationVersion: source.publicationVersion!, positions: items.map(item => ({ position: item.source.position, sourceQuestionId: item.source.sourceQuestionId })),
            answers: false, origin: { kind: 'selection_command', id: prepared.command.id } }, sources: items.map(item => item.source) }));
      }
    }
    return structuredClone(prepared.command.result);
  }
  metadata(request: PaperLibraryActor, id: string) {
    validate(paperSelectionIdSchema, id); paperLibraryAuthor(this.store, request);
    const row = this.library.practiceSource(request.user, id), publication = this.store.find('paperPublications', { paperId: id });
    if (!/^[a-f0-9]{64}$/.test(row.detail_sha256)) throw new ConflictException('原卷摘要无法核对，请先核对原资料。');
    const positions = this.repo.items(id).filter(slot => slot.available).map(slot => validate(paperSelectionSourceIdentitySchema, {
      paperId: id, position: slot.position, sourceQuestionId: slot.question_key, detailSha256: row.detail_sha256, publicationVersion: publication?.version ?? null,
    }));
    if (positions.length > 1000 || new Set(positions.map(item => item.position)).size !== positions.length) throw new ConflictException('原题位目录超出本次准确阅读范围或含重复，请先核对原资料。');
    return { paperId: id, title: row.title, detailSha256: row.detail_sha256, publicationVersion: publication?.version ?? null, positions, document: Boolean(row.pdf_url) };
  }
  readResult(request: PaperLibraryActor, key: string) {
    validate(paperSelectionRequestKeySchema, key);
    const { scope } = paperLibraryAuthor(this.store, request);
    if (scope.kind !== 'student_self') throw new ForbiddenException('来源曝光只属于学生本人学习身份。');
    const row = this.store.find('paperSourceExposures', { actorId: request.user.id, studentId: scope.studentId, requestKey: key });
    return row ? { input: structuredClone(row.input), result: structuredClone(row.result) } : null;
  }
  read(request: PaperLibraryActor, value: unknown) {
    const input = validate(paperSourceReadCommandSchema, value), { scope, authorization } = paperLibraryAuthor(this.store, request);
    if (scope.kind !== 'student_self' || input.kind !== 'read') throw new ForbiddenException('只允许学生本人明确阅读；选题和导出曝光由原业务事务登记。');
    const old = this.store.find('paperSourceExposures', { actorId: request.user.id, requestKey: input.requestKey });
    if (old) {
      if (old.studentId !== scope.studentId || !same(old.input, input)) throw new ConflictException('这个原阅读请求键已经用于另一份完整命令。');
      return structuredClone(old.result);
    }
    assertPaperDiagnosticAvailable(this.store, scope);
    const row = this.library.practiceSource(request.user, input.paperId), publication = this.store.find('paperPublications', { paperId: input.paperId });
    if (row.detail_sha256 !== input.detailSha256 || publication?.version !== input.publicationVersion) throw new ConflictException('原卷或发布版本已变化，请保留原命令后重新核对。');
    let sources = [] as ReturnType<ReturnType<PaperSelectionService['resolver']>>;
    if (input.positions === 'document') {
      if (!row.pdf_url) throw new ConflictException('当前原卷没有整卷PDF身份，请选择准确原题位。');
      if (!input.answers) throw new BadRequestException('整卷原始PDF可能包含参考，请明确按可能接触参考登记后再阅读。');
      if (!this.repo.media(row.pdf_url)) throw new ConflictException('原始PDF当前未完成本地校验，请先恢复原资料。');
      this.repo.verifiedSelectionDetail(input.paperId, input.detailSha256);
    } else sources = this.resolver(request)(input.positions.map(position => ({ ...position, paperId: input.paperId, detailSha256: input.detailSha256, publicationVersion: input.publicationVersion })));
    const saved = preparePaperSourceExposure({ actorId: request.user.id, studentId: scope.studentId, authorization, input, sources: sources.map(row => row.item.source), at: new Date().toISOString() });
    this.store.append('paperSourceExposures', saved); return structuredClone(saved.result);
  }
}
