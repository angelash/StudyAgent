import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { DiagnosticGuidancePlan, GuidanceAction, GuidancePlanRevision, GuidancePlanView, Subject } from '@study-agent/contracts';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { validate } from '../../common/validation';
import { StudentsService } from '../students/students.service';
import { AiService } from '../ai/ai.service';
import { DiagnosticsService } from './diagnostics.service';
import { estimateMastery, weightedEvidence } from './measurement';
import { eligibleMeasurements } from './curriculum.service';

const createPlanSchema = z.object({
  baselineSessionId: z.string().min(1).max(180), minutesPerDay: z.number().int().min(5).max(60),
  useAi: z.boolean().default(true),
}).strict();
const versionedCommand = { expectedRevision: z.number().int().positive().optional(), requestKey: z.string().min(8).max(180).optional() };
const reasonSchema = z.string().trim().min(5).max(1500);
const inputHash = (kind: string, input: unknown) => createHash('sha256').update(JSON.stringify({ kind, input })).digest('hex');

@Injectable()
export class GuidanceService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly diagnostics: DiagnosticsService, private readonly events: DomainEventBusService, private readonly ai: AiService) {}

  async create(user: InMemoryUserAccount, studentId: string, input: unknown) {
    this.students.assertGuardian(user, studentId);
    const command = validate(createPlanSchema, input);
    const session = this.diagnostics.requireSession(user, command.baselineSessionId);
    if (session.studentId !== studentId || session.status !== 'completed') throw new BadRequestException('请先完成当前孩子的评测');
    const report = this.diagnostics.report(user, session.id);
    if (!session.atomSnapshots) throw new BadRequestException('历史评测未保存知识定义，请完成一轮新评测后建立指导计划');
    if (this.diagnostics.changedPlanDefinitions(session, report.estimates.map(estimate => estimate.atomId)).length) {
      throw new ConflictException('知识定义已调整，请按当前定义重新评测后建立计划');
    }
    const atomMap = new Map(this.store.inspect('knowledgeAtoms').map((atom) => [atom.id, atom]));
    const activeHypotheses = report.hypotheses.filter((item) => !['contradicted', 'resolved', 'withdrawn'].includes(item.status));
    const prioritized = [...report.estimates].sort((a, b) => {
      const rootA = activeHypotheses.some((hypothesis) => hypothesis.cause === 'prerequisite_gap' && hypothesis.status === 'supported' && hypothesis.probeAtomIds.includes(a.atomId));
      const rootB = activeHypotheses.some((hypothesis) => hypothesis.cause === 'prerequisite_gap' && hypothesis.status === 'supported' && hypothesis.probeAtomIds.includes(b.atomId));
      return Number(rootB) - Number(rootA) || (a.mastery ?? 0) - (b.mastery ?? 0);
    }).filter((item) => item.status !== 'secure').slice(0, Math.min(3, Math.max(1, Math.floor(command.minutesPerDay / 5))));
    if (!prioritized.length) prioritized.push(...report.estimates.slice(0, 1));
    const now = new Date();
    const perAction = Math.floor(command.minutesPerDay / Math.max(prioritized.length, 1));
    const actions: GuidanceAction[] = prioritized.map((estimate, index) => {
      const atom = atomMap.get(estimate.atomId)!;
      const hypothesis = activeHypotheses.find((item) => item.atomId === atom.id || item.probeAtomIds.includes(atom.id));
      const unknown = estimate.status === 'unknown' || estimate.status === 'insufficient';
      const resourceQuestionIds = eligibleMeasurements(this.store, [atom.id])
        .map((item) => item.questionId).filter((id, position, all) => all.indexOf(id) === position &&
          Boolean(this.store.find('questions', { id: id, status: 'published' })) &&
          this.store.select('questionSources', { questionId: id, reviewStatus: 'approved' }).some(s => s.licenseClass !== 'C_PUBLIC_REFERENCE_ONLY')).slice(0, 4);
      return { id: this.store.nextId('action'), atomId: atom.id, hypothesisId: hypothesis?.id ?? null,
        evidenceIds: estimate.evidenceIds, title: `${unknown ? '先补充证据' : '逐步巩固'}：${atom.name}`,
        activity: unknown ? `先做两个不同题族的独立小测，观察“${atom.objective}”。根据表现决定是否需要讲解。` :
          `先让孩子说清“${atom.objective}”，示范一个关键步骤，再完成新题。${hypothesis?.nextAction ?? '逐步减少提示，并让孩子说明为什么这样做。'}`,
        minutes: perAction + (index === 0 ? command.minutesPerDay % Math.max(prioritized.length, 1) : 0),
        successCriterion: `${atom.successCriterion}；至少两个新题族独立完成，再安排迁移与延迟验证。`,
        resourceQuestionIds, retestAt: new Date(now.getTime() + 86_400_000).toISOString(),
        ...(atom.teaching?.reviewStatus === 'approved' ? { teachingSnapshot: { atomVersion: atom.version, teaching: structuredClone(atom.teaching) } } : {}) };
    });
    const plan: DiagnosticGuidancePlan = {
      id: this.store.nextId('guidance'), studentId, subject: session.subject, baselineSessionId: session.id,
      version: this.store.select('diagnosticPlans', { studentId: studentId, subject: session.subject }).length + 1,
      source: 'rules', status: 'proposed', minutesPerDay: command.minutesPerDay,
      summary: `每天 ${command.minutesPerDay} 分钟，围绕 ${actions.map((item) => atomMap.get(item.atomId)?.name).join('、')} 先验证再指导；复测后调整。`,
      actions, evidenceIds: [...new Set(actions.flatMap((item) => item.evidenceIds))], createdAt: now.toISOString(), aiStatus: 'not_requested',
      revision: 1, baselineReportVersion: report.version ?? 1,
    };
    if (command.useAi) {
      const enrichment = await this.ai.enrichDiagnosticPlan(plan, { scope: session.scopeSnapshot, report });
      plan.aiStatus = enrichment.status;
      if (enrichment.status === 'available' && enrichment.value) {
        plan.source = 'ai'; plan.summary = enrichment.value.summary;
        for (const action of plan.actions) action.activity = enrichment.value.activities.find((item) => item.actionId === action.id)?.activity ?? action.activity;
      }
    }
    this.store.append('diagnosticPlans', plan);
    this.saveRevision(plan, user.id, 'created', '依据当前评测建立指导计划');
    this.events.publish('guidance.proposed', { planId: plan.id, studentId, source: plan.source, baselineSessionId: session.id });
    return this.view(user, plan);
  }

  list(user: InMemoryUserAccount, studentId: string, subject: Subject) {
    this.students.assertCanAccessStudent(user, studentId);
    return this.store.select('diagnosticPlans', { studentId: studentId, subject: subject })
      .sort((a, b) => b.version - a.version).map(plan => this.view(user, plan));
  }

  get(user: InMemoryUserAccount, planId: string) { return this.view(user, this.requirePlan(user, planId)); }
  history(user: InMemoryUserAccount, planId: string) {
    this.requirePlan(user, planId);
    return this.store.select('guidancePlanRevisions', { planId: planId }).sort((a, b) => b.revision - a.revision);
  }
  private requirePlan(user: InMemoryUserAccount, id: string) {
    const plan = this.store.find('diagnosticPlans', { id: id });
    if (!plan) throw new NotFoundException('计划不存在');
    this.students.assertCanAccessStudent(user, plan.studentId); return plan;
  }
  private baseVersion(plan: DiagnosticGuidancePlan) {
    return plan.baselineReportVersion ?? this.store.select('diagnosticReports', { sessionId: plan.baselineSessionId }).filter(r => r.createdAt <= plan.createdAt)
      .sort((a, b) => b.version - a.version)[0]?.version ?? 1;
  }
  private view(user: InMemoryUserAccount, plan: DiagnosticGuidancePlan): GuidancePlanView {
    const report = this.diagnostics.report(user, plan.baselineSessionId), version = this.baseVersion(plan);
    const changed = version !== (report.version ?? 1);
    const baseline = this.diagnostics.requireSession(user, plan.baselineSessionId);
    const definitionChangedActionIds = plan.actions.filter(action => this.diagnostics.changedPlanDefinitions(baseline, [action.atomId]).length).map(action => action.id);
    const definitionUnverifiedActionIds = baseline.atomSnapshots ? [] : plan.actions.map(action => action.id);
    const definitionIssues = [...definitionChangedActionIds, ...definitionUnverifiedActionIds];
    return { ...plan, revision: plan.revision ?? 1, baselineReportVersion: version, impact: {
      needsReview: changed || definitionIssues.length > 0, baselineReportVersion: version, currentReportVersion: report.version ?? 1,
      pendingReviewCount: report.pendingReviewCount, affectedActionIds: changed ? plan.actions.map(a => a.id) : definitionIssues,
      definitionChangedActionIds, definitionUnverifiedActionIds,
      message: definitionUnverifiedActionIds.length ? '历史计划未保存知识定义，暂不能核对新旧证据。请重新评测后建立新计划；已开始的练习可继续回看。' :
        definitionChangedActionIds.length ? '知识点的目标或测量条件已调整。请重新评测当前定义，再建立新指导计划；原计划和已开始练习保留。' :
        changed ? '作为依据的评测已修订。请查看新证据，再确认或调整指导计划。' :
        report.pendingReviewCount ? `还有 ${report.pendingReviewCount} 条作答等待评分；当前指导按已有证据安排。` : '指导依据与当前评测版本一致。',
    } };
  }
  private saveRevision(plan: DiagnosticGuidancePlan, actorId: string, kind: GuidancePlanRevision['kind'], reason: string,
    receipt?: { requestKey?: string; inputHash: string }) {
    this.store.append('guidancePlanRevisions', { id: `${plan.id}:revision:${plan.revision ?? 1}`, planId: plan.id,
      revision: plan.revision ?? 1, kind, at: new Date().toISOString(), actorId, reason, snapshot: structuredClone(plan), ...receipt });
  }
  private command(user: InMemoryUserAccount, plan: DiagnosticGuidancePlan, kind: string,
    input: { expectedRevision?: number; requestKey?: string }) {
    const hash = inputHash(kind, input);
    if (input.requestKey) {
      const previous = this.store.find('guidancePlanRevisions', { planId: plan.id, actorId: user.id, requestKey: input.requestKey });
      if (previous) {
        if (previous.inputHash !== hash) throw new ConflictException('请求键已用于不同的计划操作');
        return { replay: true, receipt: { requestKey: input.requestKey, inputHash: hash } };
      }
    }
    if (input.expectedRevision === undefined && plan.revision !== undefined) throw new BadRequestException('请提供当前计划版本');
    if ((input.expectedRevision ?? 1) !== (plan.revision ?? 1)) throw new ConflictException('计划已调整，请刷新后再操作');
    return { replay: false, receipt: { requestKey: input.requestKey, inputHash: hash } };
  }
  private bump(plan: DiagnosticGuidancePlan, actorId: string, kind: GuidancePlanRevision['kind'], reason: string,
    receipt?: { requestKey?: string; inputHash: string }) {
    plan.revision = (plan.revision ?? 1) + 1;
    this.saveRevision(plan, actorId, kind, reason, receipt);
  }
  private preserveLegacy(plan: DiagnosticGuidancePlan, actorId: string) {
    for (const session of this.store.select('practiceSessions', { planId: plan.id }).filter(s => !s.actionSnapshot)) {
      const action = plan.actions.find(a => a.id === session.actionId);
      if (action) { session.actionSnapshot = structuredClone(action); session.planRevision = plan.revision ?? 1; session.snapshotOrigin = 'legacy_capture'; }
    }
    if (Boolean(this.store.find('guidancePlanRevisions', { planId: plan.id }))) return;
    plan.revision ??= 1; plan.baselineReportVersion ??= this.baseVersion(plan);
    this.saveRevision(plan, actorId, 'legacy', '历史计划首次纳入版本记录；此前变化不作追溯推断');
  }

  adjust(user: InMemoryUserAccount, planId: string, input: unknown) {
    const plan = this.requirePlan(user, planId);
    this.students.assertGuardian(user, plan.studentId);
    const impact = this.view(user, plan).impact;
    if (impact.definitionChangedActionIds?.length || impact.definitionUnverifiedActionIds?.length) throw new ConflictException('知识定义已变化或无法核对，修改活动不能替代重新评测，请建立新计划');
    const data = validate(z.object({ ...versionedCommand, requestKey: z.string().min(8).max(180), reason: reasonSchema,
      minutesPerDay: z.number().int().min(5).max(60), acknowledgeReportVersion: z.number().int().positive(),
      actions: z.array(z.object({ actionId: z.string().max(180), minutes: z.number().int().min(1).max(60),
        activity: z.string().trim().min(5).max(2500) }).strict()).min(1).max(3) }).strict(), input);
    const command = this.command(user, plan, 'adjust', data); if (command.replay) return this.view(user, plan);
    if (plan.status === 'completed') throw new BadRequestException('已结束计划保留为历史，请根据新的评测另建计划');
    const report = this.diagnostics.report(user, plan.baselineSessionId);
    if (data.acknowledgeReportVersion !== (report.version ?? 1)) throw new ConflictException('评测依据已变化，请重新查看报告');
    if (new Set(data.actions.map(a => a.actionId)).size !== data.actions.length || data.actions.length !== plan.actions.length ||
      data.actions.some(a => !plan.actions.some(old => old.id === a.actionId))) throw new BadRequestException('请为当前每个活动提供一次调整；更换知识目标需根据新评测另建计划');
    if (data.actions.reduce((sum, a) => sum + a.minutes, 0) !== data.minutesPerDay) throw new BadRequestException('活动时长之和需要等于每日预算');
    this.preserveLegacy(plan, user.id);
    plan.minutesPerDay = data.minutesPerDay; plan.baselineReportVersion = report.version ?? 1; plan.source = 'human';
    const active = report.hypotheses.filter(h => !['withdrawn', 'contradicted', 'resolved'].includes(h.status));
    plan.actions = data.actions.map(edit => {
      const old = plan.actions.find(a => a.id === edit.actionId)!;
      return { ...old, minutes: edit.minutes, activity: edit.activity,
        evidenceIds: report.estimates.find(e => e.atomId === old.atomId)?.evidenceIds ?? [],
        hypothesisId: active.find(h => h.atomId === old.atomId || h.probeAtomIds.includes(old.atomId))?.id ?? null };
    });
    plan.evidenceIds = [...new Set(plan.actions.flatMap(a => a.evidenceIds))];
    plan.summary = `每天 ${data.minutesPerDay} 分钟，围绕 ${plan.actions.map(a => this.store.find('knowledgeAtoms', { id: a.atomId })?.name ?? a.title).join('、')} 执行已调整活动，并用独立新题复测验证。`;
    delete plan.retrospectiveReview;
    this.bump(plan, user.id, 'adjusted', data.reason, command.receipt);
    this.events.publish('guidance.adjusted', { planId, revision: plan.revision, baselineReportVersion: plan.baselineReportVersion, actorId: user.id });
    return this.view(user, plan);
  }

  update(user: InMemoryUserAccount, planId: string, input: unknown) {
    const plan = this.requirePlan(user, planId);
    this.students.assertGuardian(user, plan.studentId);
    const data = validate(z.object({ ...versionedCommand, status: z.enum(['active', 'paused', 'completed']) }).strict(), input);
    const command = this.command(user, plan, 'status', data); if (command.replay) return this.view(user, plan);
    const { status } = data;
    if (plan.status === 'completed') throw new BadRequestException('已结束计划不能重新启用，请根据新评测另建计划');
    if (status !== 'paused' && this.view(user, plan).impact.needsReview) throw new ConflictException('评测已修订，请先查看新依据并调整或确认计划');
    if (status === 'completed') {
      const pending = this.store.select('reviewTasks', { planId }).filter(item => item.status !== 'completed');
      if (!Boolean(this.store.find('reviewTasks', { planId: planId })) || pending.length) throw new BadRequestException('完成复测并复盘后再结束计划');
      if (plan.retrospectiveReview?.fingerprint !== this.retrospective(user, planId).fingerprint) throw new BadRequestException('请先确认当前版本的前后证据复盘');
    }
    this.preserveLegacy(plan, user.id);
    if (status === 'active') {
      for (const other of this.store.select('diagnosticPlans', { studentId: plan.studentId, subject: plan.subject, status: 'active' })) if (other.id !== plan.id) {
        this.preserveLegacy(other, user.id); other.status = 'paused'; this.bump(other, user.id, 'status', '启用另一指导计划后暂停本计划');
      }
      plan.activatedAt ??= new Date().toISOString();
      for (const action of plan.actions) for (const intervalDays of [1, 3, 7, 14]) {
        const id = `review:${plan.id}:${action.atomId}:${intervalDays}`;
        if (!Boolean(this.store.find('reviewTasks', { id: id }))) this.store.append('reviewTasks', { id, planId: plan.id,
          studentId: plan.studentId, subject: plan.subject, atomId: action.atomId, intervalDays,
          dueAt: new Date(Date.parse(plan.activatedAt) + intervalDays * 86_400_000).toISOString(), status: 'pending', sessionId: null,
          earliestDueAt: new Date(Date.parse(plan.activatedAt) + intervalDays * 86_400_000).toISOString(),
          planRevision: (plan.revision ?? 1) + 1, baselineReportVersion: this.baseVersion(plan), scheduleRevision: 1 });
      }
    }
    plan.status = status;
    this.bump(plan, user.id, 'status', { active: '确认并启用指导计划', paused: '暂停指导计划', completed: '确认复盘并结束指导计划' }[status], command.receipt);
    this.events.publish('guidance.status_changed', { planId, status, actorId: user.id });
    return this.view(user, plan);
  }

  reviews(user: InMemoryUserAccount, studentId: string, subject: Subject) {
    this.students.assertCanAccessStudent(user, studentId);
    const active = new Set(this.store.select('diagnosticPlans', { studentId, subject, status: 'active' }).map((item) => item.id));
    return this.reviewViews(this.store.select('reviewTasks', { studentId, subject }).filter(item => active.has(item.planId)));
  }

  planReviews(user: InMemoryUserAccount, planId: string) {
    this.requirePlan(user, planId);
    return this.reviewViews(this.store.select('reviewTasks', { planId: planId }));
  }

  private reviewViews(tasks: typeof this.store.reviewTasks) {
    return [...tasks]
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt)).map((item) => ({ ...item, due: Date.parse(item.dueAt) <= Date.now(),
        atomName: this.store.find('knowledgeAtoms', { id: item.atomId })?.name ?? item.atomId }));
  }

  reschedule(user: InMemoryUserAccount, reviewId: string, input: unknown) {
    const task = this.store.find('reviewTasks', { id: reviewId });
    if (!task) throw new NotFoundException('复测任务不存在');
    const plan = this.requirePlan(user, task.planId);
    this.students.assertGuardian(user, plan.studentId);
    const data = validate(z.object({ expectedPlanRevision: z.number().int().positive(), expectedScheduleRevision: z.number().int().positive(),
      requestKey: z.string().min(8).max(180), dueAt: z.string().datetime({ offset: true }), reason: reasonSchema }).strict(), input);
    const hash = inputHash('reschedule', data), previous = task.scheduleHistory?.find(h => h.actorId === user.id && h.requestKey === data.requestKey);
    if (previous) { if (previous.inputHash !== hash) throw new ConflictException('请求键已用于不同的复测安排'); return task; }
    if (data.expectedPlanRevision !== (plan.revision ?? 1) || data.expectedScheduleRevision !== (task.scheduleRevision ?? 1)) throw new ConflictException('计划或复测时间已调整，请刷新后重试');
    if (task.status !== 'pending' || task.sessionId) throw new BadRequestException('已开始的复测保留原安排，请完成或查看该次评测');
    if (plan.status === 'completed') throw new BadRequestException('已结束计划的安排保留为历史');
    const at = Date.parse(data.dueAt), earliest = task.earliestDueAt ?? task.dueAt;
    if (at <= Date.now() || at < Date.parse(earliest) || at > Date.now() + 90 * 86_400_000) throw new BadRequestException('请选择未来 90 天内的时间，且不能早于原定测量间隔');
    const nextDue = new Date(at).toISOString(), version = (task.scheduleRevision ?? 1) + 1;
    task.scheduleHistory ??= [];
    task.scheduleHistory.push({ revision: version, previousDueAt: task.dueAt, dueAt: nextDue, reason: data.reason,
      actorId: user.id, at: new Date().toISOString(), requestKey: data.requestKey, inputHash: hash });
    task.earliestDueAt = earliest; task.dueAt = nextDue; task.scheduleRevision = version;
    this.events.publish('guidance.review_rescheduled', { reviewId, planId: plan.id, scheduleRevision: version, actorId: user.id });
    return task;
  }

  startReview(user: InMemoryUserAccount, reviewId: string) {
    const task = this.store.find('reviewTasks', { id: reviewId });
    if (!task) throw new NotFoundException('复测任务不存在');
    this.students.assertCanAccessStudent(user, task.studentId);
    const plan = this.store.find('diagnosticPlans', { id: task.planId });
    if (task.sessionId) return this.diagnostics.sessionView(user, task.sessionId);
    if (!plan || plan.status !== 'active') throw new BadRequestException('请先启用指导计划');
    if (this.view(user, plan).impact.needsReview) throw new ConflictException('评测依据已修订，请先确认指导计划再开始新的复测');
    if (Date.parse(task.dueAt) > Date.now()) throw new BadRequestException('复测尚未到期；如需立即检查，请开始验证评测');
    const baseline = this.diagnostics.requireSession(user, plan.baselineSessionId);
    return this.diagnostics.start(user, { studentId: task.studentId, subject: task.subject, intent: 'retest',
      targetAtomIds: [task.atomId], maxItems: 4, includePrerequisites: true, reviewTaskId: task.id }, baseline.scopeSnapshot);
  }

  retrospective(user: InMemoryUserAccount, planId: string) {
    const plan = this.store.find('diagnosticPlans', { id: planId });
    if (!plan) throw new NotFoundException('计划不存在');
    this.students.assertCanAccessStudent(user, plan.studentId);
    const raw = this.diagnostics.effectiveResponses(plan.studentId, plan.subject);
    const baseline = this.diagnostics.requireSession(user, plan.baselineSessionId), atoms = this.diagnostics.definitionsForSession(baseline);
    const linkedReviewIds = new Set(this.store.select('reviewTasks', { planId: planId }).map(t => t.id));
    const sessions = this.store.select('diagnosticSessions', { studentId: plan.studentId, subject: plan.subject }).filter((item) =>
      item.status === 'completed' && item.id !== plan.baselineSessionId &&
      (item.planId === planId || (item.reviewTaskId && linkedReviewIds.has(item.reviewTaskId))));
    const relevant = raw.filter(item => item.sessionId === baseline.id || sessions.some(session => session.id === item.sessionId));
    const compatibility = this.diagnostics.definitionEvidence(atoms, relevant, plan.studentId, !!baseline.atomSnapshots);
    const all = compatibility.compatible;
    const before = all.filter((item) => item.sessionId === plan.baselineSessionId);
    const after = all.filter((item) => sessions.some((session) => session.id === item.sessionId) && !before.some((baseline) => baseline.questionId === item.questionId));
    const mappings = this.diagnostics.allMappings(plan.studentId);
    // A delayed observation is labelled retention for mastery, but still measures its
    // original skill using a frozen response scale. Compare only matching scales.
    const comparisonKey = (r: typeof all[number]) => {
      const sourceSession = this.store.find('diagnosticSessions', { id: r.sessionId });
      const snapshot = sourceSession?.questionSnapshots.find(q => q.id === r.questionId);
      const schema = snapshot?.answerSchema as { mode?: string; gradingConfig?: unknown } | undefined;
      const dimension = mappings.get(`${r.itemId}@${r.mappingVersion}`)?.dimension ?? r.dimension;
      return inputHash('comparison-scale-v1', { atomId: r.atomId, dimension, mode: schema?.mode, gradingConfig: schema?.gradingConfig ?? {} });
    };
    const independent = after.filter(r => r.status === 'scored' && r.score !== null && !r.hintLevel && !r.priorExposure);
    const followupSessionIds = [...new Set(independent.map(r => r.sessionId))];
    const fingerprint = inputHash('retrospective-v1', { planId, actions: plan.actions.map(a => [a.id, a.atomId]),
      reportVersion: this.diagnostics.report(user, plan.baselineSessionId).version ?? 1,
      sessions: sessions.map(s => [s.id, this.diagnostics.report(user, s.id).version ?? 1]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      definitionContext: { baseline: baseline.atomSnapshots?.map(atom => [atom.id, atom.objective, atom.successCriterion, atom.prerequisiteIds]),
        incompatible: compatibility.incompatibleEvidenceIds, unverified: compatibility.unverifiedEvidenceIds },
      evidence: [...before, ...after].map(r => [r.id, r.score, r.status, r.dimension, r.hintLevel, r.retentionDelayDays, comparisonKey(r)]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) });
    return { planId, baselineSessionId: plan.baselineSessionId, followupSessionIds, independentFollowupCount: independent.length, fingerprint,
      practiceSessionIds: this.store.select('practiceSessions', { planId: planId }).map(s => s.id),
      reviewed: plan.retrospectiveReview?.fingerprint === fingerprint,
      definitionCompatibility: { incompatibleEvidenceIds: compatibility.incompatibleEvidenceIds, unverifiedEvidenceIds: compatibility.unverifiedEvidenceIds },
      comparisons: plan.actions.map((action) => {
        const atom = atoms.find(atom => atom.id === action.atomId)!;
        const pre = before.filter((item) => item.atomId === atom.id), post = after.filter((item) => item.atomId === atom.id);
        const sharedScales = new Set(pre.map(comparisonKey).filter(key => post.some(item => comparisonKey(item) === key)));
        const preComparable = pre.filter(item => sharedScales.has(comparisonKey(item)));
        const postComparable = post.filter(item => sharedScales.has(comparisonKey(item)));
        const beforeEstimate = estimateMastery(atom, weightedEvidence(preComparable, mappings, new Date()));
        const afterEstimate = estimateMastery(atom, weightedEvidence(postComparable, mappings, new Date()));
        const sufficient = beforeEstimate.effectiveSamples >= 3 && afterEstimate.effectiveSamples >= 3 &&
          beforeEstimate.independentFamilies >= 2 && afterEstimate.independentFamilies >= 2;
        const incompatiblePost = raw.some(item => item.atomId === atom.id && sessions.some(session => session.id === item.sessionId) &&
          (compatibility.incompatibleEvidenceIds.includes(item.id) || compatibility.unverifiedEvidenceIds.includes(item.id)));
        const outcome = !post.length ? incompatiblePost ? 'different_definitions' : 'awaiting_retest' : !sharedScales.size ? 'different_dimensions' : !sufficient ? 'insufficient' :
          afterEstimate.lower! > beforeEstimate.upper! ? 'improved' : afterEstimate.upper! < beforeEstimate.lower! ? 'declined' : 'uncertain';
        return { atomId: atom.id, atomName: atom.name, before: beforeEstimate, after: afterEstimate, outcome,
          retentionSamples: post.filter((item) => item.dimension === 'retention' && (item.retentionDelayDays ?? 0) >= 1).length,
          note: outcome === 'improved' ? '观察到可比表现改善；仍需继续检查迁移与保持，不能据此证明单一干预因果。' : '证据量、测量维度或区间尚不足以确定改善，继续验证。' };
      }) };
  }

  acknowledgeRetrospective(user: InMemoryUserAccount, planId: string, input: unknown) {
    const plan = this.requirePlan(user, planId);
    this.students.assertGuardian(user, plan.studentId);
    const data = validate(z.object({ ...versionedCommand, requestKey: z.string().min(8).max(180),
      fingerprint: z.string().regex(/^[a-f0-9]{64}$/), reason: reasonSchema }).strict(), input);
    const command = this.command(user, plan, 'retrospective', data); if (command.replay) return this.view(user, plan);
    if (plan.status === 'completed') throw new BadRequestException('已结束计划的复盘保留为历史');
    if (this.view(user, plan).impact.needsReview) throw new ConflictException('请先核对修订后的评测依据');
    const current = this.retrospective(user, planId);
    if (data.fingerprint !== current.fingerprint) throw new ConflictException('前后证据已变化，请重新查看复盘');
    if (!current.followupSessionIds.length) throw new BadRequestException('还没有独立新题后测，请先完成验证或间隔复测');
    this.preserveLegacy(plan, user.id);
    plan.retrospectiveReview = { fingerprint: current.fingerprint, reviewedAt: new Date().toISOString(), actorId: user.id, note: data.reason };
    this.bump(plan, user.id, 'retrospective', data.reason, command.receipt);
    this.events.publish('guidance.retrospective_reviewed', { planId, revision: plan.revision, fingerprint: current.fingerprint, actorId: user.id });
    return this.view(user, plan);
  }
}
