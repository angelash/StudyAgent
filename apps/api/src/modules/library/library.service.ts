import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { validate } from '../../common/validation';
import { LibraryRepository } from './library.repository';
import { cleanPaperHtml } from './library-html';
import { PaperRow } from './library.types';

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
    const publication = this.store.paperPublications.find((item) => item.paperId === id);
    if (!privileged(user) && publication?.status !== 'published') throw new ForbiddenException('此试卷尚未通过发布审核');
    const row = this.repo.paper(id);
    if (!row) throw new NotFoundException('试卷不存在');
    return row;
  }
  private metadata(row: PaperRow, user: InMemoryUserAccount) {
    const publication = this.store.paperPublications.find((item) => item.paperId === row.id);
    return { id: row.id, title: row.title, grade: row.grade, subject: row.subject, province: row.province,
      paperType: row.paper_type, year: row.year, state: row.content_state, expected: row.expected,
      available: row.available, missing: row.missing, hasPdf: Boolean(row.pdf_url),
      flags: JSON.parse(row.metadata_flags || '[]') as string[],
      publicationStatus: publication?.status ?? 'unreviewed',
      bookmarked: this.store.libraryBookmarks.some((item) => item.userId === user.id && item.paperId === row.id) };
  }
  overview(user: InMemoryUserAccount) {
    return { ready: this.repo.available, researchAccess: privileged(user),
      research: this.repo.available && privileged(user) ? this.repo.stats() : null,
      published: this.store.paperPublications.filter((item) => item.status === 'published').length,
      bookmarks: this.store.libraryBookmarks.filter((item) => item.userId === user.id).length,
      notice: '原始题卷先经过来源、内容和媒体审核。整卷练习与知识点评测的题目审核分别进行。' };
  }
  facets() { return this.repo.facets(); }
  search(user: InMemoryUserAccount, input: unknown) {
    const query = validate(searchLibrarySchema, input);
    if (query.collection === 'research') this.assertResearch(user);
    const visible = query.collection === 'research' ? undefined : this.store.paperPublications.filter((item) => item.status === 'published' &&
      (query.collection !== 'bookmarks' || this.store.libraryBookmarks.some((bookmark) => bookmark.userId === user.id && bookmark.paperId === item.paperId)))
      .map((item) => item.paperId);
    const result = this.repo.search(query, visible);
    return { ...result, items: result.items.map((item) => this.metadata(item, user)) };
  }
  private originalItems(row: PaperRow) {
    const original = this.repo.detail(row.id).questions ?? [];
    const byId = new Map(original.map((item) => [String(item.uuid), item]));
    return this.repo.items(row.id).map((item) => ({ position: item.position,
      question: item.available ? byId.get(item.question_key.replace(/^paper:/, '')) ?? this.repo.question(item.question_key) : null }));
  }
  private collectMedia(row: PaperRow) {
    const urls = new Set<string>();
    const collect = (html: unknown) => cleanPaperHtml(typeof html === 'string' ? html : '', (url) => { urls.add(url); return null; });
    for (const item of this.originalItems(row)) if (item.question) {
      collect(item.question.title); collect(item.question.answer); collect(item.question.details);
      for (const option of Array.isArray(item.question.options) ? item.question.options : []) collect(typeof option === 'string' ? option : (option as Record<string, unknown>)?.title);
    }
    if (row.pdf_url) urls.add(row.pdf_url);
    return urls;
  }
  preview(user: InMemoryUserAccount, id: string, answers: boolean) {
    const row = this.requirePaper(user, id), missingMedia = new Set<string>();
    const media = (url: string) => {
      if (!this.repo.media(url)) { missingMedia.add(url); return null; }
      return `/api/library/media?paperId=${encodeURIComponent(id)}&url=${encodeURIComponent(url)}`;
    };
    const html = (value: unknown) => cleanPaperHtml(typeof value === 'string' ? value : '', media);
    const questions = this.originalItems(row).map(({ position, question }) => question ? {
      position, id: String(question.uuid ?? position), missing: false, type: String(question.type ?? ''),
      html: html(question.title), options: (Array.isArray(question.options) ? question.options : []).map((option) =>
        html(typeof option === 'string' ? option : (option as Record<string, unknown>)?.title)),
      ...(answers ? { answerHtml: html(question.answer), analysisHtml: html(question.details) } : {}),
    } : { position, id: `missing-${position}`, missing: true, html: '', options: [] });
    const pdf = row.pdf_url ? media(row.pdf_url) : null;
    return { ...this.metadata(row, user), questions, pdf, missingMedia: missingMedia.size,
      publication: privileged(user) ? this.store.paperPublications.find((item) => item.paperId === id) ?? null : null,
      source: '本地保存的试卷宝原始资料',
      notice: row.content_state === 'partial' ? `原始资料缺少 ${row.missing ?? '部分'} 道题，已保留缺题位置。` :
        row.content_state === 'pdf' ? '此卷以原始 PDF 保存。尚未完成逐题结构化。' : '结构已恢复；练习结果不自动计入知识点能力评测。' };
  }
  media(user: InMemoryUserAccount, id: string, url: string) {
    const row = this.requirePaper(user, id);
    if (!this.collectMedia(row).has(url)) throw new ForbiddenException('资源不属于当前试卷');
    const local = this.repo.media(url);
    if (!local) throw new NotFoundException('此媒体尚未完成迁入校验');
    return local;
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
    let publication = this.store.paperPublications.find((item) => item.paperId === id);
    if (!publication) { publication = { id: `paper-publication:${id}`, paperId: id, status: command.status,
      licenseEvidence: command.licenseEvidence, mediaReviewed: true, contentReviewed: true,
      reviewerId: user.id, reviewedAt: new Date().toISOString(), version: 0, history: [] }; this.store.paperPublications.push(publication); }
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
    if (bookmarked) this.store.libraryBookmarks.push({ id: key, userId: user.id, paperId: id, createdAt: new Date().toISOString() });
    return { bookmarked };
  }
}
