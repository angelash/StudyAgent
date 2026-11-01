import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { textbookTeachingCommandSchema, textbookTeachingSaveSchema, type TextbookTeachingSourceSnapshot, type TextbookTeachingMaterialCatalog, type TextbookTeachingEditorDetail } from '@study-agent/contracts';
import type { AuthenticatedRequest } from '../../common/auth.guard';
import { validate } from '../../common/validation';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { TextbookRegistryService } from './textbook-registry.service';
import { lessonSourceFingerprint } from './textbook-source-candidates';
import { currentTeachingRelease } from './textbook-teaching-release';
import { prepareTextbookTeachingPackage, teachingHash, teachingTargetSnapshot } from './textbook-teaching-package';
import { eligibleMeasurements } from './eligible-measurements';
import { atomDefinitionFingerprint, questionContentFingerprint } from './measurement-definition';
import { canonicalFamily, FAMILY_IDENTITY_VERSION } from './family-identity';
import { prepareTeachingChange, savedTeachingPreparation, teachingVersionId, type TextbookTeachingAuthorization,
  type TextbookTeachingPackageRecord, type TextbookTeachingVersionRecord } from './textbook-teaching-record';

const key = z.string().min(1).max(180).refine(value => value === value.trim() && !/[\x00-\x1f]/.test(value));
export const teachingSourceRangeSchema = z.object({ bookId: key, bookVersion: key, lessonId: key,
  pageStart: z.number().int().min(1).max(10000), pageEnd: z.number().int().min(1).max(10000) }).strict();
const same = (a: unknown, b: unknown) => teachingHash(a) === teachingHash(b);
@Injectable()
export class TextbookTeachingService {
  constructor(private readonly store: InMemoryStoreService, private readonly textbooks: TextbookRegistryService) {}

