import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PaperPracticePreview, PaperPracticeSessionView, PaperPracticeItemSummary, PaperPracticeItemView, PaperPracticeAvailability, PaperPracticeCommandResult } from '@study-agent/contracts';
import { paperPracticeSelectionSchema as selectionSchema, paperPracticeCreationSchema as creationSchema, paperPracticeCommandSchema as commandSchema } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { StudentsService } from '../students/students.service';
import { LibraryRepository } from './library.repository';
import { LibraryService } from './library.service';
import { cleanPaperHtml } from './library-html';
import type { PaperPracticeSessionRecord, PaperPracticeItemRecord, PaperPracticeSource } from './paper-practice-record';

const id = z.string().trim().min(1).max(180), key = z.string().trim().min(8).max(180);
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const privileged = (user: InMemoryUserAccount) => ['admin', 'teacher', 'operator'].includes(user.role);
const hasAnswer = (html: string) => Boolean(html.replace(/<[^>]*>/g, '').trim() || /<(?:img|math)\b/i.test(html));

@Injectable()
export class PaperPracticeService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly repo: LibraryRepository, private readonly library: LibraryService, private readonly events: DomainEventBusService) {}

  private student(user: InMemoryUserAccount, studentId: string | null) {
    if (user.role === 'student' && !studentId) throw new ForbiddenException('请选择当前学习账号的孩子档案');
    if (!studentId) return;
    if (!this.store.find('students', { id: studentId })) throw new NotFoundException('孩子档案不存在');
    if (user.role === 'teacher') this.students.assertCanReviewStudent(user, studentId); else this.students.assertCanAccessStudent(user, studentId);
  }
  private require(user: InMemoryUserAccount, sessionId: string, editing = false) {
    const row = this.store.find('paperPracticeSessions', { id: sessionId });
    if (!row) throw new NotFoundException('题卷练习不存在');
    this.student(user, row.studentId);
    if (row.ownerUserId !== user.id && (editing || !row.studentId || user.role === 'student' || !this.store.find('users', { id: row.ownerUserId, role: 'student' })))
      throw new ForbiddenException('不能读取或修改其他账号的练习草稿');
    return row;
  }
  private sourceAvailability(user: InMemoryUserAccount, source: PaperPracticeSource): PaperPracticeAvailability {
    try {
      const current = this.library.practiceSource(user, source.paperId);
      if (current.detail_sha256 !== source.detailSha256) return { available: false, reason: '原卷版本已变化，保留自己的作答，请重新选卷。' };
      const publication = this.store.find('paperPublications', { paperId: source.paperId });
      if (!privileged(user) && (source.research || publication?.version !== source.publicationVersion))
        return { available: false, reason: '原发布版本已变化，请重新核对可用的试卷。' };
      return { available: true, reason: '' };
    } catch (error) {
      if (error instanceof ForbiddenException) return { available: false, reason: '这份原卷已撤回或当前账号没有来源资格，自己的作答仍保留。' };
      if (error instanceof NotFoundException) return { available: false, reason: '原卷当前不可用，自己的作答仍保留。' };
      return { available: false, reason: '原卷资料暂时无法核对，请稍后重新读取。' };
    }
  }
  private availability(item: PaperPracticeItemRecord, source: PaperPracticeAvailability): PaperPracticeAvailability {
    if (item.kind === 'missing') return { available: false, reason: '原始资料缺少此题，保留原题位。' };
    if (!source.available) return source;
    if (item.promptMedia.some(url => !this.repo.media(url))) return { available: false, reason: '本题所需原图或文档暂时未完成本地校验，请先恢复资料。' };
    return source;
  }
  private sourceStates(user: InMemoryUserAccount, row: PaperPracticeSessionRecord) {
    return new Map(row.sources.map(source => [source.paperId, this.sourceAvailability(user, source)]));
  }
  private summary(item: PaperPracticeItemRecord, row: PaperPracticeSessionRecord, state: PaperPracticeAvailability): PaperPracticeItemSummary {
    return { id: item.id, paperId: item.paperId, paperTitle: row.sources.find(source => source.paperId === item.paperId)!.title,
      position: item.position, kind: item.kind, availability: this.availability(item, state), disposition: item.firstAnswer?.disposition ?? null,
      revealed: item.revealed, selfReview: item.selfReview, correctionCount: item.corrections.length };
  }
  private view(user: InMemoryUserAccount, row: PaperPracticeSessionRecord): PaperPracticeSessionView {
    const states = this.sourceStates(user, row), items = row.items.map(item => this.summary(item, row, states.get(item.paperId)!));
    return { id: row.id, ownerUserId: row.ownerUserId, studentId: row.studentId, status: row.status, version: row.version,
      currentItemId: row.currentItemId, createdAt: row.createdAt, updatedAt: row.updatedAt, completedAt: row.completedAt,
      permissions: { edit: row.ownerUserId === user.id && row.status !== 'completed' }, independentMeasurement: false, items,
      counts: { total: items.length, submitted: items.filter(item => item.disposition !== null).length,
        unanswered: items.filter(item => item.kind !== 'missing' && !item.disposition).length, missing: items.filter(item => item.kind === 'missing').length,
        unavailable: items.filter(item => item.kind !== 'missing' && !item.availability.available).length,
        dontKnow: items.filter(item => item.disposition === 'dont_know').length, skipped: items.filter(item => item.disposition === 'skip').length,
        needsCorrection: items.filter(item => item.selfReview === 'needs_correction').length } };
  }
  private build(user: InMemoryUserAccount, command: z.infer<typeof selectionSchema>) {
    this.student(user, command.studentId);
    if (new Set(command.selection.map(item => item.paperId)).size !== command.selection.length) throw new BadRequestException('同一试卷请合并选择题位');
    const sources: PaperPracticeSource[] = [], items: PaperPracticeItemRecord[] = [];
    for (const selection of command.selection) {
      const paper = this.library.practiceSource(user, selection.paperId), publication = this.store.find('paperPublications', { paperId: paper.id });
      const source: PaperPracticeSource = { paperId: paper.id, title: paper.title, state: paper.content_state, detailSha256: paper.detail_sha256,
        publicationVersion: publication?.version ?? null, publicationStatus: publication?.status ?? 'unreviewed', research: publication?.status !== 'published' };
      sources.push(source);
      const slots = this.repo.items(paper.id), originals = new Map((this.repo.detail(paper.id).questions ?? []).map(row => [String(row.uuid), row]));
      if (selection.positions && (new Set(selection.positions).size !== selection.positions.length || selection.positions.some(position => !slots.some(slot => slot.position === position))))
        throw new BadRequestException('题位重复或不属于原卷，请重新选择');
      const selected = slots.filter(slot => !selection.positions || selection.positions.includes(slot.position));
      const append = (position: number, sourceQuestionId: string, kind: PaperPracticeItemRecord['kind'], html: string, options: string[], answerHtml: string, analysisHtml: string, promptMedia: string[], pdfUrl: string | null = null, referenceMedia: string[] = []) => {
        items.push({ id: 'paper_item_' + hash([paper.id, position]).slice(0, 40), paperId: paper.id, position, sourceQuestionId, kind,
          html, options, answerHtml, analysisHtml, hasAnswer: hasAnswer(answerHtml), promptMedia, referenceMedia, pdfUrl, draft: '', firstAnswer: null, revealed: false, selfReview: null, corrections: [] });
      };
      if (!slots.length && paper.pdf_url && !selection.positions) {
        append(0, 'original-pdf', 'document', '<p>整卷作答记录：请对照原始 PDF 记录你的回答和核对笔记。本卷尚未逐题结构化。</p>', [], '', '', [paper.pdf_url],
          '/api/library/media?paperId=' + encodeURIComponent(paper.id) + '&url=' + encodeURIComponent(paper.pdf_url));
      }
      for (const slot of selected) {
        const original = slot.available ? originals.get(slot.question_key.replace(/^paper:/, '')) ?? this.repo.question(slot.question_key) : null;
        if (!original) { append(slot.position, slot.question_key, 'missing', '', [], '', '', []); continue; }
        const promptMedia = new Set<string>(), referenceMedia = new Set<string>();
        const html = (value: unknown, prompt = false) => cleanPaperHtml(typeof value === 'string' ? value : '', url => {
          (prompt ? promptMedia : referenceMedia).add(url);
          return '/api/library/media?paperId=' + encodeURIComponent(paper.id) + '&url=' + encodeURIComponent(url);
        });
        append(slot.position, slot.question_key, 'question', html(original.title, true), (Array.isArray(original.options) ? original.options : []).map(option => html(typeof option === 'string' ? option : option?.title, true)),
          html(original.answer), html(original.details), [...promptMedia], null, [...referenceMedia]);
      }
    }
    if (!items.length || items.length > 500) throw new BadRequestException('请选1～500个原题位；不会自动截断原卷。');
    if (Buffer.byteLength(JSON.stringify({ sources, items })) > 8 * 1024 * 1024) throw new BadRequestException('所选题目超过本次8MiB作答预算，请减少选择；原资料完整保留。');
    const sourceHash = hash({ studentId: command.studentId, sources, items });
    return { sources, items, sourceHash };
  }
  preview(user: InMemoryUserAccount, input: unknown): PaperPracticePreview {
    const command = validate(selectionSchema, input), built = this.build(user, command);
    const available = built.items.filter(item => this.availability(item, this.sourceAvailability(user, built.sources.find(source => source.paperId === item.paperId)!)).available);
    return { sourceHash: built.sourceHash, studentId: command.studentId, paperCount: built.sources.length, total: built.items.length,
      answerable: available.length, missing: built.items.filter(item => item.kind === 'missing').length, documents: built.items.filter(item => item.kind === 'document').length,
      unavailable: built.items.filter(item => item.kind !== 'missing').length - available.length, withoutReference: built.items.filter(item => item.kind !== 'missing' && !item.hasAnswer).length,
      papers: built.sources.map(source => ({ id: source.paperId, title: source.title, state: source.state, publicationStatus: source.publicationStatus, selected: built.items.filter(item => item.paperId === source.paperId).length })) };
  }
  create(user: InMemoryUserAccount, input: unknown): PaperPracticeSessionView {
    const command = validate(creationSchema, input); this.student(user, command.studentId);
    const inputHash = hash(command), previous = this.store.find('paperPracticeSessions', { ownerUserId: user.id, requestKey: command.requestKey });
    if (previous) { if (previous.inputHash !== inputHash) throw new ConflictException('原开始请求已用于另一份选择'); return this.view(user, this.require(user, previous.id, true)); }
    const built = this.build(user, command);
    if (built.sourceHash !== command.sourceHash) throw new ConflictException('预览后原卷或发布版本已变化，请重新核对选择');
    if (!built.items.some(item => this.availability(item, this.sourceAvailability(user, built.sources.find(source => source.paperId === item.paperId)!)).available))
      throw new BadRequestException('所选范围没有当前可作答的原题或已核验PDF，请先恢复资料');
    const now = new Date().toISOString(), row: PaperPracticeSessionRecord = { id: 'paper_practice_' + hash([user.id, command.requestKey]).slice(0, 40),
      ownerUserId: user.id, studentId: command.studentId, requestKey: command.requestKey, inputHash, ...built,
      status: 'in_progress', version: 1, currentItemId: built.items[0].id, createdAt: now, updatedAt: now, completedAt: null };
    this.store.append('paperPracticeSessions', row); this.events.publish('paper_practice.started', { sessionId: row.id, studentId: row.studentId, actorId: user.id, sourceHash: row.sourceHash });
    return this.view(user, row);
  }
  creationResult(user: InMemoryUserAccount, requestKey: string) {
    validate(key, requestKey); const row = this.store.find('paperPracticeSessions', { ownerUserId: user.id, requestKey });
    return row ? { requestKey, inputHash: row.inputHash, session: this.view(user, this.require(user, row.id)) } : null;
  }
  list(user: InMemoryUserAccount, input: unknown) {
    const query = validate(z.object({ studentId: id.optional(), page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(30).default(20) }).strict(), input);
    if (query.studentId) this.student(user, query.studentId); else if (user.role === 'student') throw new ForbiddenException('请选择当前孩子');
    const rows = this.store.select('paperPracticeSessions', query.studentId ? { studentId: query.studentId } : { ownerUserId: user.id })
      .filter(row => row.ownerUserId === user.id || user.role !== 'student' && Boolean(this.store.find('users', { id: row.ownerUserId, role: 'student' })))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    return { total: rows.length, page: query.page, pageSize: query.pageSize, items: rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map(row => ({
      id: row.id, studentId: row.studentId, status: row.status, currentItemId: row.currentItemId, version: row.version,
      papers: row.sources.map(source => ({ id: source.paperId, title: source.title })), total: row.items.length, submitted: row.items.filter(item => item.firstAnswer).length, updatedAt: row.updatedAt })) };
  }
  get(user: InMemoryUserAccount, sessionId: string) { return this.view(user, this.require(user, sessionId)); }
  item(user: InMemoryUserAccount, sessionId: string, itemId: string): PaperPracticeItemView {
    const row = this.require(user, sessionId), item = row.items.find(item => item.id === itemId); if (!item) throw new NotFoundException('题位不属于这次练习');
    const availability = this.availability(item, this.sourceAvailability(user, row.sources.find(source => source.paperId === item.paperId)!));
    const missingMedia = item.referenceMedia.filter(url => !this.repo.media(url)).length;
    return { ...this.summary(item, row, availability), html: availability.available ? item.html : '', options: availability.available ? item.options : [], pdfUrl: availability.available ? item.pdfUrl : null,
      draft: item.draft, firstAnswer: item.firstAnswer, corrections: item.corrections,
      reference: availability.available && item.revealed && item.firstAnswer ? { answerHtml: item.answerHtml, analysisHtml: item.analysisHtml, hasAnswer: item.hasAnswer && !missingMedia, missingMedia } : null };
  }
  commandResult(user: InMemoryUserAccount, sessionId: string, requestKey: string): PaperPracticeCommandResult | null {
    const row = this.require(user, sessionId, true); validate(key, requestKey);
    const receipt = this.store.find('paperPracticeCommands', { sessionId, ownerUserId: user.id, requestKey });
    return receipt ? { requestKey, inputHash: receipt.inputHash, appliedVersion: receipt.appliedVersion, session: this.view(user, row) } : null;
  }
  command(user: InMemoryUserAccount, sessionId: string, input: unknown): PaperPracticeCommandResult {
    const command = validate(commandSchema, input), row = this.require(user, sessionId, true), inputHash = hash(command);
    const previous = this.store.find('paperPracticeCommands', { sessionId, ownerUserId: user.id, requestKey: command.requestKey });
    if (previous) { if (previous.inputHash !== inputHash) throw new ConflictException('原操作请求已用于另一份内容'); return { requestKey: command.requestKey, inputHash, appliedVersion: previous.appliedVersion, session: this.view(user, row) }; }
    if (row.version !== command.expectedVersion) throw new ConflictException('练习已在其他页面更新，本机输入请保留并核对最新版本');
    if (row.status === 'completed' && command.kind !== 'reveal') throw new ConflictException('这份练习已完成，首次回答与订正保留为只读记录');
    if (row.status === 'paused' && !['resume', 'navigate', 'complete'].includes(command.kind)) throw new ConflictException('请先继续这份练习');
    const item = 'itemId' in command ? row.items.find(item => item.id === command.itemId) : undefined;
    if ('itemId' in command && !item) throw new NotFoundException('题位不属于这次练习');
    if (item && command.kind !== 'navigate') {
      const availability = this.availability(item, this.sourceAvailability(user, row.sources.find(source => source.paperId === item.paperId)!));
      if (!availability.available) throw new ConflictException(availability.reason);
    }
    const now = new Date().toISOString();
    if (command.kind === 'draft') { if (item!.firstAnswer) throw new ConflictException('首次回答已经提交，请在订正里继续'); item!.draft = command.text; }
    if (command.kind === 'submit') {
      if (item!.firstAnswer) throw new ConflictException('首次回答已经提交，不能覆盖原记录');
      if (command.disposition === 'answered' && !command.text.trim()) throw new BadRequestException('先记录你的回答，或明确选择暂时不会/跳过');
      item!.firstAnswer = { disposition: command.disposition, text: command.text, submittedAt: now }; item!.draft = command.text;
    }
    if (command.kind === 'reveal') { if (!item!.firstAnswer) throw new ConflictException('先提交本题的首次回答，再核对参考答案'); item!.revealed = true; }
    if (command.kind === 'self_review') {
      if (!item!.firstAnswer || !item!.revealed) throw new ConflictException('先核对本题参考，再记录自己的判断');
      if (command.value === 'matches_reference' && (!item!.hasAnswer || item!.referenceMedia.some(url => !this.repo.media(url)))) throw new BadRequestException('原题答案缺失或所需图片不可用，请记录不能确定或需要订正'); item!.selfReview = command.value;
    }
    if (command.kind === 'correct') { if (!item!.firstAnswer) throw new ConflictException('先保留首次回答，再追加订正'); item!.corrections.push({ id: 'correction_' + hash([row.id, command.requestKey]).slice(0, 40), text: command.text, at: now }); }
    if (command.kind === 'navigate') row.currentItemId = item!.id;
    if (command.kind === 'pause') row.status = 'paused';
    if (command.kind === 'resume') row.status = 'in_progress';
    if (command.kind === 'complete') {
      if (row.items.some(item => item.kind !== 'missing' && !item.firstAnswer) && command.acknowledgeUnanswered !== true) throw new ConflictException('还有未答题位，请明确确认后结束并保留未答记录');
      row.status = 'completed'; row.completedAt = now;
    }
    row.version++; row.updatedAt = now;
    this.store.append('paperPracticeCommands', { id: 'paper_command_' + hash([row.id, user.id, command.requestKey]).slice(0, 40), sessionId: row.id,
      ownerUserId: user.id, studentId: row.studentId, requestKey: command.requestKey, inputHash, kind: command.kind, appliedVersion: row.version, at: now });
    this.events.publish('paper_practice.' + command.kind, { sessionId: row.id, studentId: row.studentId, actorId: user.id, version: row.version, ...item ? { itemId: item.id } : {} });
    return { requestKey: command.requestKey, inputHash, appliedVersion: row.version, session: this.view(user, row) };
  }
}
