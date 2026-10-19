import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PracticeAttempt, PracticeSession, QuestionAnswerSchema, QuestionRenderPayload, Subject } from '@study-agent/contracts';
import { answerProtocolIssue } from '@study-agent/contracts';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { validate } from '../../common/validation';
import { StudentsService } from '../students/students.service';
import { DiagnosticsService } from '../diagnostics/diagnostics.service';
import { GuidanceService } from '../diagnostics/guidance.service';
import { gradeResponse } from '../diagnostics/scoring';
import { QuestionWorkspaceService } from '../question-workspace/question-workspace.service';
import { prepareScoringReview } from '../diagnostics/scoring-review';
import { eligibleMeasurements } from '../diagnostics/curriculum.service';
import { StudentMediaService } from '../student-media/student-media.service';
import { mediaModeAvailable } from '../student-media/media-normalization';
import { atomDefinitionFingerprint } from '../diagnostics/measurement-definition';

export function studyDay(at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: process.env.STUDY_TIMEZONE ?? 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}
const answerSchema = z.object({ questionId: z.string().min(1).max(180), requestKey: z.string().min(1).max(180),
  answer: z.unknown().optional(), disposition: z.enum(['answered', 'skip']).default('answered'), elapsedMs: z.number().int().min(0).max(3600000) }).strict();

