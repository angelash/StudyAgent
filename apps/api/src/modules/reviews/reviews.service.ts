import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { EvidenceFeedback, EvidenceKind, QuestionAnswerSchema, QuestionRenderPayload, evidenceFeedbackInputSchema, evidenceKindSchema } from '@study-agent/contracts';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { validate } from '../../common/validation';
import { StudentsService } from '../students/students.service';
import { DiagnosticsService } from '../diagnostics/diagnostics.service';
import { LearningService } from '../learning/learning.service';
import { frozenRubric } from '../diagnostics/scoring-review';

@Injectable()
export class ReviewsService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly diagnostics: DiagnosticsService, private readonly learning: LearningService, private readonly events: DomainEventBusService) {}

  private assertReviewer(user: InMemoryUserAccount) {
    if (!['teacher', 'admin'].includes(user.role)) throw new ForbiddenException('需要评分复核身份');
  }

  private evidence(kind: EvidenceKind, responseId: string) {
    if (kind === 'diagnostic') {
      const response = this.store.diagnosticResponses.find((item) => item.id === responseId);
      const session = response && this.store.diagnosticSessions.find((item) => item.id === response.sessionId);
      const snapshot = session?.questionSnapshots.find((item) => item.id === response?.questionId);
      if (!response || !session || !snapshot) throw new NotFoundException('作答证据不存在');
      return { response, session, snapshot, studentId: session.studentId, atomId: response.atomId,
        revisions: this.store.scoringRevisions.filter((item) => item.responseId === responseId) };
    }
    const response = this.store.practiceAttempts.find((item) => item.id === responseId);
    const session = response && this.store.practiceSessions.find((item) => item.id === response.sessionId);
    const snapshot = session?.snapshots.find((item) => item.id === response?.questionId);
    if (!response || !session || !snapshot) throw new NotFoundException('训练证据不存在');
    return { response, session, snapshot, studentId: session.studentId, atomId: session.atomId,
      revisions: this.store.practiceScoringRevisions.filter((item) => item.responseId === responseId) };
  }

  queue(user: InMemoryUserAccount, input: unknown) {
    this.assertReviewer(user);
    const query = validate(z.object({ subject: z.enum(['math', 'chinese', 'english']).optional(),
      state: z.enum(['pending', 'reviewed', 'all']).default('pending'), kind: evidenceKindSchema.optional(),
      page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }).strict(), input);
    const rows: Array<{ kind: EvidenceKind; responseId: string; studentId: string; nickname: string; subject: string; atomName: string;
      stem: string; status: string; submittedAt: string; reviewVersion: number; feedbackCount: number }> = [];
    for (const kind of ['diagnostic', 'practice'] as const) {
      if (query.kind && query.kind !== kind) continue;
      const responses = kind === 'diagnostic' ? this.store.diagnosticResponses : this.store.practiceAttempts;
      for (const response of responses) {
        if (response.disposition !== 'answered') continue;
        const e = this.evidence(kind, response.id);
        if (!this.students.canReviewStudent(user, e.studentId) || (kind === 'diagnostic' && e.session.status !== 'completed') ||
          (query.subject && e.session.subject !== query.subject)) continue;
        const version = Math.max(0, ...e.revisions.map((item) => item.version));
        const pending = response.status === 'pending_review' && !version;
        if (query.state === 'pending' && !pending || query.state === 'reviewed' && !version) continue;
        rows.push({ kind, responseId: response.id, studentId: e.studentId,
          nickname: this.store.students.find((item) => item.id === e.studentId)?.nickname ?? '孩子', subject: e.session.subject,
          atomName: this.store.knowledgeAtoms.find((item) => item.id === e.atomId)?.name ?? e.atomId, stem: e.snapshot.stem.slice(0, 240),
          status: pending ? 'pending_review' : 'scored', submittedAt: response.submittedAt, reviewVersion: version,
          feedbackCount: this.store.evidenceFeedback.filter((item) => item.kind === kind && item.responseId === response.id && ['open', 'investigating'].includes(item.status)).length });
      }
    }
    rows.sort((a, b) => b.feedbackCount - a.feedbackCount || a.submittedAt.localeCompare(b.submittedAt));
    return { total: rows.length, page: query.page, pageSize: query.pageSize, rows: rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize) };
  }

  detail(user: InMemoryUserAccount, kind: EvidenceKind, responseId: string) {
    const e = this.evidence(kind, responseId);
    this.students.assertCanReviewStudent(user, e.studentId);
    if (kind === 'diagnostic' && e.session.status !== 'completed') throw new ConflictException('评测完成后才能进入复核');
    const payload = structuredClone(e.snapshot.renderPayload) as QuestionRenderPayload;
    payload.source.sourcePathOrUrl = ''; payload.source.notes = null; payload.source.importJobId = null;
    let rubric: ReturnType<typeof frozenRubric> = null, rubricIssue: string | null = null;
    try { rubric = frozenRubric(e.snapshot.answerSchema as QuestionAnswerSchema); }
    catch (error) { if (!(error instanceof BadRequestException)) throw error; rubricIssue = error.message; }
    return { kind, responseId, student: { id: e.studentId, nickname: this.store.students.find((item) => item.id === e.studentId)?.nickname ?? '孩子' },
      subject: e.session.subject, atomName: this.store.knowledgeAtoms.find((item) => item.id === e.atomId)?.name ?? e.atomId,
      payload, referenceAnswer: e.snapshot.answer, analysis: e.snapshot.analysis, response: e.response,
      rubric, rubricIssue, canScore: e.response.disposition === 'answered' && !rubricIssue,
      reviewVersion: Math.max(0, ...e.revisions.map((item) => item.version)),
      revisions: e.revisions.map(({ requestHash: _hash, ...item }) => item),
      feedback: this.store.evidenceFeedback.filter((item) => item.kind === kind && item.responseId === responseId) };
  }

  review(user: InMemoryUserAccount, kind: EvidenceKind, responseId: string, input: unknown) {
    return kind === 'diagnostic' ? this.diagnostics.reviewScore(user, responseId, input) : this.learning.reviewScore(user, responseId, input);
  }

  feedback(user: InMemoryUserAccount, input: unknown) {
    const command = validate(evidenceFeedbackInputSchema, input);
    const e = this.evidence(command.kind, command.responseId);
    this.students.assertCanAccessStudent(user, e.studentId);
    const existing = this.store.evidenceFeedback.find((item) => item.createdBy === user.id && item.requestKey === command.requestKey);
    if (existing) {
      if (existing.kind !== command.kind || existing.responseId !== command.responseId || existing.message !== command.message || existing.category !== command.category)
        throw new ConflictException('请求标识已用于另一份反馈');
      return existing;
    }
    const at = new Date().toISOString();
    const feedback: EvidenceFeedback = { id: this.store.nextId('evidence_feedback'), ...command, studentId: e.studentId, subject: e.session.subject,
      createdBy: user.id, status: 'open', version: 1, createdAt: at, updatedAt: at,
      history: [{ status: 'open', note: command.message, actorId: user.id, at, version: 1 }] };
    this.store.evidenceFeedback.push(feedback);
    this.events.publish('evidence.feedback_opened', { feedbackId: feedback.id, studentId: e.studentId, actorId: user.id });
    return feedback;
  }

  listFeedback(user: InMemoryUserAccount, input: unknown, reviewer = false) {
    const query = validate(z.object({ kind: evidenceKindSchema.optional(), responseId: z.string().max(500).optional(),
      studentId: z.string().max(180).optional(), status: z.enum(['open', 'investigating', 'resolved', 'dismissed']).optional(),
      page: z.coerce.number().int().min(1).max(100000).default(1) }).strict(), input);
    if (reviewer) this.assertReviewer(user);
    if (query.studentId && !reviewer) this.students.assertCanAccessStudent(user, query.studentId);
    const rows = this.store.evidenceFeedback.filter((item) =>
      (reviewer ? this.students.canReviewStudent(user, item.studentId) : user.role === 'admin' || this.store.bindings.some((b) => b.parentUserId === user.id && b.studentId === item.studentId && b.status === 'active')) &&
      (!query.kind || query.kind === item.kind) && (!query.responseId || query.responseId === item.responseId) &&
      (!query.studentId || query.studentId === item.studentId) && (!query.status || query.status === item.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { total: rows.length, page: query.page, rows: rows.slice((query.page - 1) * 25, query.page * 25) };
  }

  resolveFeedback(user: InMemoryUserAccount, id: string, input: unknown) {
    const feedback = this.store.evidenceFeedback.find((item) => item.id === id);
    if (!feedback) throw new NotFoundException('反馈不存在');
    this.students.assertCanReviewStudent(user, feedback.studentId);
    const command = validate(z.object({ expectedVersion: z.number().int().positive(),
      status: z.enum(['investigating', 'resolved', 'dismissed']), note: z.string().trim().min(5).max(3000) }).strict(), input);
    if (command.expectedVersion !== feedback.version) throw new ConflictException('反馈已更新，请重新打开核对');
    if (['resolved', 'dismissed'].includes(feedback.status)) throw new BadRequestException('反馈已处理，新的情况请另行反馈');
    feedback.status = command.status; feedback.version++; feedback.updatedAt = new Date().toISOString();
    feedback.history.push({ status: command.status, note: command.note, actorId: user.id, at: feedback.updatedAt, version: feedback.version });
    this.events.publish('evidence.feedback_updated', { feedbackId: id, status: feedback.status, actorId: user.id });
    return feedback;
  }
}
