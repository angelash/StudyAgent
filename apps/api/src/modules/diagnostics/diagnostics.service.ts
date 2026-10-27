import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DiagnosticHypothesis, DiagnosticReport, DiagnosticResponse, DiagnosticSession, DiagnosticStart, MeasurementItem,
  DiagnosticBlueprintReservation, DiagnosticBlueprintView, DiagnosticVerificationBlueprint, KnowledgeAtom, LearningScope, QuestionAnswerSchema, QuestionRenderPayload, Subject,
  answerInputConfiguration, answerProtocolIssue, answerDraftSaveSchema, diagnosticResponseInputSchema, diagnosticStartSchema } from '@study-agent/contracts';
import { answerIdentity, answerDraftState, prepareAnswerDraft, assertAnswerDraftFence, sameAnswer } from '../../common/answer-draft';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { validate } from '../../common/validation';
import { StudentsService } from '../students/students.service';
import { QuestionWorkspaceService } from '../question-workspace/question-workspace.service';
import { CurriculumService, eligibleMeasurements } from './curriculum.service';
import { deriveHypotheses, DIAGNOSIS_VERSION } from './diagnosis';
import { estimateMastery, MEASUREMENT_VERSION, weightedEvidence } from './measurement';
import { gradeResponse } from './scoring';
import { prepareScoringReview } from './scoring-review';
import { StudentMediaService } from '../student-media/student-media.service';
import { mediaModeAvailable } from '../student-media/media-normalization';
import { atomDefinitionFingerprint, compatibleDefinitionEvidence } from './measurement-definition';
import { blueprintContentHash, selectBlueprintItems } from './assessment-blueprint';
import { advanceRouting, initializeRouting, routedItemAvailable, routedItems } from './adaptive-routing';
import { observedPerformance } from './observations';
import { componentObservations } from './component-observations';
import { verificationBlueprint, verificationResult } from './verification-blueprint';
import { FAMILY_IDENTITY_VERSION, canonicalFamily, familyIdentityAffectsAtom } from './family-identity';
import { reportAnalysisCompatibility } from './measurement-compatibility';
import { originalPaperExposure } from './paper-exposure';

