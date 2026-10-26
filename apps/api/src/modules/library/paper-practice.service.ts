import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PaperPracticePreview, PaperPracticeSessionView, PaperPracticeItemSummary, PaperPracticeItemView, PaperPracticeAvailability, PaperPracticeCommandResult, PaperReviewList, PaperReviewScope, PaperReviewCalendarEvent, PaperReviewNextOptions } from '@study-agent/contracts';
import { paperPracticeSelectionSchema as selectionSchema, paperPracticeCreationSchema as creationSchema, paperPracticeCommandSchema as commandSchema, paperReviewVerificationSchema } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { StudentsService } from '../students/students.service';
import { LibraryRepository } from './library.repository';
import { LibraryService } from './library.service';
import { cleanPaperHtml } from './library-html';
import type { PaperPracticeSessionRecord, PaperPracticeItemRecord, PaperPracticeSource } from './paper-practice-record';
import { organizePaperItem, paperReviewOrganization } from './paper-review-organization';
import { matchesPaperReview, paperReviewCalendarQuerySchema, paperReviewQuerySchema, paperReviewSummary } from './paper-review-query';
import { renderIcs } from '../learning/ics-calendar';
import { paperReviewKnowledge } from './paper-review-eligibility';
import { CurriculumService } from '../diagnostics/curriculum.service';
import { DiagnosticsService } from '../diagnostics/diagnostics.service';

const id = z.string().trim().min(1).max(180), key = z.string().trim().min(8).max(180);
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const privileged = (user: InMemoryUserAccount) => ['admin', 'teacher', 'operator'].includes(user.role);
const hasAnswer = (html: string) => Boolean(html.replace(/<[^>]*>/g, '').trim() || /<(?:img|math)\b/i.test(html));

