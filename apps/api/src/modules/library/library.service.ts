import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { validate } from '../../common/validation';
import { LibraryRepository } from './library.repository';
import { cleanPaperHtml } from './library-html';
import { PaperRow } from './library.types';
import type { PaperLibraryActor } from './paper-library-authorization';
import { assertPaperPreviewAccess, assertPaperMediaAccess } from './paper-student-source-access';
import { openVerifiedLibraryMedia } from './verified-library-media';

export const searchLibrarySchema = z.object({ q: z.string().trim().max(100).optional(),
  grade: z.string().max(30).optional(), subject: z.string().max(30).optional(), province: z.string().max(30).optional(),
  state: z.enum(['complete', 'partial', 'pdf', 'unknown']).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(40).default(20),
  collection: z.enum(['research', 'published', 'bookmarks']).default('published'),
}).strict();
const publicationSchema = z.object({ status: z.enum(['published', 'withdrawn']), reason: z.string().trim().min(5).max(2000),
  licenseEvidence: z.string().trim().min(10).max(4000), contentReviewed: z.literal(true), mediaReviewed: z.literal(true),
}).strict();
const privileged = (user: InMemoryUserAccount) => ['admin', 'teacher', 'operator'].includes(user.role);

@Injectable()
export class LibraryService {
  constructor(private readonly repo: LibraryRepository, private readonly store: InMemoryStoreService, private readonly events: DomainEventBusService) {}
  assertResearch(user: InMemoryUserAccount) {
    if (!privileged(user)) throw new ForbiddenException('原始资料仅供教研审核，请在已发布练习库中选卷');
  }
  private requirePaper(user: InMemoryUserAccount, id: string) {
    const publication = this.store.find('paperPublications', { paperId: id });
    if (!privileged(user) && publication?.status !== 'published') throw new ForbiddenException('此试卷尚未通过发布审核');
    const row = this.repo.paper(id);
    if (!row) throw new NotFoundException('试卷不存在');
    return row;
  }
  /** Internal practice access uses the same current publication and role policy. */
  practiceSource(user: InMemoryUserAccount, id: string) { return this.requirePaper(user, id); }
  private metadata(row: PaperRow, user: InMemoryUserAccount) {
    const publication = this.store.find('paperPublications', { paperId: row.id });
    return { id: row.id, title: row.title, grade: row.grade, subject: row.subject, province: row.province,
      paperType: row.paper_type, year: row.year, state: row.content_state, expected: row.expected,
      available: row.available, missing: row.missing, hasPdf: Boolean(row.pdf_url),
      flags: JSON.parse(row.metadata_flags || '[]') as string[],
      publicationStatus: publication?.status ?? 'unreviewed',
      bookmarked: Boolean(this.store.find('libraryBookmarks', { userId: user.id, paperId: row.id })) };
  }
  overview(user: InMemoryUserAccount) {
    return { ready: this.repo.available, researchAccess: privileged(user),
      measurementAccess: ['admin', 'teacher'].includes(user.role),
      research: this.repo.available && privileged(user) ? this.repo.stats() : null,
      published: this.store.select('paperPublications', { status: 'published' }).length,
      bookmarks: this.store.select('libraryBookmarks', { userId: user.id }).length,
      notice: '原始题卷先经过来源、内容和媒体审核。整卷练习与知识点评测的题目审核分别进行。' };
  }
  facets() { return this.repo.facets(); }
  search(user: InMemoryUserAccount, input: unknown) {
    const query = validate(searchLibrarySchema, input);
    if (query.collection === 'research') this.assertResearch(user);
    const visible = query.collection === 'research' ? undefined : this.store.paperPublications.filter((item) => item.status === 'published' &&
      (query.collection !== 'bookmarks' || Boolean(this.store.find('libraryBookmarks', { userId: user.id, paperId: item.paperId }))))
      .map((item) => item.paperId);
    const result = this.repo.search(query, visible);
    return { ...result, items: result.items.map((item) => this.metadata(item, user)) };
  }
  private originalItems(row: PaperRow, exact = false) {
    const byId = exact ? this.repo.verifiedSelectionDetail(row.id, row.detail_sha256) : new Map((this.repo.detail(row.id).questions ?? []).map(item => [String(item.uuid), item]));
    return this.repo.items(row.id).map((item) => ({ position: item.position, sourceQuestionId: item.question_key,
      question: item.available ? (exact ? byId.get(item.question_key.replace(/^paper:/, '')) ?? null : byId.get(item.question_key.replace(/^paper:/, '')) ?? this.repo.question(item.question_key)) : null }));
  }
  private collectMedia(row: PaperRow, originals = this.originalItems(row)) {
    const urls = new Set<string>();
    const collect = (html: unknown) => cleanPaperHtml(typeof html === 'string' ? html : '', (url) => { urls.add(url); return null; });
    for (const item of originals) if (item.question) {
      collect(item.question.title); collect(item.question.answer); collect(item.question.details);
      for (const option of Array.isArray(item.question.options) ? item.question.options : []) collect(typeof option === 'string' ? option : (option as Record<string, unknown>)?.title);
    }
    if (row.pdf_url) urls.add(row.pdf_url);
    return urls;
  }
  preview(request: PaperLibraryActor, id: string, answers: boolean) {
    const user = request.user;
    const row = this.requirePaper(user, id), missingMedia = new Set<string>();
    assertPaperPreviewAccess(this.store, request, row, this.repo.items(id), answers);
    const media = (url: string) => {
      if (!this.repo.media(url)) { missingMedia.add(url); return null; }
      return `/api/library/media?paperId=${encodeURIComponent(id)}&url=${encodeURIComponent(url)}`;
    };
    const html = (value: unknown) => cleanPaperHtml(typeof value === 'string' ? value : '', media);
    const questions = this.originalItems(row, user.role === 'student').map(({ position, question }) => question ? {
      position, id: String(question.uuid ?? position), missing: false, type: String(question.type ?? ''),
      html: html(question.title), options: (Array.isArray(question.options) ? question.options : []).map((option) =>
        html(typeof option === 'string' ? option : (option as Record<string, unknown>)?.title)),
      ...(answers ? { answerHtml: html(question.answer), analysisHtml: html(question.details) } : {}),
    } : { position, id: `missing-${position}`, missing: true, html: '', options: [] });
    const pdf = row.pdf_url ? media(row.pdf_url) : null;
    return { ...this.metadata(row, user), questions, pdf, missingMedia: missingMedia.size,
      sourceIdentity: { detailSha256: row.detail_sha256, publicationVersion: this.store.find('paperPublications', { paperId: id })?.version ?? null },
      publication: privileged(user) ? this.store.find('paperPublications', { paperId: id }) ?? null : null,
      source: '本地保存的试卷宝原始资料',
      notice: row.content_state === 'partial' ? `原始资料缺少 ${row.missing ?? '部分'} 道题，已保留缺题位置。` :
        row.content_state === 'pdf' ? '此卷以原始 PDF 保存。尚未完成逐题结构化。' : '结构已恢复；练习结果不自动计入知识点能力评测。' };
  }
  private mediaGrant(request: PaperLibraryActor, id: string, url: string) {
    const row = this.requirePaper(request.user, id), originals = this.originalItems(row, request.user.role === 'student');
    if (!this.collectMedia(row, originals).has(url)) throw new ForbiddenException('资源不属于当前试卷');
    assertPaperMediaAccess(this.store, request, row, url, originals);
    const local = this.repo.media(url);
    if (!local) throw new NotFoundException('此媒体尚未完成迁入校验');
    return { local, source: JSON.stringify({ detailSha256: row.detail_sha256, publicationVersion: this.store.find('paperPublications', { paperId: id })?.version ?? null }) };
  }
  async media(request: PaperLibraryActor, id: string, url: string, signal?: AbortSignal) {
    const initial = this.mediaGrant(request, id, url), opened = await openVerifiedLibraryMedia(initial.local, signal);
    try {
      // Hashing is asynchronous: a fresh native snapshot must recheck actual
      // session/learning/source rights before any HTTP bytes are returned.
      const current = await this.store.requestContext(() => this.mediaGrant(request, id, url));
      if (signal?.aborted || current.source !== initial.source || JSON.stringify(current.local) !== JSON.stringify(initial.local))
        throw new ConflictException('原卷或资源版本已变化，请重新核对后读取。');
      return opened;
    } catch (error) { await opened.handle.close(); throw error; }
  }
  publish(user: InMemoryUserAccount, id: string, input: unknown) {
    this.assertResearch(user);
    const command = validate(publicationSchema, input), row = this.repo.paper(id);
    if (!row) throw new NotFoundException('试卷不存在');
    if (command.status === 'published') {
      const missing = [...this.collectMedia(row)].filter((url) => !this.repo.media(url));
      if (missing.length) throw new BadRequestException(`还有 ${missing.length} 项媒体未完成本地校验，暂不可发布`);
      if (!row.available && !row.pdf_url) throw new BadRequestException('缺少可用的题目或 PDF');
    }
    let publication = this.store.find('paperPublications', { paperId: id });
    if (!publication) { publication = { id: `paper-publication:${id}`, paperId: id, status: command.status,
      licenseEvidence: command.licenseEvidence, mediaReviewed: true, contentReviewed: true,
      reviewerId: user.id, reviewedAt: new Date().toISOString(), version: 0, history: [] }; this.store.append('paperPublications', publication); }
    Object.assign(publication, { status: command.status, licenseEvidence: command.licenseEvidence,
      reviewerId: user.id, reviewedAt: new Date().toISOString(), version: publication.version + 1 });
    publication.history.push({ at: publication.reviewedAt, actorId: user.id, status: command.status, reason: command.reason });
    this.events.publish('library.publication_changed', { paperId: id, actorId: user.id, status: command.status, version: publication.version });
    return publication;
  }
  bookmark(user: InMemoryUserAccount, id: string, input: unknown) {
    this.requirePaper(user, id);
    const { bookmarked } = validate(z.object({ bookmarked: z.boolean() }).strict(), input);
    const key = `bookmark:${user.id}:${id}`;
    this.store.libraryBookmarks = this.store.libraryBookmarks.filter((item) => item.id !== key);
    if (bookmarked) this.store.append('libraryBookmarks', { id: key, userId: user.id, paperId: id, createdAt: new Date().toISOString() });
    return { bookmarked };
  }
}