@Injectable()
export class DiagnosticsService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly curriculum: CurriculumService, private readonly workspace: QuestionWorkspaceService,
    private readonly events: DomainEventBusService, private readonly media: StudentMediaService) {}

  start(user: InMemoryUserAccount, input: unknown, scopeOverride?: LearningScope) {
    return this.activateSession(user, this.prepareSession(user, input, scopeOverride));
  }

  private prepareSession(user: InMemoryUserAccount, input: unknown, scopeOverride?: LearningScope, seed: string = randomUUID(), allowEmpty = false): DiagnosticSession {
    const command = validate(diagnosticStartSchema, input);
    if (command.adaptive && command.intent === 'retest') throw new BadRequestException('间隔复测使用预先固定的对照题组，请关闭在线分支后重试');
    this.students.assertCanAccessStudent(user, command.studentId);
    const review = command.reviewTaskId ? this.store.find('reviewTasks', { id: command.reviewTaskId, studentId: command.studentId, subject: command.subject }) : undefined;
    if (command.reviewTaskId && (!review || command.intent !== 'retest' || (command.planId && command.planId !== review.planId))) throw new BadRequestException('复测任务与当前评测不匹配');
    const planId = review?.planId ?? command.planId;
    const plan = planId ? this.store.find('diagnosticPlans', { id: planId, studentId: command.studentId, subject: command.subject }) : undefined;
    if (planId && !plan) throw new NotFoundException('指导计划不存在');
    if (review?.sessionId) return this.requireSession(user, review.sessionId);
    if (plan) {
      if (!['verification', 'retest'].includes(command.intent)) throw new BadRequestException('指导计划只能关联验证或复测');
      if (plan.status !== 'active') throw new BadRequestException('请先启用指导计划');
      const baselineVersion = plan.baselineReportVersion ?? this.store.diagnosticReports.filter(r => r.sessionId === plan.baselineSessionId && r.createdAt <= plan.createdAt)
        .sort((a, b) => b.version - a.version)[0]?.version ?? 1;
      const baselineReport = this.report(user, plan.baselineSessionId);
      if (this.analysisCompatibility(baselineReport).requiresReanalysis) throw new ConflictException('能力或题族计量方法已更新或原依据无法核对，请先重新分析原报告并核对指导计划');
      if (baselineVersion !== (baselineReport.version ?? 1)) throw new ConflictException('评测依据已修订，请先核对指导计划');
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
    let targets = command.targetAtomIds ?? (review ? [review.atomId] : plan ? plan.actions.map(a => a.atomId) :
      command.intent === 'micro' ? [scope.currentAtomId ?? scope.learnedAtomIds.at(-1)!] : scope.learnedAtomIds);
    if (command.intent === 'micro' && targets.length > 3) throw new BadRequestException('微测最多选择3个知识目标；扩大范围时请选择单元或阶段评测');
    let hypothesis: DiagnosticHypothesis | undefined, specification: DiagnosticVerificationBlueprint | undefined;
    if (command.hypothesisId) {
      hypothesis = this.store.find('diagnosticHypotheses', { id: command.hypothesisId, studentId: command.studentId, subject: command.subject });
      if (!hypothesis) throw new NotFoundException('待验证问题不存在');
      if (hypothesis.ruleVersion !== DIAGNOSIS_VERSION && familyIdentityAffectsAtom(hypothesis.atomId)) {
        throw new ConflictException('原因核查方法已更新，请先重新分析原报告或完成新评测');
      }
      if (command.intent !== 'verification') throw new BadRequestException('原因核查应使用验证评测；间隔保持请从复测任务开始');
      if (hypothesis.cause === 'retention_gap') throw new BadRequestException('保持情况需要真实间隔，请通过指导计划的到期复测验证');
      if (hypothesis.status === 'withdrawn') throw new ConflictException('该问题已撤回，请根据当前评测重新确认需要核查的行为');
      const definition = this.store.find('knowledgeAtoms', { id: hypothesis.atomId });
      if (!definition || hypothesis.atomDefinitionFingerprint !== atomDefinitionFingerprint(definition)) {
        throw new ConflictException('该问题的知识定义已变化或无法核对，请重新评测后再验证原因');
      }
      specification = verificationBlueprint(hypothesis, definition, blueprintContentHash(hypothesis));
      for (const group of specification.groups) group.atomName = this.store.find('knowledgeAtoms', { id: group.atomId })?.name;
      const hypothesisAtoms = new Set(specification.groups.map(group => group.atomId));
      targets = command.targetAtomIds ?? [...hypothesisAtoms].filter(id => allowed.has(id));
      if (targets.some((id) => !hypothesisAtoms.has(id))) throw new BadRequestException('验证点超出当前假设的对照范围');
    }
    targets = [...new Set(targets)];
    if (review && (targets.length !== 1 || targets[0] !== review.atomId)) throw new BadRequestException('本次复测只针对安排中的知识目标');
    if (plan && targets.some(id => !plan.actions.some(a => a.atomId === id))) throw new BadRequestException('验证目标不属于当前指导计划');
    if (!targets.length || targets.some((id) => !allowed.has(id))) throw new BadRequestException('评测知识点超出已确认的学习进度');
    const targetSet = new Set(targets);
    if (command.includePrerequisites && !specification) for (const id of this.curriculum.prerequisiteClosure(targets)) targetSet.add(id);
    // Rendering a practice item is already exposure, even if its answer was never submitted.
    // Training and abandoned assessments must not later be presented as independent new probes.
    const seen = new Set([
      ...this.store.select('diagnosticSessions', { studentId: command.studentId }).flatMap((item) => item.questionSnapshots.map((entry) => entry.id)),
      ...this.store.select('practiceSessions', { studentId: command.studentId }).flatMap((item) => item.questionIds),
      ...originalPaperExposure(this.store, command.studentId),
    ]);
    const atomMap = new Map(this.store.inspect('knowledgeAtoms').map((item) => [item.id, item]));
    const candidates = eligibleMeasurements(this.store, [...targetSet]).filter((item) => {
      const atom = atomMap.get(item.atomId);
      return targetSet.has(item.atomId) && atom?.subject === scope.subject && atom.grade <= scope.grade &&
        (!['verification', 'retest'].includes(command.intent) || !seen.has(item.questionId));
    });
    const coverage = [...targetSet].map((atomId) => ({ atomId, selected: 0, required: 2,
      role: (hypothesis ? atomId === hypothesis.atomId ? 'target' : 'prerequisite' : targets.includes(atomId) ? 'target' : 'prerequisite') as 'target' | 'prerequisite' }));
    const { selected, blueprint } = selectBlueprintItems(command, candidates, coverage, seed, seen, scope.minutesPerSession, scope.grade, specification);
    if (!selected.length && !allowEmpty) throw new BadRequestException({ message: '当前范围缺少审核通过的量化题，请查看覆盖缺口或调整已学范围',
      missingAtomIds: targets, code: 'assessment_coverage_gap' });
    const session: DiagnosticSession = {
      id: this.store.nextId('diagnostic'), studentId: command.studentId, subject: command.subject, intent: command.intent,
      status: 'in_progress', revision: 1, blueprint, scopeSnapshot: structuredClone(scope), itemIds: selected.map((item) => item.id), itemSnapshots: selected,
      atomSnapshots: structuredClone(this.store.select('knowledgeAtoms', { id: [...new Set([...scope.learnedAtomIds, ...targetSet])] })),
      componentAtomSnapshots: structuredClone(this.store.select('knowledgeAtoms', { id: [...new Set(selected.flatMap(item => item.componentBindings?.map(binding => binding.atomId) ?? []))] })),
      questionSnapshots: selected.map((item) => {
        const question = this.store.find('questions', { id: item.questionId })!;
        const payload = this.workspace.buildRenderPayload(question.id);
        return structuredClone({ id: question.id, stem: question.stem, answer: question.answer, analysis: question.analysis,
          document: payload.document, answerSchema: payload.answerSchema, renderPayload: payload, questionType: question.type });
      }), coverage, selectionReasons: Object.fromEntries(selected.map((item) => [item.id,
        `${learned.has(item.atomId) ? '已学范围' : '前置基础核查'} · ${item.dimension} · 独立题族 ${canonicalFamily(item)}${seen.has(item.questionId) ? ' · 已接触或选入练习，不增加独立样本' : ''}`])),
      seed, algorithmVersion: blueprint.version, startedAt: new Date().toISOString(), completedAt: null,
      exposedQuestionIds: selected.filter((item) => seen.has(item.questionId)).map((item) => item.questionId),
      hypothesisId: command.hypothesisId ?? null, reviewTaskId: command.reviewTaskId ?? null,
      ...(plan ? { planId: plan.id, planRevision: plan.revision ?? 1 } : {}),
    };
    return session;
  }

  private activateSession(user: InMemoryUserAccount, session: DiagnosticSession) {
    if (this.store.find('diagnosticSessions', { id: session.id })) return this.sessionView(user, session.id);
    initializeRouting(session);
    if (session.reviewTaskId) {
      const task = this.store.find('reviewTasks', { id: session.reviewTaskId, studentId: session.studentId });
      if (!task || task.status !== 'pending' || !session.coverage.some(point => point.atomId === task.atomId)) throw new BadRequestException('复测任务不可用');
      task.status = 'in_progress'; task.sessionId = session.id;
    }
    this.store.append('diagnosticSessions', session);
    if (session.hypothesisId) {
      const hypothesis = this.store.find('diagnosticHypotheses', { id: session.hypothesisId })!;
      hypothesis.status = 'testing'; hypothesis.history.push({ at: session.startedAt, status: 'testing', ruleVersion: hypothesis.ruleVersion,
        reason: `开始验证评测 ${session.id}` });
    }
    this.events.publish('diagnostic.started', { sessionId: session.id, studentId: session.studentId, scopeId: session.scopeSnapshot.id, itemCount: session.itemIds.length });
    return this.sessionView(user, session.id);
  }

  private blueprintFingerprint(session: DiagnosticSession) {
    return blueprintContentHash({ scope: session.scopeSnapshot, atoms: session.atomSnapshots, componentAtoms: session.componentAtomSnapshots,
      items: session.itemSnapshots, questions: session.questionSnapshots, coverage: session.coverage,
      blueprint: session.blueprint, exposed: session.exposedQuestionIds, planRevision: session.planRevision, hypothesisId: session.hypothesisId });
  }

  previewBlueprint(user: InMemoryUserAccount, input: unknown): DiagnosticBlueprintView {
    const { requestKey, ...command } = validate(diagnosticStartSchema.extend({ requestKey: z.string().min(8).max(180) }).strict(), input);
    this.students.assertCanAccessStudent(user, command.studentId);
    const id = `blueprint:${createHash('sha256').update(JSON.stringify([user.id, requestKey])).digest('hex')}`;
    const requestHash = createHash('sha256').update(JSON.stringify(command)).digest('hex');
    const existing = this.store.find('diagnosticBlueprints', { id });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new ConflictException('请求键已用于另一份评测蓝图');
      return this.blueprintView(user, existing);
    }
    const seed = randomUUID(), draft = this.prepareSession(user, command, undefined, seed, true);
    if (this.store.find('diagnosticSessions', { id: draft.id })) throw new ConflictException('该复测已经开始，请继续原评测');
    const createdAt = new Date().toISOString();
    const reservation: DiagnosticBlueprintReservation = { id, studentId: draft.studentId, actorId: user.id, command, seed,
      fingerprint: this.blueprintFingerprint(draft), createdAt, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), sessionId: null, requestHash,
      blueprint: draft.blueprint!, scopeSnapshot: draft.scopeSnapshot, coverage: draft.coverage,
      atomNames: draft.atomSnapshots!.filter(atom => draft.coverage.some(point => point.atomId === atom.id)).map(atom => ({ id: atom.id, name: atom.name })), itemCount: draft.itemIds.length };
    this.store.append('diagnosticBlueprints', reservation);
    return this.blueprintView(user, reservation);
  }

  private requireBlueprint(user: InMemoryUserAccount, id: string) {
    const blueprint = this.store.find('diagnosticBlueprints', { id, actorId: user.id });
    if (!blueprint) throw new NotFoundException('评测蓝图不存在');
    this.students.assertCanAccessStudent(user, blueprint.studentId); return blueprint;
  }
  private blueprintView(user: InMemoryUserAccount, reservation: DiagnosticBlueprintReservation): DiagnosticBlueprintView {
    this.students.assertCanAccessStudent(user, reservation.studentId);
    const { actorId: _actor, command: _command, seed: _seed, fingerprint: _fingerprint, requestHash: _requestHash, paperReviewOrigin, ...view } = reservation;
    const origin = paperReviewOrigin ? { sessionId: paperReviewOrigin.sessionId, itemId: paperReviewOrigin.itemId, atomId: paperReviewOrigin.atomId, createdAt: paperReviewOrigin.createdAt } : undefined;
    const expired = Date.parse(reservation.expiresAt) <= Date.now();
    return { ...view, ...(origin ? { paperReviewOrigin: origin } : {}), expired, canStart: !!reservation.sessionId || reservation.itemCount > 0 && !expired };
  }
  getBlueprint(user: InMemoryUserAccount, id: string) { return this.blueprintView(user, this.requireBlueprint(user, id)); }
  startBlueprint(user: InMemoryUserAccount, id: string) {
    const reservation = this.requireBlueprint(user, id);
    if (reservation.sessionId) return this.sessionView(user, reservation.sessionId);
    if (Date.parse(reservation.expiresAt) <= Date.now()) throw new ConflictException('这份蓝图已过期，请重新查看范围与题组');
    if (!reservation.itemCount) throw new BadRequestException('当前范围缺少可用题组，请补充覆盖或调整范围后重新预览');
    const draft = this.prepareSession(user, reservation.command, undefined, reservation.seed, true);
    if (this.store.find('diagnosticSessions', { id: draft.id }) || this.blueprintFingerprint(draft) !== reservation.fingerprint) {
      throw new ConflictException('学习范围、题目、定义或已有学习证据发生变化，请重新预览本次题组');
    }
    if (reservation.paperReviewOrigin) { const { inputHash: _hash, ...origin } = reservation.paperReviewOrigin; draft.paperReviewOrigin = structuredClone(origin); }
    const result = this.activateSession(user, draft); reservation.sessionId = result.id;
    return result;
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
    const original = session.paperReviewOrigin ? this.store.find('paperPracticeSessions', { id: session.paperReviewOrigin.sessionId }) : null;
    const originVisible = original && (original.ownerUserId === user.id || original.studentId === session.studentId && this.store.find('users', { id: original.ownerUserId, role: 'student' }));
    return { id: session.id, studentId: session.studentId, subject: session.subject, intent: session.intent,
      ...(originVisible ? { paperReviewOrigin: session.paperReviewOrigin } : {}),
      status: session.status, scopeSnapshot: session.scopeSnapshot, coverage: session.coverage,
      startedAt: session.startedAt, completedAt: session.completedAt, endedAt: session.endedAt ?? null,
      revision: session.revision ?? 1, blueprint: session.blueprint,
      routing: session.routing ? { version: session.routing.version, mode: 'adaptive', currentItemId: session.routing.currentItemId,
        notice: '本组根据刚才的作答逐步选择核查顺序；题量和范围沿用开始前的确认，不即时判定深层原因。',
        decisions: ['completed', 'aborted'].includes(session.status) ? session.routing.decisions : undefined } : null,
      stateHistory: session.stateHistory?.map(({ action, at, reason, revision }) => ({ action, at, reason, revision })) ?? [],
      answeredCount: responses.length, totalCount: session.itemIds.length,
      planId: session.planId ?? null, planRevision: session.planRevision ?? null,
      items: routedItems(session).map((item) => ({ id: item.id, questionId: item.questionId, atomId: item.atomId, dimension: item.dimension,
        atomName: this.definitionsForSession(session).find(atom => atom.id === item.atomId)?.name ?? item.atomId,
        reason: session.selectionReasons[item.id], answered: responses.some((response) => response.itemId === item.id) })) };
  }

  changeState(user: InMemoryUserAccount, sessionId: string, input: unknown) {
    const session = this.requireSession(user, sessionId);
    const command = validate(z.object({ action: z.enum(['pause', 'resume', 'abort']), expectedRevision: z.number().int().positive(),
      requestKey: z.string().min(8).max(180), reason: z.string().trim().min(5).max(1000) }).strict(), input);
    const requestHash = createHash('sha256').update(JSON.stringify(command)).digest('hex');
    const previous = session.stateHistory?.find(event => event.actorId === user.id && event.requestKey === command.requestKey);
    if (previous) {
      if (previous.requestHash !== requestHash) throw new ConflictException('请求键已用于另一项评测状态操作');
      return this.sessionView(user, sessionId);
    }
    if ((session.revision ?? 1) !== command.expectedRevision) throw new ConflictException('评测状态已经变化，请刷新后再操作');
    if (['completed', 'aborted'].includes(session.status)) throw new BadRequestException('已结束评测保留为历史，不能重新开启');
    if (command.action === 'pause' && session.status !== 'in_progress') throw new BadRequestException('只有进行中的评测可以暂停');
    if (command.action === 'resume' && session.status !== 'paused') throw new BadRequestException('只有暂停的评测可以继续');
    const at = new Date().toISOString();
    session.status = command.action === 'abort' ? 'aborted' : command.action === 'pause' ? 'paused' : 'in_progress';
    session.revision = (session.revision ?? 1) + 1;
    (session.stateHistory ??= []).push({ ...command, actorId: user.id, at, requestHash, revision: session.revision });
    if (session.status === 'aborted') {
      session.endedAt = at;
      if (session.reviewTaskId) {
        const task = this.store.find('reviewTasks', { id: session.reviewTaskId, sessionId });
        if (task) { task.status = 'pending'; task.sessionId = null; }
      }
      if (session.hypothesisId && !this.store.select('diagnosticSessions', { studentId: session.studentId, hypothesisId: session.hypothesisId, status: ['in_progress', 'paused'] }).some(item => item.id !== sessionId)) {
        const hypothesis = this.store.find('diagnosticHypotheses', { id: session.hypothesisId });
        if (hypothesis?.status === 'testing') {
          hypothesis.status = 'proposed'; hypothesis.updatedAt = at;
          hypothesis.history.push({ at, status: 'proposed', ruleVersion: hypothesis.ruleVersion,
            reason: '本轮验证提前结束，已答证据保留，原因仍需进一步核查。' });
        }
      }
      this.refreshHypotheses(session.studentId, session.subject);
      this.store.append('diagnosticReports', { id: this.store.nextId('report'), sessionId, version: 1, createdAt: at,
        report: { ...this.buildReport(session), revisionReason: '本组提前结束。仅记录已答表现，未作答内容不计为错误，也不代表评测已完整完成。' } });
    }
    this.events.publish(`diagnostic.${command.action}`, { sessionId, studentId: session.studentId, revision: session.revision, actorId: user.id });
    return this.sessionView(user, sessionId);
  }

  renderItem(user: InMemoryUserAccount, sessionId: string, itemId: string) {
    const session = this.requireSession(user, sessionId);
    const mapping = session.itemSnapshots.find((item) => item.id === itemId);
    if (!mapping) throw new NotFoundException('题目不属于当前评测');
    if (!routedItemAvailable(session, itemId)) throw new ConflictException('请先完成当前核查题，后续题目按本次作答继续安排');
    const question = session.questionSnapshots.find((item) => item.id === mapping.questionId)!;
    const payload = structuredClone(question.renderPayload) as QuestionRenderPayload;
    payload.answerSchema.gradingConfig = {};
    payload.inputAvailability = { supported: mediaModeAvailable(payload.answerSchema.mode), reason: mediaModeAvailable(payload.answerSchema.mode) ? '' : '本次音频作答暂时不可用，请先跳过并反馈给老师。' };
    payload.source.sourcePathOrUrl = ''; payload.source.notes = null; payload.source.importJobId = null;
    const draft = this.store.find('diagnosticDrafts', { sessionId: sessionId, itemId: itemId });
    const draftState = this.draftState(session, itemId, user.id);
    return { itemId, atomId: mapping.atomId, reason: session.selectionReasons[itemId], payload,
      draft: draftState.hasSubmission ? null : draft?.answer ?? null, draftState };
  }

  private draftState(session: DiagnosticSession, itemId: string, actorId: string) {
    const mapping = session.itemSnapshots.find(item => item.id === itemId)!, snapshot = session.questionSnapshots.find(item => item.id === mapping.questionId)!;
    const schema = snapshot.answerSchema as QuestionAnswerSchema;
    const baseHash = answerIdentity(['diagnostic', session.id, itemId, mapping.questionVersion, snapshot.document, schema.mode, schema.responseShape, schema.options]);
    const saved = this.store.find('diagnosticDrafts', { sessionId: session.id, itemId });
    const answered = !!this.store.find('diagnosticResponses', { sessionId: session.id, itemId });
    return answerDraftState(saved, baseHash, 0, session.status === 'in_progress' && !answered && (!session.routing || session.routing.currentItemId === itemId), answered, actorId);
  }

  saveDraft(user: InMemoryUserAccount, sessionId: string, itemId: string, input: unknown) {
    const session = this.requireSession(user, sessionId);
    const command = validate(answerDraftSaveSchema, input);
    if (session.status !== 'in_progress' || !session.itemIds.includes(itemId) || session.routing && session.routing.currentItemId !== itemId || Boolean(this.store.find('diagnosticResponses', { sessionId: sessionId, itemId: itemId }))) {
      throw new BadRequestException('只能保存尚未提交的当前评测题目');
    }
    const mapping = session.itemSnapshots.find(item => item.id === itemId)!;
    const snapshot = session.questionSnapshots.find(item => item.id === mapping.questionId)!;
    const issue = answerProtocolIssue(snapshot.answerSchema as QuestionAnswerSchema, command.answer, true); if (issue) throw new BadRequestException(issue);
    this.media.assertAnswer(user, { kind: 'diagnostic', sessionId, itemId }, command.answer, true);
    const existing = this.store.find('diagnosticDrafts', { sessionId: sessionId, itemId: itemId });
    const prepared = prepareAnswerDraft(existing, this.draftState(session, itemId, user.id), command, user.id);
    if (!prepared.metadata) return prepared.receipt;
    const draft = { id: `draft:${sessionId}:${itemId}`, sessionId, itemId, answer: command.answer, updatedAt: prepared.receipt.updatedAt, ...prepared.metadata };
    if (existing) Object.assign(existing, draft); else this.store.append('diagnosticDrafts', draft);
    return prepared.receipt;
  }

  submit(user: InMemoryUserAccount, sessionId: string, input: unknown) {
    const command = validate(diagnosticResponseInputSchema, input);
    const session = this.requireSession(user, sessionId);
    const mapping = session.itemSnapshots.find((item) => item.id === command.itemId);
    if (!mapping) throw new BadRequestException('题目不属于当前评测');
    if (command.draftFence && !command.requestKey) throw new BadRequestException('恢复作答需要完整的提交标识');
    if (command.draftFence && command.draftFence.actorId !== user.id) throw new ConflictException('提交所属的登录身份已变化，请读取当前账号的活动');
    const commandHash = command.draftFence ? answerIdentity(command) : undefined;
    const priorKey = command.requestKey ? this.store.find('diagnosticResponses', { sessionId, requestKey: command.requestKey }) : undefined;
    if (priorKey && priorKey.itemId !== command.itemId) throw new ConflictException('提交标识已用于另一道题');
    const previous = this.store.find('diagnosticResponses', { sessionId: sessionId, itemId: command.itemId });
    if (previous) {
      if (previous.requestHash && (previous.requestKey !== command.requestKey || previous.requestHash !== commandHash)) throw new ConflictException('首次提交已经保存，请核对原提交，不能用新命令覆盖');
      if (previous.disposition === command.disposition && sameAnswer(previous.answer, command.answer ?? null)) {
        return { saved: true, responseId: previous.id, idempotent: true, status: previous.status };
      }
      throw new ConflictException('首次作答已保存；如需重新验证，请开始新评测');
    }
    if (session.status !== 'in_progress') throw new BadRequestException('评测已结束');
    if (session.routing && session.routing.currentItemId !== command.itemId) throw new ConflictException('核查顺序已经变化，请刷新并完成当前题目');
    const question = session.questionSnapshots.find((item) => item.id === mapping.questionId)!;
    const draft = this.store.find('diagnosticDrafts', { sessionId, itemId: command.itemId });
    assertAnswerDraftFence(this.draftState(session, command.itemId, user.id), command.draftFence, draft?.protocol === 'answer-draft-v2');
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
      priorExposure: Boolean(session.exposedQuestionIds?.includes(mapping.questionId) || originalPaperExposure(this.store, session.studentId).has(mapping.questionId)),
      submittedAt: new Date().toISOString(), gradingVersion: 'deterministic-rubric-v2', requestKey: command.requestKey ?? `${sessionId}:${mapping.id}`,
      ...(commandHash ? { requestHash: commandHash } : {}),
      ...('scoreDetails' in grade && grade.scoreDetails ? { scoreDetails: grade.scoreDetails } : {}),
      ...(atom && session.atomSnapshots ? { atomVersion: atom.version, atomDefinitionFingerprint: atomDefinitionFingerprint(atom) } : {}),
    };
    this.store.append('diagnosticResponses', response);
    this.media.bind(mediaIds, response.id);
    // Keep the v2 revision journal as a tombstone. A stale client cannot reopen or bypass it.
    if (draft?.protocol !== 'answer-draft-v2') this.store.remove('diagnosticDrafts', { sessionId, itemId: mapping.id });
    const next = advanceRouting(session, this.store.select('diagnosticResponses', { sessionId }), response.submittedAt);
    if (session.routing) this.events.publish('diagnostic.routing_advanced', { sessionId, studentId: session.studentId, responseId: response.id,
      nextItemId: next?.itemId ?? null, rule: next?.rule ?? 'finished', routingVersion: session.routing.version });
    this.events.publish('diagnostic.response_saved', { sessionId, responseId: response.id, studentId: session.studentId });
    return { saved: true, responseId: response.id, idempotent: false, status: response.status };
  }

  hint(user: InMemoryUserAccount, sessionId: string, itemId: string) {
    const session = this.requireSession(user, sessionId);
    if (session.status !== 'in_progress' || session.routing && session.routing.currentItemId !== itemId || Boolean(this.store.find('diagnosticResponses', { sessionId: sessionId, itemId: itemId }))) throw new BadRequestException('只能获取尚未提交的当前核查题提示');
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
    if (session.status !== 'in_progress') throw new BadRequestException('请先恢复进行中的评测；已结束评测保留原始证据');
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
    const history = this.store.select('diagnosticSessions', { studentId });
    const sessions = new Set(history.filter(item => item.subject === subject && ['completed', 'aborted'].includes(item.status)).map(item => item.id));
    const starts = new Map(history.map(item => [item.id, Date.parse(item.startedAt)]));
    const firstSeen = new Map<string, number>();
    for (const session of history) for (const question of session.questionSnapshots ?? []) {
      const at = starts.get(session.id)!;
      if (Number.isFinite(at) && at < (firstSeen.get(question.id) ?? Infinity)) firstSeen.set(question.id, at);
    }
    return this.store.select('diagnosticResponses', { sessionId: [...sessions] }).map((item) => {
      // Earlier frozen sessions prove exposure even if an old protocol omitted the flag.
      // Preserve the stored original; this derived view never supplies a missing answer or score.
      const knownEarlier = (firstSeen.get(item.questionId) ?? Infinity) < (starts.get(item.sessionId) ?? -Infinity);
      const response = knownEarlier && !item.priorExposure ? { ...item, priorExposure: true } : item;
      const revision = this.store.select('scoringRevisions', { responseId: item.id }).sort((a, b) => b.version - a.version)[0];
      return revision ? { ...response, score: revision.score, correct: revision.score === 1, status: 'scored' as const,
        gradingReason: revision.reason, gradingVersion: `review-v${revision.version}`,
        scoreDetails: revision.ratings?.map(rating => ({ key: `criterion-${rating.criterionIndex}`, label: revision.rubricSnapshot?.[rating.criterionIndex]?.criterion ?? `量规${rating.criterionIndex + 1}`,
          score: rating.score, origin: 'review' as const, observation: rating.observation })) } : response;
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
      old.ruleVersion = DIAGNOSIS_VERSION; old.familyIdentityVersion = FAMILY_IDENTITY_VERSION;
      old.history.push({ at: old.updatedAt, status: 'withdrawn', ruleVersion: DIAGNOSIS_VERSION,
        reason: '当前有效评分不再支持原假设，保留历史供追溯，不作为已验证改善。' });
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
    const responsesBySession = new Map<string, DiagnosticResponse[]>();
    for (const response of compatibility.compatible) {
      const rows = responsesBySession.get(response.sessionId) ?? []; rows.push(response); responsesBySession.set(response.sessionId, rows);
    }
    return { studentId, subject, scope, estimates: atoms.map((atom) => estimateMastery(atom, weighted)),
      componentObservations: this.store.select('diagnosticSessions', { studentId, subject, status: ['completed', 'aborted'] })
        .flatMap(session => componentObservations(session, responsesBySession.get(session.id) ?? [], atoms)),
      hypotheses: deriveHypotheses(studentId, subject, atoms, compatibility.compatible, this.allMappings(studentId),
        this.store.select('diagnosticHypotheses', { studentId, subject }), new Date().toISOString()),
      definitionCompatibility: { incompatibleEvidenceIds: compatibility.incompatibleEvidenceIds, unverifiedEvidenceIds: compatibility.unverifiedEvidenceIds },
      modelVersion: MEASUREMENT_VERSION, familyIdentityVersion: FAMILY_IDENTITY_VERSION };
  }

  report(user: InMemoryUserAccount, sessionId: string) {
    const session = this.requireSession(user, sessionId);
    if (!['completed', 'aborted'].includes(session.status)) throw new ConflictException('请先完成或明确结束本组，再查看评分与原因报告');
    const saved = this.store.select('diagnosticReports', { sessionId: sessionId }).sort((a, b) => b.version - a.version)[0];
    return saved ? { ...this.reportOrigin(saved.report), version: saved.version, generatedAt: saved.createdAt } : this.buildReport(session);
  }

  reportHistory(user: InMemoryUserAccount, sessionId: string) {
    const session = this.requireSession(user, sessionId);
    if (!['completed', 'aborted'].includes(session.status)) throw new ConflictException('本组结束后才能查看评分与报告历史');
    return this.store.select('diagnosticReports', { sessionId: sessionId }).sort((a, b) => b.version - a.version)
      .map((item) => ({ ...this.reportOrigin(item.report), version: item.version, generatedAt: item.createdAt }));
  }

  analysisStatus(user: InMemoryUserAccount, sessionId: string) {
    const report = this.report(user, sessionId);
    const { originalsAvailable, ...compatibility } = this.analysisCompatibility(report);
    return { ...compatibility,
      canReanalyze: originalsAvailable && !!this.requireSession(user, sessionId).atomSnapshots && ['parent', 'admin'].includes(user.role) };
  }

  analysisCompatibility(report: DiagnosticReport) {
    const sessions = this.store.select('diagnosticSessions', { studentId: report.studentId, subject: report.subject });
    const sources = new Map(sessions.map(session => [session.id, session]));
    const retained = this.effectiveResponses(report.studentId, report.subject).filter(response => {
      const session = sources.get(response.sessionId);
      return session?.questionSnapshots?.some(question => question.id === response.questionId) &&
        session.itemSnapshots?.some(item => item.id === response.itemId && item.version === response.mappingVersion);
    });
    return reportAnalysisCompatibility(report, retained);
  }

  /** A requested rule update appends a report; it cannot manufacture an intervention or overwrite the old result. */
  reanalyzeReport(user: InMemoryUserAccount, sessionId: string, input: unknown) {
    const session = this.requireSession(user, sessionId);
    this.students.assertGuardian(user, session.studentId);
    const command = validate(z.object({ requestKey: z.string().min(8).max(180), expectedReportVersion: z.number().int().positive(),
      reason: z.string().trim().min(5).max(1000) }).strict(), input);
    const inputHash = blueprintContentHash(command);
    const previousRequest = this.store.select('diagnosticReports', { sessionId }).find(row =>
      row.reanalysis?.actorId === user.id && row.reanalysis.requestKey === command.requestKey);
    if (previousRequest) {
      if (previousRequest.reanalysis!.inputHash !== inputHash) throw new ConflictException('请求键已用于另一份报告重分析');
      return { ...this.reportOrigin(previousRequest.report), version: previousRequest.version, generatedAt: previousRequest.createdAt };
    }
    const report = this.report(user, sessionId);
    if ((report.version ?? 1) !== command.expectedReportVersion) throw new ConflictException('报告已有新版本，请重新查看后再分析');
    if (!session.atomSnapshots) throw new ConflictException('历史评测缺少冻结知识定义，请保留原报告并完成新评测');
    const compatibility = this.analysisCompatibility(report);
    if (!compatibility.requiresReanalysis) return report;
    if (!compatibility.originalsAvailable) throw new ConflictException('部分计量原件已不可用，请保留原报告，确认范围后完成新的独立评测');
    this.refreshHypotheses(session.studentId, session.subject);
    const version = (report.version ?? 1) + 1, createdAt = new Date().toISOString();
    this.store.append('diagnosticReports', { id: this.store.nextId('report'), sessionId, version, createdAt,
      reanalysis: { actorId: user.id, requestKey: command.requestKey, inputHash },
      report: { ...this.buildReport(session), revisionReason: `能力或题族计量规则更新，依据保留的原始作答重新分析；数值变化不等同于学习改善。${command.reason}` } });
    this.events.publish('diagnostic.report_reanalyzed', { sessionId, studentId: session.studentId, actorId: user.id,
      previousVersion: report.version ?? 1, version, familyIdentityVersion: FAMILY_IDENTITY_VERSION, measurementVersion: MEASUREMENT_VERSION });
    return this.report(user, sessionId);
  }

  evidenceView(user: InMemoryUserAccount, studentId: string, responseId: string) {
    this.students.assertCanAccessStudent(user, studentId);
    const original = this.store.find('diagnosticResponses', { id: responseId, studentId });
    if (!original) throw new NotFoundException('作答证据不存在');
    const session = this.requireSession(user, original.sessionId);
    if (!['completed', 'aborted'].includes(session.status)) throw new ConflictException('本组结束后才能展开评分与原因依据');
    const response = this.effectiveResponses(studentId, session.subject).find(item => item.id === responseId)!;
    const question = session.questionSnapshots.find(item => item.id === original.questionId)!;
    const mapping = session.itemSnapshots.find(item => item.id === original.itemId)!;
    const payload = question.renderPayload ? structuredClone(question.renderPayload) as QuestionRenderPayload : null;
    if (payload) { payload.answerSchema.gradingConfig = {}; payload.source.sourcePathOrUrl = ''; payload.source.notes = null; payload.source.importJobId = null; }
    const { requestHash: _hash, ...publicResponse } = response, { requestHash: _originalHash, ...publicOriginal } = original;
    return { response: publicResponse, originalResponse: publicOriginal, observation: observedPerformance(response), componentObservations: componentObservations(session, [response]), payload, stem: question.stem,
      referenceAnswer: question.answer, analysis: question.analysis, mapping, scopeSnapshot: session.scopeSnapshot,
      atomSnapshot: session.atomSnapshots?.find(atom => atom.id === original.atomId) ?? null,
      revisions: this.store.select('scoringRevisions', { responseId }).sort((a, b) => a.version - b.version)
        .map(({ version, score, reason, createdAt, ratings, rubricSnapshot }) => ({ version, score, reason, createdAt, ratings, rubricSnapshot })) };
  }

  private reportOrigin(report: DiagnosticReport): DiagnosticReport {
    return report.definitionContext ? report : { ...report, definitionContext: { origin: 'unavailable', atoms: [],
      incompatibleEvidenceIds: [], unverifiedEvidenceIds: report.evidence.map(item => item.id) },
      modelNotice: report.modelNotice + ' 此历史报告未保存知识定义快照，保留原估计供查阅，不能直接与当前定义比较。' };
  }

  private buildReport(session: DiagnosticSession): DiagnosticReport {
    const endedAt = session.completedAt ?? session.endedAt;
    const all = this.effectiveResponses(session.studentId, session.subject).filter((item) => !endedAt || item.submittedAt <= endedAt);
    const evidence = all.filter((item) => item.sessionId === session.id);
    const atoms = this.definitionsForSession(session);
    const compatibility = this.definitionEvidence(atoms, all, session.studentId, !!session.atomSnapshots);
    const weighted = weightedEvidence(compatibility.compatible, this.allMappings(session.studentId), new Date(endedAt ?? Date.now()));
    const estimates = atoms.map((atom) => estimateMastery(atom, weighted));
    const scored = evidence.filter((item) => item.status === 'scored' && item.score !== null);
    const pending = evidence.filter((item) => item.status === 'pending_review').length;
    const insufficient = estimates.filter((item) => item.status === 'unknown' || item.status === 'insufficient').length;
    const measuredAt = endedAt ?? new Date().toISOString();
    const previous = this.store.select('diagnosticHypotheses', { studentId: session.studentId, subject: session.subject })
      .flatMap((item) => {
        const history = item.history.filter((entry) => entry.at <= measuredAt), latest = history.at(-1);
        return latest ? [{ ...item, ruleVersion: latest.ruleVersion ?? (item.history.some(entry => entry.ruleVersion) ? 'legacy-unversioned' : item.ruleVersion),
          status: latest.status as DiagnosticHypothesis['status'], updatedAt: latest.at, history }] : [];
      });
    return { sessionId: session.id, studentId: session.studentId, subject: session.subject, status: session.status,
      familyIdentityVersion: FAMILY_IDENTITY_VERSION, measurementVersion: MEASUREMENT_VERSION,
      answeredCount: evidence.length, totalCount: session.itemIds.length, scoredCount: scored.length, pendingReviewCount: pending,
      rawScore: scored.length ? Math.round(scored.reduce((sum, item) => sum + item.score!, 0) / scored.length * 100) : null,
      coverage: session.coverage, estimates,
      hypotheses: deriveHypotheses(session.studentId, session.subject, atoms,
        compatibility.compatible, this.allMappings(session.studentId), previous, measuredAt),
      evidence, unmeasuredAtomIds: estimates.filter((item) => !item.scoredCount).map((item) => item.atomId),
      observations: evidence.map(observedPerformance),
      componentObservations: componentObservations(session, evidence),
      ...(session.blueprint?.verification ? { verification: verificationResult(session.blueprint.verification, evidence) } : {}),
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
    if (!['completed', 'aborted'].includes(session.status) || response.disposition !== 'answered') throw new BadRequestException('只可复核已结束评测中的有效作答');
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
      ['completed', 'aborted'].includes(item.status) && (item.completedAt ?? item.endedAt ?? '') >= response.submittedAt && (item.id === session.id ||
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
