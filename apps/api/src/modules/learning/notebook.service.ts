import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { MistakeNotebookEntry, NotebookMetadata, PracticeSession, QuestionRenderPayload, Subject } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { StudentsService } from '../students/students.service';
import { DiagnosticsService } from '../diagnostics/diagnostics.service';
import { atomDefinitionFingerprint } from '../diagnostics/measurement-definition';
import { blueprintContentHash as hash } from '../diagnostics/assessment-blueprint';
import { LearningService, studyDay } from './learning.service';

const kindSchema = z.enum(['diagnostic', 'practice']);
const metadataSchema = z.object({ tags: z.array(z.string().trim().min(1).max(30)).max(12), favorite: z.boolean(), removed: z.boolean(),
  errorSteps: z.array(z.string().trim().min(1).max(400)).max(12), reflection: z.string().trim().max(3000), reviewState: z.enum(['open', 'reviewed']) }).strict();
const mutationSchema = z.object({ expectedVersion: z.number().int().min(0), requestKey: z.string().trim().min(8).max(180), reason: z.string().trim().min(5).max(1500) });
const blank = (): NotebookMetadata => ({ tags: [], favorite: false, removed: false, errorSteps: [], reflection: '', reviewState: 'open' });
const identity = (studentId: string, kind: string, responseId: string) => `notebook:${createHash('sha256').update(JSON.stringify([studentId, kind, responseId])).digest('hex')}`;

