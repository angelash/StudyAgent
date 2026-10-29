'use client';
import Link from 'next/link';
import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useSessionUser } from '../../lib/session-user';
import { learningContextIssue, readLearningContext, type LearningContext } from '../../lib/learning-context';
import { WorkspaceShellContext } from '../../lib/workspace-shell-context';
import { workspaceEntries, workspaceArea, workspaceHref, type WorkspaceNavigation, type WorkspaceArea } from '../../lib/workspace-navigation';
import { SessionControl } from '../../components/session-control';
import './workspace.css';
import { WorkspaceDialog } from './workspace-dialog';
import './reference-navigation.generated.css';
import './reference-navigation.css';

export type { StudioView } from '../../lib/workspace-navigation';
export function StudioSymbol({ path, size = 20 }: { path: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path}/></svg>;
}
export function StudioNavigation(props: WorkspaceNavigation) {
  const host = React.useContext(WorkspaceShellContext), user = useSessionUser();
  const token = React.useRef(Symbol('workspace-page'));
  React.useLayoutEffect(() => { if (host && user) host.register(token.current, user.id, props); }, [host, user?.id, props]);
  React.useLayoutEffect(() => { const key = token.current; return () => host?.unregister(key); }, [host]);
  return host ? null : <WorkspaceSidebar {...props} />;
}
export function WorkspaceSidebar({ active, recent, onNavigate, onCreate, context }: WorkspaceNavigation) {
  const pathname = usePathname();
  const [mobile, setMobile] = React.useState(false), [narrow, setNarrow] = React.useState(false), [collapsed, setCollapsed] = React.useState(false);
  const trigger = React.useRef<HTMLButtonElement>(null), sidebar = React.useRef<HTMLElement>(null), user = useSessionUser();
  const mobileOpen = React.useRef(false); mobileOpen.current = narrow && mobile;
  const [selectedContext, setSelectedContext] = React.useState<LearningContext | undefined>(context);
  React.useEffect(() => {
    const query = window.matchMedia('(max-width:1000px)'), update = () => { setNarrow(query.matches); if (!query.matches) setMobile(false); };
    update(); query.addEventListener('change', update); return () => query.removeEventListener('change', update);
  }, []);
  React.useEffect(() => {
    let saved = false; try { saved = localStorage.getItem('studyagent.navigation.compact.' + (user?.id ?? 'guest')) === 'true'; } catch { /* Current controls remain usable. */ }
    setCollapsed(saved);
    if (!user) { setSelectedContext(undefined); return; }
    if (learningContextIssue(window.location.search)) { setSelectedContext(user.role === 'student' ? { studentId: user.studentId, subject: 'math' } : undefined); return; }
    const restored = context?.studentId || context?.audience === 'self' ? context : readLearningContext(user.id, window.location.search);
    const selected = user.role === 'student' ? { studentId: user.studentId, subject: restored.subject } : restored;
    setSelectedContext(selected);
  }, [user?.id, context?.studentId, context?.subject, context?.audience, pathname]);
  React.useEffect(() => { setMobile(false); }, [user?.id]);
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
        if (document.querySelector('.ws-dialog-layer')) return;
        if (!mobileOpen.current && window.matchMedia('(max-width:1000px)').matches && trigger.current?.isConnected) trigger.current.focus();
      });
    };
  }, [narrow, mobile]);
  function toggle() { const value = !collapsed; setCollapsed(value); try { localStorage.setItem('studyagent.navigation.compact.' + (user?.id ?? 'guest'), String(value)); } catch { /* Persistence is optional. */ } }
  const expanded = narrow || !collapsed, resume = recent?.[0], rootId = React.useId();
  const current = workspaceArea(pathname, typeof window === 'undefined' ? '' : window.location.search, active === 'feed' ? 'home' : active);
  const independent = user?.role !== 'student' && selectedContext?.audience === 'self';
  const entries = workspaceEntries.filter(entry => !independent || !['assessment', 'reports'].includes(entry.id));
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
        {['学习', '学习观察', '资料与记录'].map(group => <div key={group} className="ws-navigation-group">
          {expanded && <p className="ws-navigation-group-label">{group === '学习观察' && independent ? '时间安排' : group}</p>}
          {entries.filter(entry => entry.group === group).map(entry => {
            const className = 'nav-item' + (expanded ? ' expanded' : '') + (current === entry.id ? ' active' : '');
            const content = <><StudioSymbol path={entry.path}/><span className="button-label">{entry.label}</span></>;
            const label = ['tasks', 'assessment', 'reports'].includes(entry.id) ? entry.label : entry.english;
            return onNavigate && entry.view ? <button key={entry.id} type="button" className={className} title={!expanded ? entry.label : undefined} aria-label={label}
              aria-current={current === entry.id ? 'page' : undefined} onClick={() => { afterNavigate(); onNavigate(entry.view!); }}>{content}</button> :
              <Link key={entry.id} className={className} href={workspaceHref(entry.id, selectedContext)} title={!expanded ? entry.label : undefined} aria-label={label}
                aria-current={current === entry.id ? 'page' : undefined} onClick={afterNavigate}>{content}</Link>;
          })}
        </div>)}
      </nav>
      {onCreate && expanded && <button type="button" className="ws-reference-create" onClick={() => {
        const target = narrow ? trigger.current : document.activeElement as HTMLElement | null;
        afterNavigate(); onCreate(target);
      }}>＋ 创建课程</button>}
      {expanded && <div className="history-sections-container"><section className="sidebar-resume-section" aria-label={resume ? '继续学习' : '开始学习'}>
        <header className="sidebar-history-header"><h3>{resume ? '继续学习' : '开始学习'}</h3></header>
        {resume ? <Link className="sidebar-resume-card" href={resume.href} onClick={afterNavigate}><span className="sidebar-resume-card-top"><b className="sidebar-resume-title">{resume.title}</b></span>
          {resume.detail && <span className="sidebar-resume-course">{resume.detail}</span>}</Link> :
          <Link className="sidebar-resume-card" href="/studio?view=courses" onClick={afterNavigate}><b className="sidebar-resume-title">打开课程</b><span className="sidebar-resume-course">从一节适合自己的课开始。</span></Link>}
      </section><section className="activities-section"><header className="sidebar-history-header"><h3>近期活动</h3></header>
        <div className="conversation-list">{recent?.length ? recent.slice(1, 4).map((item, index) => <Link className="conversation-item" href={item.href} key={index} title={item.title} onClick={afterNavigate}>
          <span className="conversation-title">{item.title}</span></Link>) : <p className="ws-reference-empty">开始学习后，活动会出现在这里。</p>}</div>
      </section></div>}
      </div><footer className="sidebar-version-footer">
        {([
          ...(['parent', 'admin'].includes(user?.role ?? '') ? [['profiles', '学习档案', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-4M16 3a4 4 0 0 1 0 8']] : []),
          ...(['teacher', 'admin'].includes(user?.role ?? '') ? [['admin', '教研与管理', 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6']] : []),
          ['settings', '账号与设置', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4'],
        ] as Array<[WorkspaceArea, string, string]>).map(([id, label, path]) => <Link key={id} href={workspaceHref(id, selectedContext)} className={current === id ? 'active' : undefined}
          aria-label={label} aria-current={current === id ? 'page' : undefined} title={!expanded ? label : undefined} onClick={afterNavigate}>
          <StudioSymbol path={path}/><span className="button-label">{label}</span></Link>)}
        {expanded && <SessionControl navigation={false} />}
      </footer>
    </div>
  </aside>;
  return <>
    <button ref={trigger} type="button" className="ws-reference-trigger" aria-label="打开学习导航" aria-expanded={mobile} aria-controls={rootId} onClick={() => setMobile(true)}><StudioSymbol path="M4 6h16M4 12h16M4 18h16"/></button>
    {narrow ? mobile && <WorkspaceDialog onClose={afterNavigate} returnFocus={trigger.current}><div className="ws-reference-backdrop" onClick={event => { if (event.target === event.currentTarget) afterNavigate(); }}>{body}</div></WorkspaceDialog> : body}
  </>;

}
