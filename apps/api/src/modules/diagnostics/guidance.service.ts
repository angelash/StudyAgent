import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { DiagnosticGuidancePlan, GuidanceAction, Subject } from '@study-agent/contracts';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { validate } from '../../common/validation';
import { StudentsService } from '../students/students.service';
import { AiService } from '../ai/ai.service';
import { DiagnosticsService } from './diagnostics.service';
import { estimateMastery, weightedEvidence } from './measurement';

const createPlanSchema = z.object({
  baselineSessionId: z.string().min(1).max(180), minutesPerDay: z.number().int().min(5).max(60),
  useAi: z.boolean().default(true),
}).strict();

@Injectable()
export class GuidanceService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly diagnostics: DiagnosticsService, private readonly events: DomainEventBusService, private readonly ai: AiService) {}

  async create(user: InMemoryUserAccount, studentId: string, input: unknown) {
    this.students.assertCanAccessStudent(user, studentId);
    const command = validate(createPlanSchema, input);
    const session = this.diagnostics.requireSession(user, command.baselineSessionId);
    if (session.studentId !== studentId || session.status !== 'completed') throw new BadRequestException('请先完成当前孩子的评测');
    const report = this.diagnostics.report(user, session.id);
    const atomMap = new Map(this.store.knowledgeAtoms.map((atom) => [atom.id, atom]));
    const activeHypotheses = report.hypotheses.filter((item) => !['contradicted', 'resolved'].includes(item.status));
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
      const resourceQuestionIds = this.store.measurementItems.filter((item) => item.atomId === atom.id && item.reviewStatus === 'approved')
        .map((item) => item.questionId).filter((id, position, all) => all.indexOf(id) === position).slice(0, 4);
      return { id: this.store.nextId('action'), atomId: atom.id, hypothesisId: hypothesis?.id ?? null,
        evidenceIds: estimate.evidenceIds, title: `${unknown ? '先补充证据' : '逐步巩固'}：${atom.name}`,
        activity: unknown ? `先做两个不同题族的独立小测，观察“${atom.objective}”。根据表现决定是否需要讲解。` :
          `先让孩子说清“${atom.objective}”，示范一个关键步骤，再完成新题。${hypothesis?.nextAction ?? '逐步减少提示，并让孩子说明为什么这样做。'}`,
        minutes: perAction + (index === 0 ? command.minutesPerDay % Math.max(prioritized.length, 1) : 0),
        successCriterion: `${atom.successCriterion}；至少两个新题族独立完成，再安排迁移与延迟验证。`,
        resourceQuestionIds, retestAt: new Date(now.getTime() + 86_400_000).toISOString() };
    });
    const plan: DiagnosticGuidancePlan = {
      id: this.store.nextId('guidance'), studentId, subject: session.subject, baselineSessionId: session.id,
      version: this.store.diagnosticPlans.filter((item) => item.studentId === studentId && item.subject === session.subject).length + 1,
      source: 'rules', status: 'proposed', minutesPerDay: command.minutesPerDay,
      summary: `每天 ${command.minutesPerDay} 分钟，围绕 ${actions.map((item) => atomMap.get(item.atomId)?.name).join('、')} 先验证再指导；复测后调整。`,
      actions, evidenceIds: [...new Set(actions.flatMap((item) => item.evidenceIds))], createdAt: now.toISOString(), aiStatus: 'not_requested',
    };
    if (command.useAi) {
      const enrichment = await this.ai.enrichDiagnosticPlan(plan, { scope: session.scopeSnapshot, report });
      plan.aiStatus = enrichment.status;
      if (enrichment.status === 'available' && enrichment.value) {
        plan.source = 'ai'; plan.summary = enrichment.value.summary;
        for (const action of plan.actions) action.activity = enrichment.value.activities.find((item) => item.actionId === action.id)?.activity ?? action.activity;
      }
    }
    this.store.diagnosticPlans.push(plan);
    this.events.publish('guidance.proposed', { planId: plan.id, studentId, source: plan.source, baselineSessionId: session.id });
    return plan;
  }

  list(user: InMemoryUserAccount, studentId: string, subject: Subject) {
    this.students.assertCanAccessStudent(user, studentId);
    return this.store.diagnosticPlans.filter((item) => item.studentId === studentId && item.subject === subject)
      .sort((a, b) => b.version - a.version);
  }

  update(user: InMemoryUserAccount, planId: string, input: unknown) {
    const plan = this.store.diagnosticPlans.find((item) => item.id === planId);
    if (!plan) throw new NotFoundException('计划不存在');
    this.students.assertCanAccessStudent(user, plan.studentId);
    const { status } = validate(z.object({ status: z.enum(['active', 'paused', 'completed']) }).strict(), input);
    if (status === 'completed') {
      const pending = this.store.reviewTasks.filter((item) => item.planId === planId && item.status !== 'completed');
      if (!this.store.reviewTasks.some((item) => item.planId === planId) || pending.length) throw new BadRequestException('完成复测并复盘后再结束计划');
    }
    if (status === 'active') {
      for (const other of this.store.diagnosticPlans) if (other.studentId === plan.studentId && other.subject === plan.subject && other.status === 'active' && other.id !== plan.id) other.status = 'paused';
      for (const action of plan.actions) for (const intervalDays of [1, 3, 7, 14]) {
        const id = `review:${plan.id}:${action.atomId}:${intervalDays}`;
        if (!this.store.reviewTasks.some((item) => item.id === id)) this.store.reviewTasks.push({ id, planId: plan.id,
          studentId: plan.studentId, subject: plan.subject, atomId: action.atomId, intervalDays,
          dueAt: new Date(Date.now() + intervalDays * 86_400_000).toISOString(), status: 'pending', sessionId: null });
      }
    }
    plan.status = status;
    this.events.publish('guidance.status_changed', { planId, status, actorId: user.id });
    return plan;
  }

  reviews(user: InMemoryUserAccount, studentId: string, subject: Subject) {
    this.students.assertCanAccessStudent(user, studentId);
    const active = new Set(this.store.diagnosticPlans.filter((item) => item.status === 'active').map((item) => item.id));
    return this.store.reviewTasks.filter((item) => item.studentId === studentId && item.subject === subject && active.has(item.planId))
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt)).map((item) => ({ ...item, due: Date.parse(item.dueAt) <= Date.now(),
        atomName: this.store.knowledgeAtoms.find((atom) => atom.id === item.atomId)?.name ?? item.atomId }));
  }

  startReview(user: InMemoryUserAccount, reviewId: string) {
    const task = this.store.reviewTasks.find((item) => item.id === reviewId);
    if (!task) throw new NotFoundException('复测任务不存在');
    this.students.assertCanAccessStudent(user, task.studentId);
    const plan = this.store.diagnosticPlans.find((item) => item.id === task.planId);
    if (!plan || plan.status !== 'active') throw new BadRequestException('请先启用指导计划');
    if (task.sessionId) return this.diagnostics.sessionView(user, task.sessionId);
    if (Date.parse(task.dueAt) > Date.now()) throw new BadRequestException('复测尚未到期；如需立即检查，请开始验证评测');
    const baseline = this.diagnostics.requireSession(user, plan.baselineSessionId);
    return this.diagnostics.start(user, { studentId: task.studentId, subject: task.subject, intent: 'retest',
      targetAtomIds: [task.atomId], maxItems: 4, includePrerequisites: true, reviewTaskId: task.id }, baseline.scopeSnapshot);
  }

  retrospective(user: InMemoryUserAccount, planId: string) {
    const plan = this.store.diagnosticPlans.find((item) => item.id === planId);
    if (!plan) throw new NotFoundException('计划不存在');
    this.students.assertCanAccessStudent(user, plan.studentId);
    const all = this.diagnostics.effectiveResponses(plan.studentId, plan.subject);
    const before = all.filter((item) => item.sessionId === plan.baselineSessionId);
    const sessions = this.store.diagnosticSessions.filter((item) => item.studentId === plan.studentId && item.subject === plan.subject &&
      item.status === 'completed' && item.startedAt > plan.createdAt);
    const after = all.filter((item) => sessions.some((session) => session.id === item.sessionId) && !before.some((baseline) => baseline.questionId === item.questionId));
    const mappings = this.diagnostics.allMappings();
    return { planId, baselineSessionId: plan.baselineSessionId, followupSessionIds: sessions.map((item) => item.id),
      comparisons: plan.actions.map((action) => {
        const atom = this.store.knowledgeAtoms.find((atom) => atom.id === action.atomId)!;
        const pre = before.filter((item) => item.atomId === atom.id), post = after.filter((item) => item.atomId === atom.id);
        const sharedDimensions = new Set(pre.map((item) => item.dimension).filter((dimension) => post.some((item) => item.dimension === dimension)));
        const preComparable = pre.filter((item) => sharedDimensions.has(item.dimension));
        const postComparable = post.filter((item) => sharedDimensions.has(item.dimension));
        const beforeEstimate = estimateMastery(atom, weightedEvidence(preComparable, mappings, new Date()));
        const afterEstimate = estimateMastery(atom, weightedEvidence(postComparable, mappings, new Date()));
        const sufficient = beforeEstimate.effectiveSamples >= 3 && afterEstimate.effectiveSamples >= 3 &&
          beforeEstimate.independentFamilies >= 2 && afterEstimate.independentFamilies >= 2;
        const outcome = !post.length ? 'awaiting_retest' : !sharedDimensions.size ? 'different_dimensions' : !sufficient ? 'insufficient' :
          afterEstimate.lower! > beforeEstimate.upper! ? 'improved' : afterEstimate.upper! < beforeEstimate.lower! ? 'declined' : 'uncertain';
        return { atomId: atom.id, atomName: atom.name, before: beforeEstimate, after: afterEstimate, outcome,
          retentionSamples: post.filter((item) => item.dimension === 'retention' && (item.retentionDelayDays ?? 0) >= 1).length,
          note: outcome === 'improved' ? '观察到可比表现改善；仍需继续检查迁移与保持，不能据此证明单一干预因果。' : '证据量、测量维度或区间尚不足以确定改善，继续验证。' };
      }) };
  }
}
