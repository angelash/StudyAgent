'use client';
import Link from 'next/link';
import * as React from 'react';
import { useSessionUser } from '../../lib/session-user';
import { learningContextHref, readLearningContext, saveLearningContext, type LearningContext } from '../../lib/learning-context';
import './workspace.css';

export type StudioView = 'home' | 'courses' | 'feed' | 'calendar' | 'materials' | 'history';
const navigation: Array<[StudioView, string, string, string]> = [
  ['home', '首页', 'Home', 'M3 10 12 3l9 7M5 9v12h14V9M9 21v-7h6v7'],
  ['courses', '课程', 'Courses', 'm2 8 10-5 10 5-10 5Zm4 3v6q6 5 12 0v-6M22 8v9'],
  ['calendar', '学习动态', 'Calendar', 'M4 5h16v16H4ZM4 10h16M8 3v4M16 3v4M8 14h3M8 17h7'],
  ['history', '历史', 'History', 'M4 7a9 9 0 1 1-1 9M4 3v5h5M12 7v6l4 2'],
  ['materials', '资料', 'Materials', 'M4 3h11l5 5v13H4ZM15 3v6h5M8 13h8M8 17h6'],
];
export function StudioSymbol({ path, size = 20 }: { path: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path}/></svg>;
}
export function StudioNavigation({ active, recent, onNavigate, onCreate, context }: { active: StudioView | 'whiteboards';
  recent?: Array<{ title: string; detail?: string; href: string }>; onNavigate?: (view: StudioView) => void; onCreate?: () => void; context?: LearningContext }) {
  const [mobile, setMobile] = React.useState(false);
  const user = useSessionUser();
  const [homeHref, setHomeHref] = React.useState('/learn');
  React.useEffect(() => {
    if (!user) { setHomeHref('/learn'); return; }
    const selected = context?.studentId ? context : readLearningContext(user.id, window.location.search);
    setHomeHref(learningContextHref('/learn', selected));
    saveLearningContext(user.id, selected);
  }, [user?.id, context?.studentId, context?.subject]);
  return <><button className="ws-mobile-menu" aria-label="打开学习导航" aria-expanded={mobile} onClick={() => setMobile(!mobile)}>☰</button>
    {mobile && <button className="ws-nav-backdrop" aria-label="关闭学习导航" onClick={() => setMobile(false)}/>}
    <aside className="ws-navigation" data-open={mobile} aria-label="学习工作台导航">
      <Link href="/studio" className="ws-brand"><StudioSymbol path="m3 8 9-5 9 5-9 5ZM5 12v5l7 4 7-4v-5M9 10l3 2 3-2" size={26}/><b>StudyAgent</b></Link>
      <nav>{navigation.map(([view, label, english, path]) => onNavigate ? <button key={view} aria-label={english} aria-current={active === view ? 'page' : undefined} onClick={() => { setMobile(false); onNavigate(view); }}><StudioSymbol path={path}/><span>{label}</span></button> :
        <Link key={view} href={'/studio?view=' + view} aria-label={english} aria-current={active === view ? 'page' : undefined} onClick={() => setMobile(false)}><StudioSymbol path={path}/><span>{label}</span></Link>)}
        <Link href="/studio/whiteboards" aria-label="AI Whiteboards" aria-current={active === 'whiteboards' ? 'page' : undefined} onClick={() => setMobile(false)}><StudioSymbol path="M4 4h16v13H4ZM8 21l4-4 4 4M8 8h8M8 12h5"/><span>AI白板</span></Link></nav>
      {onCreate && <button className="ws-create-course" onClick={onCreate}>＋ 创建课程</button>}
      <section className="ws-continue"><h2>继续学习</h2><Link href={recent?.[0]?.href ?? '/studio/classroom'}><small>讲座</small><b>{recent?.[0]?.title ?? '社会学想象力'}</b><span>{recent?.[0]?.detail ?? '社会学概论'}</span></Link></section>
      <section className="ws-recents"><h2>近期活动</h2>{recent?.length ? recent.slice(1, 4).map((item, index) => <Link href={item.href} key={index} title={item.title}>{item.title}</Link>) : <p>开始学习后，活动会出现在这里。</p>}</section>
      <footer><Link href={homeHref}>返回学习首页 →</Link></footer>
    </aside></>;
}
