import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { gespCodeSubmissionSchema, gespGuidancePlanCreateSchema, gespGuidancePlanDecisionSchema, gespHintRequestSchema, gespTaskReviewInputSchema,
  gespLearningScopeSchema, gespProbeSubmissionSchema, gespSearchSchema, type GespAtom, type GespCodeSubmissionReceipt,
  type GespGuidanceAction, type GespGuidancePlan, type GespGuidancePlanRevision, type GespHintEvent, type GespOverview,
  type GespLearningScopeRevision, type GespProbeSubmissionReceipt, type GespQuestion, type GespQuestionDetail,
  type GespReviewTask, type GespStudentTask, type GespTaskReview, type GespTaskReviewRevision, type GespTeachingPlan,
  type GespPilotTaskReviewView, type GespTaskProvenance, type GespTaskReviewHistoryItem, type GespResponseEvidence,
  gespTeachingBundleSchema, type GespTeachingCandidateView } from '@study-agent/contracts';
import { InMemoryStoreService, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { workspaceRoot } from '../../infrastructure/workspace-paths';
import { validate } from '../../common/validation';

type IndexedQuestion = GespQuestion & { textPath: string; textSha256: string; answer: string | null;
  answerBasis: string | null; answerReviewStatus: string; referenceMaterialPresent: boolean; hiddenTestDataStatus: 'not_collected' };
type PrivateProbe = { id: string; dimension: 'understanding' | 'procedure'; prompt: string; options: string[]; answer: string; analysis?: string };
type PilotTask = Omit<GespStudentTask, 'probes'> & { probes: PrivateProbe[]; tests: Array<{ input: string; expected: string }> };
type PilotCurriculum = { format: string; version: string; status: string; notice: string; tasks: PilotTask[] };
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const notice = '教研研究资料：机器文本可能遗漏公式、图示和代码。题目、答案、题族与知识映射均待审核，尚未用于学生诊断或自动运行程序。';

@Injectable()
export class GespService implements OnModuleDestroy {
  private db?: DatabaseSync;
  private pilot?: PilotCurriculum;
  private snapshot?: { graph: { atoms: GespAtom[] }; coverage: {
    coverage: Array<{ session: string; level: number; status: string; officialStatus?: string; questionCount?: number }>;
    quarantinedLinks: unknown[]; unrecoveredObjectiveAnswers: number }; plan: GespTeachingPlan; asOf: string };
  get root() { return resolve(process.env.STUDY_GESP_ROOT ?? resolve(workspaceRoot(), 'data/gesp')); }
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService) {}
  private resource(name: string) { return resolve(workspaceRoot(), 'resources/gesp', name); }
  assertAccess(user: InMemoryUserAccount) {
    if (!['admin', 'teacher'].includes(user.role)) throw new ForbiddenException('GESP资料需要教研权限');
  }
  private data() {
    if (!this.snapshot) {
      try {
        this.snapshot = { graph: JSON.parse(readFileSync(this.resource('knowledge-map.json'), 'utf8')),
          coverage: JSON.parse(readFileSync(this.resource('coverage.json'), 'utf8')),
          plan: JSON.parse(readFileSync(this.resource('teaching-plan.json'), 'utf8')),
          asOf: JSON.parse(readFileSync(this.resource('sources.json'), 'utf8')).asOf };
      } catch { throw new ServiceUnavailableException('GESP版本化资料未安装，请恢复 resources/gesp'); }
    }
    return this.snapshot;
  }
  private studentData() {
    if (!this.pilot) { const parsed = JSON.parse(readFileSync(this.resource('student-curriculum-v2.json'), 'utf8')) as PilotCurriculum; this.pilot = parsed; return parsed; }
    return this.pilot;
  }
  private index() {
    if (this.db) return this.db;
    const path = resolve(this.root, 'catalog.sqlite3');
    if (!existsSync(path)) throw new ServiceUnavailableException('GESP索引未安装，请运行 scripts/gesp/build_runtime_index.py');
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      const entry = db.prepare("SELECT value FROM metadata WHERE key='summary'").get() as { value: string };
      const summary = JSON.parse(entry.value);
      if (summary.format !== 'gesp-research-index-v1') throw new Error('Unknown index format');
      for (const [name, fingerprint] of Object.entries(summary.inputSha256)) {
        if (!['questions.jsonl', 'sources.json', 'supplements.json', 'coverage.json', 'knowledge-map.json', 'syllabus-clauses.json', 'teaching-plan.json'].includes(name) ||
            hash(readFileSync(this.resource(name))) !== fingerprint) throw new Error('Stale index');
      }
      if (Object.keys(summary.inputSha256).length !== 7) throw new Error('Incomplete index version');
      this.db = db;
      return db;
    } catch {
      db.close();
      throw new ServiceUnavailableException('GESP索引与资料版本不符，请离线重建索引并重启API');
    }
  }
  overview(user: InMemoryUserAccount): GespOverview {
    this.assertAccess(user);
    const data = this.data(), ready = existsSync(resolve(this.root, 'catalog.sqlite3'));
    const stats = ready ? JSON.parse((this.index().prepare("SELECT value FROM metadata WHERE key='summary'").get() as { value: string }).value) : null;
    return { track: 'gesp-cpp', asOf: data.asOf, ready, stats, notice,
      levels: Array.from({ length: 8 }, (_, i) => ({ level: i + 1, atoms: data.graph.atoms.filter(a => a.level === i + 1).length,
        questions: data.coverage.coverage.filter(c => c.level === i + 1).reduce((sum, c) => sum + (c.questionCount ?? 0), 27) })),
      sessions: [...new Set(data.coverage.coverage.map(c => c.session))].sort().reverse(),
      sourceGaps: data.coverage.coverage.filter(c => c.status !== 'original_paper').map(c => ({ session: c.session,
        level: c.level, status: c.status, officialStatus: c.officialStatus ?? c.status })),
      quarantinedLinks: data.coverage.quarantinedLinks.length, unrecoveredObjectiveAnswers: data.coverage.unrecoveredObjectiveAnswers,
      teachingPlan: data.plan };
  }
  studentContentReview(user: InMemoryUserAccount, input: unknown): { tasks: GespPilotTaskReviewView[] } {
    this.assertAccess(user);
    const query = validate(gespSearchSchema.pick({ level: true }).strict(), input);
    const tasks = this.studentData().tasks.filter(task => query.level === undefined || task.atomId.startsWith(`gesp-cpp.l${query.level}.`));
    return { tasks: tasks.map(task => {
      const contentSha256 = hash(JSON.stringify(task)), stored = this.store.find('gespTaskReviews', { taskId: task.id });
      const review = stored ? this.publicTaskReview(stored, contentSha256) : null;
      return { id: task.id, atomId: task.atomId, title: task.title, prompt: task.prompt, language: task.language, standard: task.standard,
        timeLimitSeconds: task.timeLimitSeconds, memoryLimitMiB: task.memoryLimitMiB, contentSha256, probes: task.probes.map(probe => ({ ...probe })),
        tests: task.tests.map(test => ({ ...test })), review };
    }) };
  }
  teachingCandidates(user: InMemoryUserAccount, input: unknown): GespTeachingCandidateView {
    this.assertAccess(user);
    const query = validate(gespSearchSchema.pick({ level: true }).strict(), input);
    try {
      const bytes = readFileSync(this.resource('teaching-candidates-v1.json'));
      const bundle = gespTeachingBundleSchema.parse(JSON.parse(bytes.toString('utf8')));
      const atoms = this.data().graph.atoms.filter(atom => atom.level <= 4), tasks = this.studentData().tasks;
      if (new Set(bundle.lessons.map(row => row.atomId)).size !== atoms.length || new Set(bundle.lessons.map(row => row.id)).size !== 49 ||
        bundle.lessons.some(row => {
          const atom = atoms.find(atom => atom.id === row.atomId), task = tasks.find(task => task.id === row.linkedTaskId);
          return !atom || atom.level !== row.level || !task || task.atomId !== row.atomId || hash(JSON.stringify(task)) !== row.linkedTaskContentSha256 ||
            JSON.stringify(row.sourceEvidence) !== JSON.stringify(atom.sourceEvidence);
        })) throw Error('Stale or mismatched teaching candidate');
      return { contentSha256: hash(bytes), notice: bundle.notice, automaticPublication: false, teacherReviewed: false,
        lessons: bundle.lessons.filter(row => query.level === undefined || row.level === query.level) };
    } catch { throw new ServiceUnavailableException('GESP教学候选未安装或与当前来源、试题版本不符，请核对候选包'); }
  }
  reviewStudentTask(user: InMemoryUserAccount, input: unknown) {
    this.assertAccess(user);
    const command = validate(gespTaskReviewInputSchema, input), task = this.studentData().tasks.find(row => row.id === command.taskId);
    if (!task) throw new NotFoundException('编程试点任务不存在');
    const replay = this.store.select('gespTaskReviewRevisions', { taskId: task.id }).find(row => row.requestKey === command.requestKey);
    if (replay) {
      if (JSON.stringify(replay.gates) !== JSON.stringify(command.gates) || replay.rationale !== command.rationale)
        throw new ConflictException('同一审核请求键不能改变审核结论或理由');
      return this.publicTaskReview(replay, hash(JSON.stringify(task)));
    }
    const previous = this.store.find('gespTaskReviews', { taskId: task.id }), expected = previous?.version ?? 0;
    if (command.expectedVersion !== expected) throw new ConflictException('内容审核已变化，请刷新后重新核对');
    const status = Object.values(command.gates).every(decision => decision === 'approved') ? 'approved' as const : 'rejected' as const;
    const review: GespTaskReview = { id: previous?.id ?? this.store.nextId('gesp_task_review'), taskId: task.id, atomId: task.atomId,
      taskContentSha256: hash(JSON.stringify(task)), gates: command.gates, status, reviewerId: user.id,
      reviewedAt: new Date().toISOString(), version: expected + 1, rationale: command.rationale, requestKey: command.requestKey };
    if (previous) Object.assign(previous, review); else this.store.append('gespTaskReviews', review);
    const revision: GespTaskReviewRevision = { ...structuredClone(review), id: this.store.nextId('gesp_task_review_revision'), reviewId: review.id };
    this.store.append('gespTaskReviewRevisions', revision);
    return this.publicTaskReview(review, review.taskContentSha256);
  }
  studentTaskReviewHistory(user: InMemoryUserAccount, taskId: string): GespTaskReviewHistoryItem[] {
    this.assertAccess(user);
    const task = this.studentData().tasks.find(row => row.id === taskId); if (!task) throw new NotFoundException('编程试点任务不存在');
    const contentSha256 = hash(JSON.stringify(task));
    return this.store.select('gespTaskReviewRevisions', { taskId }).sort((left, right) => right.version - left.version)
      .map(row => { const { requestKey: _requestKey, ...safe } = row; return { ...safe, current: row.taskContentSha256 === contentSha256 }; });
  }
  setStudentScope(user: InMemoryUserAccount, studentId: string, input: unknown) {
    this.students.assertGuardian(user, studentId);
    const command = validate(gespLearningScopeSchema, input), tasks = this.studentData().tasks;
    if (!command.atomIds.every(atomId => tasks.some(task => task.atomId === atomId))) throw new BadRequestException('范围包含尚无原创试点题的知识点');
    if (!command.atomIds.every(atomId => atomId.startsWith(`gesp-cpp.l${command.level}.`))) throw new BadRequestException('认证等级与知识点命名空间不一致');
    const replayed = this.store.find('gespLearningScopeRevisions', { studentId, requestKey: command.requestKey });
    if (replayed) {
      if (replayed.level !== command.level || replayed.reason!==command.reason || command.expectedVersion!==undefined&&command.expectedVersion!==replayed.version-1 || JSON.stringify([...replayed.atomIds].sort()) !== JSON.stringify([...new Set(command.atomIds)].sort()))
        throw new ConflictException('同一范围请求键不能改变范围内容');
      const {scopeId,...original}=replayed;return this.scopeView({...original,id:scopeId});
    }
    const previous = this.store.find('gespLearningScopes', { studentId }), now = new Date().toISOString();
    if(command.expectedVersion!==undefined&&command.expectedVersion!==(previous?.version??0))throw new ConflictException('认证范围已由另一处修改，请保留完整选择并核对当前版本。');
    if (previous) {
      previous.level = command.level; previous.atomIds = [...new Set(command.atomIds)].sort(); previous.version++; previous.confirmedByUserId = user.id;
      previous.confirmedAt = now; previous.updatedAt = now; previous.requestKey = command.requestKey; previous.reason = command.reason;
      this.appendScopeRevision(previous); return this.scopeView(previous);
    }
    const scope = { id: this.store.nextId('gesp_scope'), studentId, level: command.level, atomIds: [...new Set(command.atomIds)].sort(), status: 'active' as const,
      version: 1, confirmedByUserId: user.id, confirmedAt: now, updatedAt: now, requestKey: command.requestKey, reason: command.reason };
    this.store.append('gespLearningScopes', scope); this.appendScopeRevision(scope); return this.scopeView(scope);
  }
  studentWorkspace(user: InMemoryUserAccount, studentId: string) {
    this.students.assertCanAccessStudent(user, studentId);
    const scope = this.store.find('gespLearningScopes', { studentId, status: 'active' }), tasks = this.studentData().tasks,
      catalog = tasks.map(task => this.publicTask(task));
    if (!scope) return { studentId, scope: null, scopeHistory: [], notice: this.studentData().notice,
      tasks: user.role === 'student' ? [] : catalog, availableTasks: user.role === 'student' ? [] : catalog, submissions: [], probeSubmissions: [],
      hintEvents: [], guidancePlans: [], reviewTasks: [], capabilities: [] };
    const available = tasks.filter(task => scope.atomIds.includes(task.atomId)).map(task => this.publicTask(task));
    const submissions = this.store.select('gespCodeSubmissions', { studentId }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(row => this.publicSubmission(row, true));
    const probes = this.store.select('gespProbeSubmissions', { studentId }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(row => this.publicProbeSubmission(row, true));
    const scopeHistory = this.store.select('gespLearningScopeRevisions', { studentId }).sort((a, b) => a.version - b.version).map(row => this.scopeView(row));
    const hints = this.store.select('gespHintEvents', { studentId }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(row => this.publicHint(row));
    const guidancePlans = this.store.select('gespGuidancePlans', { studentId }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(row => this.publicPlan(row));
    const reviewTasks = this.store.select('gespReviewTasks', { studentId }).sort((a, b) => a.dueAt.localeCompare(b.dueAt)).map(row => ({ ...row, ...this.reviewEligibility(row) }));
    return { studentId, scope: this.scopeView(scope), scopeHistory, notice: this.studentData().notice, tasks: available,
      availableTasks: user.role === 'student' ? [] : catalog, submissions, probeSubmissions: probes,
      hintEvents: hints, guidancePlans, reviewTasks,
      capabilities: this.capabilities(scope.atomIds, probes, submissions, this.store.select('gespReviewTasks', { studentId })) };
  }
  requestHint(user: InMemoryUserAccount, input: unknown) {
    if (user.role !== 'student') throw new ForbiddenException('编程提示必须由当前独立学习身份获取');
    const command = validate(gespHintRequestSchema, input); this.students.assertCanAccessStudent(user, command.studentId);
    const previous = this.store.find('gespHintEvents', { studentId: command.studentId, requestKey: command.requestKey });
    if (previous) {
      if (previous.atomId !== command.atomId || previous.taskId !== command.taskId || previous.level !== command.level) throw new ConflictException('同一提示请求键不能改变知识点、任务或提示级别');
      return this.publicHint(previous);
    }
    const scope = this.store.find('gespLearningScopes', { studentId: command.studentId, status: 'active' });
    if (!scope || !scope.atomIds.includes(command.atomId)) throw new ForbiddenException('该知识点不在家长已确认的GESP学习范围内');
    const task = this.studentData().tasks.find(row => row.id === command.taskId && row.atomId === command.atomId);
    if (!task) throw new NotFoundException('编程任务不存在或不属于当前知识点');
    const taskHints = this.store.select('gespHintEvents', { studentId: command.studentId, taskId: task.id });
    if (command.level > 1 && !taskHints.some(row => row.level === command.level - 1)) throw new BadRequestException('请先获取上一级提示，再按顺序加深');
    const prior = task.probes.find(probe => probe.dimension === 'understanding') ?? task.probes[0];
    const trace = task.probes.find(probe => probe.dimension === 'procedure');
    const text = command.level === 1 ? `先分开写出输入、输出与转换步骤。题目要求：${task.prompt}`
      : command.level === 2 ? `回到概念，不直接猜输出：${prior.prompt} 请用题面中的规则支持或否定每个选项。`
        : `${trace ? `先在纸上独立跟踪这个状态问题：${trace.prompt} ` : ''}再用最小合法输入检查边界和输出格式。提示不会显示隐藏测试、选项答案或最终代码。`;
    const event: GespHintEvent = { id: this.store.nextId('gesp_hint'), studentId: command.studentId, atomId: command.atomId,
      taskId: task.id, level: command.level, text, revealsAnswer: false, requestKey: command.requestKey, createdAt: new Date().toISOString() };
    this.store.append('gespHintEvents', event); return this.publicHint(event);
  }
  createGuidancePlan(user: InMemoryUserAccount, input: unknown) {
    const command = validate(gespGuidancePlanCreateSchema, input); this.students.assertGuardian(user, command.studentId);
    const replayed = this.store.find('gespGuidancePlans', { studentId: command.studentId, requestKey: command.requestKey });
    if (replayed) {
      if (replayed.scopeVersion !== command.scopeVersion || replayed.minutesPerDay !== command.minutesPerDay)
        throw new ConflictException('同一指导计划请求键不能改变范围版本或每日时长');
      const original = this.store.select('gespGuidancePlanRevisions', { planId: replayed.id, version: 1 })
        .find(row => row.requestKey === command.requestKey);
      return original ? this.publicPlanSnapshot(original) : this.publicPlan(replayed);
    }
    const scope = this.store.find('gespLearningScopes', { studentId: command.studentId, status: 'active' });
    if (!scope) throw new BadRequestException('请先确认GESP独立学习范围');
    if (scope.version !== command.scopeVersion) throw new ConflictException('学习范围已经变化，请刷新后重新生成指导计划');
    const probes = [...this.store.select('gespProbeSubmissions', { studentId: command.studentId })].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const submissions = [...this.store.select('gespCodeSubmissions', { studentId: command.studentId })].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const capabilities = this.capabilities(scope.atomIds, probes, submissions, this.store.select('gespReviewTasks', { studentId: command.studentId })), now = new Date().toISOString();
    const fingerprint = hash(JSON.stringify({ scopeVersion: scope.version, capabilities,
      evidenceIds: [...probes, ...submissions].map(row => row.id).sort() }));
    const priority = { needs_verification: 0, unknown: 1, partial_evidence: 2, current_evidence_met: 3 } as Record<string, number>;
    const ordered = [...capabilities].sort((left, right) => priority[left.state] - priority[right.state] || left.atomId.localeCompare(right.atomId));
    const maxActions = Math.max(1, Math.min(ordered.length, Math.floor(command.minutesPerDay / 5), 6));
    const selected = ordered.slice(0, maxActions), deferredAtomIds = ordered.slice(maxActions).map(capability => capability.atomId);
    const baseMinutes = Math.floor(command.minutesPerDay / maxActions), remainder = command.minutesPerDay % maxActions;
    const actions: GespGuidanceAction[] = selected.map((capability, index) => {
      const gaps = capability.dimensions.filter((dimension: any) => !['correct', 'passed'].includes(dimension.status)).map((dimension: any) => dimension.dimension);
      const evidenceIds = this.latestEvidenceIds(capability.atomId, probes, submissions);
      const title = gaps.length ? `补齐${capability.atomId}的独立证据` : `为${capability.atomId}安排延迟复测`;
      const activity = gaps.includes('understanding') ? '先独立完成概念探针并解释规则，再重试代码实现。'
        : gaps.includes('procedure') ? '用状态表跟踪最小输入、边界输入和另一个输入，再写代码。'
          : gaps.includes('implementation') ? '根据编译器或测试类别修正一个边界，保留概念与跟踪证据。'
            : '按到期复测任务使用不同隐藏边界重跑程序，并回看原先三个维度的证据。';
      return { id: `gesp_guidance_action_${createHash('sha256').update(`${scope.studentId}:${capability.atomId}:${fingerprint}`).digest('hex').slice(0, 24)}`,
        atomId: capability.atomId, title, activity, dimensionGaps: gaps, evidenceIds,
        successCriterion: '新作答独立完成且解释与冻结知识目标一致；提示后结果单独记录，不冒充独立掌握。',
        minutes: baseMinutes + (index < remainder ? 1 : 0) };
    });
    const plan: GespGuidancePlan = { id: this.store.nextId('gesp_guidance'), studentId: command.studentId, scopeVersion: scope.version,
      evidenceFingerprint: fingerprint, source: 'rules', status: 'awaiting_confirmation', version: 1,
      minutesPerDay: command.minutesPerDay, requestKey: command.requestKey, reason: command.reason, createdAt: now, updatedAt: now,
      createdByUserId: user.id, decidedByUserId: null, decidedAt: null, actions,
      totalActionMinutes: actions.reduce((sum, action) => sum + action.minutes, 0), deferredAtomIds };
    this.store.append('gespGuidancePlans', plan); this.appendGuidanceRevision(plan); return this.publicPlan(plan);
  }
  decideGuidancePlan(user: InMemoryUserAccount, planId: string, input: unknown) {
    const command = validate(gespGuidancePlanDecisionSchema, input);
    const plan = this.store.find('gespGuidancePlans', { id: planId }); if (!plan) throw new NotFoundException('指导计划不存在');
    this.students.assertGuardian(user, plan.studentId);
    const replayed = this.store.select('gespGuidancePlanRevisions', { planId }).find(row => row.requestKey === command.requestKey);
    if (replayed) {
      if (replayed.status !== command.status) throw new ConflictException('同一计划请求键不能改变决策');
      return this.publicPlanSnapshot(replayed);
    }
    if (plan.version !== command.expectedVersion) throw new ConflictException('指导计划已更新，请刷新后核对');
    const valid = plan.status === 'awaiting_confirmation' && command.status === 'active' || plan.status === 'active' && command.status === 'completed';
    if (!valid) throw new BadRequestException('指导计划只能由家长从待确认启用，再由启用状态结束');
    plan.status = command.status; plan.version++; plan.reason = command.reason; plan.updatedAt = new Date().toISOString();
    plan.decidedByUserId = user.id; plan.decidedAt = plan.updatedAt;
    this.appendGuidanceRevision({ ...plan, requestKey: command.requestKey }); return this.publicPlan(plan);
  }
  submitProbe(user: InMemoryUserAccount, input: unknown) {
    if (user.role !== 'student') throw new ForbiddenException('编程概念与跟踪任务必须由当前独立学习身份提交');
    const command = validate(gespProbeSubmissionSchema, input); this.students.assertCanAccessStudent(user, command.studentId);
    const previous = this.store.find('gespProbeSubmissions', { studentId: command.studentId, requestKey: command.requestKey });
    if (previous) {
      if (previous.atomId !== command.atomId || previous.probeId !== command.probeId || previous.answer !== command.answer) throw new ConflictException('同一请求键不能改变知识点、探针或答案');
      return this.publicProbeSubmission(previous);
    }
    const scope = this.store.find('gespLearningScopes', { studentId: command.studentId, status: 'active' });
    if (!scope || !scope.atomIds.includes(command.atomId)) throw new ForbiddenException('该知识点不在家长已确认的GESP学习范围内');
    const task = this.studentData().tasks.find(row => row.atomId === command.atomId), probe = task?.probes.find(row => row.id === command.probeId);
    if (!task || !probe) throw new NotFoundException('探针不存在或不属于当前知识点');
    if (!probe.options.includes(command.answer)) throw new BadRequestException('请选择一个有效选项');
    const status = command.answer === probe.answer ? 'correct' as const : 'incorrect' as const;
    const provenance = this.taskProvenance(task);
    const evidence = this.responseEvidence(command.studentId, task.id, probe.id);
    const receipt: GespProbeSubmissionReceipt = { id: this.store.nextId('gesp_probe'), studentId: command.studentId, atomId: command.atomId,
      taskId: task.id, probeId: probe.id, dimension: probe.dimension, status, requestKey: command.requestKey, answer: command.answer,
      provenance, evidence,
      createdAt: new Date().toISOString(), analysis: status === 'correct' ? (probe.analysis ?? '当前证据支持这一判断。') :
        `当前判断还不一致。请回到题目材料，核对当前知识点的可观察目标：${task.title}。本结果只针对该探针，不直接确定更深原因。` };
    this.store.append('gespProbeSubmissions', receipt);
    receipt.feedbackHeld = !this.feedbackReleased(command.studentId, task.id);
    this.scheduleCompletedGroup(command.studentId, task);
    return this.publicProbeSubmission(receipt);
  }
  async submitCode(user: InMemoryUserAccount, input: unknown) {
    if (user.role !== 'student') throw new ForbiddenException('编程作答必须由当前独立学习身份提交');
    const command = validate(gespCodeSubmissionSchema, input); this.students.assertCanAccessStudent(user, command.studentId);
    const previous = this.store.find('gespCodeSubmissions', { studentId: command.studentId, requestKey: command.requestKey });
    if (previous) {
      if (previous.atomId !== command.atomId || previous.sourceSha256 !== hash(command.source) || (previous.reviewTaskId ?? undefined) !== command.reviewTaskId ||
        (previous.hintEventId ?? undefined) !== command.hintEventId) throw new ConflictException('同一提交请求键不能改变知识点、源代码、复测任务或提示引用');
      return this.publicSubmission(previous);
    }
    const scope = this.store.find('gespLearningScopes', { studentId: command.studentId, status: 'active' });
    if (!scope || !scope.atomIds.includes(command.atomId)) throw new ForbiddenException('该知识点不在家长已确认的GESP学习范围内');
    const task = this.studentData().tasks.find(row => row.atomId === command.atomId); if (!task) throw new NotFoundException('该知识点尚无已发布试点题');
    const hint = command.hintEventId ? this.store.find('gespHintEvents', { id: command.hintEventId, studentId: command.studentId }) : undefined;
    if (command.hintEventId && (!hint || hint.taskId !== task.id)) throw new BadRequestException('提示记录不属于当前编程任务');
    const review = command.reviewTaskId ? this.store.find('gespReviewTasks', { id: command.reviewTaskId, studentId: command.studentId }) : undefined;
    if (command.reviewTaskId && (!review || review.atomId !== command.atomId || review.taskId !== task.id)) throw new BadRequestException('复测任务不属于当前编程任务');
    // A client cannot erase help by omitting a hint identifier or closing its panel.
    const evidence = this.responseEvidence(command.studentId, task.id, undefined, Boolean(review));
    if (review && (hint || evidence.hintEventIds.length)) throw new BadRequestException('间隔复测必须独立完成；本题已有提示曝光，请使用新的已审核独立任务');
    const taskContentSha256 = hash(JSON.stringify(task)), tests = review ? this.reviewTests(task, review.stageDay) : task.tests;
    if (review) {
      const testPackSha256 = hash(JSON.stringify(tests));
      const source = this.store.find('gespCodeSubmissions', { id: review.sourceSubmissionId });
      if (!this.independentResponse(source) || testPackSha256 !== review.testPackSha256 || review.taskContentSha256 && review.taskContentSha256 !== taskContentSha256 ||
        source?.provenance?.taskContentSha256 && source.provenance.taskContentSha256 !== taskContentSha256) {
        throw new ConflictException('复测任务对应的题面或隐藏测试包已变化，请重新完成独立评测后再安排复测');
      }
    }
    if (review && !this.reviewEligibility(review).due) throw new BadRequestException('复测尚未到期或已经完成；须从最近相关反馈起等待完整间隔');
    const provenance = this.taskProvenance(task, tests);
    const receipt = await this.runCpp(command.source, tests), now = new Date().toISOString(), sourceSha256 = receipt.sourceSha256;
    const finalEvidence = this.responseEvidence(command.studentId, task.id, undefined, Boolean(review));
    if (review && finalEvidence.hintEventIds.length) throw new ConflictException('运行期间已有提示曝光，本次不能计入独立保持证据');
    const timing = review ? this.reviewEligibility(review) : null;
    if (review && !timing?.due) throw new ConflictException('运行期间复测资格已变化；请按最近相关反馈重新等待完整间隔');
    const hintLevel = Math.max(0, ...this.store.select('gespHintEvents', { studentId: command.studentId, taskId: task.id }).map(row => row.level));
    const status = receipt.passed ? 'passed' as const : receipt.compile?.passed ? 'failed' as const : 'error' as const;
    const row: GespCodeSubmissionReceipt = { id: this.store.nextId('gesp_submission'), studentId: command.studentId, atomId: command.atomId,
      taskId: task.id, sourceSha256, status, createdAt: now, toolchain: receipt.toolchain, compilePassed: Boolean(receipt.compile?.passed),
      requestKey: command.requestKey, source: command.source, compileDiagnostics: this.safeDiagnostic(receipt.compile?.stderr),
      runtimeDiagnostics: (receipt.tests ?? []).filter((test: any) => test.stderr).map((test: any) => ({ index: test.index,
        status: test.status, stderr: this.safeDiagnostic(test.stderr).join('\n').slice(0, 2000) })),
      tests: (receipt.tests ?? []).map((test: any) => ({ index: test.index, passed: test.passed,
        status: test.status, exitCode: test.exitCode, durationMs: test.durationMs })), hintEventId: hint?.id ?? null,
      hintLevel, independent: finalEvidence.classification === 'independent', reviewTaskId: review?.id ?? null, evidence: finalEvidence };
    row.provenance = provenance;
    if (review && timing?.retentionTiming) row.retentionTiming = timing.retentionTiming;
    this.store.append('gespCodeSubmissions', row);
    row.feedbackHeld = !review && !this.feedbackReleased(command.studentId, task.id);
    if (review) {
      review.attemptCount++; review.lastSubmissionId = row.id; review.lastStatus = status;
      if (receipt.passed) { review.status = 'completed'; review.completedSubmissionId = row.id; review.completedAt = now; }
    } else this.scheduleCompletedGroup(command.studentId, task);
    return this.publicSubmission(row);
  }
  private scopeView(scope: any) { const { confirmedByUserId: _confirmedByUserId, requestKey: _requestKey, ...safe } = scope; return safe; }
  private publicHint(row: GespHintEvent) { const { requestKey: _requestKey, ...safe } = row; return safe; }
  private publicPlan(row: GespGuidancePlan) {
    const { requestKey: _requestKey, createdByUserId: _createdBy, decidedByUserId: _decidedBy, ...safe } = row;
    return { ...safe, totalActionMinutes: row.totalActionMinutes ?? row.actions.reduce((sum, action) => sum + action.minutes, 0),
      deferredAtomIds: row.deferredAtomIds ?? [] };
  }
  private publicPlanSnapshot(row: GespGuidancePlanRevision) { return { ...this.publicPlan(row), id: row.planId }; }
  private publicTask(task: PilotTask): GespStudentTask {
    const { tests: _tests, ...publicTask } = task;
    const contentSha256 = hash(JSON.stringify(task)), stored = this.store.find('gespTaskReviews', { taskId: task.id }),
      current = stored?.taskContentSha256 === contentSha256, status = stored ? current ? stored.status : 'stale' : 'unreviewed';
    return { ...publicTask, reviewStatus: status === 'approved' ? 'instructional_approved' : 'original_authored_pilot',
      contentReviewStatus: status, contentReviewVersion: stored?.version ?? 0,
      probes: task.probes.map(({ answer: _answer, analysis: _analysis, ...probe }) => probe) };
  }
  private publicTaskReview(row: GespTaskReview, contentSha256: string) {
    const { requestKey: _requestKey, reviewId: _reviewId, ...safe } = row as GespTaskReview & { reviewId?: string };
    return { ...safe, current: row.taskContentSha256 === contentSha256 };
  }
  private taskProvenance(task: PilotTask, tests?: Array<{ input: string; expected: string }>): GespTaskProvenance {
    const taskContentSha256 = hash(JSON.stringify(task)), review = this.store.find('gespTaskReviews', { taskId: task.id });
    const contentReviewStatus = !review ? 'unreviewed' : review.taskContentSha256 === taskContentSha256 ? review.status : 'stale';
    return { taskContentSha256, testPackSha256: tests ? hash(JSON.stringify(tests)) : null,
      contentReviewVersion: review?.version ?? 0, contentReviewStatus };
  }
  private publicProbeSubmission(row: GespProbeSubmissionReceipt, projection = false) {
    const { requestKey: _requestKey, feedbackHeld: _held, ...safe } = row;
    if (row.feedbackHeld && !(projection && this.feedbackReleased(row.studentId, row.taskId))) {
      return { ...safe, status: 'recorded' as const, analysis: '首答已保存。完成本题的理解、跟踪和代码首答后一起查看反馈；也可结束首组并获取提示。', feedbackState: 'held' as const };
    }
    return safe;
  }
  private taskResponses(studentId: string, taskId: string) {
    return [...this.store.select('gespProbeSubmissions', { studentId, taskId }),
      ...this.store.select('gespCodeSubmissions', { studentId, taskId }).filter(row => !row.reviewTaskId)];
  }
  private feedbackReleased(studentId: string, taskId: string) {
    const rows = this.taskResponses(studentId, taskId);
    // Legacy responses already exposed feedback. They cannot become a fresh independent group.
    if (rows.some(row => row.evidence?.policy !== 'gesp-first-group-v2') || this.store.select('gespHintEvents', { studentId, taskId }).length) return true;
    const task = this.studentData().tasks.find(row => row.id === taskId);
    return Boolean(task && task.probes.every(probe => rows.some(row => 'probeId' in row && row.probeId === probe.id)) &&
      rows.some(row => 'sourceSha256' in row));
  }
  private scheduleCompletedGroup(studentId: string, task: PilotTask) {
    const probes = this.store.select('gespProbeSubmissions', { studentId }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const submissions = this.store.select('gespCodeSubmissions', { studentId }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const capability = this.capabilities([task.atomId], probes, submissions).at(0);
    const code = submissions.find(row => row.taskId === task.id && capability?.independentEvidenceIds.includes(row.id) && this.independentResponse(row) && !row.reviewTaskId);
    if (capability?.state === 'current_evidence_met' && code) {
      const responses = [...probes, ...submissions].filter(row => capability.independentEvidenceIds.includes(row.id));
      const completedAt = new Date(Math.max(...responses.map(row => Date.parse(row.createdAt)))).toISOString();
      this.scheduleReviews(studentId, task.atomId, task.id, code.id, completedAt);
    }
  }
  private reviewEligibility(review: GespReviewTask) {
    const blocked = (waitingReason: string) => ({ due: false, effectiveDueAt: null as string | null, retentionAnchorAt: null as string | null,
      waitingReason, retentionTiming: null as GespCodeSubmissionReceipt['retentionTiming'] | null });
    if (review.status !== 'scheduled') return blocked('');
    const source = this.store.find('gespCodeSubmissions', { id: review.sourceSubmissionId, studentId: review.studentId });
    if (!this.independentResponse(source) || source?.status !== 'passed' || source.taskId !== review.taskId) return blocked('历史独立性未确认，需要新的已审核独立任务。');
    const task = this.studentData().tasks.find(row => row.id === review.taskId), taskHash = task ? hash(JSON.stringify(task)) : null;
    if (!task || source.provenance?.taskContentSha256 !== taskHash || review.taskContentSha256 && review.taskContentSha256 !== taskHash ||
        hash(JSON.stringify(this.reviewTests(task, review.stageDay))) !== review.testPackSha256) return blocked('原题或隐藏测试包已变化，需要重新核对独立任务。');
    if (this.store.select('gespHintEvents', { studentId: review.studentId, taskId: review.taskId }).length) return blocked('本题已有提示帮助，需要新的已审核独立任务。');
    const feedback = [...this.store.select('gespProbeSubmissions', { studentId: review.studentId, taskId: review.taskId }),
      ...this.store.select('gespCodeSubmissions', { studentId: review.studentId, taskId: review.taskId }).filter(row => !row.reviewTaskId || row.status !== 'passed')]
      .filter(row => row.feedbackHeld !== true);
    const times = [Date.parse(review.createdAt), ...feedback.map(row => Date.parse(row.createdAt))], original = Date.parse(review.dueAt);
    if (!Number.isFinite(original) || times.some(value => !Number.isFinite(value))) return blocked('缺少准确反馈时间，暂不能确认本次间隔。');
    const anchor = Math.max(...times), eligible = Math.max(original, anchor + review.stageDay * 86_400_000);
    const retentionTiming: NonNullable<GespCodeSubmissionReceipt['retentionTiming']> = { policy: 'gesp-feedback-delay-v1', anchorAt: new Date(anchor).toISOString(),
      originalDueAt: review.dueAt, eligibleAt: new Date(eligible).toISOString(), feedbackResponseIds: feedback.map(row => row.id).sort() };
    return { due: eligible <= Date.now(), effectiveDueAt: retentionTiming.eligibleAt, retentionAnchorAt: retentionTiming.anchorAt,
      waitingReason: eligible > Date.now() ? '须从最近相关反馈起等待完整间隔；原计划日期保持。' : '', retentionTiming };
  }
  private responseEvidence(studentId: string, taskId: string, probeId?: string, retention = false): GespResponseEvidence {
    const hintEventIds = this.store.select('gespHintEvents', { studentId, taskId }).map(row => row.id);
    const priorResponseIds = probeId
      ? this.store.select('gespProbeSubmissions', { studentId, taskId, probeId }).map(row => row.id)
      : this.store.select('gespCodeSubmissions', { studentId, taskId }).filter(row => !row.reviewTaskId).map(row => row.id);
    const feedbackExposureIds = this.feedbackReleased(studentId, taskId) ? this.taskResponses(studentId, taskId).map(row => row.id) : [];
    return { policy: 'gesp-first-group-v2', classification: hintEventIds.length ? 'assisted' : retention ? 'retention' : priorResponseIds.length ? 'practice' : feedbackExposureIds.length ? 'assisted' : 'independent',
      priorResponseIds, hintEventIds, feedbackExposureIds };
  }
  private independentResponse(row: any) {
    return row?.evidence?.policy === 'gesp-first-group-v2' && row.evidence.classification === 'independent';
  }
  private capabilities(atomIds: string[], probes: any[], submissions: any[], reviews: any[] = []) {
    return atomIds.map(atomId => {
      const task = this.studentData().tasks.find(row => row.atomId === atomId), contentSha256 = task ? hash(JSON.stringify(task)) : null,
        compatible = (row: any) => Boolean(task && row.taskId === task.id && row.provenance?.taskContentSha256 === contentSha256),
        compatibleProbes = probes.filter(compatible),
        compatibleSubmissions = submissions.filter(compatible),
        compatibleReviews = reviews.filter((row: any) => Boolean(task && row.atomId === atomId &&
          (row.taskContentSha256 ?? this.store.find('gespCodeSubmissions', { id: row.sourceSubmissionId })?.provenance?.taskContentSha256) === contentSha256)),
        invalidatedEvidenceIds = [...probes.filter(row => row.atomId === atomId && !compatible(row)),
          ...submissions.filter(row => row.atomId === atomId && !compatible(row)),
          ...reviews.filter((row: any) => row.atomId === atomId && !compatibleReviews.includes(row))].map(row => row.id);
      const latestProbe = (dimension: string) => compatibleProbes.find(row => row.dimension === dimension && this.independentResponse(row))
        ?? compatibleProbes.find(row => row.dimension === dimension);
      const latestCode = compatibleSubmissions.find(row => !row.reviewTaskId && this.independentResponse(row)) ?? compatibleSubmissions.find(row => !row.reviewTaskId), understanding = latestProbe('understanding'), procedure = latestProbe('procedure'),
        atomReviews = compatibleReviews, completedReviews = atomReviews.filter(row => {
          if (row.status !== 'completed' || typeof row.completedSubmissionId !== 'string') return false;
          const result = this.store.find('gespCodeSubmissions', { id: row.completedSubmissionId }), timing = result?.retentionTiming;
          if (!result || !compatible(result) || result.status !== 'passed' || result.reviewTaskId !== row.id || result.evidence?.classification !== 'retention' ||
              timing?.policy !== 'gesp-feedback-delay-v1' || timing.originalDueAt !== row.dueAt || result.createdAt !== row.completedAt) return false;
          const completedAt = Date.parse(result.createdAt), anchorAt = Date.parse(timing.anchorAt), eligibleAt = Date.parse(timing.eligibleAt), originalDueAt = Date.parse(row.dueAt);
          return [completedAt, anchorAt, eligibleAt, originalDueAt].every(Number.isFinite) &&
            eligibleAt >= Math.max(originalDueAt, anchorAt + row.stageDay * 86_400_000) && completedAt >= eligibleAt;
        }),
        historicalTimingUnknown = atomReviews.some(row => row.status === 'completed' && !completedReviews.includes(row)),
        latestReview = [...atomReviews].sort((left, right) => left.dueAt.localeCompare(right.dueAt)).at(-1),
        responseStatus = (row: any, passed: string) => !row ? 'unknown' : row.feedbackHeld && !this.feedbackReleased(row.studentId, row.taskId) ? 'recorded' : row.status !== passed ? row.status : this.independentResponse(row) ? row.status
          : row.evidence?.classification === 'assisted' ? `assisted_${passed === 'passed' ? 'pass' : 'correct'}` : row.evidence ? `practice_${passed === 'passed' ? 'pass' : 'correct'}` : 'independence_unknown',
        implementationStatus = responseStatus(latestCode, 'passed'),
        dimensions = [{ dimension: 'understanding', status: responseStatus(understanding, 'correct'), attempts: compatibleProbes.filter(row => row.dimension === 'understanding').length },
          { dimension: 'procedure', status: responseStatus(procedure, 'correct'), attempts: compatibleProbes.filter(row => row.dimension === 'procedure').length },
          { dimension: 'implementation', status: implementationStatus ?? 'unknown', attempts: compatibleSubmissions.filter(row => !row.reviewTaskId).length },
          { dimension: 'retention', status: completedReviews.length ? 'correct' : historicalTimingUnknown ? 'timing_unknown' : latestReview?.lastStatus ?? (atomReviews.length ? 'scheduled' : 'unknown'),
            attempts: atomReviews.reduce((sum, review) => sum + review.attemptCount, 0) }];
      const core = dimensions.slice(0, 3), known = core.filter(row => row.status !== 'unknown'), met = core.filter(row => row.status === 'correct' || row.status === 'passed'),
        failed = dimensions.filter(row => row.status === 'incorrect' || row.status === 'failed' || row.status === 'error');
      const state = !known.length ? 'unknown' : met.length === 3 ? 'current_evidence_met' : failed.length ? 'needs_verification' : 'partial_evidence';
      let hypothesis = '继续完成未测维度，暂不推断能力原因。', nextAction = '完成三个维度的独立任务后，再比较概念、状态跟踪和代码实现。';
      if (understanding?.status === 'incorrect') { hypothesis = '规则或概念理解假设仍待验证'; nextAction = '先独立重做概念探针，并用反例解释规则，不立即增加同型代码量。'; }
      else if (procedure?.status === 'incorrect') { hypothesis = '状态跟踪或步骤执行假设仍待验证'; nextAction = '用状态表逐步跟踪相同小例子，再换输入复测。'; }
      else if (latestCode?.status === 'error') { hypothesis = '编译或语言形式问题是当前表面障碍'; nextAction = '根据编译器诊断修复语法或类型问题，再运行原有边界。'; }
      else if (latestCode?.status === 'failed') { hypothesis = '边界、输入输出或实现细节假设仍待验证'; nextAction = '保留概念与跟踪证据，分别检查最小输入、边界和输出格式。'; }
      else if (implementationStatus === 'assisted_pass') { hypothesis = '提示后已经能够完成，但独立性仍待验证'; nextAction = '此次保留为辅助练习；需要新的已审核任务验证独立完成，关闭提示不会清除曝光。'; }
      else if (core.some(row => ['practice_pass', 'practice_correct', 'assisted_correct', 'independence_unknown'].includes(row.status))) {
        hypothesis = '练习结果已保存，首答或帮助边界仍不支持独立通过'; nextAction = '保留首次响应和原有反馈，使用新的已审核任务继续核对；原题重做不能替代独立后测。';
      }
      else if (state === 'current_evidence_met') { hypothesis = '当前三个维度均有独立通过证据'; nextAction = completedReviews.length ? '已保留延迟保持证据；继续用新任务验证陌生情境迁移。' : '已生成1、3、7、14日复测，到期使用不同隐藏边界验证保持。'; }
      return { atomId, state, dimensions, hypothesis, nextAction,
        independentEvidenceIds: this.latestEvidenceIds(atomId, compatibleProbes, compatibleSubmissions),
        invalidatedEvidenceIds, evidenceNotice: invalidatedEvidenceIds.length
          ? `${invalidatedEvidenceIds.length}条证据来自已变化的题面或测试版本，保留在历史中但不计入当前能力。` :
          historicalTimingUnknown ? '历史回执保持；缺少最近反馈与间隔快照的旧复测结果暂不确认保持资格。' :
          [...compatibleProbes, ...compatibleSubmissions].some(row => row.evidence?.policy !== 'gesp-first-group-v2') ? '历史回执保持；缺少首组反馈边界的旧结果不自动计为独立证据。' : '' };
    });
  }
  private latestEvidenceIds(atomId: string, probes: any[], submissions: any[]) {
    const probeIds = ['understanding', 'procedure'].map(dimension => probes.find(row => row.atomId === atomId && row.dimension === dimension && this.independentResponse(row))?.id);
    const code = submissions.find(row => row.atomId === atomId && !row.reviewTaskId && this.independentResponse(row));
    return [...probeIds, this.independentResponse(code) ? code?.id : undefined].filter((id): id is string => typeof id === 'string');
  }
  private reviewTests(task: PilotTask, stageDay: number) {
    const ranked = task.tests.map((test, index) => ({ test, rank: createHash('sha256').update(`${task.id}:${stageDay}:${index}:${test.input}:${test.expected}`).digest('hex') }))
      .sort((left, right) => left.rank.localeCompare(right.rank));
    const count = stageDay === 1 ? Math.min(2, ranked.length) : stageDay === 3 ? Math.min(3, ranked.length) : ranked.length;
    return ranked.slice(0, count).map(row => row.test);
  }
  private scheduleReviews(studentId: string, atomId: string, taskId: string, sourceSubmissionId: string, now: string) {
    for (const stageDay of [1, 3, 7, 14] as const) {
      const id = `gesp_review_${createHash('sha256').update(`${studentId}:${atomId}:${stageDay}:${sourceSubmissionId}`).digest('hex').slice(0, 36)}`;
      if (this.store.find('gespReviewTasks', { id })) continue;
      const dueAt = new Date(Date.parse(now) + stageDay * 86_400_000).toISOString();
      const task = this.studentData().tasks.find(row => row.id === taskId)!;
      const review: GespReviewTask = { id, studentId, atomId, taskId, sourceSubmissionId, stageDay, dueAt, createdAt: now,
        status: 'scheduled', taskContentSha256: hash(JSON.stringify(task)), testPackSha256: hash(JSON.stringify(this.reviewTests(task, stageDay))),
        attemptCount: 0, lastSubmissionId: null, lastStatus: null, completedSubmissionId: null, completedAt: null };
      this.store.append('gespReviewTasks', review);
    }
  }
  private appendGuidanceRevision(plan: GespGuidancePlan) {
    const revision: GespGuidancePlanRevision = { ...structuredClone(plan), id: this.store.nextId('gesp_guidance_revision'), planId: plan.id };
    this.store.append('gespGuidancePlanRevisions', revision);
  }
  private safeDiagnostic(value: unknown) {
    return String(value ?? '').replace(/(?:\/tmp|\/dev\/shm)\/study-(?:agent-)?gesp-[^/\s:]+/g, 'sandbox').split(/\r?\n/)
      .map(line => line.trim()).filter(Boolean).slice(0, 30).map(line => line.slice(0, 500));
  }
  private appendScopeRevision(scope: any) {
    const revision: GespLearningScopeRevision = { ...structuredClone(scope), id: this.store.nextId('gesp_scope_revision'), scopeId: scope.id };
    this.store.append('gespLearningScopeRevisions', revision);
  }
  private publicSubmission(row: GespCodeSubmissionReceipt, projection = false) {
    const { source: _source, requestKey: _requestKey, feedbackHeld: _held, ...safe } = row;
    if (row.feedbackHeld && !(projection && this.feedbackReleased(row.studentId, row.taskId))) {
      return { ...safe, status: 'recorded' as const, compilePassed: null, compileDiagnostics: [], runtimeDiagnostics: [], tests: [], feedbackState: 'held' as const };
    }
    return safe;
  }
  private runCpp(source: string, tests: Array<{ input: string; expected: string }>) {
    const script = resolve(workspaceRoot(), 'scripts/gesp/run_submission.cjs');
    return new Promise<any>((resolvePromise, reject) => {
      const stdout: Buffer[] = [], stderr: Buffer[] = [];
      const child = spawn(process.execPath, [script], { cwd: workspaceRoot(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }), timer = setTimeout(() => child.kill(), 60_000);
      child.stdout.on('data', chunk => stdout.push(chunk)); child.stderr.on('data', chunk => stderr.push(chunk));
      child.on('error', error => { clearTimeout(timer); reject(new ServiceUnavailableException(`GESP运行器不可用：${error.message}`)); });
      child.on('close', () => { clearTimeout(timer); try { resolvePromise(JSON.parse(Buffer.concat(stdout).toString('utf8'))); }
        catch { reject(new ServiceUnavailableException(`GESP运行器未返回有效收据：${Buffer.concat(stderr).toString('utf8').slice(0, 500)}`)); } });
      child.stdin.end(JSON.stringify({ source, tests }));
    });
  }
  atoms(user: InMemoryUserAccount, input: unknown) {
    this.assertAccess(user);
    const { level } = validate(gespSearchSchema.pick({ level: true }).strict(), input);
    return this.data().graph.atoms.filter(a => level === undefined || a.level === level);
  }
  search(user: InMemoryUserAccount, input: unknown) {
    this.assertAccess(user);
    const query = validate(gespSearchSchema, input), where: string[] = [], values: Array<string | number> = [];
    for (const [column, value] of [['level', query.level], ['session', query.session], ['kind', query.kind], ['source_kind', query.sourceKind]] as const) {
      if (value !== undefined) { where.push(`${column}=?`); values.push(value); }
    }
    if (query.atomId) {
      if (!this.data().graph.atoms.some(a => a.id === query.atomId)) throw new BadRequestException('知识点不存在');
      where.push('id IN (SELECT question_id FROM question_atoms WHERE atom_id=?)'); values.push(query.atomId);
    }
    if (query.q) { where.push('instr(lower(search_text),lower(?))>0'); values.push(query.q); }
    const condition = where.length ? `WHERE ${where.join(' AND ')}` : '', db = this.index();
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM questions ${condition}`).get(...values) as { n: number }).n;
    const rows = db.prepare(`SELECT body FROM questions ${condition} ORDER BY CASE WHEN session='sample' THEN 1 ELSE 0 END,session DESC,level,kind,number LIMIT ? OFFSET ?`)
      .all(...values, query.pageSize, (query.page - 1) * query.pageSize) as Array<{ body: string }>;
    return { items: rows.map(r => this.publicQuestion(JSON.parse(r.body))), total, page: query.page, pageSize: query.pageSize };
  }
  private publicQuestion(q: IndexedQuestion): GespQuestion {
    return { id: q.id, certificationLevel: q.certificationLevel, session: q.session ?? 'sample', kind: q.kind, sourceKind: q.sourceKind,
      sourceAuthority: q.sourceAuthority, number: q.number, title: q.title, pdfUrl: q.pdfUrl, pdfSha256: q.pdfSha256,
      pdfPages: q.pdfPages, sourcePageUrl: q.sourcePageUrl, atomCandidates: q.atomCandidates,
      publicationStatus: 'research_only', requiresVisualReview: true };
  }
  /** Resolve only known archive-relative paths, including a realpath check for symlinks. */
  private archiveFile(path: string): string | null {
    if (!path.startsWith('data/gesp/')) throw new ServiceUnavailableException('GESP档案路径无效');
    const target = resolve(this.root, path.slice('data/gesp/'.length));
    const inside = (candidate: string, root: string) => { const rel = relative(root, candidate); return rel !== '' && !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..\\`) && !rel.startsWith('../'); };
    if (!inside(target, this.root)) throw new ServiceUnavailableException('GESP档案路径越界');
    if (!existsSync(target)) return null;
    if (!inside(realpathSync(target), realpathSync(this.root))) throw new ServiceUnavailableException('GESP档案链接越界');
    return target;
  }
  detail(user: InMemoryUserAccount, id: string): GespQuestionDetail {
    this.assertAccess(user);
    if (!/^gesp-cpp-(20\d{2}-\d{2}|sample)-l0[1-8]-(choice|true-false|programming)-\d{2}$/.test(id)) throw new BadRequestException('题目标识无效');
    const found = this.index().prepare('SELECT body FROM questions WHERE id=?').get(id) as { body: string } | undefined;
    if (!found) throw new NotFoundException('题目不在本资料版本中');
    const row: IndexedQuestion = JSON.parse(found.body), path = this.archiveFile(row.textPath);
    let content: GespQuestionDetail['content'] = null;
    if (path) {
      try {
        const payload = JSON.parse(readFileSync(path, 'utf8'));
        if (payload.id !== row.id || payload.pdfSha256 !== row.pdfSha256 || hash(payload.rawText) !== row.textSha256 ||
            !payload.rawText.startsWith(payload.promptMachineText) || !payload.rawText.endsWith(payload.referenceMaterialMachineText)) throw new Error('Hash mismatch');
        content = { promptMachineText: payload.promptMachineText, referenceMaterialMachineText: payload.referenceMaterialMachineText };
      } catch { throw new ServiceUnavailableException('单题档案校验失败，请恢复原档案后重建'); }
    }
    return { ...this.publicQuestion(row), archiveStatus: path ? 'available' : 'missing', content,
      answer: row.answer, answerBasis: row.answerBasis, answerReviewStatus: row.answerReviewStatus,
      referenceMaterialPresent: row.referenceMaterialPresent, hiddenTestDataStatus: 'not_collected', notice };
  }
  document(user: InMemoryUserAccount, sha256: string) {
    this.assertAccess(user);
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new BadRequestException('原卷标识无效');
    const row = this.index().prepare('SELECT path,bytes FROM documents WHERE sha256=?').get(sha256) as { path: string; bytes: number } | undefined;
    if (!row) throw new NotFoundException('原卷未登记');
    const path = this.archiveFile(row.path);
    if (!path) throw new NotFoundException('本地原卷未安装，请恢复 data/gesp 档案');
    if (statSync(path).size !== row.bytes || hash(readFileSync(path)) !== sha256) throw new ServiceUnavailableException('原卷字节校验失败');
    return { path, size: row.bytes, sha256 };
  }
  onModuleDestroy() { this.db?.close(); }
}
