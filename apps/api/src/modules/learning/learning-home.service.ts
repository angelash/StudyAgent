import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { LearningHome, LearningHomeAction, Subject } from '@study-agent/contracts';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { DiagnosticsService } from '../diagnostics/diagnostics.service';
import { LearningService, studyDay } from './learning.service';
import { classroomFingerprint, classroomLesson } from './classroom-curriculum';

type Today = ReturnType<LearningService['today']>;
type ActionInput = {
  studentId: string; subject: Subject; canManage: boolean; today: Today;
  confirmed: boolean; hasEvidenceGap: boolean; latestReportId: string | null; hasOpenHypotheses: boolean;
  course: LearningHomeAction | null;
};

const path = (route: string, studentId: string, subject: Subject, extras: Record<string, string> = {}) =>
  route + '?' + new URLSearchParams({ studentId, subject, ...extras });

/** Choose real, currently eligible actions without creating a session or plan. */
export function learningHomeActions(input: ActionInput): LearningHomeAction[] {
  const { studentId, subject, today, canManage } = input;
  const assessment = (extras: Record<string, string> = {}) => path('/student/assessment', studentId, subject, extras);
  const daily = path('/student/today', studentId, subject);
  const actions: LearningHomeAction[] = [];
  const incomplete = today.incompleteAssessments[0];
  if (incomplete) actions.push({ id: 'assessment:' + incomplete.id, kind: 'resume_assessment',
    title: '继续上次的评测', reason: `已完成 ${incomplete.answeredCount}/${incomplete.totalCount} 题，原题组和草稿已经保存。`,
    href: assessment({ session: incomplete.id }), label: '继续作答', estimatedMinutes: null, saved: '从服务器保存的题组恢复' });

  const plan = today.plan;
  const due = today.reviews.filter(review => review.due && review.status !== 'completed');
  if (plan && !plan.impact.needsReview) for (const review of due) actions.push({
    id: 'review:' + review.id, kind: 'due_review', title: `再看看：${review.atomName}`,
    reason: `这组 +${review.intervalDays} 天复测已经到期，用新题检查一段时间后是否还会。`,
    href: review.sessionId ? assessment({ session: review.sessionId }) : daily + '#review-' + encodeURIComponent(review.id),
    label: review.sessionId ? '继续复测' : '查看到期复测', estimatedMinutes: null,
    saved: review.sessionId ? '已有复测题组已保存' : '在今日安排中预览并确认题组' });

  const needsDecision = plan?.impact.needsReview ? plan : today.awaitingConfirmation;
  if (needsDecision) actions.push({ id: 'plan:' + needsDecision.id, kind: 'plan_review',
    title: canManage ? (plan?.impact.needsReview ? '核对指导计划的新依据' : '确认接下来的指导安排') : '请家长核对接下来的安排',
    reason: canManage ? (plan?.impact.needsReview ? '评测依据已变化，新训练需要先核对计划。' : '先查看依据和每天的负担，确认后才开始执行。') : '计划需要家长确认；你可以先回看已保存的学习安排。',
    href: assessment({ view: 'plan', planId: needsDecision.id }), label: canManage ? '核对指导计划' : '查看学习安排',
    estimatedMinutes: null, saved: '查看不会自动确认或修改计划' });

  if (plan && !plan.impact.needsReview) {
    const activities = today.activities.filter(activity => activity.status !== 'completed')
      .sort((a, b) => Number(b.status === 'in_progress') - Number(a.status === 'in_progress'));
    for (const activity of activities) actions.push({ id: 'activity:' + activity.id,
      kind: activity.sessionId ? 'resume_practice' : 'practice', title: `${activity.sessionId ? '继续练习' : '今天练习'}：${activity.atomName}`,
      reason: activity.activity, href: activity.sessionId ? path('/student/today', studentId, subject, { practice: activity.sessionId }) : daily + '#activity-' + encodeURIComponent(activity.id),
      label: activity.sessionId ? '恢复这次练习' : '查看指导练习', estimatedMinutes: activity.minutes,
      saved: activity.sessionId ? '已有作答和草稿已保存' : '进入今日安排后开始，不重复创建' });
  }

  if (input.hasOpenHypotheses && input.latestReportId) actions.push({ id: 'report:' + input.latestReportId, kind: 'report',
    title: '核对还有哪些地方需要验证', reason: '已有解释仍需通过对照题核查；打开报告查看依据和下一步。',
    href: assessment({ session: input.latestReportId }), label: '查看报告与验证建议', estimatedMinutes: null, saved: '保留支持、反证和尚不能判断的部分' });
  if (input.course) actions.push(input.course);
  if (!input.confirmed) actions.push({ id: 'scope:' + subject, kind: 'scope', title: canManage ? '先确认学到哪里了' : '看看当前学习进度',
    reason: canManage ? '选择年级、教材和已经学过的内容，再安排适合的题目。' : '先查看当前范围；如果还没有确认，可以提出进度建议，请家长核对。',
    href: assessment(), label: canManage ? '确认学习范围' : '查看学习范围', estimatedMinutes: null, saved: '不会把还没学过的内容当成薄弱项' });
  else if (input.hasEvidenceGap || !actions.length) actions.push({ id: 'baseline:' + subject, kind: 'assessment', title: '用一组小题了解现在的情况',
    reason: input.hasEvidenceGap ? '部分已学知识还缺少独立证据；先预览题量和时间，再决定开始。' : '可以预览一组独立题目，核查当前已确认的学习范围。',
    href: assessment(), label: '预览知识点小测', estimatedMinutes: null, saved: '先预览，再由你确认开始' });
  return actions;
}

