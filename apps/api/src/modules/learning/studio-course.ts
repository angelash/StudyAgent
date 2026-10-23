import { createHash } from 'node:crypto';
import type { KnowledgeAtom, LearningScope, StudioCourse, StudioCoursePace, StudioLesson, StudioUnit } from '@study-agent/contracts';

type StudioCourseInput = {
  id: string;
  studentId: string;
  subject: StudioCourse['subject'];
  scope: LearningScope;
  atoms: KnowledgeAtom[];
  focusAtomIds: string[];
  title?: string;
  objective?: string;
  minutesPerSession?: number;
  now?: string;
};

const subjectNames = { math: '数学', chinese: '语文', english: '英语' } as const;

function courseTitle(subject: StudioCourse['subject'], grade: number, focus: KnowledgeAtom[], custom?: string) {
  if (custom?.trim()) return custom.trim();
  const strands = [...new Set(focus.map(atom => atom.strand))].slice(0, 2);
  return `${grade}年级${subjectNames[subject]} · ${strands.join('与') || '能力精进'}`;
}

function lessonHref(subject: StudioCourse['subject'], atomId: string, kind: StudioLesson['kind']) {
  const params = new URLSearchParams({ subject, intent: kind === 'exam' ? 'phase' : 'micro', atom: atomId });
  return `/student/assessment?${params.toString()}`;
}

function createLesson(atom: KnowledgeAtom, kind: 'learn' | 'practice'): StudioLesson {
  return {
    id: `${kind}:${atom.id}`,
    atomId: atom.id,
    title: kind === 'learn' ? atom.name : `${atom.name} · 独立验证`,
    objective: kind === 'learn' ? atom.objective : atom.successCriterion,
    kind,
    state: 'not_started',
    href: lessonHref(atom.subject, atom.id, kind),
    ...(atom.teaching?.reviewStatus === 'approved' ? { teaching: { atomVersion: atom.version, teaching: structuredClone(atom.teaching) } } : {}),
  };
}

export function buildStudioCourse(input: StudioCourseInput): StudioCourse {
  const byId = new Map(input.atoms.map(atom => [atom.id, atom]));
  const focus = [...new Set(input.focusAtomIds)].map(id => byId.get(id)).filter((atom): atom is KnowledgeAtom => Boolean(atom));
  const grouped = new Map<string, KnowledgeAtom[]>();
  for (const atom of focus) grouped.set(atom.strand, [...(grouped.get(atom.strand) ?? []), atom]);

  const units: StudioUnit[] = [...grouped.entries()].map(([strand, atoms], index) => {
    const lessons: StudioLesson[] = atoms.flatMap(atom => [createLesson(atom, 'learn'), createLesson(atom, 'practice')]);
    const first = atoms[0];
    lessons.push({
      id: `project:${strand}`,
      atomId: first.id,
      title: `${strand} · 情境迁移任务`,
      objective: `在不同于讲解例题的真实情境中运用${strand}的关键关系，并说明依据。`,
      kind: 'project',
      state: 'not_started',
      href: lessonHref(input.subject, first.id, 'project'),
    });
    lessons.push({
      id: `exam:${strand}`,
      atomId: first.id,
      title: `${strand} · 单元核查`,
      objective: '用独立题组、迁移题和延迟证据核查是否真的学会。',
      kind: 'exam',
      state: 'not_started',
      href: lessonHref(input.subject, first.id, 'exam'),
    });
    return {
      id: `unit:${index + 1}:${strand}`,
      title: `Unit ${index + 1}: ${strand}`,
      objective: `围绕“${strand}”串联概念理解、独立执行与迁移验证。`,
      lessons,
    };
  });

  const now = input.now ?? new Date().toISOString();
  const title = courseTitle(input.subject, input.scope.grade, focus, input.title);
  const objective = input.objective?.trim() || `从已确认的${focus.length}个知识点出发，用可验证的新题与间隔复测形成连续学习路径。`;
  const base = {
    studentId: input.studentId,
    subject: input.subject,
    grade: input.scope.grade,
    term: input.scope.term,
    title,
    description: `依据${input.scope.textbookVersion}学习范围生成。结构先进入待确认状态；课程只引用已发布的账号可见原子，不复制第三方课程。`,
    objective,
    status: 'draft' as const,
    source: 'studyagent_curriculum' as const,
    scopeVersion: input.scope.version,
    textbookVersion: input.scope.textbookVersion,
    focusAtomIds: focus.map(atom => atom.id),
    units,
    ...(input.minutesPerSession === undefined ? {} : { pace: buildCoursePace(units, input.minutesPerSession) }),
    materials: [
      { id: 'scope', title: '已确认学习范围', detail: `${input.scope.grade}年级 · ${input.scope.term === 'upper' ? '上' : '下'}学期 · ${input.scope.textbookVersion}`, status: 'available' as const },
      { id: 'mapping', title: '教材课时映射快照', detail: `${input.scope.mappingSnapshots?.length ?? 0} 个已审核课时快照；页码仍需教研逐页确认。`, status: 'needs_review' as const },
    ],
  };
  const fingerprint = createHash('sha256').update(JSON.stringify(base)).digest('hex');
  return { id: input.id, ...base, fingerprint, createdAt: now, updatedAt: now };
}

function buildCoursePace(units: StudioUnit[], budget: number): StudioCoursePace {
  if (!Number.isInteger(budget) || budget < 5 || budget > 60) throw new Error('课程时间预算须为5至60的整数分钟');
  const sessions: StudioCoursePace['sessions'] = [];
  for (const lesson of units.flatMap(unit => unit.lessons)) {
    const teaching = lesson.teaching?.teaching;
    const text = teaching ? [teaching.explanation, teaching.example.prompt, ...teaching.example.steps, teaching.example.conclusion].join('') : lesson.objective;
    const minutes = lesson.kind === 'learn' ? Math.max(3, Math.ceil(text.length / 180) + 2) : lesson.kind === 'practice' ? 5 : 10;
    const parts = Math.ceil(minutes / budget);
    let remaining = minutes;
    for (let part = 1; part <= parts; part++) {
      const portion = Math.min(budget, remaining); remaining -= portion;
      let session = sessions.at(-1);
      if (!session || session.minutes + portion > budget) { session = { id: 'pace:' + (sessions.length + 1), minutes: 0, activities: [] }; sessions.push(session); }
      session.activities.push({ lessonId: lesson.id, title: lesson.title, kind: lesson.kind, part, parts, minutes: portion }); session.minutes += portion;
    }
  }
  return { version: 'course-pace-v1', minutesPerSession: budget, teachingLanguage: 'source',
    estimatedMinutes: sessions.reduce((sum, session) => sum + session.minutes, 0), sessions,
    notice: '参考时长按讲解篇幅和活动类型估算，可按自己的节奏分段。沿用已审核材料的语言；这不是实际耗时、学习效果保证或已加入日历的安排。' };
}

export function studioLessonCount(course: Pick<StudioCourse, 'units'>) {
  return course.units.reduce((sum, unit) => sum + unit.lessons.length, 0);
}