@Injectable()
export class NotebookService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly diagnostics: DiagnosticsService, private readonly learning: LearningService, private readonly events: DomainEventBusService) {}

  private source(user: InMemoryUserAccount, studentId: string, kindInput: unknown, responseId: string,
    knownResponses?: Map<string, ReturnType<DiagnosticsService['effectiveResponses']>[number]>) {
    this.students.assertCanAccessStudent(user, studentId); const kind = validate(kindSchema, kindInput);
    if (kind === 'diagnostic') {
      const original = this.store.find('diagnosticResponses', { id: responseId, studentId });
      const session = original && this.store.find('diagnosticSessions', { id: original.sessionId, studentId });
      const snapshot = session?.questionSnapshots.find(question => question.id === original?.questionId);
      if (!original || !session || !snapshot) throw new NotFoundException('原始评测证据不存在');
      if (!['completed', 'aborted'].includes(session.status)) throw new ConflictException('请先结束独立评测，再回看订正与参考思路');
      const effective = knownResponses?.get(responseId) ?? this.diagnostics.effectiveResponses(studentId, session.subject).find(response => response.id === responseId)!;
      return { kind, responseId, subject: session.subject, questionId: original.questionId, atomId: original.atomId,
        atomSnapshot: session.atomSnapshots?.find(atom => atom.id === original.atomId), snapshot,
        answer: original.answer, reason: effective.gradingReason, status: effective.status, score: effective.score, originalScore: original.score,
        correct: effective.correct, at: original.submittedAt, sourceSessionId: session.id, sourceAssessmentId: session.id,
        hintLevel: original.hintLevel, priorExposure: original.priorExposure ?? false, attemptNumber: 1 };
    }
    const original = this.store.find('practiceAttempts', { id: responseId });
    const session = original && this.store.find('practiceSessions', { id: original.sessionId, studentId });
    const snapshot = session?.snapshots.find(question => question.id === original?.questionId);
    if (!original || !session || !snapshot || session.origin === 'notebook') throw new NotFoundException('原始训练证据不存在');
    const effective = this.learning.effectiveAttempt(original), plan = session.planId ? this.store.find('diagnosticPlans', { id: session.planId }) : undefined;
    return { kind, responseId, subject: session.subject, questionId: original.questionId, atomId: session.atomId,
      atomSnapshot: session.atomSnapshot ?? this.store.find('diagnosticSessions', { id: plan?.baselineSessionId })?.atomSnapshots?.find(atom => atom.id === session.atomId), snapshot,
      answer: original.answer, reason: effective.reason, status: effective.status, score: effective.score, originalScore: original.score,
      correct: effective.correct, at: original.submittedAt, sourceSessionId: session.id, sourceAssessmentId: session.sourceAssessmentId ?? plan?.baselineSessionId,
      hintLevel: original.hintLevel, priorExposure: original.solutionExposedBefore, attemptNumber: original.attempt };
  }
  private entry(studentId: string, kind: string, responseId: string) { return this.store.find('mistakeNotebookEntries', { id: identity(studentId, kind, responseId), studentId }); }
  private assertEligible(source: ReturnType<NotebookService['source']>, entry?: MistakeNotebookEntry) {
    if (!entry && source.correct !== false && source.status !== 'pending_review') throw new BadRequestException('此记录没有需要订正或核查的表现，不能加入错题本');
  }
  private ensure(studentId: string, source: ReturnType<NotebookService['source']>) {
    let entry = this.entry(studentId, source.kind, source.responseId);
    this.assertEligible(source, entry);
    if (!entry) {
      const at = new Date().toISOString(); entry = { id: identity(studentId, source.kind, source.responseId), studentId, subject: source.subject,
        kind: source.kind, responseId: source.responseId, questionId: source.questionId, atomId: source.atomId,
        version: 0, metadata: blank(), createdAt: at, updatedAt: at, history: [], redoSessionIds: [], verificationBlueprintIds: [] };
      this.store.append('mistakeNotebookEntries', entry);
    }
    return entry;
  }
  private summary(source: ReturnType<NotebookService['source']>, entry?: MistakeNotebookEntry) {
    const candidate = this.store.find('measurementCandidates', { questionId: source.questionId });
    return { id: entry?.id ?? null, kind: source.kind, responseId: source.responseId, atomId: source.atomId, atomName: source.atomSnapshot?.name ?? source.atomId,
      questionId: source.questionId, subject: source.subject, stem: source.snapshot.stem, at: source.at, status: source.status,
      correct: source.correct, score: source.score, originalScore: source.originalScore, version: entry?.version ?? 0,
      hintLevel: source.hintLevel, priorExposure: source.priorExposure, attemptNumber: source.attemptNumber,
      metadata: entry?.metadata ?? blank(), sourceName: (source.snapshot.renderPayload as QuestionRenderPayload | undefined)?.source.sourceName ?? '历史学习记录',
      paper: candidate ? { id: candidate.paperId, title: candidate.paperTitle, position: candidate.position,
        published: this.store.find('paperPublications', { paperId: candidate.paperId })?.status === 'published' } : null,
      redoCount: entry?.redoSessionIds.length ?? 0, verificationCount: entry?.verificationBlueprintIds.length ?? 0 };
  }
  list(user: InMemoryUserAccount, studentId: string, input: unknown) {
    this.students.assertCanAccessStudent(user, studentId);
    const query = validate(z.object({ subject: z.enum(['math', 'chinese', 'english']), q: z.string().trim().max(100).optional(),
      atomId: z.string().max(180).optional(), tag: z.string().trim().max(30).optional(), favorite: z.enum(['true', 'false']).optional(),
      state: z.enum(['active', 'removed', 'all']).default('active'), reviewState: z.enum(['open', 'reviewed']).optional(),
      page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(40).default(20) }).strict(), input);
    const references = new Map<string, { kind: 'diagnostic' | 'practice'; responseId: string }>();
    for (const row of this.learning.mistakes(user, studentId, query.subject, true)) {
      const kind = row.kind === 'measurement' ? 'diagnostic' as const : 'practice' as const;
      references.set(`${kind}:${row.id}`, { kind, responseId: row.id });
    }
    for (const row of this.store.select('mistakeNotebookEntries', { studentId, subject: query.subject })) references.set(`${row.kind}:${row.responseId}`, { kind: row.kind, responseId: row.responseId });
    const effective = new Map(this.diagnostics.effectiveResponses(studentId, query.subject).map(row => [row.id, row]));
    const all = [...references.values()].map(ref => {
      const source = this.source(user, studentId, ref.kind, ref.responseId, effective); return this.summary(source, this.entry(studentId, ref.kind, ref.responseId));
    }).sort((a, b) => b.at.localeCompare(a.at));
    const rows = all.filter(row => (!query.atomId || row.atomId === query.atomId) && (!query.tag || row.metadata.tags.includes(query.tag)) &&
      (!query.q || `${row.stem} ${row.atomName} ${row.metadata.reflection} ${row.sourceName}`.includes(query.q)) &&
      (query.favorite === undefined || row.metadata.favorite === (query.favorite === 'true')) &&
      (query.state === 'all' || row.metadata.removed === (query.state === 'removed')) && (!query.reviewState || row.metadata.reviewState === query.reviewState));
    const grouped = new Map<string, { id: string; name: string; count: number; open: number; pending: number; removed: number }>();
    for (const row of all) {
      const point = grouped.get(row.atomId) ?? { id: row.atomId, name: row.atomName, count: 0, open: 0, pending: 0, removed: 0 };
      if (row.metadata.removed) point.removed++;
      else { point.count++; if (row.metadata.reviewState === 'open') point.open++; if (row.status === 'pending_review') point.pending++; }
      grouped.set(row.atomId, point);
    }
    return { total: rows.length, page: query.page, pageSize: query.pageSize, items: rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
      tags: [...new Set(all.flatMap(row => row.metadata.tags))].sort(), atoms: [...grouped.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN')),
      counts: { active: all.filter(row => !row.metadata.removed).length, removed: all.filter(row => row.metadata.removed).length,
        pendingScoring: all.filter(row => !row.metadata.removed && row.status === 'pending_review').length },
      notice: '订正和复做保存思路；原题复做不作为独立掌握证据，之后用未见新题和真实间隔验证。待评分表达不先认定为错误。' };
  }
  detail(user: InMemoryUserAccount, studentId: string, kind: unknown, responseId: string) {
    const source = this.source(user, studentId, kind, responseId), entry = this.entry(studentId, source.kind, responseId); this.assertEligible(source, entry);
    const payload = source.snapshot.renderPayload ? structuredClone(source.snapshot.renderPayload) as QuestionRenderPayload : null;
    if (payload) { payload.answerSchema.gradingConfig = {}; payload.source.sourcePathOrUrl = ''; payload.source.notes = null; payload.source.importJobId = null; }
    return { ...this.summary(source, entry), studentId, reason: source.reason, answer: source.answer,
      referenceAnswer: source.snapshot.answer, analysis: source.snapshot.analysis, payload,
      atomSnapshot: source.atomSnapshot, sourceSessionId: source.sourceSessionId,
      hypotheses: source.atomSnapshot ? this.store.select('diagnosticHypotheses', { studentId, atomId: source.atomId }).filter(hypothesis =>
        hypothesis.atomDefinitionFingerprint === atomDefinitionFingerprint(source.atomSnapshot!) && !['contradicted', 'resolved', 'withdrawn'].includes(hypothesis.status)) : [],
      history: (entry?.history ?? []).map(({ requestKey: _key, inputHash: _hash, ...history }) => history),
      redos: (entry?.redoSessionIds ?? []).map(id => { const practice = this.store.find('practiceSessions', { id, studentId });
        return practice ? { id, createdAt: practice.createdAt, completedAt: practice.completedAt, status: practice.status,
          summary: this.learning.view(user, id).summary } : null; }).filter(Boolean),
      verifications: (entry?.verificationBlueprintIds ?? []).map(id => {
        const reservation = this.store.find('diagnosticBlueprints', { id, studentId }), session = reservation?.sessionId ? this.store.find('diagnosticSessions', { id: reservation.sessionId, studentId }) : null;
        const report = session && ['completed', 'aborted'].includes(session.status) ? this.diagnostics.report(user, session.id) : null;
        return { blueprintId: id, canResumePreview: reservation?.actorId === user.id, sessionId: session?.id ?? null, status: session?.status ?? 'preview',
          createdAt: reservation?.createdAt, report: report ? { rawScore: report.rawScore, scoredCount: report.scoredCount, pendingReviewCount: report.pendingReviewCount, estimates: report.estimates } : null };
      }) };
  }
  private check(entry: MistakeNotebookEntry | undefined, user: InMemoryUserAccount, command: z.infer<typeof mutationSchema>, action: string, inputHash: string) {
    const previous = entry?.history.find(history => history.actorId === user.id && history.requestKey === command.requestKey);
    if (previous) { if (previous.action !== action || previous.inputHash !== inputHash) throw new ConflictException('请求键已用于另一操作'); return previous; }
    if ((entry?.version ?? 0) !== command.expectedVersion) throw new ConflictException('错题整理已变化，请刷新后核对'); return null;
  }
  private record(entry: MistakeNotebookEntry, user: InMemoryUserAccount, command: z.infer<typeof mutationSchema>, action: MistakeNotebookEntry['history'][number]['action'], inputHash: string, referenceId?: string) {
    entry.version++; entry.updatedAt = new Date().toISOString();
    entry.history.push({ version: entry.version, actorId: user.id, at: entry.updatedAt, action, reason: command.reason,
      requestKey: command.requestKey, inputHash, ...(action === 'organized' ? { metadata: structuredClone(entry.metadata) } : {}), ...(referenceId ? { referenceId } : {}) });
    this.events.publish(`notebook.${action}`, { entryId: entry.id, studentId: entry.studentId, actorId: user.id, version: entry.version, referenceId });
  }
  organize(user: InMemoryUserAccount, studentId: string, kind: unknown, responseId: string, input: unknown) {
    const source = this.source(user, studentId, kind, responseId), existing = this.entry(studentId, source.kind, responseId);
    const command = validate(mutationSchema.extend({ metadata: metadataSchema }).strict(), input), inputHash = hash(command);
    if (this.check(existing, user, command, 'organized', inputHash)) return this.detail(user, studentId, kind, responseId);
    if (new Set(command.metadata.tags).size !== command.metadata.tags.length) throw new BadRequestException('标签不能重复');
    const entry = this.ensure(studentId, source); entry.metadata = structuredClone(command.metadata);
    this.record(entry, user, command, 'organized', inputHash); return this.detail(user, studentId, kind, responseId);
  }
  redo(user: InMemoryUserAccount, studentId: string, kind: unknown, responseId: string, input: unknown) {
    const source = this.source(user, studentId, kind, responseId), existing = this.entry(studentId, source.kind, responseId);
    const command = validate(mutationSchema.strict(), input), inputHash = hash(command), previous = this.check(existing, user, command, 'redo_started', inputHash);
    if (previous) return this.learning.view(user, previous.referenceId!);
    if (existing?.metadata.removed) throw new BadRequestException('请先恢复这道题，再开始复做');
    const entry = this.ensure(studentId, source), active = this.store.find('practiceSessions', { notebookEntryId: entry.id, status: 'in_progress' });
    if (active) { this.record(entry, user, command, 'redo_started', inputHash, active.id); return this.learning.view(user, active.id); }
    if (!source.snapshot.renderPayload) throw new BadRequestException('旧题缺少完整交互快照，请使用新题核查');
    const session: PracticeSession = { id: this.store.nextId('practice'), studentId, subject: source.subject, planId: null, actionId: entry.id,
      atomId: source.atomId, day: studyDay(), status: 'in_progress', questionIds: [source.questionId], snapshots: [structuredClone(source.snapshot)],
      atomSnapshot: source.atomSnapshot ? structuredClone(source.atomSnapshot) : undefined, origin: 'notebook', notebookEntryId: entry.id,
      sourceAssessmentId: source.sourceAssessmentId,
      snapshotOrigin: 'started', planRevision: 0, createdAt: new Date().toISOString(), completedAt: null,
      actionSnapshot: { id: entry.id, atomId: source.atomId, hypothesisId: null, evidenceIds: [source.responseId],
        title: '回看卡住的一步', activity: '先回想当时的条件与思路，重新解释关键步骤，再完成订正。之后另用未见新题验证。',
        minutes: 5, successCriterion: '能指出当时卡住的步骤，并解释现在如何核对；本次不推断独立掌握。',
        resourceQuestionIds: [source.questionId], retestAt: '', ...(source.atomSnapshot?.teaching?.reviewStatus === 'approved' ? {
          teachingSnapshot: { atomVersion: source.atomSnapshot.version, teaching: structuredClone(source.atomSnapshot.teaching) } } : {}) } };
    this.store.append('practiceSessions', session); entry.redoSessionIds.push(session.id);
    this.record(entry, user, command, 'redo_started', inputHash, session.id); return this.learning.view(user, session.id);
  }
  verification(user: InMemoryUserAccount, studentId: string, kind: unknown, responseId: string, input: unknown) {
    const source = this.source(user, studentId, kind, responseId), existing = this.entry(studentId, source.kind, responseId);
    const command = validate(mutationSchema.strict(), input), inputHash = hash(command), previous = this.check(existing, user, command, 'verification_previewed', inputHash);
    if (previous) return this.diagnostics.getBlueprint(user, previous.referenceId!);
    if (existing?.metadata.removed) throw new BadRequestException('请先恢复这道题，再开始验证');
    const current = this.store.find('knowledgeAtoms', { id: source.atomId });
    if (!current || !source.atomSnapshot || atomDefinitionFingerprint(current) !== atomDefinitionFingerprint(source.atomSnapshot)) throw new ConflictException('历史知识定义无法与当前核对。请先确认当前学习范围并重新评测，再比较结果。');
    const entry = this.ensure(studentId, source);
    const blueprint = this.diagnostics.previewBlueprint(user, { studentId, subject: source.subject, intent: 'verification', targetAtomIds: [source.atomId],
      includePrerequisites: true, maxItems: 4, requestKey: `notebook:${hash([entry.id, user.id, command.requestKey])}` });
    entry.verificationBlueprintIds.push(blueprint.id); this.record(entry, user, command, 'verification_previewed', inputHash, blueprint.id); return blueprint;
  }
}