@Injectable()
export class LearningService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly diagnostics: DiagnosticsService, private readonly guidance: GuidanceService,
    private readonly workspace: QuestionWorkspaceService, private readonly events: DomainEventBusService, private readonly media: StudentMediaService) {}

  studentProfiles(user: InMemoryUserAccount) {
    return this.store.students.filter((child) => user.role === 'admin' || (user.role === 'student' && child.userId === user.id) || Boolean(this.store.find('bindings', { parentUserId: user.id, studentId: child.id, status: 'active' })))
      .map(({ id, nickname, grade }) => ({ id, nickname, grade }));
  }

  today(user: InMemoryUserAccount, studentId: string, subject: Subject) {
    this.students.assertCanAccessStudent(user, studentId);
    const day = studyDay();
    const plans = this.guidance.list(user, studentId, subject), plan = plans.find((item) => item.status === 'active');
    const definitions = plan ? this.store.find('diagnosticSessions', { id: plan.baselineSessionId })?.atomSnapshots : undefined;
    const reviews = this.guidance.reviews(user, studentId, subject);
    return { studentId, subject, day, plan: plan ?? null, awaitingConfirmation: plans.find((item) => item.status === 'proposed') ?? null,
      activities: (plan?.actions ?? []).map((action) => {
        const session = this.store.practiceSessions.find((item) => item.planId === plan?.id && item.actionId === action.id && item.day === day);
        return { ...action, atomName: definitions?.find(atom => atom.id === action.atomId)?.name ?? action.atomId,
          status: session?.status ?? 'pending', sessionId: session?.id ?? null };
      }), reviews, incompleteAssessments: this.diagnostics.listSessions(user, studentId, subject).filter((item) => ['in_progress', 'paused'].includes(item.status)),
      notice: '训练可以看提示、订正与重试。训练完成不直接证明掌握，之后用独立新题和间隔复测验证。' };
  }
  start(user: InMemoryUserAccount, planId: string, actionId: string) {
    const plan = this.store.find('diagnosticPlans', { id: planId });
    if (!plan) throw new NotFoundException('计划不存在');
    this.students.assertCanAccessStudent(user, plan.studentId);
    if (plan.status !== 'active') throw new BadRequestException('请先确认并启用指导计划');
    const action = plan.actions.find((item) => item.id === actionId);
    if (!action) throw new NotFoundException('活动不属于当前计划');
    const day = studyDay(), existing = this.store.find('practiceSessions', { planId: planId, actionId: actionId, day: day });
    if (existing) return this.view(user, existing.id);
    if (this.guidance.get(user, planId).impact.needsReview) throw new ConflictException('评测依据已修订，请由家长先核对指导计划');
    const baseline = this.diagnostics.requireSession(user, plan.baselineSessionId);
    const allowed = new Set([...baseline.scopeSnapshot.learnedAtomIds, ...baseline.coverage.map((item) => item.atomId)]);
    if (!allowed.has(action.atomId)) throw new BadRequestException('活动超出计划确认时的学习范围');
    const used = new Set([...this.store.select('practiceSessions', { studentId: plan.studentId }).flatMap((item) => item.questionIds),
      ...this.store.select('diagnosticResponses', { studentId: plan.studentId }).map((item) => item.questionId)]);
    const mappings = eligibleMeasurements(this.store, [action.atomId]);
    const rank = (id: string) => createHash('sha256').update(`${day}:${actionId}:${id}`).digest('hex');
    mappings.sort((a, b) => Number(used.has(a.questionId)) - Number(used.has(b.questionId)) || rank(a.id).localeCompare(rank(b.id)));
    const ids: string[] = []; let seconds = 0;
    for (const item of mappings) if (!ids.includes(item.questionId) && ids.length < 5 && seconds + item.expectedSeconds <= action.minutes * 60 &&
      item.questionVersion === (this.store.find('questionDocuments', { questionId: item.questionId })?.version ?? 1)) {
      ids.push(item.questionId); seconds += item.expectedSeconds;
    }
    if (!ids.length) throw new BadRequestException('此活动暂缺审核通过的练习题，请在教研覆盖中补充');
    const session: PracticeSession = { id: this.store.nextId('practice'), studentId: plan.studentId, subject: plan.subject, planId, actionId,
      atomId: action.atomId, day, status: 'in_progress', questionIds: ids,
      actionSnapshot: structuredClone(action), planRevision: plan.revision ?? 1, snapshotOrigin: 'started',
      atomSnapshot: baseline.atomSnapshots?.find(atom => atom.id === action.atomId), sourceAssessmentId: baseline.id,
      snapshots: ids.map((id) => {
        const question = this.store.find('questions', { id: id })!, payload = this.workspace.buildRenderPayload(id);
        return structuredClone({ id, stem: question.stem, answer: question.answer, analysis: question.analysis,
          document: payload.document, answerSchema: payload.answerSchema, renderPayload: payload, questionType: question.type });
      }), createdAt: new Date().toISOString(), completedAt: null };
    this.store.append('practiceSessions', session);
    this.events.publish('learning.practice_started', { studentId: plan.studentId, sessionId: session.id, planId, actionId, day });
    return this.view(user, session.id);
  }
  private requireSession(user: InMemoryUserAccount, id: string) {
    const session = this.store.find('practiceSessions', { id: id });
    if (!session) throw new NotFoundException('训练不存在');
    this.students.assertCanAccessStudent(user, session.studentId); return session;
  }
  view(user: InMemoryUserAccount, id: string) {
    const session = this.requireSession(user, id), attempts = this.store.select('practiceAttempts', { sessionId: id }).map((item) => this.effectiveAttempt(item));
    const plan = session.planId ? this.store.find('diagnosticPlans', { id: session.planId }) : undefined, action = session.actionSnapshot ?? plan?.actions.find((item) => item.id === session.actionId);
    const latest = session.questionIds.map((questionId) => [...attempts].reverse().find((item) => item.questionId === questionId));
    return { id, studentId: session.studentId, subject: session.subject, atomId: session.atomId, planId: session.planId,
      actionId: session.actionId, day: session.day, status: session.status, action, completedAt: session.completedAt,
      planRevision: session.planRevision ?? 1, currentPlanRevision: session.origin === 'notebook' ? session.planRevision ?? 1 : plan?.revision ?? 1,
      snapshotOrigin: session.snapshotOrigin ?? 'legacy_capture',
      origin: session.origin ?? 'guidance', notebookEntryId: session.notebookEntryId ?? null,
      questions: session.questionIds.map((questionId, index) => ({ id: questionId, attempted: Boolean(latest[index]),
        latest: latest[index] ?? null, attempts: attempts.filter((item) => item.questionId === questionId).length })),
      summary: { attempted: latest.filter(Boolean).length, total: session.questionIds.length,
        answered: latest.filter((item) => item?.disposition === 'answered').length,
        skipped: latest.filter((item) => item?.disposition === 'skip').length,
        independentFirstPass: session.questionIds.filter((questionId) => {
          const first = attempts.find((item) => item.questionId === questionId); return first?.correct && !first.hintLevel && !first.solutionExposedBefore;
        }).length, pendingReview: latest.filter((item) => item?.status === 'pending_review').length } };
  }
  render(user: InMemoryUserAccount, id: string, questionId: string) {
    const session = this.requireSession(user, id), snapshot = session.snapshots.find((item) => item.id === questionId);
    if (!snapshot) throw new NotFoundException('题目不属于当前训练');
    const payload = structuredClone(snapshot.renderPayload) as QuestionRenderPayload;
    payload.answerSchema.gradingConfig = {}; payload.source.sourcePathOrUrl = ''; payload.source.notes = null; payload.source.importJobId = null;
    payload.inputAvailability = { supported: mediaModeAvailable(payload.answerSchema.mode), reason: mediaModeAvailable(payload.answerSchema.mode) ? '' : '本次音频作答暂时不可用，请先跳过并反馈给老师。' };
    const attempt = this.store.select('practiceAttempts', { sessionId: id, questionId }).reverse()[0];
    return { payload, feedback: attempt ? this.feedback(session, attempt) : null, draft: session.drafts?.[questionId] ?? null };
  }
  draft(user: InMemoryUserAccount, id: string, questionId: string, input: unknown) {
    const session = this.requireSession(user, id);
    this.assertActive(session);
    if (!session.questionIds.includes(questionId)) throw new NotFoundException('题目不属于当前训练');
    const { answer } = validate(z.object({ answer: z.unknown() }).strict(), input);
    const snapshot = session.snapshots.find(item => item.id === questionId)!;
    const issue = answerProtocolIssue(snapshot.answerSchema as QuestionAnswerSchema, answer, true); if (issue) throw new BadRequestException(issue);
    this.media.assertAnswer(user, { kind: 'practice', sessionId: id, itemId: questionId }, answer, true);
    session.drafts ??= {};
    session.drafts[questionId] = { answer, savedAt: new Date().toISOString() };
    return { savedAt: session.drafts[questionId].savedAt };
  }
  private assertActive(session: PracticeSession) {
    if (session.status !== 'in_progress') throw new BadRequestException('训练已结束；请使用新题验证');
    if (session.origin !== 'notebook' && !Boolean(this.store.find('diagnosticPlans', { id: session.planId, status: 'active' }))) throw new BadRequestException('计划已暂停，请先恢复计划');
  }
  submit(user: InMemoryUserAccount, id: string, input: unknown) {
    const session = this.requireSession(user, id), command = validate(answerSchema, input);
    const priorKey = this.store.find('practiceAttempts', { sessionId: id, requestKey: command.requestKey });
    if (priorKey) {
      if (priorKey.questionId !== command.questionId || priorKey.disposition !== command.disposition || JSON.stringify(priorKey.answer) !== JSON.stringify(command.answer ?? null)) throw new ConflictException('请求标识已用于不同的作答');
      return this.feedback(session, priorKey);
    }
    this.assertActive(session);
    const snapshot = session.snapshots.find((item) => item.id === command.questionId);
    if (!snapshot) throw new BadRequestException('题目不属于当前训练');
    const previous = this.store.select('practiceAttempts', { sessionId: id, questionId: command.questionId });
    if (previous.length >= 5) throw new BadRequestException('本题已练习五次，先查看指导后换一题');
    const mediaIds = command.disposition === 'answered' ? this.media.assertAnswer(user, { kind: 'practice', sessionId: id, itemId: command.questionId }, command.answer) : [];
    const grade = command.disposition === 'skip' ? { score: null, correct: null, status: 'skipped' as const, reason: '本题跳过，不计为错误。' } :
      gradeResponse(snapshot.answerSchema as QuestionAnswerSchema, snapshot.answer, command.answer);
    const attempt: PracticeAttempt = { id: this.store.nextId('practice-attempt'), sessionId: id, questionId: command.questionId,
      requestKey: command.requestKey, answer: command.answer ?? null, disposition: command.disposition, ...grade,
      hintLevel: Math.max(0, ...this.store.select('practiceHints', { sessionId: id, questionId: command.questionId }).map((item) => item.level)),
      attempt: previous.length + 1, solutionExposedBefore: session.origin === 'notebook' || previous.length > 0, elapsedMs: command.elapsedMs, submittedAt: new Date().toISOString() };
    this.store.append('practiceAttempts', attempt);
    this.media.bind(mediaIds, attempt.id);
    if (session.drafts) delete session.drafts[command.questionId];
    this.events.publish('learning.practice_response', { studentId: session.studentId, sessionId: id, attemptId: attempt.id, questionId: command.questionId });
    return this.feedback(session, attempt);
  }
  private feedback(session: PracticeSession, attempt: PracticeAttempt) {
    attempt = this.effectiveAttempt(attempt);
    const snapshot = session.snapshots.find((item) => item.id === attempt.questionId)!;
    return { attempt, analysis: snapshot.analysis, referenceAnswer: snapshot.answer,
      reviewHistory: this.store.select('practiceScoringRevisions', { responseId: attempt.id }).map(({ requestHash: _hash, ...item }) => item),
      notice: attempt.status === 'pending_review' ? '已保存表达，等待按量规复核。' : attempt.correct ?
        attempt.attempt === 1 && !attempt.hintLevel && !attempt.solutionExposedBefore ? '这道题已独立完成。稍后用新题看看是否能迁移。' : '这次订正有进展，再用独立新题验证。' : '先看看卡住的步骤，可以查看指导、重试或换一题。' };
  }

  effectiveAttempt(attempt: PracticeAttempt): PracticeAttempt {
    const revision = this.store.select('practiceScoringRevisions', { responseId: attempt.id }).sort((a, b) => b.version - a.version)[0];
    return revision ? { ...attempt, score: revision.score, correct: revision.score === 1, status: 'scored', reason: revision.reason } : attempt;
  }

  reviewScore(user: InMemoryUserAccount, responseId: string, input: unknown) {
    const attempt = this.store.find('practiceAttempts', { id: responseId });
    if (!attempt) throw new NotFoundException('训练作答不存在');
    const session = this.store.find('practiceSessions', { id: attempt.sessionId })!;
    this.students.assertCanReviewStudent(user, session.studentId);
    if (attempt.disposition !== 'answered') throw new BadRequestException('跳过的题目不能复核评分');
    const snapshot = session.snapshots.find((item) => item.id === attempt.questionId)!;
    const prepared = prepareScoringReview(input, snapshot.answerSchema as QuestionAnswerSchema,
      this.store.select('practiceScoringRevisions', { responseId: attempt.id }));
    if (prepared.existing) return prepared.existing;
    const revision = { id: this.store.nextId('practice_scoring_revision'), responseId, ...prepared.data!, reviewerId: user.id, createdAt: new Date().toISOString() };
    this.store.append('practiceScoringRevisions', revision);
    this.events.publish('learning.score_reviewed', { responseId, revisionId: revision.id, studentId: session.studentId, actorId: user.id });
    return revision;
  }
  hint(user: InMemoryUserAccount, id: string, questionId: string) {
    const session = this.requireSession(user, id);
    this.assertActive(session);
    if (session.status !== 'in_progress' || !session.questionIds.includes(questionId)) throw new BadRequestException('当前题目不可获取提示');
    const plan = session.planId ? this.store.find('diagnosticPlans', { id: session.planId }) : undefined;
    const atom = session.atomSnapshot ?? this.store.find('diagnosticSessions', { id: plan?.baselineSessionId })?.atomSnapshots?.find(atom => atom.id === session.atomId);
    const level = Math.min(3, 1 + this.store.select('practiceHints', { sessionId: id, questionId: questionId }).length);
    this.store.append('practiceHints', { id: this.store.nextId('practice-hint'), sessionId: id, questionId, level, at: new Date().toISOString() });
    return { level, hint: level === 1 ? `先说说题目让你做什么，再想想“${atom?.name ?? '当前任务'}”的关键条件。` : level === 2 ?
      `把思路拆开：${atom?.objective ?? '先列出已知条件和需要解决的目标'}。每做一步，核对一次条件。` : `可以请家长示范“${atom?.name ?? '当前任务'}”中的一个关键步骤，再自己解释并完成剩余部分。提示后的表现会单独记录。` };
  }
  complete(user: InMemoryUserAccount, id: string) {
    const session = this.requireSession(user, id), view = this.view(user, id);
    if (session.status !== 'completed') this.assertActive(session);
    if (view.summary.attempted !== view.summary.total) throw new BadRequestException('每一道不同的题都需作答或明确跳过，才能结束活动');
    if (session.status !== 'completed') {
      session.status = 'completed'; session.completedAt = new Date().toISOString();
      this.events.publish('learning.practice_completed', { studentId: session.studentId, sessionId: id, planId: session.planId, actionId: session.actionId });
    }
    return this.view(user, id);
  }
  mistakes(user: InMemoryUserAccount, studentId: string, subject: Subject, all = false) {
    this.students.assertCanAccessStudent(user, studentId);
    const ended = new Set(this.store.select('diagnosticSessions', { studentId, subject, status: ['completed', 'aborted'] }).map(session => session.id));
    const diagnostic = this.diagnostics.effectiveResponses(studentId, subject).filter((item) => ended.has(item.sessionId) && (item.correct === false || item.status === 'pending_review'));
    const rows = diagnostic.map((item) => {
      const session = this.store.find('diagnosticSessions', { id: item.sessionId });
      return { id: item.id, kind: 'measurement', atomId: item.atomId, questionId: item.questionId,
        reason: item.gradingReason, status: item.status, answer: item.answer, at: item.submittedAt,
        atomSnapshot: session?.atomSnapshots?.find(atom => atom.id === item.atomId),
        snapshot: session?.questionSnapshots.find((question) => question.id === item.questionId) };
    });
    for (const session of this.store.select('practiceSessions', { studentId: studentId, subject: subject })) {
      if (session.origin === 'notebook') continue;
      for (const questionId of session.questionIds) {
        const original = this.store.find('practiceAttempts', { sessionId: session.id, questionId: questionId });
        const first = original ? this.effectiveAttempt(original) : null;
        if (!first || (first.correct !== false && first.status !== 'pending_review')) continue;
        const plan = session.planId ? this.store.find('diagnosticPlans', { id: session.planId }) : undefined;
        rows.push({ id: first.id, kind: 'practice', atomId: session.atomId, questionId, reason: first.reason, status: first.status,
          atomSnapshot: this.store.find('diagnosticSessions', { id: plan?.baselineSessionId })?.atomSnapshots?.find(atom => atom.id === session.atomId),
          answer: first.answer, at: first.submittedAt, snapshot: session.snapshots.find((item) => item.id === questionId) });
      }
    }
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, all ? rows.length : 100).map(({ snapshot, atomSnapshot, ...item }) => ({ ...item,
      atomName: atomSnapshot?.name ?? item.atomId,
      stem: snapshot?.stem ?? '原始题目暂不可用', analysis: snapshot?.analysis ?? '', referenceAnswer: snapshot?.answer ?? null,
      hypothesis: atomSnapshot ? this.store.select('diagnosticHypotheses', { studentId, atomId: item.atomId }).find(hypothesis =>
        hypothesis.atomDefinitionFingerprint === atomDefinitionFingerprint(atomSnapshot) && !['contradicted', 'resolved', 'withdrawn'].includes(hypothesis.status)) ?? null : null }));
  }
  overview(user: InMemoryUserAccount) {
    const children = this.store.students.filter((child) => user.role === 'admin' || Boolean(this.store.find('bindings', { parentUserId: user.id, studentId: child.id, status: 'active' })));
    return { generatedAt: new Date().toISOString(), day: studyDay(), children: children.map((child) => ({ id: child.id, nickname: child.nickname,
      grade: child.grade, subjects: (['math', 'chinese', 'english'] as Subject[]).map((subject) => {
        const profile = this.diagnostics.profile(user, child.id, subject), today = this.today(user, child.id, subject);
        const sessions = this.diagnostics.listSessions(user, child.id, subject), last = sessions.find((item) => item.status === 'completed');
        const learned = new Set(profile.scope?.learnedAtomIds ?? []), estimates = profile.estimates.filter((item) => learned.has(item.atomId));
        const weekStart = Date.now() - 7 * 86_400_000;
        return { subject, scope: profile.scope, estimates, hypotheses: profile.hypotheses, today,
          latestSessionId: last?.id ?? null, latestAt: last?.completedAt ?? null,
          counts: { selected: learned.size, secure: estimates.filter((item) => item.status === 'secure').length,
            unknown: estimates.filter((item) => item.status === 'unknown').length,
            needsEvidence: estimates.filter((item) => item.status === 'insufficient').length },
          week: { completedAssessments: sessions.filter((item) => item.status === 'completed' && Date.parse(item.completedAt!) >= weekStart).length,
            completedActivities: this.store.practiceSessions.filter((item) => item.studentId === child.id && item.subject === subject && item.status === 'completed' && Date.parse(item.completedAt!) >= weekStart).length,
            observations: this.diagnostics.effectiveResponses(child.id, subject).filter((item) => Date.parse(item.submittedAt) >= weekStart).length },
          trend: this.store.select('diagnosticReports', { 'report.studentId': child.id, 'report.subject': subject })
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).filter((item, index, all) => !all.slice(index + 1).some((other) => other.sessionId === item.sessionId)).slice(-8)
            .map((item) => ({ at: item.createdAt, sessionId: item.sessionId, measuredPoints: item.report.estimates.filter((estimate) => estimate.scoredCount > 0).length,
              sufficientPoints: item.report.estimates.filter((estimate) => !['unknown', 'insufficient'].includes(estimate.status)).length })) };
      }) })) };
  }
}
