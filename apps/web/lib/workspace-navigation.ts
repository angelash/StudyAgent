import type { LearningContext } from './learning-context';
import { adminWorkspaceEntries,allowedAdminWorkspace } from './admin-navigation';

export type WorkspaceArea = 'home' | 'courses' | 'tasks' | 'assessment' | 'reports' | 'calendar' | 'history' | 'materials' | 'whiteboards' | 'profiles' | 'settings' | 'admin';
export type StudioView = 'home' | 'courses' | 'feed' | 'calendar' | 'materials' | 'history';
export type WorkspaceTrackContext = {kind:'gesp';mode:'manage'|'learn';studentId?:string;level?:number};
export type WorkspaceNavigation = {
  active: WorkspaceArea | 'feed';
  context?: LearningContext;
  trackContext?: WorkspaceTrackContext;
  contextState?: 'ready' | 'pending' | 'unavailable';
  layout?: 'default' | 'focus';
  activityKey?: string;
  onRequestNavigate?: (href: string, proceed: () => void, kind?: 'commit') => void;
  recent?: Array<{ title: string; detail?: string; href: string }>;
  onNavigate?: (view: StudioView) => void;
  onCreate?: (returnFocus?: HTMLElement | null) => void;
};
type Entry = { id: WorkspaceArea; label: string; english: string; path: string; view?: StudioView };
// 232 §4.1: five primary entries. Tasks, assessment, reports and whiteboards keep their routes as deep links;
// they are reached from home, from each course and from the cross-course learning record.
export const workspaceEntries: readonly Entry[] = [
  { id: 'home', label: '首页', english: 'Home', view: 'home', path: 'M3 10 12 3l9 7M5 9v12h14V9M9 21v-7h6v7' },
  { id: 'courses', label: '课程', english: 'Courses', view: 'courses', path: 'm2 8 10-5 10 5-10 5Zm4 3v6q6 5 12 0v-6M22 8v9' },
  { id: 'materials', label: '资料', english: 'Materials', view: 'materials', path: 'M4 3h11l5 5v13H4ZM15 3v6h5M8 13h8M8 17h6' },
  { id: 'calendar', label: '日历', english: 'Calendar', view: 'calendar', path: 'M4 5h16v16H4ZM4 10h16M8 3v4M16 3v4M8 14h3M8 17h7' },
  { id: 'history', label: '历史', english: 'History', view: 'history', path: 'M4 7a9 9 0 1 1-1 9M4 3v5h5M12 7v6l4 2' },
];
/** Areas without their own sidebar entry, and the entry that stays highlighted while one is open. */
export const workspaceAreaParent: Partial<Record<WorkspaceArea, WorkspaceArea>> = { tasks: 'home', assessment: 'profiles', reports: 'profiles', whiteboards: 'history' };
const destinations: Partial<Record<WorkspaceArea, string>> = {
  tasks: '/studio/tasks', assessment: '/studio/assessment', reports: '/studio/reports',
  whiteboards: '/studio/whiteboards', profiles: '/studio/profiles', settings: '/studio/settings', admin: '/admin/curriculum',
};
export function workspaceHref(area: WorkspaceArea, context?: LearningContext, track?: WorkspaceTrackContext) {
  if(track){
    if(area==='courses'){
      const params=new URLSearchParams();if(track.mode==='manage'&&track.studentId)params.set('studentId',track.studentId);if(track.level&&Number.isInteger(track.level)&&track.level>=1&&track.level<=4)params.set('level',String(track.level));
      return (track.mode==='manage'?'/parent/gesp':'/student/gesp')+(params.size?'?'+params:'');
    }
    const route=destinations[area]??'/studio',params=new URLSearchParams();
    if(!destinations[area]&&area!=='home')params.set('view',area);if(area==='materials')params.set('tab','personal');
    if(track.studentId)params.set(route==='/studio'?'student':'studentId',track.studentId);
    return route+(params.size?'?'+params:'');
  }
  const route = destinations[area] ?? '/studio';
  const params = new URLSearchParams();
  if (!destinations[area] && area !== 'home') params.set('view', area);
  if (area === 'materials') params.set('tab', 'personal');
  if (context?.studentId && context.audience !== 'self') params.set(route === '/studio' ? 'student' : 'studentId', context.studentId);
  if (context && context.audience !== 'self') params.set('subject', context.subject);
  if (context?.audience === 'self' && route === '/studio') params.set('courseScope', 'adult');
  if (context?.audience === 'self' && route !== '/studio') params.set('audience', 'independent');
  return route + (params.size ? '?' + params : '');
}
export function workspaceArea(pathname: string, search: string, fallback: WorkspaceArea = 'home'): WorkspaceArea {
  const params = new URLSearchParams(search);
  if (pathname.startsWith('/admin/')) return 'admin';
  if (pathname === '/studio/tasks' || pathname === '/student/today' || pathname === '/student/mission') return 'tasks';
  if (pathname === '/studio/reports' || pathname === '/student/knowledge' || pathname === '/parent/dashboard') return 'reports';
  if (pathname === '/studio/assessment' || pathname === '/student/assessment') return params.get('view') === 'plan' ? 'tasks' : fallback === 'reports' ? 'reports' : 'assessment';
  if (pathname === '/studio/profiles' || pathname === '/parent/access') return 'profiles';
  if (pathname === '/studio/settings' || pathname === '/parent/data') return 'settings';
  if (pathname === '/studio/whiteboards') return 'whiteboards';
  if (pathname.startsWith('/library') || pathname === '/studio/source-courses') return 'materials';
  if (pathname === '/studio/classroom' || pathname === '/studio/projects' || pathname === '/chemistry' || pathname === '/parent/gesp' || pathname === '/student/gesp') return 'courses';
  if (pathname === '/studio') {
    const view = params.get('view');
    return workspaceEntries.some(entry => entry.id === view) ? view as WorkspaceArea : fallback;
  }
  return fallback;
}
/** The sidebar item to highlight for an area: its own entry, or the entry that now hosts it. */
export function workspaceHighlight(area: WorkspaceArea): WorkspaceArea { return workspaceAreaParent[area] ?? area; }

