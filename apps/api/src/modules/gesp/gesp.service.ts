import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import { gespSearchSchema, type GespAtom, type GespOverview, type GespQuestion, type GespQuestionDetail, type GespTeachingPlan } from '@study-agent/contracts';
import type { InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { workspaceRoot } from '../../infrastructure/workspace-paths';
import { validate } from '../../common/validation';

type IndexedQuestion = GespQuestion & { textPath: string; textSha256: string; answer: string | null;
  answerBasis: string | null; answerReviewStatus: string; referenceMaterialPresent: boolean; hiddenTestDataStatus: 'not_collected' };
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const notice = '教研研究资料：机器文本可能遗漏公式、图示和代码。题目、答案、题族与知识映射均待审核，尚未用于学生诊断或自动运行程序。';

@Injectable()
export class GespService implements OnModuleDestroy {
  private db?: DatabaseSync;
  private snapshot?: { graph: { atoms: GespAtom[] }; coverage: {
    coverage: Array<{ session: string; level: number; status: string; officialStatus?: string; questionCount?: number }>;
    quarantinedLinks: unknown[]; unrecoveredObjectiveAnswers: number }; plan: GespTeachingPlan; asOf: string };
  get root() { return resolve(process.env.STUDY_GESP_ROOT ?? resolve(workspaceRoot(), 'data/gesp')); }
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
