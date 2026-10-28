import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ChemistryCatalog, ChemistryCheckpoint, LearningScope, StudioCourse } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { CurriculumService } from '../diagnostics/curriculum.service';
import { DiagnosticsService } from '../diagnostics/diagnostics.service';
import { eligibleMeasurements } from '../diagnostics/curriculum.service';
import { CHEMISTRY_VERSION, CHEMISTRY_BOOK_ID, chemistryAtomId, chemistryUnits } from '../diagnostics/chemistry-curriculum';
import { buildChemistryCourse, chemistryCourseHref, chemistryScope, isChemistrySemesterCourse, CHEMISTRY_COURSE_TITLE } from './chemistry-course';
import { chemistryTextbookBasis } from './chemistry-tutorial';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const enrollSchema = z.object({ studentId: z.string().min(1).max(180), version: z.string(), requestKey: z.string().min(8).max(180) }).strict();
const startSchema = enrollSchema.extend({ checkpointId: z.string().min(1).max(100) });
const title = CHEMISTRY_COURSE_TITLE;

// These are source leads in the existing library. Publication/withdrawal remains
// owned by LibraryService; enrolling never grants access to an unpublished paper.
const paperReferences = [
  ["3:R-fe81e950f5d12a9f2996a1a3ebb4940a","广东省广州中学2025-2026学年九年级上学期期中考试化学试卷"],
  ["3:R-1d32e790aaa9ea9ed66339887ef3cef4","广东省广州市从化区2025-2026学年九年级上学期期末考试化学试卷（B）"],
  ["3:R-176269d79593f53cc879e0be28d6b918","广东省广州市广东实验中学2025-2026学年九年级上学期期中考试化学试卷"],
  ["3:R-8dae1e8f1a7d716a44ceb2791d91d1e4","广东省广州市海珠区2025-2026学年九年级上学期期末质量监测化学试题"],
  ["3:R-40cbb5af8c5748d9c2b24c58cc081efd","广东省广州市白云区2025-2026学年九年级上学期期末考试化学试卷"],
  ["3:R-753c0f9ed3232ffdad0ebfd21ad40a57","广东省广州市第二中学2025-2026学年九年级上学期期中考试化学试卷"],
  ["3:R-fbfc19bcead8fe55f574cbe8bbc4af6b","广东省广州市第四中学2025-2026学年九年级上学期期中考化学试题"],
  ["3:R-bed39aed06147794989490551aed5356","广东省广州市花都区2025-2026学年九年级上学期期末考试化学试题"],
  ["3:R-7a7575520a8951f2dd34c5bd7b10e526","广东省广州市荔湾区广东广雅中学2025-2026学年九年级上学期期中考试化学试题"],
] as const;