@Injectable()
export class PaperPracticeService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly repo: LibraryRepository, private readonly library: LibraryService, private readonly events: DomainEventBusService,
    private readonly curriculum: CurriculumService, private readonly diagnostics: DiagnosticsService) {}

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
    let originAvailable = false;
    if (row.origin) try { const original = this.require(user, row.origin.sessionId); originAvailable = original.items.some(item => item.id === row.origin!.itemId); } catch (error) { if (!(error instanceof ForbiddenException || error instanceof NotFoundException)) throw error; }
    return { id: row.id, ownerUserId: row.ownerUserId, studentId: row.studentId, status: row.status, version: row.version,
      currentItemId: row.currentItemId, createdAt: row.createdAt, updatedAt: row.updatedAt, completedAt: row.completedAt,
      permissions: { edit: row.ownerUserId === user.id && row.status !== 'completed', organize: row.ownerUserId === user.id }, independentMeasurement: false, items,
      ...(row.origin ? { origin: { ...row.origin, available: originAvailable } } : {}),
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
    if (command.origin) {
      const original = this.require(user, command.origin.sessionId), item = original.items.find(item => item.id === command.origin!.itemId);
      if (!item || item.kind === 'missing') throw new BadRequestException('原题位不存在或只有缺题占位，不能替换为另一道题。');
      if (original.studentId !== command.studentId) throw new BadRequestException('原题再练必须保留原来的孩子或本人学习范围。');
      const source = original.sources.find(source => source.paperId === item.paperId)!, availability = this.availability(item, this.sourceAvailability(user, source));
      if (!availability.available) throw new ConflictException(availability.reason);
      if (items.length !== 1 || items[0].paperId !== item.paperId || items[0].position !== item.position || items[0].sourceQuestionId !== item.sourceQuestionId || items[0].kind !== item.kind)
        throw new BadRequestException('原题再练只允许这一个原题位；PDF仍须保留整卷文档身份。');
    }
    const sourceHash = hash({ studentId: command.studentId, sources, items, ...(command.origin ? { origin: command.origin } : {}) });
    return { sources, items, sourceHash, ...(command.origin ? { origin: structuredClone(command.origin) } : {}) };
  }
  preview(user: InMemoryUserAccount, input: unknown): PaperPracticePreview {
    const command = validate(selectionSchema, input), built = this.build(user, command);
    const available = built.items.filter(item => this.availability(item, this.sourceAvailability(user, built.sources.find(source => source.paperId === item.paperId)!)).available);
    return { sourceHash: built.sourceHash, studentId: command.studentId, paperCount: built.sources.length, total: built.items.length,
      answerable: available.length, missing: built.items.filter(item => item.kind === 'missing').length, documents: built.items.filter(item => item.kind === 'document').length,
      unavailable: built.items.filter(item => item.kind !== 'missing').length - available.length, withoutReference: built.items.filter(item => item.kind !== 'missing' && !item.hasAnswer).length,
      papers: built.sources.map(source => ({ id: source.paperId, title: source.title, state: source.state, publicationStatus: source.publicationStatus, selected: built.items.filter(item => item.paperId === source.paperId).length })), ...(built.origin ? { origin: built.origin } : {}) };
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
  nextOptions(user: InMemoryUserAccount, sessionId: string, itemId: string): PaperReviewNextOptions {
    const row = this.require(user, sessionId), item = row.items.find(item => item.id === itemId);
    if (!item) throw new NotFoundException('原题位不属于这次练习。');
    const availability = this.availability(item, this.sourceAvailability(user, row.sources.find(source => source.paperId === item.paperId)!));
    const params = new URLSearchParams({ paper: item.paperId, originSession: row.id, originItem: item.id, ...(row.studentId ? { studentId: row.studentId } : {}), ...(item.kind === 'question' ? { positions: String(item.position) } : {}) });
    const activities: PaperReviewNextOptions['activities'] = [];
    for (const next of this.store.inspect('paperPracticeSessions')) {
      if (next.origin?.sessionId !== row.id || next.origin.itemId !== item.id) continue;
      try { this.require(user, next.id); } catch (error) { if (error instanceof ForbiddenException || error instanceof NotFoundException) continue; throw error; }
      activities.push({ id: next.id, kind: 'original_redo', at: next.createdAt, href: '/library/practice?session=' + encodeURIComponent(next.id), label: '原题再练 · ' + (next.ownerUserId === user.id ? '本人作答' : '孩子学习账号作答') });
    }
    for (const blueprint of this.store.inspect('diagnosticBlueprints')) {
      if (blueprint.paperReviewOrigin?.sessionId !== row.id || blueprint.paperReviewOrigin.itemId !== item.id) continue;
      if (blueprint.sessionId) {
        try { const session = this.diagnostics.requireSession(user, blueprint.sessionId); activities.push({ id: session.id, kind: 'verification', at: session.startedAt, href: '/student/assessment?' + new URLSearchParams({ studentId: session.studentId, subject: session.subject, session: session.id }), label: session.status === 'completed' ? '正式新题报告' : '正式新题作答' }); } catch (error) { if (!(error instanceof ForbiddenException || error instanceof NotFoundException)) throw error; }
      } else if (blueprint.actorId === user.id) activities.push({ id: blueprint.id, kind: 'verification_preview', at: blueprint.createdAt, href: '/student/assessment?' + new URLSearchParams({ studentId: blueprint.studentId, subject: blueprint.scopeSnapshot.subject, blueprint: blueprint.id }), label: '独立新题蓝图 · 尚未开始作答' });
    }
    return { redo: { available: availability.available, reason: availability.reason || '确认同一原题与作答身份后创建新练习，旧首答保持。', href: availability.available ? '/library/practice?' + params.toString() : null },
      knowledge: availability.available ? paperReviewKnowledge(this.store, this.repo, item) : { available: false, reason: '当前来源不可用，不能据此指定新的测量目标；本人反思仍保留。', atoms: [] },
      activities: activities.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id)) };
  }
  verificationPreview(user: InMemoryUserAccount, sessionId: string, itemId: string, input: unknown) {
    const body = validate(paperReviewVerificationSchema, input), row = this.require(user, sessionId);
    if (!row.items.some(item => item.id === itemId)) throw new NotFoundException('原题位不属于这次练习。');
    this.student(user, body.studentId); if (row.studentId && row.studentId !== body.studentId) throw new BadRequestException('请在原来的孩子范围内确认新题验证。');
    const inputHash = hash({ sessionId, itemId, studentId: body.studentId, atomId: body.atomId });
    const blueprintId = 'blueprint:' + createHash('sha256').update(JSON.stringify([user.id, body.requestKey])).digest('hex');
    const existing = this.store.find('diagnosticBlueprints', { id: blueprintId });
    if (existing) { if (existing.paperReviewOrigin?.inputHash !== inputHash) throw new ConflictException('原预览请求已用于其他学习范围或来源，请保留原结果核对。'); return this.diagnostics.getBlueprint(user, existing.id); }
    const options = this.nextOptions(user, sessionId, itemId), atom = options.knowledge.atoms.find(atom => atom.id === body.atomId);
    if (!atom) throw new BadRequestException(options.knowledge.reason);
    const scope = this.curriculum.getScope(user, body.studentId, atom.subject);
    if (!scope || !scope.learnedAtomIds.includes(atom.id) || scope.grade < atom.grade) throw new BadRequestException('请先确认这位孩子的当前年级、教材与已学范围，再预览这个知识点。');
    const preview = this.diagnostics.previewBlueprint(user, { studentId: body.studentId, subject: atom.subject, intent: 'verification', maxItems: 6, includePrerequisites: false, adaptive: false, targetAtomIds: [atom.id], requestKey: body.requestKey });
    const reservation = this.store.find('diagnosticBlueprints', { id: preview.id })!;
    reservation.paperReviewOrigin = { sessionId, itemId, atomId: atom.id, createdAt: new Date().toISOString(), inputHash };
    return this.diagnostics.getBlueprint(user, reservation.id);
  }
  verificationRequest(user: InMemoryUserAccount, sessionId: string, itemId: string, requestKey: string) {
    validate(key, requestKey); const row = this.require(user, sessionId);
    if (!row.items.some(item => item.id === itemId)) throw new NotFoundException('原题位不属于这次练习。');
    const id = 'blueprint:' + createHash('sha256').update(JSON.stringify([user.id, requestKey])).digest('hex'), existing = this.store.find('diagnosticBlueprints', { id });
    if (!existing) return null;
    if (existing.paperReviewOrigin?.sessionId !== sessionId || existing.paperReviewOrigin.itemId !== itemId) throw new ConflictException('原请求属于另一份来源或蓝图，请保留保护文件核对。');
    return this.diagnostics.getBlueprint(user, id);
  }
  private reviewRows(user: InMemoryUserAccount, scope: PaperReviewScope, studentId?: string) {
    this.student(user, studentId ?? null);
    if (scope === 'learner' && !studentId) throw new BadRequestException('请选择需要查看的孩子学习账号记录。');
    return this.store.select('paperPracticeSessions', { ...(studentId ? { studentId } : {}), ...(scope === 'mine' ? { ownerUserId: user.id } : {}) })
      .filter(row => scope === 'mine' || Boolean(this.store.find('users', { id: row.ownerUserId, role: 'student' })) && (user.role !== 'student' || row.ownerUserId === user.id));
  }
  reviews(user: InMemoryUserAccount, input: unknown): PaperReviewList {
    const query = validate(paperReviewQuerySchema, input), rows = this.reviewRows(user, query.scope, query.studentId);
    const pairs = rows.flatMap(row => row.items.filter(item => {
      const organization = paperReviewSummary(item.organization);
      return matchesPaperReview(item, query.filter) && (!query.paperId || item.paperId === query.paperId) && (!query.tag || organization.tags.includes(query.tag)) &&
        (!query.from || !!organization.plannedDate && organization.plannedDate >= query.from) && (!query.to || !!organization.plannedDate && organization.plannedDate <= query.to) &&
        (!query.q || [row.sources.find(source => source.paperId === item.paperId)?.title ?? '', organization.errorSteps, organization.reflection, ...organization.tags].join('\n').toLocaleLowerCase().includes(query.q.toLocaleLowerCase()));
    }).map(item => ({ row, item }))).sort((a, b) => b.row.updatedAt.localeCompare(a.row.updatedAt) || a.row.id.localeCompare(b.row.id) || a.item.position - b.item.position);
    return { total: pairs.length, page: query.page, pageSize: query.pageSize, items: pairs.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map(({ row, item }) => ({
      ...this.summary(item, row, this.sourceAvailability(user, row.sources.find(source => source.paperId === item.paperId)!)),
      sessionId: row.id, sessionVersion: row.version, ownerUserId: row.ownerUserId, studentId: row.studentId,
      actor: this.store.find('users', { id: row.ownerUserId, role: 'student' }) ? 'learner' : 'self', editable: row.ownerUserId === user.id,
      organization: paperReviewSummary(item.organization), updatedAt: row.updatedAt,
    })) };
  }
  reviewCalendar(user: InMemoryUserAccount, input: unknown): { events: PaperReviewCalendarEvent[] } {
    const query = validate(paperReviewCalendarQuerySchema, input), rows = this.reviewRows(user, query.scope, query.studentId);
    return { events: rows.flatMap(row => row.items.filter(item => !item.organization?.archived && !!item.organization?.plannedDate && item.organization.plannedDate >= query.from && item.organization.plannedDate <= query.to)
      .map(item => ({ id: row.id + ':' + item.id, sessionId: row.id, itemId: item.id, ownerUserId: row.ownerUserId, studentId: row.studentId, editable: row.ownerUserId === user.id,
        title: (row.sources.find(source => source.paperId === item.paperId)?.title ?? '原卷') + (item.kind === 'document' ? ' · 整卷回看' : ' · 第' + item.position + '题'),
        date: item.organization!.plannedDate!, status: item.organization!.status,
        href: '/library/practice/review?' + new URLSearchParams({ session: row.id, item: item.id, scope: query.scope, ...(query.studentId ? { studentId: query.studentId } : {}) }).toString(),
      }))).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) };
  }
  exportReviewCalendar(user: InMemoryUserAccount, input: unknown) {
    const { events } = this.reviewCalendar(user, input);
    return { filename: 'studyagent-paper-review.ics', content: renderIcs('原卷复习', events.map(event => ({ uid: 'paper-review:' + event.id,
      title: event.title, description: (event.status === 'reviewed' ? '已实际回看；' : '计划回看；') + '不代表独立知识掌握证据。' + event.href,
      startsAt: event.date + 'T00:00:00Z', endsAt: new Date(Date.parse(event.date + 'T00:00:00Z') + 86400000).toISOString(), allDay: true }))) };
  }
  item(user: InMemoryUserAccount, sessionId: string, itemId: string): PaperPracticeItemView {
    const row = this.require(user, sessionId), item = row.items.find(item => item.id === itemId); if (!item) throw new NotFoundException('题位不属于这次练习');
    const availability = this.availability(item, this.sourceAvailability(user, row.sources.find(source => source.paperId === item.paperId)!));
    const missingMedia = item.referenceMedia.filter(url => !this.repo.media(url)).length;
    return { ...this.summary(item, row, availability), html: availability.available ? item.html : '', options: availability.available ? item.options : [], pdfUrl: availability.available ? item.pdfUrl : null,
      draft: item.draft, firstAnswer: item.firstAnswer, corrections: item.corrections, organization: paperReviewOrganization(item.organization),
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
    const organizing = ['organize', 'review_complete', 'review_reopen'].includes(command.kind);
    if (row.status === 'completed' && command.kind !== 'reveal' && !organizing) throw new ConflictException('这份练习已完成，首次回答与订正保留为只读记录');
    if (row.status === 'paused' && !['resume', 'navigate', 'complete'].includes(command.kind) && !organizing) throw new ConflictException('请先继续这份练习');
    const item = 'itemId' in command ? row.items.find(item => item.id === command.itemId) : undefined;
    if ('itemId' in command && !item) throw new NotFoundException('题位不属于这次练习');
    if (item && command.kind !== 'navigate' && !organizing) {
      const availability = this.availability(item, this.sourceAvailability(user, row.sources.find(source => source.paperId === item.paperId)!));
      if (!availability.available) throw new ConflictException(availability.reason);
    }
    const now = new Date().toISOString();
    if (command.kind === 'organize' || command.kind === 'review_complete' || command.kind === 'review_reopen') {
      if (command.kind === 'review_complete' && (!item!.firstAnswer || item!.kind === 'missing')) throw new ConflictException('这道题尚未保留首次回答，不能标记为已回看。');
      const next = organizePaperItem(item!.organization, command.kind, command.kind === 'organize' ? command.values : undefined, user.id, row.id + ':' + command.requestKey, now);
      const total = row.items.reduce((bytes, other) => bytes + Buffer.byteLength(JSON.stringify(other.id === item!.id ? next : other.organization ?? null)), 0);
      if (total > 16 * 1024 * 1024) throw new BadRequestException('这份练习整理历史超过16MiB预算，请先下载完整历史；本次修改尚未保存。');
      item!.organization = next;
    }
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
