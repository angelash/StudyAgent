import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DiagnosticHypothesis, DiagnosticReport, DiagnosticResponse, DiagnosticSession, DiagnosticStart, MeasurementItem,
  KnowledgeAtom, LearningScope, QuestionAnswerSchema, QuestionRenderPayload, Subject, answerInputConfiguration, answerProtocolIssue, diagnosticResponseInputSchema, diagnosticStartSchema } from '@study-agent/contracts';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { validate } from '../../common/validation';
import { StudentsService } from '../students/students.service';
import { QuestionWorkspaceService } from '../question-workspace/question-workspace.service';
import { CurriculumService, eligibleMeasurements } from './curriculum.service';
import { deriveHypotheses } from './diagnosis';
import { estimateMastery, MEASUREMENT_VERSION, weightedEvidence } from './measurement';
import { gradeResponse } from './scoring';
import { prepareScoringReview } from './scoring-review';
import { StudentMediaService } from '../student-media/student-media.service';
import { mediaModeAvailable } from '../student-media/media-normalization';
import { atomDefinitionFingerprint, compatibleDefinitionEvidence } from './measurement-definition';

@Injectable()
export class DiagnosticsService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly curriculum: CurriculumService, private readonly workspace: QuestionWorkspaceService,
    private readonly events: DomainEventBusService, private readonly media: StudentMediaService) {}

  start(user: InMemoryUserAccount, input: unknown, scopeOverride?: LearningScope) {
    const command = validate(diagnosticStartSchema, input);
    this.students.assertCanAccessStudent(user, command.studentId);
    const review = command.reviewTaskId ? this.store.find('reviewTasks', { id: command.reviewTaskId, studentId: command.studentId, subject: command.subject }) : undefined;
    if (command.reviewTaskId && (!review || command.intent !== 'retest' || (command.planId && command.planId !== review.planId))) throw new BadRequestException('复测任务与当前评测不匹配');
    const planId = review?.planId ?? command.planId;
    const plan = planId ? this.store.find('diagnosticPlans', { id: planId, studentId: command.studentId, subject: command.subject }) : undefined;
    if (planId && !plan) throw new NotFoundException('指导计划不存在');
    if (review?.sessionId) return this.sessionView(user, review.sessionId);
    if (plan) {
      if (!['verification', 'retest'].includes(command.intent)) throw new BadRequestException('指导计划只能关联验证或复测');
      if (plan.status !== 'active') throw new BadRequestException('请先启用指导计划');
      const baselineVersion = plan.baselineReportVersion ?? this.store.diagnosticReports.filter(r => r.sessionId === plan.baselineSessionId && r.createdAt <= plan.createdAt)
        .sort((a, b) => b.version - a.version)[0]?.version ?? 1;
      if (baselineVersion !== (this.report(user, plan.baselineSessionId).version ?? 1)) throw new ConflictException('评测依据已修订，请先核对指导计划');
      const baseline = this.requireSession(user, plan.baselineSessionId);
      if (!baseline.atomSnapshots) throw new ConflictException('历史计划未保存知识定义，请重新评测后建立新计划');
      if (this.changedPlanDefinitions(baseline, plan.actions.map(action => action.atomId)).length) throw new ConflictException('知识定义已调整，请按当前定义重新评测并建立计划');
    }
    if (review && (review.status !== 'pending' || Date.parse(review.dueAt) > Date.now())) throw new BadRequestException('复测尚未到期或已不可用');
    const scope = plan ? this.requireSession(user, plan.baselineSessionId).scopeSnapshot : scopeOverride ?? this.curriculum.getScope(user, command.studentId, command.subject);
    if (!scope) throw new BadRequestException('请先确认年级、教材和已学范围，再开始评测');
    const learned = new Set(scope.learnedAtomIds);
    const prerequisites = new Set(this.curriculum.prerequisiteClosure(scope.learnedAtomIds));
    const allowed = new Set([...learned, ...(command.includePrerequisites ? prerequisites : [])]);
    let targets = command.targetAtomIds ?? (review ? [review.atomId] : plan ? plan.actions.map(a => a.atomId) : scope.learnedAtomIds);
    if (command.hypothesisId) {
      const hypothesis = this.store.find('diagnosticHypotheses', { id: command.hypothesisId, studentId: command.studentId, subject: command.subject });
      if (!hypothesis) throw new NotFoundException('待验证问题不存在');
      const definition = this.store.find('knowledgeAtoms', { id: hypothesis.atomId });
      if (!definition || hypothesis.atomDefinitionFingerprint !== atomDefinitionFingerprint(definition)) {
        throw new ConflictException('该问题的知识定义已变化或无法核对，请重新评测后再验证原因');
      }
      targets = command.targetAtomIds ?? hypothesis.probeAtomIds;
      if (targets.some((id) => !hypothesis.probeAtomIds.includes(id))) throw new BadRequestException('验证点超出当前假设的范围');
    }
    targets = [...new Set(targets)];
    if (review && (targets.length !== 1 || targets[0] !== review.atomId)) throw new BadRequestException('本次复测只针对安排中的知识目标');
    if (plan && targets.some(id => !plan.actions.some(a => a.atomId === id))) throw new BadRequestException('验证目标不属于当前指导计划');
    if (!targets.length || targets.some((id) => !allowed.has(id))) throw new BadRequestException('评测知识点超出已确认的学习进度');
    const targetSet = new Set(targets);
    if (command.includePrerequisites) for (const id of this.curriculum.prerequisiteClosure(targets)) targetSet.add(id);
    const seed = randomUUID();
    // Rendering a practice item is already exposure, even if its answer was never submitted.
    // Training and abandoned assessments must not later be presented as independent new probes.
    const seen = new Set([
      ...this.store.select('diagnosticSessions', { studentId: command.studentId }).flatMap((item) => item.questionSnapshots.map((entry) => entry.id)),
      ...this.store.select('practiceSessions', { studentId: command.studentId }).flatMap((item) => item.questionIds),
    ]);
    const atomMap = new Map(this.store.inspect('knowledgeAtoms').map((item) => [item.id, item]));
    const candidates = eligibleMeasurements(this.store, [...targetSet]).filter((item) => {
      const atom = atomMap.get(item.atomId);
      return targetSet.has(item.atomId) && atom?.subject === scope.subject && atom.grade <= scope.grade &&
        (!['verification', 'retest'].includes(command.intent) || !seen.has(item.questionId));
    });
    const rank = (item: MeasurementItem) => createHash('sha256').update(`${seed}:${item.id}`).digest('hex');
    candidates.sort((a, b) => Number(seen.has(a.questionId)) - Number(seen.has(b.questionId)) ||
      a.difficulty - b.difficulty || rank(a).localeCompare(rank(b)));
    const selected: MeasurementItem[] = [], usedQuestions = new Set<string>();
    const families = new Map<string, Set<string>>();
    let seconds = 0;
    const coverage = [...targetSet].map((atomId) => ({ atomId, selected: 0, required: 2,
      role: (learned.has(atomId) ? 'target' : 'prerequisite') as 'target' | 'prerequisite' }));
    // Round-robin point coverage precedes extra depth; every unmet target remains visible.
    for (let round = 0; round < 4 && selected.length < command.maxItems; round++) {
      for (const point of coverage) {
        if (selected.length >= command.maxItems) break;
        const item = candidates.find((candidate) => candidate.atomId === point.atomId && !usedQuestions.has(candidate.questionId) &&
          !families.get(point.atomId)?.has(candidate.family) && seconds + candidate.expectedSeconds <= scope.minutesPerSession * 60);
        if (!item) continue;
        selected.push(structuredClone(item)); usedQuestions.add(item.questionId);
        const pointFamilies = families.get(point.atomId) ?? new Set<string>();
        pointFamilies.add(item.family); families.set(point.atomId, pointFamilies);
        point.selected++; seconds += item.expectedSeconds;
      }
    }
    if (!selected.length) throw new BadRequestException({ message: '当前范围缺少审核通过的量化题，请查看覆盖缺口或调整已学范围',
      missingAtomIds: targets, code: 'assessment_coverage_gap' });
    const session: DiagnosticSession = {
      id: this.store.nextId('diagnostic'), studentId: command.studentId, subject: command.subject, intent: command.intent,
      status: 'in_progress', scopeSnapshot: structuredClone(scope), itemIds: selected.map((item) => item.id), itemSnapshots: selected,
      atomSnapshots: structuredClone(this.store.select('knowledgeAtoms', { id: [...new Set([...scope.learnedAtomIds, ...targetSet])] })),
      questionSnapshots: selected.map((item) => {
        const question = this.store.find('questions', { id: item.questionId })!;
        const payload = this.workspace.buildRenderPayload(question.id);
        return structuredClone({ id: question.id, stem: question.stem, answer: question.answer, analysis: question.analysis,
          document: payload.document, answerSchema: payload.answerSchema, renderPayload: payload, questionType: question.type });
      }), coverage, selectionReasons: Object.fromEntries(selected.map((item) => [item.id,
        `${learned.has(item.atomId) ? '已学范围' : '前置基础核查'} · ${item.dimension} · 独立题族 ${item.family}${seen.has(item.questionId) ? ' · 曾作答，不增加独立样本' : ''}`])),
      seed, algorithmVersion: 'scope-blueprint-v1', startedAt: new Date().toISOString(), completedAt: null,
      exposedQuestionIds: selected.filter((item) => seen.has(item.questionId)).map((item) => item.questionId),
      hypothesisId: command.hypothesisId ?? null, reviewTaskId: command.reviewTaskId ?? null,
      ...(plan ? { planId: plan.id, planRevision: plan.revision ?? 1 } : {}),
    };
    if (session.reviewTaskId) {
      const task = this.store.find('reviewTasks', { id: session.reviewTaskId, studentId: session.studentId });
      if (!task || task.status !== 'pending' || !targets.includes(task.atomId)) throw new BadRequestException('复测任务不可用');
      task.status = 'in_progress'; task.sessionId = session.id;
    }
    this.store.append('diagnosticSessions', session);
    if (session.hypothesisId) {
      const hypothesis = this.store.find('diagnosticHypotheses', { id: session.hypothesisId })!;
      hypothesis.status = 'testing'; hypothesis.history.push({ at: session.startedAt, status: 'testing', reason: `开始验证评测 ${session.id}` });
    }
    this.events.publish('diagnostic.started', { sessionId: session.id, studentId: session.studentId, scopeId: scope.id, itemCount: selected.length });
    return this.sessionView(user, session.id);
  }

  requireSession(user: InMemoryUserAccount, id: string) {
    const session = this.store.find('diagnosticSessions', { id: id });
    if (!session) throw new NotFoundException('评测不存在');
    this.students.assertCanAccessStudent(user, session.studentId);
    return session;
  }

  definitionsForSession(session: DiagnosticSession): KnowledgeAtom[] {
    const ids = [...new Set([...session.scopeSnapshot.learnedAtomIds, ...session.coverage.map(item => item.atomId)])];
    return session.atomSnapshots ?? this.store.select('knowledgeAtoms', { id: ids });
  }

  definitionEvidence(atoms: readonly KnowledgeAtom[], responses: DiagnosticResponse[], studentId: string, known = true) {
    const sessions = new Map(this.store.select('diagnosticSessions', { studentId }).map(session => [session.id, session]));
    return compatibleDefinitionEvidence(atoms, responses, sessions, known);
  }

  changedPlanDefinitions(baseline: DiagnosticSession, atomIds: string[]) {
    // Legacy plans retain their historical origin, rather than inventing a frozen definition.
    if (!baseline.atomSnapshots) return [];
    return atomIds.filter(id => {
      const original = baseline.atomSnapshots!.find(atom => atom.id === id), current = this.store.find('knowledgeAtoms', { id });
      return !original || !current || current.status !== 'published' || atomDefinitionFingerprint(original) !== atomDefinitionFingerprint(current);
    });
  }

  listSessions(user: InMemoryUserAccount, studentId: string, subject: Subject) {
    this.students.assertCanAccessStudent(user, studentId);
    return this.store.select('diagnosticSessions', { studentId: studentId, subject: subject })
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 50).map((session) => this.sessionView(user, session.id));
  }

  sessionView(user: InMemoryUserAccount, id: string) {
    const session = this.requireSession(user, id);
    const responses = this.store.select('diagnosticResponses', { sessionId: id });
    return { id: session.id, studentId: session.studentId, subject: session.subject, intent: session.intent,
      status: session.status, scopeSnapshot: session.scopeSnapshot, coverage: session.coverage,
      startedAt: session.startedAt, completedAt: session.completedAt, answeredCount: responses.length, totalCount: session.itemIds.length,
      planId: session.planId ?? null, planRevision: session.planRevision ?? null,
      items: session.itemSnapshots.map((item) => ({ id: item.id, questionId: item.questionId, atomId: item.atomId, dimension: item.dimension,
        atomName: this.definitionsForSession(session).find(atom => atom.id === item.atomId)?.name ?? item.atomId,
        reason: session.selectionReasons[item.id], answered: responses.some((response) => response.itemId === item.id) })) };
  }

  renderItem(user: InMemoryUserAccount, sessionId: string, itemId: string) {
    const session = this.requireSession(user, sessionId);
    const mapping = session.itemSnapshots.find((item) => item.id === itemId);
    if (!mapping) throw new NotFoundException('题目不属于当前评测');
    const question = session.questionSnapshots.find((item) => item.id === mapping.questionId)!;
    const payload = structuredClone(question.renderPayload) as QuestionRenderPayload;
    payload.answerSchema.gradingConfig = {};
    payload.inputAvailability = { supported: mediaModeAvailable(payload.answerSchema.mode), reason: mediaModeAvailable(payload.answerSchema.mode) ? '' : '本次音频作答暂时不可用，请先跳过并反馈给老师。' };
    payload.source.sourcePathOrUrl = ''; payload.source.notes = null; payload.source.importJobId = null;
    const draft = this.store.find('diagnosticDrafts', { sessionId: sessionId, itemId: itemId });
    return { itemId, atomId: mapping.atomId, reason: session.selectionReasons[itemId], payload, draft: draft?.answer ?? null };
  }

  saveDraft(user: InMemoryUserAccount, sessionId: string, itemId: string, input: unknown) {
    const session = this.requireSession(user, sessionId);
    const command = validate(z.object({ answer: z.unknown() }).strict(), input);
    if (session.status !== 'in_progress' || !session.itemIds.includes(itemId) || Boolean(this.store.find('diagnosticResponses', { sessionId: sessionId, itemId: itemId }))) {
      throw new BadRequestException('只能保存尚未提交的当前评测题目');
    }
    const mapping = session.itemSnapshots.find(item => item.id === itemId)!;
    const snapshot = session.questionSnapshots.find(item => item.id === mapping.questionId)!;
    const issue = answerProtocolIssue(snapshot.answerSchema as QuestionAnswerSchema, command.answer, true); if (issue) throw new BadRequestException(issue);
    this.media.assertAnswer(user, { kind: 'diagnostic', sessionId, itemId }, command.answer, true);
    const existing = this.store.find('diagnosticDrafts', { sessionId: sessionId, itemId: itemId });
    const draft = { id: `draft:${sessionId}:${itemId}`, sessionId, itemId, answer: command.answer, updatedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, draft); else this.store.append('diagnosticDrafts', draft);
    return { saved: true, updatedAt: draft.updatedAt };
  }

  submit(user: InMemoryUserAccount, sessionId: string, input: unknown) {
    const command = validate(diagnosticResponseInputSchema, input);
    const session = this.requireSession(user, sessionId);
    const mapping = session.itemSnapshots.find((item) => item.id === command.itemId);
    if (!mapping) throw new BadRequestException('题目不属于当前评测');
    const previous = this.store.find('diagnosticResponses', { sessionId: sessionId, itemId: command.itemId });
    if (previous) {
      if (previous.disposition === command.disposition && JSON.stringify(previous.answer) === JSON.stringify(command.answer ?? null)) {
        return { saved: true, responseId: previous.id, idempotent: true, status: previous.status };
      }
      throw new ConflictException('首次作答已保存；如需重新验证，请开始新评测');
    }
    if (session.status !== 'in_progress') throw new BadRequestException('评测已结束');
    const question = session.questionSnapshots.find((item) => item.id === mapping.questionId)!;
    const configuration = answerInputConfiguration(question.answerSchema as QuestionAnswerSchema);
    if (command.disposition !== 'skip' && !configuration.supported) throw new BadRequestException(configuration.reason);
    if (command.disposition !== 'skip' && !mediaModeAvailable((question.answerSchema as QuestionAnswerSchema).mode)) throw new BadRequestException('本次音频作答暂时不可用，请先跳过');
    const mediaIds = command.disposition === 'answered' ? this.media.assertAnswer(user, { kind: 'diagnostic', sessionId, itemId: command.itemId }, command.answer) : [];
    const grade = command.disposition === 'answered' ? gradeResponse(question.answerSchema as QuestionAnswerSchema, question.answer, command.answer) :
      command.disposition === 'dont_know' ? { score: 0, correct: false, status: 'scored' as const, reason: '学生选择暂时不会，作为当前任务表现记录。' } :
        { score: null, correct: null, status: 'skipped' as const, reason: '本题已跳过，不计为错误。' };
    const atom = session.atomSnapshots?.find(atom => atom.id === mapping.atomId);
    const priorIndependent = this.definitionEvidence(atom ? [atom] : [], this.effectiveResponses(session.studentId, session.subject), session.studentId, !!session.atomSnapshots).compatible.filter((item) => item.atomId === mapping.atomId &&
      item.sessionId !== sessionId && item.correct && item.hintLevel === 0 && !item.priorExposure && item.submittedAt < session.startedAt)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
    const delay = priorIndependent ? Math.max(0, (Date.now() - Date.parse(priorIndependent.submittedAt)) / 86_400_000) : null;
    const response: DiagnosticResponse = {
      id: `response:${sessionId}:${mapping.id}`, sessionId, studentId: session.studentId, itemId: mapping.id,
      questionId: mapping.questionId, atomId: mapping.atomId, family: mapping.family,
      dimension: session.intent === 'retest' && (delay ?? 0) >= 1 ? 'retention' : mapping.dimension,
      questionVersion: mapping.questionVersion, mappingVersion: mapping.version, answer: command.answer ?? null,
      score: grade.score, correct: grade.correct, status: grade.status, disposition: command.disposition,
      elapsedMs: command.elapsedMs, hintLevel: Math.max(0, ...this.store.select('diagnosticHints', { sessionId: sessionId, itemId: mapping.id }).map((item) => item.level)),
      observationCode: grade.correct === false ? command.disposition === 'dont_know' ? 'reported_dont_know' : mapping.observationCode : null,
      gradingReason: grade.reason, retentionDelayDays: session.intent === 'retest' ? delay : null,
      priorExposure: session.exposedQuestionIds?.includes(mapping.questionId) ?? false,
      submittedAt: new Date().toISOString(), gradingVersion: 'deterministic-rubric-v2', requestKey: command.requestKey ?? `${sessionId}:${mapping.id}`,
      ...(atom && session.atomSnapshots ? { atomVersion: atom.version, atomDefinitionFingerprint: atomDefinitionFingerprint(atom) } : {}),
    };
    this.store.append('diagnosticResponses', response);
    this.media.bind(mediaIds, response.id);
    this.store.remove('diagnosticDrafts', { sessionId, itemId: mapping.id });
    this.events.publish('diagnostic.response_saved', { sessionId, responseId: response.id, studentId: session.studentId });
    return { saved: true, responseId: response.id, idempotent: false, status: response.status };
  }

  hint(user: InMemoryUserAccount, sessionId: string, itemId: string) {
    const session = this.requireSession(user, sessionId);
    if (session.status !== 'in_progress' || Boolean(this.store.find('diagnosticResponses', { sessionId: sessionId, itemId: itemId }))) throw new BadRequestException('当前题目已提交');
    const mapping = session.itemSnapshots.find((item) => item.id === itemId);
    if (!mapping) throw new NotFoundException('题目不存在');
    const atom = session.atomSnapshots?.find(atom => atom.id === mapping.atomId);
    const previous = this.store.select('diagnosticHints', { sessionId: sessionId, itemId: itemId });
    const level = Math.min(previous.length + 1, 2);
    this.store.append('diagnosticHints', { id: this.store.nextId('diagnostic_hint'), sessionId, itemId, level, at: new Date().toISOString() });
    return { level, hint: level === 1 ? `先确认这道题要你完成什么，再想一想“${atom?.name ?? '当前任务'}”的关键条件。` :
      `试着把任务拆成小步骤：${atom?.objective ?? '先列出已知条件与要求解决的目标'}。完成一步就核对一次条件。`, notice: '提示后的表现会与首次独立作答分开记录。' };
  }

  complete(user: InMemoryUserAccount, sessionId: string) {
    const session = this.requireSession(user, sessionId);
    if (session.status === 'completed') return this.report(user, sessionId);
    const answered = new Set(this.store.select('diagnosticResponses', { sessionId: sessionId }).map((item) => item.itemId));
    if (!session.itemIds.every((id) => answered.has(id))) throw new BadRequestException('请完成剩余题目，或明确选择跳过');
    session.status = 'completed'; session.completedAt = new Date().toISOString();
    if (session.reviewTaskId) {
      const review = this.store.find('reviewTasks', { id: session.reviewTaskId });
      if (review) review.status = 'completed';
    }
    this.refreshHypotheses(session.studentId, session.subject);
    const report = this.buildReport(session);
    this.store.append('diagnosticReports', { id: this.store.nextId('report'), sessionId, version: 1, createdAt: session.completedAt, report });
    this.events.publish('diagnostic.completed', { sessionId, studentId: session.studentId, scoredCount: report.scoredCount, pendingReviewCount: report.pendingReviewCount });
    return report;
  }

  allMappings(studentId?: string) {
    const mappings = new Map<string, MeasurementItem>();
    for (const item of this.store.inspect('measurementItems')) { mappings.set(item.id, item); mappings.set(`${item.id}@${item.version}`, item); }
    for (const session of studentId ? this.store.select('diagnosticSessions', { studentId }) : this.store.diagnosticSessions) for (const item of session.itemSnapshots) mappings.set(`${item.id}@${item.version}`, item);
    return mappings;
  }

  effectiveResponses(studentId: string, subject: Subject) {
    const sessions = new Set(this.store.select('diagnosticSessions', { studentId: studentId, subject: subject }).map((item) => item.id));
    return this.store.select('diagnosticResponses', { sessionId: [...sessions] }).map((item) => {
      const revision = this.store.select('scoringRevisions', { responseId: item.id }).sort((a, b) => b.version - a.version)[0];
      return revision ? { ...item, score: revision.score, correct: revision.score === 1, status: 'scored' as const,
        gradingReason: revision.reason, gradingVersion: `review-v${revision.version}` } : item;
    });
  }

  refreshHypotheses(studentId: string, subject: Subject) {
    const atoms = this.store.select('knowledgeAtoms', { subject });
    const next = deriveHypotheses(studentId, subject, atoms,
      this.definitionEvidence(atoms, this.effectiveResponses(studentId, subject), studentId).compatible,
      this.allMappings(studentId), this.store.select('diagnosticHypotheses', { studentId, subject }), new Date().toISOString());
    for (const hypothesis of next) {
      const existing = this.store.find('diagnosticHypotheses', { id: hypothesis.id });
      if (existing) Object.assign(existing, hypothesis); else this.store.append('diagnosticHypotheses', hypothesis);
    }
    for (const old of this.store.select('diagnosticHypotheses', { studentId, subject }).filter(entry => !next.some(item => item.id === entry.id) && entry.status !== 'withdrawn')) {
      old.status = 'withdrawn'; old.updatedAt = new Date().toISOString();
      old.history.push({ at: old.updatedAt, status: 'withdrawn', reason: '当前有效评分不再支持原假设，保留历史供追溯，不作为已验证改善。' });
    }
    return next;
  }

  profile(user: InMemoryUserAccount, studentId: string, subject: Subject) {
    this.students.assertCanAccessStudent(user, studentId);
    const scope = this.curriculum.getScope(user, studentId, subject);
    const atoms = this.store.inspect('knowledgeAtoms').filter((item) => item.subject === subject && item.status === 'published' &&
      (!scope || item.grade <= scope.grade));
    const compatibility = this.definitionEvidence(atoms, this.effectiveResponses(studentId, subject), studentId);
    const weighted = weightedEvidence(compatibility.compatible, this.allMappings(studentId), new Date());
    return { studentId, subject, scope, estimates: atoms.map((atom) => estimateMastery(atom, weighted)),
      hypotheses: this.store.select('diagnosticHypotheses', { studentId, subject }).filter(hypothesis => atoms.some(atom =>
        atom.id === hypothesis.atomId && atomDefinitionFingerprint(atom) === hypothesis.atomDefinitionFingerprint)),
      definitionCompatibility: { incompatibleEvidenceIds: compatibility.incompatibleEvidenceIds, unverifiedEvidenceIds: compatibility.unverifiedEvidenceIds },
      modelVersion: MEASUREMENT_VERSION };
  }

  report(user: InMemoryUserAccount, sessionId: string) {
    const session = this.requireSession(user, sessionId);
    const saved = this.store.select('diagnosticReports', { sessionId: sessionId }).sort((a, b) => b.version - a.version)[0];
    return saved ? { ...this.reportOrigin(saved.report), version: saved.version, generatedAt: saved.createdAt } : this.buildReport(session);
  }

  reportHistory(user: InMemoryUserAccount, sessionId: string) {
    this.requireSession(user, sessionId);
    return this.store.select('diagnosticReports', { sessionId: sessionId }).sort((a, b) => b.version - a.version)
      .map((item) => ({ ...this.reportOrigin(item.report), version: item.version, generatedAt: item.createdAt }));
  }

  private reportOrigin(report: DiagnosticReport): DiagnosticReport {
    return report.definitionContext ? report : { ...report, definitionContext: { origin: 'unavailable', atoms: [],
      incompatibleEvidenceIds: [], unverifiedEvidenceIds: report.evidence.map(item => item.id) },
      modelNotice: report.modelNotice + ' 此历史报告未保存知识定义快照，保留原估计供查阅，不能直接与当前定义比较。' };
  }

  private buildReport(session: DiagnosticSession): DiagnosticReport {
    const all = this.effectiveResponses(session.studentId, session.subject).filter((item) => !session.completedAt || item.submittedAt <= session.completedAt);
    const evidence = all.filter((item) => item.sessionId === session.id);
    const atoms = this.definitionsForSession(session);
    const compatibility = this.definitionEvidence(atoms, all, session.studentId, !!session.atomSnapshots);
    const weighted = weightedEvidence(compatibility.compatible, this.allMappings(session.studentId), new Date(session.completedAt ?? Date.now()));
    const estimates = atoms.map((atom) => estimateMastery(atom, weighted));
    const scored = evidence.filter((item) => item.status === 'scored' && item.score !== null);
    const pending = evidence.filter((item) => item.status === 'pending_review').length;
    const insufficient = estimates.filter((item) => item.status === 'unknown' || item.status === 'insufficient').length;
    const measuredAt = session.completedAt ?? new Date().toISOString();
    const previous = this.store.select('diagnosticHypotheses', { studentId: session.studentId, subject: session.subject })
      .flatMap((item) => {
        const history = item.history.filter((entry) => entry.at <= measuredAt), latest = history.at(-1);
        return latest ? [{ ...item, status: latest.status as DiagnosticHypothesis['status'], updatedAt: latest.at, history }] : [];
      });
    return { sessionId: session.id, studentId: session.studentId, subject: session.subject, status: session.status,
      answeredCount: evidence.length, totalCount: session.itemIds.length, scoredCount: scored.length, pendingReviewCount: pending,
      rawScore: scored.length ? Math.round(scored.reduce((sum, item) => sum + item.score!, 0) / scored.length * 100) : null,
      coverage: session.coverage, estimates,
      hypotheses: deriveHypotheses(session.studentId, session.subject, atoms,
        compatibility.compatible, this.allMappings(session.studentId), previous, measuredAt),
      evidence, unmeasuredAtomIds: estimates.filter((item) => !item.scoredCount).map((item) => item.atomId),
      scopeSnapshot: structuredClone(session.scopeSnapshot),
      scoringRevisionIds: this.store.scoringRevisions.filter((revision) => all.some((item) => item.id === revision.responseId)).map((item) => item.id),
      definitionContext: { origin: session.atomSnapshots ? 'started' : 'unavailable',
        atoms: (session.atomSnapshots ?? []).map(atom => ({ id: atom.id, name: atom.name, version: atom.version, objective: atom.objective,
          successCriterion: atom.successCriterion, fingerprint: session.atomSnapshots ? atomDefinitionFingerprint(atom) : null })),
        incompatibleEvidenceIds: compatibility.incompatibleEvidenceIds, unverifiedEvidenceIds: compatibility.unverifiedEvidenceIds },
      summary: `本次已评分 ${scored.length} 题，${pending} 题待复核；${insufficient} 个知识点仍需补充证据。下一步优先核查具体知识与步骤。`,
      modelNotice: '掌握度为规则估计，区间表示现有证据的不确定性；尚未建立标准化常模。一次表现不能确定深层原因。' };
  }

  reviewScore(user: InMemoryUserAccount, responseId: string, input: unknown) {
    const response = this.store.find('diagnosticResponses', { id: responseId });
    if (!response) throw new NotFoundException('作答证据不存在');
    this.students.assertCanReviewStudent(user, response.studentId);
    const session = this.store.find('diagnosticSessions', { id: response.sessionId })!;
    if (session.status !== 'completed' || response.disposition !== 'answered') throw new BadRequestException('只可复核已结束评测中的有效作答');
    const snapshot = session.questionSnapshots.find((item) => item.id === response.questionId)!;
    const previous = this.store.select('scoringRevisions', { responseId: responseId });
    const prepared = prepareScoringReview(input, snapshot.answerSchema as QuestionAnswerSchema, previous);
    if (prepared.existing) return prepared.existing;
    const revision = { id: this.store.nextId('scoring_revision'), responseId, ...prepared.data!, reviewerId: user.id,
      createdAt: new Date().toISOString() };
    this.store.append('scoringRevisions', revision);
    this.refreshHypotheses(response.studentId, session.subject);
    // Later reports also used this evidence. Retain every earlier snapshot when rebuilding them.
    for (const affected of this.store.select('diagnosticSessions', { studentId: session.studentId, subject: session.subject }).filter((item) =>
      item.status === 'completed' && item.completedAt! >= response.submittedAt && (item.id === session.id ||
        this.definitionEvidence(this.definitionsForSession(item), [response], item.studentId, !!item.atomSnapshots).compatible.length > 0 ||
        (!item.atomSnapshots && this.store.select('diagnosticReports', { sessionId: item.id }).some(saved =>
          saved.report.estimates.some(estimate => estimate.evidenceIds.includes(response.id))))))) {
      this.store.append('diagnosticReports', { id: this.store.nextId('report'), sessionId: affected.id,
        version: Math.max(0, ...this.store.select('diagnosticReports', { sessionId: affected.id }).map((item) => item.version)) + 1,
        createdAt: revision.createdAt, report: { ...this.buildReport(affected), revisionReason: '作答证据经人工复核，已重新计算依赖该证据的报告。' } });
    }
    this.events.publish('diagnostic.score_reviewed', { responseId, revisionId: revision.id, actorId: user.id });
    return revision;
  }
}
