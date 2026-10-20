import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { gespCodeSubmissionSchema, gespGuidancePlanCreateSchema, gespGuidancePlanDecisionSchema, gespHintRequestSchema,
  gespLearningScopeSchema, gespProbeSubmissionSchema, gespSearchSchema, type GespAtom, type GespCodeSubmissionReceipt,
  type GespGuidanceAction, type GespGuidancePlan, type GespGuidancePlanRevision, type GespHintEvent, type GespOverview,
  type GespLearningScopeRevision, type GespProbeSubmissionReceipt, type GespQuestion, type GespQuestionDetail,
  type GespReviewTask, type GespStudentTask, type GespTeachingPlan } from '@study-agent/contracts';
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
  setStudentScope(user: InMemoryUserAccount, studentId: string, input: unknown) {
    this.students.assertGuardian(user, studentId);
    const command = validate(gespLearningScopeSchema, input), tasks = this.studentData().tasks;
    if (!command.atomIds.every(atomId => tasks.some(task => task.atomId === atomId))) throw new BadRequestException('范围包含尚无原创试点题的知识点');
    if (!command.atomIds.every(atomId => atomId.startsWith(`gesp-cpp.l${command.level}.`))) throw new BadRequestException('认证等级与知识点命名空间不一致');
    const replayed = this.store.find('gespLearningScopeRevisions', { studentId, requestKey: command.requestKey });
    if (replayed) {
      if (replayed.level !== command.level || JSON.stringify([...replayed.atomIds].sort()) !== JSON.stringify([...new Set(command.atomIds)].sort()))
        throw new ConflictException('同一范围请求键不能改变范围内容');
      return this.scopeView(this.store.find('gespLearningScopes', { studentId })!);
    }
    const previous = this.store.find('gespLearningScopes', { studentId }), now = new Date().toISOString();
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
      tasks: user.role === 'student' ? [] : catalog, availableTasks: catalog, submissions: [], probeSubmissions: [],
      hintEvents: [], guidancePlans: [], reviewTasks: [], capabilities: [] };
    const available = tasks.filter(task => scope.atomIds.includes(task.atomId)).map(task => this.publicTask(task));
    const submissions = this.store.select('gespCodeSubmissions', { studentId }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(row => this.publicSubmission(row));
    const probes = this.store.select('gespProbeSubmissions', { studentId }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(row => this.publicProbeSubmission(row));
    const scopeHistory = this.store.select('gespLearningScopeRevisions', { studentId }).sort((a, b) => a.version - b.version).map(row => this.scopeView(row));
    const hints = this.store.select('gespHintEvents', { studentId }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(row => this.publicHint(row));
    const guidancePlans = this.store.select('gespGuidancePlans', { studentId }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(row => this.publicPlan(row));
    const reviewTasks = this.store.select('gespReviewTasks', { studentId }).sort((a, b) => a.dueAt.localeCompare(b.dueAt)).map(row => ({ ...row,
      due: row.status === 'scheduled' && Date.parse(row.dueAt) <= Date.now() }));
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
      if (previous.taskId !== command.taskId || previous.level !== command.level) throw new ConflictException('同一提示请求键不能改变任务或提示级别');
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
    const actions: GespGuidanceAction[] = capabilities.map(capability => {
      const gaps = capability.dimensions.filter((dimension: any) => !['correct', 'passed'].includes(dimension.status)).map((dimension: any) => dimension.dimension);
      const evidenceIds = this.latestEvidenceIds(capability.atomId, probes, submissions);
      const title = gaps.length ? `补齐${capability.atomId}的独立证据` : `为${capability.atomId}安排延迟复测`;
      const activity = gaps.includes('understanding') ? '先独立完成概念探针并解释规则，再重试代码实现。'
        : gaps.includes('procedure') ? '用状态表跟踪最小输入、边界输入和另一个输入，再写代码。'
          : gaps.includes('implementation') ? '根据编译器或测试类别修正一个边界，保留概念与跟踪证据。'
            : '按到期复测任务使用不同隐藏边界重跑程序，并回看原先三个维度的证据。';
      return { id: `gesp_guidance_action_${createHash('sha256').update(`${scope.studentId}:${capability.atomId}:${fingerprint}`).digest('hex').slice(0, 24)}`,
        atomId: capability.atomId, title, activity, dimensionGaps: gaps, evidenceIds,
        successCriterion: '新作答独立完成且解释与冻结知识目标一致；提示后结果单独记录，不冒充独立掌握。', minutes: Math.min(20, command.minutesPerDay) };
    });
    const plan: GespGuidancePlan = { id: this.store.nextId('gesp_guidance'), studentId: command.studentId, scopeVersion: scope.version,
      evidenceFingerprint: fingerprint, source: 'rules', status: 'awaiting_confirmation', version: 1,
      minutesPerDay: command.minutesPerDay, requestKey: command.requestKey, reason: command.reason, createdAt: now, updatedAt: now,
      createdByUserId: user.id, decidedByUserId: null, decidedAt: null, actions };
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
      if (previous.probeId !== command.probeId || previous.answer !== command.answer) throw new ConflictException('同一请求键不能改变探针答案');
      return this.publicProbeSubmission(previous);
    }
    const scope = this.store.find('gespLearningScopes', { studentId: command.studentId, status: 'active' });
    if (!scope || !scope.atomIds.includes(command.atomId)) throw new ForbiddenException('该知识点不在家长已确认的GESP学习范围内');
    const task = this.studentData().tasks.find(row => row.atomId === command.atomId), probe = task?.probes.find(row => row.id === command.probeId);
    if (!task || !probe) throw new NotFoundException('探针不存在或不属于当前知识点');
    if (!probe.options.includes(command.answer)) throw new BadRequestException('请选择一个有效选项');
    const status = command.answer === probe.answer ? 'correct' as const : 'incorrect' as const;
    const receipt: GespProbeSubmissionReceipt = { id: this.store.nextId('gesp_probe'), studentId: command.studentId, atomId: command.atomId,
      taskId: task.id, probeId: probe.id, dimension: probe.dimension, status, requestKey: command.requestKey, answer: command.answer,
      createdAt: new Date().toISOString(), analysis: status === 'correct' ? (probe.analysis ?? '当前证据支持这一判断。') :
        `当前判断还不一致。请回到题目材料，核对当前知识点的可观察目标：${task.title}。本结果只针对该探针，不直接确定更深原因。` };
    this.store.append('gespProbeSubmissions', receipt); return this.publicProbeSubmission(receipt);
  }
  async submitCode(user: InMemoryUserAccount, input: unknown) {
    if (user.role !== 'student') throw new ForbiddenException('编程作答必须由当前独立学习身份提交');
    const command = validate(gespCodeSubmissionSchema, input); this.students.assertCanAccessStudent(user, command.studentId);
    const previous = this.store.find('gespCodeSubmissions', { studentId: command.studentId, requestKey: command.requestKey });
    if (previous) {
      if (previous.sourceSha256 !== hash(command.source) || (previous.reviewTaskId ?? undefined) !== command.reviewTaskId ||
        (previous.hintEventId ?? undefined) !== command.hintEventId) throw new ConflictException('同一提交请求键不能改变源代码、复测任务或提示引用');
      return this.publicSubmission(previous);
    }
    const scope = this.store.find('gespLearningScopes', { studentId: command.studentId, status: 'active' });
    if (!scope || !scope.atomIds.includes(command.atomId)) throw new ForbiddenException('该知识点不在家长已确认的GESP学习范围内');
    const task = this.studentData().tasks.find(row => row.atomId === command.atomId); if (!task) throw new NotFoundException('该知识点尚无已发布试点题');
    const hint = command.hintEventId ? this.store.find('gespHintEvents', { id: command.hintEventId, studentId: command.studentId }) : undefined;
    if (command.hintEventId && (!hint || hint.taskId !== task.id)) throw new BadRequestException('提示记录不属于当前编程任务');
    const review = command.reviewTaskId ? this.store.find('gespReviewTasks', { id: command.reviewTaskId, studentId: command.studentId }) : undefined;
    if (command.reviewTaskId && (!review || review.atomId !== command.atomId || review.taskId !== task.id)) throw new BadRequestException('复测任务不属于当前编程任务');
    if (review && hint) throw new BadRequestException('间隔复测必须独立完成，请关闭提示记录后重新作答');
    if (review && (review.status !== 'scheduled' || Date.parse(review.dueAt) > Date.now())) throw new BadRequestException('复测尚未到期或已经完成');
    const tests = review ? this.reviewTests(task, review.stageDay) : task.tests;
    const receipt = await this.runCpp(command.source, tests), now = new Date().toISOString(), sourceSha256 = receipt.sourceSha256;
    const status = receipt.passed ? 'passed' as const : receipt.compile?.passed ? 'failed' as const : 'error' as const;
    const row: GespCodeSubmissionReceipt = { id: this.store.nextId('gesp_submission'), studentId: command.studentId, atomId: command.atomId,
      taskId: task.id, sourceSha256, status, createdAt: now, toolchain: receipt.toolchain, compilePassed: Boolean(receipt.compile?.passed),
      requestKey: command.requestKey, source: command.source, compileDiagnostics: this.safeDiagnostic(receipt.compile?.stderr),
      runtimeDiagnostics: (receipt.tests ?? []).filter((test: any) => test.stderr).map((test: any) => ({ index: test.index,
        status: test.status, stderr: this.safeDiagnostic(test.stderr).join('\n').slice(0, 2000) })),
      tests: (receipt.tests ?? []).map((test: any) => ({ index: test.index, passed: test.passed,
        status: test.status, exitCode: test.exitCode, durationMs: test.durationMs })), hintEventId: hint?.id ?? null,
      hintLevel: hint?.level ?? 0, independent: !hint && !review, reviewTaskId: review?.id ?? null };
    this.store.append('gespCodeSubmissions', row);
    if (review) {
      review.attemptCount++; review.lastSubmissionId = row.id; review.lastStatus = status;
      if (receipt.passed) { review.status = 'completed'; review.completedSubmissionId = row.id; review.completedAt = now; }
    } else if (receipt.passed && row.independent) {
      const latest = this.capabilities(scope.atomIds,
        [...this.store.select('gespProbeSubmissions', { studentId: command.studentId })].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        [...this.store.select('gespCodeSubmissions', { studentId: command.studentId })].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        this.store.select('gespReviewTasks', { studentId: command.studentId })).find(capability => capability.atomId === command.atomId);
      if (latest?.state === 'current_evidence_met') this.scheduleReviews(command.studentId, command.atomId, task.id, row.id, now);
    }
    return this.publicSubmission(row);
  }
  private scopeView(scope: any) { const { confirmedByUserId: _confirmedByUserId, requestKey: _requestKey, ...safe } = scope; return safe; }
  private publicHint(row: GespHintEvent) { const { requestKey: _requestKey, ...safe } = row; return safe; }
  private publicPlan(row: GespGuidancePlan) { const { requestKey: _requestKey, createdByUserId: _createdBy, decidedByUserId: _decidedBy, ...safe } = row; return safe; }
  private publicPlanSnapshot(row: GespGuidancePlanRevision) { return { ...this.publicPlan(row), id: row.planId }; }
  private publicTask(task: PilotTask): GespStudentTask {
    const { tests: _tests, ...publicTask } = task;
    return { ...publicTask, probes: task.probes.map(({ answer: _answer, analysis: _analysis, ...probe }) => probe) };
  }
  private publicProbeSubmission(row: GespProbeSubmissionReceipt) { const { requestKey: _requestKey, ...safe } = row; return safe; }
  private capabilities(atomIds: string[], probes: any[], submissions: any[], reviews: any[] = []) {
    return atomIds.map(atomId => {
      const latestProbe = (dimension: string) => probes.find(row => row.atomId === atomId && row.dimension === dimension);
      const latestCode = submissions.find(row => row.atomId === atomId && !row.reviewTaskId), understanding = latestProbe('understanding'), procedure = latestProbe('procedure'),
        atomReviews = reviews.filter(row => row.atomId === atomId), completedReviews = atomReviews.filter(row => row.status === 'completed'),
        latestReview = [...atomReviews].sort((left, right) => left.dueAt.localeCompare(right.dueAt)).at(-1),
        implementationStatus = latestCode?.status === 'passed' && latestCode.independent === false ? 'assisted_pass' : latestCode?.status,
        dimensions = [{ dimension: 'understanding', status: understanding?.status ?? 'unknown', attempts: probes.filter(row => row.atomId === atomId && row.dimension === 'understanding').length },
          { dimension: 'procedure', status: procedure?.status ?? 'unknown', attempts: probes.filter(row => row.atomId === atomId && row.dimension === 'procedure').length },
          { dimension: 'implementation', status: implementationStatus ?? 'unknown', attempts: submissions.filter(row => row.atomId === atomId && !row.reviewTaskId).length },
          { dimension: 'retention', status: completedReviews.length ? 'correct' : latestReview?.lastStatus ?? (atomReviews.length ? 'scheduled' : 'unknown'),
            attempts: atomReviews.reduce((sum, review) => sum + review.attemptCount, 0) }];
      const core = dimensions.slice(0, 3), known = core.filter(row => row.status !== 'unknown'), met = core.filter(row => row.status === 'correct' || row.status === 'passed'),
        failed = dimensions.filter(row => row.status === 'incorrect' || row.status === 'failed' || row.status === 'error');
      const state = !known.length ? 'unknown' : met.length === 3 ? 'current_evidence_met' : failed.length ? 'needs_verification' : 'partial_evidence';
      let hypothesis = '继续完成未测维度，暂不推断能力原因。', nextAction = '完成三个维度的独立任务后，再比较概念、状态跟踪和代码实现。';
      if (understanding?.status === 'incorrect') { hypothesis = '规则或概念理解假设仍待验证'; nextAction = '先独立重做概念探针，并用反例解释规则，不立即增加同型代码量。'; }
      else if (procedure?.status === 'incorrect') { hypothesis = '状态跟踪或步骤执行假设仍待验证'; nextAction = '用状态表逐步跟踪相同小例子，再换输入复测。'; }
      else if (latestCode?.status === 'error') { hypothesis = '编译或语言形式问题是当前表面障碍'; nextAction = '根据编译器诊断修复语法或类型问题，再运行原有边界。'; }
      else if (latestCode?.status === 'failed') { hypothesis = '边界、输入输出或实现细节假设仍待验证'; nextAction = '保留概念与跟踪证据，分别检查最小输入、边界和输出格式。'; }
      else if (implementationStatus === 'assisted_pass') { hypothesis = '提示后已经能够完成，但独立性仍待验证'; nextAction = '关闭提示后使用不同隐藏边界独立重做；此次结果继续标为提示后证据。'; }
      else if (state === 'current_evidence_met') { hypothesis = '当前三个维度均有独立通过证据'; nextAction = completedReviews.length ? '已保留延迟保持证据；继续用新任务验证陌生情境迁移。' : '已生成1、3、7、14日复测，到期使用不同隐藏边界验证保持。'; }
      return { atomId, state, dimensions, hypothesis, nextAction, independentEvidenceIds: this.latestEvidenceIds(atomId, probes, submissions) };
    });
  }
  private latestEvidenceIds(atomId: string, probes: any[], submissions: any[]) {
    const probeIds = ['understanding', 'procedure'].map(dimension => probes.find(row => row.atomId === atomId && row.dimension === dimension)?.id);
    const code = submissions.find(row => row.atomId === atomId && !row.reviewTaskId);
    return [...probeIds, code?.id].filter((id): id is string => typeof id === 'string');
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
      const review: GespReviewTask = { id, studentId, atomId, taskId, sourceSubmissionId, stageDay, dueAt, createdAt: now,
        status: 'scheduled', testPackSha256: hash(JSON.stringify(this.reviewTests(this.studentData().tasks.find(task => task.id === taskId)!, stageDay))),
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
  private publicSubmission(row: GespCodeSubmissionReceipt) { const { source: _source, requestKey: _requestKey, ...safe } = row; return safe; }
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