  private author(request: AuthenticatedRequest): TextbookTeachingAuthorization {
    const actor = this.store.find('users', { id: request.user.id }), session = this.store.find('sessions', { id: request.authSession.id, userId: request.user.id });
    if (!actor || actor.status !== 'active' || actor.role !== request.user.role || !['admin', 'teacher'].includes(actor.role) ||
        !session || session.revokedAt || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) throw new ForbiddenException('当前教研身份或登录会话已改变，请重新登录并保留完整原稿');
    return { role: actor.role as 'admin' | 'teacher', accountVersion: actor.version ?? 1, sessionId: session.id };
  }
  private require(request: AuthenticatedRequest, id: string) {
    this.author(request); validate(key, id);
    const header = this.store.find('textbookTeachingPackages', { id, actorId: request.user.id });
    if (!header) throw new NotFoundException('教学包不存在或不属于当前教研账号');
    return header;
  }
  private assertCurrentSource(source: TextbookTeachingSourceSnapshot) {
    this.textbooks.assertCurrentEdition(source);
    const book = this.textbooks.require(source.bookId), chapter = book.chapters.find(chapter => chapter.lessons.some(lesson => lesson.id === source.lessonId)),
      lesson = chapter?.lessons.find(lesson => lesson.id === source.lessonId);
    if (book.version !== source.bookVersion || !chapter || !lesson || lesson.kind === 'reference' || lessonSourceFingerprint(chapter, lesson) !== source.lessonFingerprint)
      throw new ConflictException('读取来源期间教材或课时定义已改变，请保留原范围和完整稿后重新核对');
  }
  async sourcePreview(request: AuthenticatedRequest, raw: unknown, signal?: AbortSignal) {
    const input = validate(teachingSourceRangeSchema, raw); await this.store.requestContext(() => this.author(request));
    const source = await this.textbooks.teachingSource(input.bookId, input.bookVersion, input.lessonId, input.pageStart, input.pageEnd, signal);
    return this.store.requestContext(() => { this.author(request); this.assertCurrentSource(source); return source; });
  }
  async preflight(request: AuthenticatedRequest, raw: unknown, signal?: AbortSignal) {
    const input = validate(textbookTeachingSaveSchema, raw), source = await this.sourcePreview(request, {
      bookId: input.source.bookId, bookVersion: input.source.bookVersion, lessonId: input.source.lessonId, pageStart: input.source.pageStart, pageEnd: input.source.pageEnd }, signal);
    return this.store.requestContext(() => { this.author(request); this.assertCurrentSource(source); return prepareTextbookTeachingPackage(this.store, input, source).report; });
  }
  materials(request: AuthenticatedRequest, raw: unknown): TextbookTeachingMaterialCatalog {
    this.author(request);
    const input = validate(z.object({ atomId: key, page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) }).strict(), raw),
      atom = this.store.find('knowledgeAtoms', { id: input.atomId });
    if (!atom) throw new NotFoundException('所选教学目标定义不存在');
    const items = eligibleMeasurements(this.store, [atom.id]).sort((a, b) => a.dimension.localeCompare(b.dimension) || a.family.localeCompare(b.family) || a.id.localeCompare(b.id));
    return { atom: teachingTargetSnapshot(atom), page: input.page, pageSize: input.pageSize, total: items.length,
      items: items.slice((input.page - 1) * input.pageSize, input.page * input.pageSize).map(item => ({
        reference: { measurementId: item.id, version: item.version, questionId: item.questionId, questionVersion: item.questionVersion,
          definitionFingerprint: atomDefinitionFingerprint(atom), contentFingerprint: questionContentFingerprint(this.store, item.questionId) },
        atomId: atom.id, family: item.family, familyKey: canonicalFamily(item), familyIdentityVersion: FAMILY_IDENTITY_VERSION, dimension: item.dimension,
        probeRole: item.probeRole, expectedSeconds: item.expectedSeconds, stem: this.store.find('questions', { id: item.questionId })!.stem,
        answerMode: this.store.find('questionAnswerSchemas', { questionId: item.questionId })!.mode,
      })) };
  }
  list(request: AuthenticatedRequest, raw: unknown) {
    this.author(request);
    const input = validate(z.object({ bookId: key, bookVersion: key, lessonId: key, page: z.coerce.number().int().min(1).max(10000).default(1),
      pageSize: z.coerce.number().int().min(1).max(30).default(10) }).strict(), raw), rows = this.store.select('textbookTeachingPackages', {
      actorId: request.user.id, bookId: input.bookId, bookVersion: input.bookVersion, lessonId: input.lessonId }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    return { total: rows.length, page: input.page, pageSize: input.pageSize, items: rows.slice((input.page - 1) * input.pageSize, input.page * input.pageSize).map(row => ({ ...structuredClone(row),
      availability: currentTeachingRelease(this.store, row, source => this.assertCurrentSource(source)).availability })) };
  }
  get(request: AuthenticatedRequest, id: string, rawVersion?: string): TextbookTeachingEditorDetail {
    const header = this.require(request, id), contentVersion = rawVersion === undefined ? header.contentVersion : validate(z.coerce.number().int().min(1).max(1000), rawVersion),
      saved = this.store.find('textbookTeachingVersions', { id: teachingVersionId(id, contentVersion), actorId: request.user.id });
    if (!saved) throw new NotFoundException('准确教学稿版本不存在');
    const source = this.store.find('textbookTeachingSources', { id: saved.sourceId, actorId: request.user.id });
    if (!source) throw new ConflictException('原完整来源无法核对，请保留原稿');
    const command = this.store.find('textbookTeachingCommands', { id: saved.commandId, actorId: request.user.id });
    if (!command || command.input.action !== 'save') throw new ConflictException('这个版本的完整原保存命令无法核对，请保留原稿');
    return { header: structuredClone(header), version: structuredClone(saved), source: structuredClone(source.snapshot),
      savedBy: { input: structuredClone(command.input), result: structuredClone(command.result) },
      availability: currentTeachingRelease(this.store, header, source => this.assertCurrentSource(source)).availability };
  }
  commandResult(request: AuthenticatedRequest, requestKey: string) {
    this.author(request); validate(key, requestKey);
    const command = this.store.find('textbookTeachingCommands', { actorId: request.user.id, requestKey });
    return command ? { input: structuredClone(command.input), result: structuredClone(command.result), current: structuredClone(this.require(request, command.input.packageId)) } : null;
  }
  async command(request: AuthenticatedRequest, raw: unknown, signal?: AbortSignal) {
    const input = validate(textbookTeachingCommandSchema, raw);
    const replay = () => {
      this.author(request);
      const original = this.store.find('textbookTeachingCommands', { actorId: request.user.id, requestKey: input.requestKey });
      if (original && !same(original.input, input)) throw new ConflictException('原请求键已经用于另一份完整命令，请先核对原输入与原回执');
      return original && structuredClone(original.result);
    };
    const original = await this.store.requestContext(replay); if (original) return original;
    let source: TextbookTeachingSourceSnapshot | undefined;
    if (input.action === 'save') source = await this.sourcePreview(request, { bookId: input.source.bookId, bookVersion: input.source.bookVersion, lessonId: input.source.lessonId,
      pageStart: input.source.pageStart, pageEnd: input.source.pageEnd }, signal);
    if (input.action === 'publish') {
      const saved = await this.store.requestContext(() => this.get(request, input.packageId, String(input.contentVersion)));
      source = await this.sourcePreview(request, { bookId: saved.source.bookId, bookVersion: saved.source.bookVersion, lessonId: saved.source.lessonId,
        pageStart: saved.source.pageStart, pageEnd: saved.source.pageEnd }, signal);
    }
    return this.store.transaction(() => {
      const authorization = this.author(request), prior = replay(); if (prior) return prior;
      if (signal?.aborted) throw new BadRequestException('请求已结束；请先核对原请求结果，再决定下一步');
      if (source) this.assertCurrentSource(source);
      const previous = this.store.find('textbookTeachingPackages', { id: input.packageId });
      if (previous && previous.actorId !== request.user.id) throw new NotFoundException('教学包不存在或不属于当前教研账号');
      let saved: TextbookTeachingVersionRecord | undefined, current: ReturnType<typeof prepareTextbookTeachingPackage> | undefined;
      if (input.action === 'save') current = prepareTextbookTeachingPackage(this.store, input, source!);
      else {
        saved = this.store.find('textbookTeachingVersions', { id: teachingVersionId(input.packageId, input.contentVersion), actorId: request.user.id });
        if (!saved) throw new ConflictException('准确教学稿版本已改变，请保留完整原输入');
        if (input.action === 'publish') {
          const original = this.store.find('textbookTeachingCommands', { id: saved.commandId, actorId: request.user.id });
          if (!original || original.input.action !== 'save') throw new ConflictException('原保存命令无法核对');
          current = prepareTextbookTeachingPackage(this.store, original.input, source!);
        }
      }
      let prepared: ReturnType<typeof prepareTeachingChange>;
      const base = input.action === 'save' && input.basedOn ? this.store.find('textbookTeachingVersions', { id: teachingVersionId(input.packageId, input.basedOn.contentVersion), actorId: request.user.id }) : undefined;
      try { prepared = prepareTeachingChange({ actorId: request.user.id, authorization, input, at: new Date().toISOString(), previous: previous ?? null,
        saved, base, prepared: input.action === 'save' ? current : undefined, current }); }
      catch (error) {
        if (error instanceof Error && /^textbook_teaching_/.test(error.message)) throw new ConflictException('教学稿、来源材料、原发布状态或修订号已改变，请保留完整原稿并重新核对');
        throw error;
      }
      if (prepared.source && !this.store.find('textbookTeachingSources', { id: prepared.source.id })) this.store.append('textbookTeachingSources', prepared.source);
      if (prepared.saved) this.store.append('textbookTeachingVersions', prepared.saved);
      if (previous) Object.assign(previous, prepared.header); else this.store.append('textbookTeachingPackages', prepared.header);
      this.store.append('textbookTeachingCommands', prepared.command);
      return structuredClone(prepared.command.result);
    });
  }
}