@Injectable()
export class ChemistryService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly curriculum: CurriculumService, private readonly diagnostics: DiagnosticsService) {}

  private profile(user: InMemoryUserAccount, studentId: string) {
    const student = this.students.getProfile(user, studentId);
    const enrolled = this.store.select('studioCourses', { studentId, subject: 'chemistry', status: 'active' }).some(isChemistrySemesterCourse);
    if (student.grade !== 9 && !enrolled) throw new BadRequestException('这套课程面向九年级，请选择九年级学习档案');
    return student;
  }
  private courseId(studentId: string) {
    return this.store.select('studioCourses', { studentId, subject: 'chemistry', status: 'active' }).find(isChemistrySemesterCourse)?.id ?? `chemistry-course:${studentId}:${CHEMISTRY_VERSION}`;
  }
  private buildCourse(studentId: string, atoms: ReturnType<ChemistryService['definitions']>, status: StudioCourse['status']): StudioCourse {
    return buildChemistryCourse(studentId, atoms, { id: this.courseId(studentId), status });
  }
  private courseHref(studentId: string, unit?: string, panel?: string) {
    return chemistryCourseHref(studentId, this.courseId(studentId), unit, panel);
  }
  private definitions() {
    return chemistryUnits.flatMap(unit => unit.codes.map(code => {
      const atom = this.store.find('knowledgeAtoms', { id: chemistryAtomId(code), subject: 'chemistry', status: 'published' });
      if (!atom || atom.curriculumVersion !== CHEMISTRY_VERSION || atom.version !== 1 || atom.teaching?.reviewStatus !== 'approved')
        throw new ConflictException('化学教学内容尚未准备完成或已修订，请核对课程版本后重试');
      return atom;
    }));
  }
  private scope(studentId: string, atomIds: string[], id: string, minutes: number): LearningScope {
    return chemistryScope(studentId, atomIds, id, minutes);
  }
  private specification(): Array<Omit<ChemistryCheckpoint, 'ready' | 'reason' | 'lastSessionId' | 'status'>> {
    const result: ReturnType<ChemistryService['specification']> = [];
    const add = (id: string, label: string, kind: ChemistryCheckpoint['kind'], units: readonly string[], minutes: number) => {
      const targetAtomIds = chemistryUnits.filter(unit => units.includes(unit.id)).flatMap(unit => unit.codes.map(chemistryAtomId));
      result.push({ id, title: label, kind, unitIds: [...units], targetAtomIds, itemLimit: targetAtomIds.length * 2, minutes });
    };
    for (const [index, unit] of chemistryUnits.entries()) {
      add(`${unit.id}:baseline`, `第${index + 1}单元 · 课前诊断`, 'baseline', [unit.id], 20);
      add(`${unit.id}:unit`, `第${index + 1}单元 · 独立考核`, 'unit', [unit.id], 25);
    }
    add('midterm:a', '期中考核一 · 第一、二单元', 'midterm', ['u1', 'u2'], 35);
    add('midterm:b', '期中考核二 · 第三、四单元', 'midterm', ['u3', 'u4'], 35);
    add('final:a', '期末考核一 · 第一、二单元', 'final', ['u1', 'u2'], 40);
    add('final:b', '期末考核二 · 第三、四单元', 'final', ['u3', 'u4'], 40);
    add('final:c', '期末考核三 · 第五至七单元', 'final', ['u5', 'u6', 'u7'], 50);
    return result;
  }
  private checkpointPrefix(studentId: string, checkpointId: string) { return `chemistry-check:${studentId}:${CHEMISTRY_VERSION}:${checkpointId}:`; }
  private checkpointViews(studentId: string | null, enrolled: boolean): ChemistryCheckpoint[] {
    const sessions = studentId ? this.store.select('diagnosticSessions', { studentId, subject: 'chemistry' }) : [];
    const latest = (id: string) => sessions.filter(session => session.scopeSnapshot.id.startsWith(this.checkpointPrefix(studentId!, id)))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    const completed = (id: string) => sessions.some(session => session.status === 'completed' && session.scopeSnapshot.id.startsWith(this.checkpointPrefix(studentId!, id)));
    return this.specification().map(check => {
      const session = studentId ? latest(check.id) : undefined;
      const waiting = check.kind === 'unit' ? check.unitIds.filter(id => !completed(`${id}:baseline`)) :
        check.kind === 'midterm' || check.kind === 'final' ? check.unitIds.filter(id => !completed(`${id}:unit`)) : [];
      return { ...check, ready: enrolled && waiting.length === 0,
        reason: !enrolled ? '先建立本学期课程' : waiting.length ? check.kind === 'unit' ? '先完成本单元课前诊断' : '先完成对应单元考核' : null,
        lastSessionId: session?.id ?? null, status: session?.status ?? 'not_started' };
    });
  }
  catalog(user: InMemoryUserAccount, studentId?: string): ChemistryCatalog {
    const children = user.role === 'student' ? this.store.select('students', { userId: user.id }) : this.students.listChildren(user);
    const requested = studentId ? this.students.getProfile(user, studentId) : null;
    // An explicit library context must never silently switch to another child.
    // The course outline remains visible before enrollment; only a ninth-grade
    // profile can save the semester plan or start its assessments.
    const selected = requested?.id ?? children.find(child => child.grade === 9)?.id ?? null;
    const course = selected ? this.store.find('studioCourses', { id: this.courseId(selected), studentId: selected }) : undefined;
    const atoms = this.definitions();
    return { version: CHEMISTRY_VERSION, title, description: '七个单元从课前诊断走到独立考核，再按真实间隔复测。每次首次作答、受助和订正分别保留。',
      pointCount: atoms.length, questionCount: new Set(eligibleMeasurements(this.store, atoms.map(atom => atom.id)).map(item => item.questionId)).size,
      studentId: selected, courseId: course?.id ?? null,
      canEnroll: ['parent', 'admin'].includes(user.role) && children.some(child => child.id === selected && child.grade === 9),
      course: course ?? (selected ? this.buildCourse(selected, atoms, 'draft') : null),
      children: children.map(({ id, nickname, grade }) => ({ id, nickname, grade })),
      units: chemistryUnits.map(unit => ({ id: unit.id, title: unit.title, lessons: unit.codes.map(code => {
        const atom = atoms.find(atom => atom.id === chemistryAtomId(code))!;
        return { id: atom.id, title: atom.name, objective: atom.objective, teaching: atom.teaching ?? null,
          classroomHref: course ? '/studio/classroom?' + new URLSearchParams({ studioCourseId: course.id, lesson: `learn:${atom.id}` }) : null,
          practiceHref: course ? '/student/assessment?' + new URLSearchParams({ studentId: selected!, subject: 'chemistry', intent: 'micro', atom: atom.id }) : null };
      }) })), checkpoints: this.checkpointViews(selected, Boolean(course)),
      references: [{ id: 'pep-catalog', title: '人教社九年级化学官方教材入口', href: 'https://jc.pep.com.cn/?filed=%E5%88%9D%E4%B8%AD&subject=%E5%8C%96%E5%AD%A6', status: 'reference' },
        ...paperReferences.map(([id, paperTitle]) => ({ id, title: paperTitle, href: '/library?' + new URLSearchParams({ paper: id, subject: 'chemistry', ...(selected ? { studentId: selected } : {}) }),
          status: this.store.find('paperPublications', { paperId: id, status: 'published' }) ? 'published' as const : 'reference' as const }))],
      textbookBasis: chemistryTextbookBasis(),
      notices: ['28节课已对照七单元参考本的相关课题；学校现用教材版次未确认，不能直接套用参考本页码。讲解、28张图示和10种模型均为原创。',
        '建立课程只确认计划范围，不表示已经学会；课堂阅读、练习与独立考核分别记录。',
        '原卷资料按现有审核状态开放，未审核原题不会自动进入能力评分。',
        '阶段考核分场覆盖全部单元；1、3、7、14天复测必须真实到期，当前通过不代表已经验证长期保持。'] };
  }
  async enroll(user: InMemoryUserAccount, input: unknown) {
    const command = validate(enrollSchema, input);
    return this.store.transaction(() => {
      this.students.assertGuardian(user, command.studentId); this.profile(user, command.studentId);
      if (command.version !== CHEMISTRY_VERSION) throw new ConflictException('课程版本已改变，请刷新后确认');
      const receipt = this.store.find('studioActivities', { actorId: user.id, requestKey: command.requestKey });
      if (receipt && receipt.requestHash !== digest(command)) throw new ConflictException('请求键已用于其他课程操作');
      const id = this.courseId(command.studentId), previous = this.store.find('studioCourses', { id });
      if (previous) return { courseId: previous.id, created: false };
      const atoms = this.definitions(), atomIds = atoms.map(atom => atom.id);
      const scope = this.scope(command.studentId, atomIds, `chemistry-plan:${command.studentId}:${CHEMISTRY_VERSION}`, 25);
      const course = this.buildCourse(command.studentId, atoms, 'active');
      this.store.append('studioCourses', course);
      // Existing confirmed progress is preserved. This initial scope means selected
      // study/check range, never a completion or mastery observation.
      if (!this.curriculum.getScope(user, command.studentId, 'chemistry')) this.curriculum.saveScope(user, command.studentId, {
        subject: 'chemistry', grade: 9, term: 'upper', textbookVolumeId: CHEMISTRY_BOOK_ID,
        textbookVersion: scope.textbookVersion, learnedAtomIds: atomIds, currentAtomId: atomIds[0], minutesPerSession: 25,
        progressMode: 'knowledge', selectedLessonIds: [] });
      this.store.append('studioActivities', { id: this.store.nextId('studio_activity'), studentId: command.studentId, subject: 'chemistry',
        kind: 'course_created', title: '建立广州人教版九上化学课程', detail: '七个单元、28个知识目标；诊断、独立考核与间隔复测分别保留证据。',
        href: this.courseHref(command.studentId), at: new Date().toISOString(), status: 'opened',
        actorId: user.id, referenceId: id, requestKey: command.requestKey, requestHash: digest(command) });
      return { courseId: id, created: true };
    });
  }
  async start(user: InMemoryUserAccount, input: unknown) {
    const command = validate(startSchema, input);
    return this.store.transaction(() => {
      this.profile(user, command.studentId);
      if (command.version !== CHEMISTRY_VERSION) throw new ConflictException('考核版本已变化，请重新核对');
      const course = this.store.find('studioCourses', { id: this.courseId(command.studentId), studentId: command.studentId, status: 'active' });
      if (!course) throw new BadRequestException('请先由监护人建立本学期课程');
      this.definitions();
      const check = this.checkpointViews(command.studentId, true).find(check => check.id === command.checkpointId);
      if (!check) throw new NotFoundException('考核项目不存在');
      const scopeId = this.checkpointPrefix(command.studentId, check.id) + digest([user.id, command.requestKey]).slice(0, 20);
      const replay = this.store.select('diagnosticSessions', { studentId: command.studentId, subject: 'chemistry' }).find(session => session.scopeSnapshot.id.startsWith('chemistry-check:') && session.scopeSnapshot.id.endsWith(digest([user.id, command.requestKey]).slice(0, 20)));
      if (replay && replay.scopeSnapshot.id !== scopeId) throw new ConflictException('请求键已用于另一场考核，请读取原考核结果');
      if (replay) return { sessionId: replay.id, href: '/student/assessment?' + new URLSearchParams({ studentId: command.studentId, subject: 'chemistry', session: replay.id }) };
      if (!check.ready) throw new BadRequestException(check.reason ?? '前置考核尚未完成');
      const session = this.diagnostics.start(user, { studentId: command.studentId, subject: 'chemistry',
        intent: check.kind === 'baseline' ? 'baseline' : 'verification', targetAtomIds: check.targetAtomIds,
        maxItems: check.itemLimit, includePrerequisites: false }, this.scope(command.studentId, check.targetAtomIds, scopeId, check.minutes));
      if (session.coverage.some(row => row.selected < row.required)) throw new ConflictException('当前独立新题不足以覆盖全部目标，请先核对素材缺口');
      return { sessionId: session.id, href: '/student/assessment?' + new URLSearchParams({ studentId: command.studentId, subject: 'chemistry', session: session.id }) };
    });
  }
}
