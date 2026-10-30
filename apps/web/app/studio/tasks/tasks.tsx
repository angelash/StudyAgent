'use client';
import { GuidanceObservationWorkspace } from './guidance-observation';
import { StudentTeachingPracticeWorkspace } from './student-teaching-practice';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { ClassroomCatalog } from '@study-agent/contracts';
import { DailyStudio } from '../../student/today/studio';
import { StudioNavigation } from '../studio-navigation';
import { useSessionUser, type SessionUser } from '../../../lib/session-user';
import { apiRequest } from '../../../lib/api';
import { learningContextIssue, readLearningContext } from '../../../lib/learning-context';
import { workspaceHref } from '../../../lib/workspace-navigation';
import { AssessmentStudio } from '../../student/assessment/studio';
import { ConversationPracticeWorkspace } from './conversation-practice';
import { TeachingPracticeWorkspace } from './teaching-practice';
import { teachingWorkspaceHref } from '../../../lib/teaching-practice-workspace';

export function TasksWorkspace() {
  const search = useSearchParams(), user = useSessionUser();
  if (!user) return <main className="learning-studio"><section className="workspace-page"><h1>学习任务</h1>{user === undefined ? <p role="status">正在确认学习身份…</p> : <Link href="/parent/login">登录后继续学习</Link>}</section></main>;
  if(search.has('guidanceIntent')||search.get('view')==='guidance-observation')return <GuidanceObservationWorkspace key={user.id+':'+user.role+':'+search.toString()} user={user}/>;
  if(search.has('teachingAssignment')||search.get('kind')==='generated')return <StudentTeachingPracticeWorkspace key={user.id+':'+user.role+':'+search.get('studentId')+':'+search.get('subject')+':'+search.get('teachingAssignment')+':'+search.get('teachingSession')} user={user}/>;
  if(search.has('teachingPractice')||search.has('teachingSession')||search.get('view')==='conversation-practice'&&search.get('audience')==='independent')return <TeachingPracticeWorkspace key={user.id+':'+user.role} user={user}/>;
  if(search.get('view')==='conversation-practice'||search.has('assistantAssignment')||search.has('assistantPractice'))return <ConversationPracticeWorkspace key={user.id+':'+user.role} user={user}/>;
  const issue = learningContextIssue('?' + search), selected = user ? readLearningContext(user.id, '?' + search) : null;
  if (issue || user?.role === 'student' && selected?.audience === 'self') return <main className="learning-studio"><StudioNavigation active="tasks" /><section className="workspace-page"><h1>学习任务</h1><p role="alert">{issue || '学生学习身份不能进入成人独立学习。'}</p><Link href="/studio">重新选择学习对象</Link></section></main>;
  return user && selected?.audience === 'self' ? <PersonalTasks key={user.id} user={user} /> : search.get('view') === 'plan' || search.has('planId') ? <AssessmentStudio /> : <DailyStudio />;
}
function PersonalTasks({ user }: { user: SessionUser }) {
  const [catalog, setCatalog] = React.useState<ClassroomCatalog | null>(null), [error, setError] = React.useState(''), [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    const controller = new AbortController(); setCatalog(null); setError('');
    apiRequest<ClassroomCatalog>('/learning/classroom/catalog', { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setCatalog(value); }).catch(caught => { if (!controller.signal.aborted) setError((caught as Error).message); });
    return () => controller.abort();
  }, [user.id, retry]);
  const lessons = catalog?.course.units.flatMap(unit => unit.lectures.flatMap(lecture => lecture.lessons)) ?? [];
  const progress = [...(catalog?.progress ?? [])].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  const context = { subject: 'math' as const, audience: 'self' as const };
  return <main className="learning-studio"><StudioNavigation active="tasks" context={context} /><section className="workspace-page"><h1>我的学习任务</h1><p className="workspace-page-intro">从自己的课程、练习和项目继续。孩子的学习安排按档案分别保存。</p>
    {error ? <div className="workspace-error" role="alert"><p>{error}</p><button className="workspace-button" onClick={() => setRetry(value => value + 1)}>重新读取</button></div> : !catalog ? <p role="status">正在读取个人学习记录…</p> : progress.length ? progress.map(item => <article key={item.sessionId} className="workspace-page-row"><div><h2>{lessons.find(lesson => lesson.id === item.lessonId)?.title ?? '已保存的课程活动'}</h2><p>{item.completed ? '本次阅读已完成，可回到原记录。' : '从原句和原作答位置继续。'}</p></div><Link className="workspace-button" href={'/studio/classroom?' + new URLSearchParams({ lesson:item.lessonId,session:item.sessionId })}>继续原活动</Link></article>) : <><h2>从一门课程开始</h2><p>阅读、练习和项目进度会保存在自己的账号下。</p></>}
    <div className="workspace-page-controls"><Link className="workspace-button" href={workspaceHref('courses', context)}>我的课程</Link><Link className="workspace-button" href={teachingWorkspaceHref()}>本人的对话练习</Link><Link className="workspace-button" href={workspaceHref('history', context)}>学习历史</Link></div>
  </section></main>;
}