@Injectable()
export class LearningHomeService {
  constructor(private readonly learning: LearningService, private readonly students: StudentsService,
    private readonly diagnostics: DiagnosticsService, private readonly store: InMemoryStoreService) {}

  home(user: InMemoryUserAccount, studentId: string | undefined, subject: Subject): LearningHome {
    const children = this.learning.studentProfiles(user);
    // Never silently fall back to another child's data for an explicit selection.
    if (studentId) {
      if (user.role !== 'admin' && !children.some(child => child.id === studentId)) throw new ForbiddenException('所选档案不存在或当前无法访问，请重新选择可用档案');
      this.students.assertCanAccessStudent(user, studentId);
      if (!children.some(child => child.id === studentId)) throw new NotFoundException('学习档案不存在或当前无法访问');
    }
    const selected = children.find(child => child.id === studentId) ?? children[0] ?? null;
    if (user.role === 'student' && !selected) throw new ForbiddenException('当前学习身份已不可用，请家长重新生成学习码');
    const actor = { id: user.id, role: user.role, canManage: ['parent', 'admin'].includes(user.role), canUseAdultCourses: user.role !== 'student' };
    const base: LearningHome = { generatedAt: new Date().toISOString(), day: studyDay(), subject, actor, children, selected,
      scope: { confirmed: false, summary: '先选择一个学习档案。', minutesPerSession: null, learnedPoints: 0 },
      primary: null, secondary: [], memory: null,
      counts: { dueReviews: 0, unfinishedAssessments: 0, pendingActivities: 0, unknownPoints: 0, insufficientPoints: 0 },
      notice: '阅读、练习和独立评测分别记录。提示后的成功与看完课程，都不直接代表稳定掌握。' };
    if (!selected) {
      const course = this.courseAction(user);
      return { ...base, primary: course ?? { id: 'adult-course', kind: 'course', title: '从一节课程开始',
        reason: '可以直接学习独立课程，也可以先建立孩子的学习档案。', href: '/studio?view=courses', label: '浏览课程',
        estimatedMinutes: null, saved: '课程记录属于当前账号' } };
    }
    const profile = this.diagnostics.profile(user, selected.id, subject);
    const today = this.learning.today(user, selected.id, subject), memory = this.learning.memory(user, selected.id, subject);
    const learned = new Set(profile.scope?.learnedAtomIds ?? []);
    const estimates = profile.estimates.filter(estimate => learned.has(estimate.atomId));
    const sessions = this.diagnostics.listSessions(user, selected.id, subject);
    const actions = learningHomeActions({ studentId: selected.id, subject, canManage: actor.canManage, today,
      confirmed: Boolean(profile.scope), hasEvidenceGap: estimates.some(estimate => ['unknown', 'insufficient'].includes(estimate.status)),
      latestReportId: sessions.find(session => session.status === 'completed')?.id ?? null,
      hasOpenHypotheses: memory.openHypotheses.length > 0, course: this.courseAction(user, selected.id, subject) });
    return { ...base, scope: { confirmed: Boolean(profile.scope),
      summary: profile.scope ? `${profile.scope.grade}年级${profile.scope.term === 'upper' ? '上' : '下'}学期 · ${profile.scope.textbookVersion}` : '还没有确认这门学科学到了哪里。',
      minutesPerSession: profile.scope?.minutesPerSession ?? null, learnedPoints: learned.size },
      primary: actions[0] ?? null, secondary: actions.slice(1), memory,
      counts: { dueReviews: today.reviews.filter(review => review.due && review.status !== 'completed').length,
        unfinishedAssessments: today.incompleteAssessments.length,
        pendingActivities: today.plan && !today.plan.impact.needsReview ? today.activities.filter(activity => activity.status !== 'completed').length : 0,
        unknownPoints: estimates.filter(estimate => estimate.status === 'unknown').length,
        insufficientPoints: estimates.filter(estimate => estimate.status === 'insufficient').length } };
  }

  private courseAction(user: InMemoryUserAccount, studentId?: string, subject?: Subject): LearningHomeAction | null {
    const courses = studentId ? this.store.select('studioCourses', { studentId, subject }) : [];
    const sessions = this.store.select('classroomSessions', { ownerUserId: user.id })
      .filter(row => row.status !== 'completed' && (studentId ? courses.some(course => course.id === row.courseId) : !row.studentId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    for (const session of sessions) {
      const course = courses.find(course => course.id === session.courseId);
      if (!studentId) {
        const lesson = classroomLesson(session.lessonId);
        if (!lesson || session.contentFingerprint !== classroomFingerprint(lesson)) continue;
      } else if (!course?.units.some(unit => unit.lessons.some(lesson => lesson.id === session.lessonId))) continue;
      const params = new URLSearchParams({ lesson: session.lessonId });
      if (course) { params.set('studioCourseId', course.id); params.set('returnSubject', subject!); }
      return { id: 'course:' + session.id, kind: 'course', title: `继续学习：${session.lesson.title}`,
        reason: '从当前账号保存的讲解断点继续，阅读进度与独立评测分别记录。',
        href: '/studio/classroom?' + params, label: '回到课堂', estimatedMinutes: null, saved: '按课堂保存的当前句恢复' };
    }
    return null;
  }
}
