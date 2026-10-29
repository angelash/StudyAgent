'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSessionUser } from '../lib/session-user';
import { readLearningContext } from '../lib/learning-context';
import { workspaceHref } from '../lib/workspace-navigation';
import { StudyNav } from '../components/study-nav';
import './student/assessment/studio.css';
import './welcome.css';

export default function HomePage() {
  const identity = useSessionUser(), router = useRouter();
  React.useEffect(() => { if (identity) router.replace(workspaceHref('home', identity.role === 'student' ? { studentId: identity.studentId, subject: 'math' } : readLearningContext(identity.id, ''))); }, [identity, router]);
  if (identity) return <main className="workspace-entry"><p role="status">正在返回学习工作台…</p></main>;
  return <main className="workspace-welcome"><StudyNav /><section className="welcome-intro"><span>StudyAgent 学习工作台</span><h1>从一个问题开始，<br />把学习接着做下去。</h1><p>创建课程、阅读资料、练习与复盘，都在同一个工作台。孩子按已学范围诊断，家长根据具体证据安排下一步；成人也可以直接开始自己的课程。</p><div className="welcome-actions"><Link className="workspace-button" href="/studio">进入学习工作台 →</Link><Link href="/student/login">孩子使用学习码进入</Link><Link href="/parent/login">家长 / 教师登录</Link></div></section><section className="welcome-principles" aria-label="工作台学习流程">{[['课程与资料', '从课程、原文和白板开始，在保存的位置继续。'], ['练习与诊断', '确认已经学过什么，再通过自己的作答留下证据。'], ['报告与下一步', '查看知识、原因与指导安排，用新题和间隔复测继续核查。']].map(([title, detail]) => <article key={title}><h2>{title}</h2><p>{detail}</p></article>)}</section><footer className="welcome-bottom"><p>课程、练习和独立评测分别记录。</p><Link href="/library">浏览题卷资料 ↗</Link></footer></main>;
}