/** Explicit compatibility fields, including both aliases so ambiguities stay visible. */
export function legacyWorkspaceHref(area: 'home' | 'reports', source: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const key of ['student', 'studentId', 'subject', 'audience', 'courseScope', ...(area === 'reports' ? ['session', 'reportAtom', 'planId'] : [])]) {
    const value = source[key];
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  // A saved plan without its report opens that same plan in tasks; a report link keeps its original session.
  if (area === 'reports' && !params.has('session') && params.has('planId')) { params.set('view', 'plan'); return '/studio/tasks?' + params; }
  if (area === 'reports' && !params.has('session')) params.set('tab', 'knowledge');
  return (area === 'home' ? '/studio' : '/studio/reports') + (params.size ? '?' + params : '');
}

// Old addresses stay valid sign-in destinations; their own pages redirect to the workspace location.
const loginReturnPaths = new Set(['/learn', '/parent/dashboard', '/student/knowledge', '/student/mission', '/chemistry', '/studio', '/studio/tasks', '/studio/assessment', '/studio/reports', '/studio/profiles', '/studio/settings', '/studio/classroom', '/studio/projects', '/studio/whiteboards', '/studio/source-courses', '/student/assessment', '/student/today', '/student/gesp', '/library', '/library/practice', '/library/practice/review', '/parent/access', '/parent/data', '/parent/gesp',...adminWorkspaceEntries.map(entry=>entry.path)]);
/** Whether a page is one of the activities a sign-in may return to; other pages sign in without a return. */
export function isLoginReturnPath(pathname: string) { return loginReturnPaths.has(pathname); }
/** Login may return to an existing activity, never an external site or nested login. */
export function workspaceLoginDestination(value: string | null, role: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return '/studio';
  try {
    const url = new URL(value, 'https://workspace.invalid');
    if (url.origin !== 'https://workspace.invalid' || !loginReturnPaths.has(url.pathname) || role === 'student' && url.pathname.startsWith('/parent/') || role === 'student' && ['/studio/profiles', '/studio/source-courses'].includes(url.pathname)) return '/studio';
    if(url.pathname.startsWith('/admin/')&&!allowedAdminWorkspace(role,url.pathname))return '/studio';
    if ([...url.searchParams.keys()].some(key => /token|credential|password|code|returnTo|next/i.test(key))) return '/studio';
    return url.pathname + url.search + url.hash;
  } catch { return '/studio'; }
}
