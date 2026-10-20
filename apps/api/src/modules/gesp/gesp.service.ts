import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { gespCodeSubmissionSchema, gespLearningScopeSchema, gespProbeSubmissionSchema, gespSearchSchema, type GespAtom, type GespCodeSubmissionReceipt, type GespOverview,
  type GespLearningScopeRevision, type GespProbeSubmissionReceipt, type GespQuestion, type GespQuestionDetail, type GespStudentTask, type GespTeachingPlan } from '@study-agent/contracts';
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
    if (!scope) return { studentId, scope: null, notice: this.studentData().notice, tasks: user.role === 'student' ? [] : catalog, availableTasks: catalog, submissions: [] };
    const available = tasks.filter(task => scope.atomIds.includes(task.atomId)).map(task => this.publicTask(task));
    const submissions = this.store.select('gespCodeSubmissions', { studentId }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(row => this.publicSubmission(row));
    const probes = this.store.select('gespProbeSubmissions', { studentId }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(row => this.publicProbeSubmission(row));
    const scopeHistory = this.store.select('gespLearningScopeRevisions', { studentId }).sort((a, b) => a.version - b.version).map(row => this.scopeView(row));
    return { studentId, scope: this.scopeView(scope), scopeHistory, notice: this.studentData().notice, tasks: available,
      availableTasks: user.role === 'student' ? [] : catalog, submissions, probeSubmissions: probes,
      capabilities: this.capabilities(scope.atomIds, probes, submissions) };
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
    if (previous) { if (previous.sourceSha256 !== hash(command.source)) throw new ConflictException('同一提交请求键不能改变源代码'); return this.publicSubmission(previous); }
    const scope = this.store.find('gespLearningScopes', { studentId: command.studentId, status: 'active' });
    if (!scope || !scope.atomIds.includes(command.atomId)) throw new ForbiddenException('该知识点不在家长已确认的GESP学习范围内');
    const task = this.studentData().tasks.find(row => row.atomId === command.atomId); if (!task) throw new NotFoundException('该知识点尚无已发布试点题');
    const receipt = await this.runCpp(command.source, task.tests), now = new Date().toISOString(), sourceSha256 = receipt.sourceSha256;
    const status = receipt.passed ? 'passed' as const : receipt.compile?.passed ? 'failed' as const : 'error' as const;
    const row: GespCodeSubmissionReceipt = { id: this.store.nextId('gesp_submission'), studentId: command.studentId, atomId: command.atomId,
      taskId: task.id, sourceSha256, status, createdAt: now, toolchain: receipt.toolchain, compilePassed: Boolean(receipt.compile?.passed),
      requestKey: command.requestKey, source: command.source, compileDiagnostics: this.safeDiagnostic(receipt.compile?.stderr),
      runtimeDiagnostics: (receipt.tests ?? []).filter((test: any) => test.stderr).map((test: any) => ({ index: test.index,
        status: test.status, stderr: this.safeDiagnostic(test.stderr).join('\n').slice(0, 2000) })),
      tests: (receipt.tests ?? []).map((test: any) => ({ index: test.index, passed: test.passed,
        status: test.status, exitCode: test.exitCode, durationMs: test.durationMs })) };
    this.store.append('gespCodeSubmissions', row); return this.publicSubmission(row);
  }
  private scopeView(scope: any) { const { confirmedByUserId: _confirmedByUserId, ...safe } = scope; return safe; }
  private publicTask(task: PilotTask): GespStudentTask {
    const { tests: _tests, ...publicTask } = task;
    return { ...publicTask, probes: task.probes.map(({ answer: _answer, analysis: _analysis, ...probe }) => probe) };
  }
  private publicProbeSubmission(row: GespProbeSubmissionReceipt) { const { requestKey: _requestKey, ...safe } = row; return safe; }
  private capabilities(atomIds: string[], probes: any[], submissions: any[]) {
    return atomIds.map(atomId => {
      const latestProbe = (dimension: string) => probes.find(row => row.atomId === atomId && row.dimension === dimension);
      const latestCode = submissions.find(row => row.atomId === atomId), understanding = latestProbe('understanding'), procedure = latestProbe('procedure'),
        dimensions = [{ dimension: 'understanding', status: understanding?.status ?? 'unknown', attempts: probes.filter(row => row.atomId === atomId && row.dimension === 'understanding').length },
          { dimension: 'procedure', status: procedure?.status ?? 'unknown', attempts: probes.filter(row => row.atomId === atomId && row.dimension === 'procedure').length },
          { dimension: 'implementation', status: latestCode?.status ?? 'unknown', attempts: submissions.filter(row => row.atomId === atomId).length }];
      const known = dimensions.filter(row => row.status !== 'unknown'), met = dimensions.filter(row => row.status === 'correct' || row.status === 'passed'),
        failed = dimensions.filter(row => row.status === 'incorrect' || row.status === 'failed' || row.status === 'error');
      const state = !known.length ? 'unknown' : met.length === 3 ? 'current_evidence_met' : failed.length ? 'needs_verification' : 'partial_evidence';
      let hypothesis = '继续完成未测维度，暂不推断能力原因。', nextAction = '完成三个维度的独立任务后，再比较概念、状态跟踪和代码实现。';
      if (understanding?.status === 'incorrect') { hypothesis = '规则或概念理解假设仍待验证'; nextAction = '先独立重做概念探针，并用反例解释规则，不立即增加同型代码量。'; }
      else if (procedure?.status === 'incorrect') { hypothesis = '状态跟踪或步骤执行假设仍待验证'; nextAction = '用状态表逐步跟踪相同小例子，再换输入复测。'; }
      else if (latestCode?.status === 'error') { hypothesis = '编译或语言形式问题是当前表面障碍'; nextAction = '根据编译器诊断修复语法或类型问题，再运行原有边界。'; }
      else if (latestCode?.status === 'failed') { hypothesis = '边界、输入输出或实现细节假设仍待验证'; nextAction = '保留概念与跟踪证据，分别检查最小输入、边界和输出格式。'; }
      else if (state === 'current_evidence_met') { hypothesis = '当前三个维度均有通过证据'; nextAction = '安排同构新任务与延迟复测，验证迁移和保持。'; }
      return { atomId, state, dimensions, hypothesis, nextAction };
    });
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
