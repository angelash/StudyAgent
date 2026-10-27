'use client';
import Link from 'next/link';
import * as React from 'react';
import { useSessionUser } from '../../lib/session-user';
import { learningContextHref, readLearningContext, saveLearningContext, type LearningContext } from '../../lib/learning-context';
import './workspace.css';
import { WorkspaceDialog } from './workspace-dialog';
import './reference-navigation.generated.css';
import './reference-navigation.css';

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
  const [mobile, setMobile] = React.useState(false), [narrow, setNarrow] = React.useState(false), [collapsed, setCollapsed] = React.useState(false);
  const trigger = React.useRef<HTMLButtonElement>(null), sidebar = React.useRef<HTMLElement>(null), user = useSessionUser();
  const mobileOpen = React.useRef(false); mobileOpen.current = narrow && mobile;
  const [homeHref, setHomeHref] = React.useState('/learn');
  React.useEffect(() => {
    const query = window.matchMedia('(max-width:1000px)'), update = () => { setNarrow(query.matches); if (!query.matches) setMobile(false); };
    update(); query.addEventListener('change', update); return () => query.removeEventListener('change', update);
  }, []);
  React.useEffect(() => {
    setMobile(false);
    let saved = false; try { saved = localStorage.getItem('studyagent.navigation.compact.' + (user?.id ?? 'guest')) === 'true'; } catch { /* Current controls remain usable. */ }
    setCollapsed(saved);
    if (!user) { setHomeHref('/learn'); return; }
    const selected = context?.studentId ? context : readLearningContext(user.id, window.location.search);
    setHomeHref(learningContextHref('/learn', selected)); saveLearningContext(user.id, selected);
  }, [user?.id, context?.studentId, context?.subject]);
  React.useEffect(() => {
    const value = narrow ? 'mobile' : collapsed ? 'compact' : 'expanded'; document.body.dataset.studyNavigation = value;
    return () => { if (document.body.dataset.studyNavigation === value) delete document.body.dataset.studyNavigation; };
  }, [narrow, collapsed]);
  React.useEffect(() => {
    if (!narrow || !mobile) return;
    const protectedElements: Array<{ element: HTMLElement; inert: boolean }> = [];
    let current: HTMLElement | null = sidebar.current?.closest<HTMLElement>('.ws-dialog-layer') ?? null;
    while (current && current !== document.body) {
      for (const sibling of current.parentElement?.children ?? []) if (sibling !== current && sibling instanceof HTMLElement && !['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) {
        protectedElements.push({ element: sibling, inert: sibling.inert }); sibling.inert = true;
      }
      current = current.parentElement;
    }
    return () => {
      for (const row of protectedElements) if (row.element.isConnected) row.element.inert = row.inert;
      requestAnimationFrame(() => {
        if (!mobileOpen.current && window.matchMedia('(max-width:1000px)').matches && trigger.current?.isConnected) trigger.current.focus();
      });
    };
  }, [narrow, mobile]);
  function toggle() { const value = !collapsed; setCollapsed(value); try { localStorage.setItem('studyagent.navigation.compact.' + (user?.id ?? 'guest'), String(value)); } catch { /* Persistence is optional. */ } }
  const expanded = narrow || !collapsed, resume = recent?.[0], rootId = React.useId();
  function afterNavigate() { setMobile(false); }
  const body = <aside ref={sidebar} id={rootId} className={'ws-navigation ws-reference-navigation sidebar expanded' + (!expanded ? ' compact' : '')}
    data-open={mobile} data-narrow={narrow} aria-label="学习工作台导航" {...(narrow ? { role: 'dialog', 'aria-modal': true as const } : {})}>
    <div className="sidebar-content-wrapper">
      <header className="sidebar-logo-header"><Link href="/studio" className="ws-reference-brand" aria-label="StudyAgent 学习工作台" onClick={afterNavigate}>
        <StudioSymbol path="m3 8 9-5 9 5-9 5ZM5 12v5l7 4 7-4v-5M9 10l3 2 3-2" size={24}/><b>StudyAgent</b></Link>
        <button type="button" className="collapse-icon expanded" aria-label={narrow ? '关闭学习导航' : collapsed ? '展开学习导航' : '收起学习导航'}
          aria-expanded={expanded} onClick={narrow ? afterNavigate : toggle}><StudioSymbol path={narrow ? 'M6 6l12 12M18 6 6 18' : collapsed ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'} size={16}/></button>
      </header>
      <div className="sidebar-body"><nav className="nav-icons-group" aria-label="工作台主要入口">
        {navigation.map(([view, label, english, path]) => {
          const className = 'nav-item' + (expanded ? ' expanded' : '') + (active === view ? ' active' : '');
          const content = <><StudioSymbol path={path}/><span className="button-label">{label}</span></>;
          return onNavigate ? <button key={view} type="button" className={className} title={!expanded ? label : undefined} aria-label={english}
            aria-current={active === view ? 'page' : undefined} onClick={() => { afterNavigate(); onNavigate(view); }}>{content}</button> :
            <Link key={view} className={className} href={'/studio?view=' + view} title={!expanded ? label : undefined} aria-label={english}
              aria-current={active === view ? 'page' : undefined} onClick={afterNavigate}>{content}</Link>;
        })}
        <Link className={'nav-item' + (expanded ? ' expanded' : '') + (active === 'whiteboards' ? ' active' : '')} href="/studio/whiteboards"
          aria-label="AI Whiteboards" title={!expanded ? 'AI白板' : undefined} aria-current={active === 'whiteboards' ? 'page' : undefined} onClick={afterNavigate}>
          <StudioSymbol path="M4 4h16v13H4ZM8 21l4-4 4 4M8 8h8M8 12h5"/><span className="button-label">AI白板</span></Link>
      </nav>
      {onCreate && expanded && <button type="button" className="ws-reference-create" onClick={() => { afterNavigate(); onCreate(); }}>＋ 创建课程</button>}
      {expanded && <div className="history-sections-container"><section className="sidebar-resume-section" aria-label={resume ? '继续学习' : '开始学习'}>
        <header className="sidebar-history-header"><h3>{resume ? '继续学习' : '开始学习'}</h3></header>
        {resume ? <Link className="sidebar-resume-card" href={resume.href} onClick={afterNavigate}><span className="sidebar-resume-card-top"><b className="sidebar-resume-title">{resume.title}</b></span>
          {resume.detail && <span className="sidebar-resume-course">{resume.detail}</span>}</Link> :
          <Link className="sidebar-resume-card" href="/studio?view=courses" onClick={afterNavigate}><b className="sidebar-resume-title">打开课程</b><span className="sidebar-resume-course">从一节适合自己的课开始。</span></Link>}
      </section><section className="activities-section"><header className="sidebar-history-header"><h3>近期活动</h3></header>
        <div className="conversation-list">{recent?.length ? recent.slice(1, 4).map((item, index) => <Link className="conversation-item" href={item.href} key={index} title={item.title} onClick={afterNavigate}>
          <span className="conversation-title">{item.title}</span></Link>) : <p className="ws-reference-empty">开始学习后，活动会出现在这里。</p>}</div>
      </section></div>}
      </div><footer className="sidebar-version-footer"><Link href={homeHref} title={!expanded ? '返回学习首页' : undefined} aria-label="返回学习首页" onClick={afterNavigate}>
        {expanded ? '返回学习首页 →' : <StudioSymbol path="M3 12h18M9 6l-6 6 6 6" size={18}/>}</Link></footer>
    </div>
  </aside>;
  return <><link rel="stylesheet" href="/reference/hyperknow/font/Satoshi_Complete/Fonts/WEB/css/satoshi.css" precedence="studio-fonts"/>
    <link rel="stylesheet" href="/reference/hyperknow/fonts/misans/misans.css" precedence="studio-fonts"/>
    <button ref={trigger} type="button" className="ws-reference-trigger" aria-label="打开学习导航" aria-expanded={mobile} aria-controls={rootId} onClick={() => setMobile(true)}><StudioSymbol path="M4 6h16M4 12h16M4 18h16"/></button>
    {narrow ? mobile && <WorkspaceDialog onClose={afterNavigate} returnFocus={trigger.current}><div className="ws-reference-backdrop" onClick={event => { if (event.target === event.currentTarget) afterNavigate(); }}>{body}</div></WorkspaceDialog> : body}
  </>;

}
