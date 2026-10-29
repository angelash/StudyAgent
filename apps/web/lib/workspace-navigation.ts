import type { LearningContext } from './learning-context';

export type WorkspaceArea = 'home' | 'courses' | 'tasks' | 'assessment' | 'reports' | 'calendar' | 'history' | 'materials' | 'whiteboards' | 'profiles' | 'settings' | 'admin';
export type StudioView = 'home' | 'courses' | 'feed' | 'calendar' | 'materials' | 'history';
export type WorkspaceNavigation = {
  active: WorkspaceArea | 'feed';
  context?: LearningContext;
  recent?: Array<{ title: string; detail?: string; href: string }>;
  onNavigate?: (view: StudioView) => void;
  onCreate?: (returnFocus?: HTMLElement | null) => void;
};
type Entry = { id: WorkspaceArea; label: string; english: string; group: string; path: string; view?: StudioView };
export const workspaceEntries: readonly Entry[] = [
  { id: 'home', label: '首页', english: 'Home', group: '学习', view: 'home', path: 'M3 10 12 3l9 7M5 9v12h14V9M9 21v-7h6v7' },
  { id: 'courses', label: '课程', english: 'Courses', group: '学习', view: 'courses', path: 'm2 8 10-5 10 5-10 5Zm4 3v6q6 5 12 0v-6M22 8v9' },
  { id: 'tasks', label: '学习任务', english: 'Learning tasks', group: '学习', path: 'M9 6h12M9 12h12M9 18h12M3 6l1 1 2-3M3 12l1 1 2-3M3 18l1 1 2-3' },
  { id: 'assessment', label: '知识诊断', english: 'Knowledge assessment', group: '学习观察', path: 'M9 4H5v17h14V4h-4M9 3h6v4H9ZM8 13l3 3 5-6' },
  { id: 'reports', label: '学习报告', english: 'Learning reports', group: '学习观察', path: 'M4 3v18h17M8 16v-4M13 16V8M18 16V5' },
  { id: 'calendar', label: '学习动态', english: 'Calendar', group: '学习观察', view: 'calendar', path: 'M4 5h16v16H4ZM4 10h16M8 3v4M16 3v4M8 14h3M8 17h7' },
  { id: 'history', label: '历史', english: 'History', group: '资料与记录', view: 'history', path: 'M4 7a9 9 0 1 1-1 9M4 3v5h5M12 7v6l4 2' },
  { id: 'materials', label: '资料', english: 'Materials', group: '资料与记录', view: 'materials', path: 'M4 3h11l5 5v13H4ZM15 3v6h5M8 13h8M8 17h6' },
  { id: 'whiteboards', label: 'AI白板', english: 'AI Whiteboards', group: '资料与记录', path: 'M4 4h16v13H4ZM8 21l4-4 4 4M8 8h8M8 12h5' },
];
const destinations: Partial<Record<WorkspaceArea, string>> = {
  tasks: '/studio/tasks', assessment: '/studio/assessment', reports: '/studio/reports',
  whiteboards: '/studio/whiteboards', profiles: '/studio/profiles', settings: '/studio/settings', admin: '/admin/curriculum',
};
export function workspaceHref(area: WorkspaceArea, context?: LearningContext) {
  const route = destinations[area] ?? '/studio';
  const params = new URLSearchParams();
  if (!destinations[area] && area !== 'home') params.set('view', area);
  if (context?.studentId && context.audience !== 'self') params.set(route === '/studio' ? 'student' : 'studentId', context.studentId);
  if (context && context.audience !== 'self') params.set('subject', context.subject);
  if (context?.audience === 'self' && route === '/studio') params.set('courseScope', 'adult');
  if (context?.audience === 'self' && route !== '/studio') params.set('audience', 'independent');
  return route + (params.size ? '?' + params : '');
}
export function workspaceArea(pathname: string, search: string, fallback: WorkspaceArea = 'home'): WorkspaceArea {
  const params = new URLSearchParams(search);
  if (pathname.startsWith('/admin/')) return 'admin';
  if (pathname === '/studio/tasks' || pathname === '/student/today' || pathname === '/student/mission' || pathname === '/student/gesp') return 'tasks';
  if (pathname === '/studio/reports' || pathname === '/student/knowledge' || pathname === '/parent/dashboard') return 'reports';
  if (pathname === '/studio/assessment' || pathname === '/student/assessment') return params.get('view') === 'plan' ? 'tasks' : fallback === 'reports' ? 'reports' : 'assessment';
  if (pathname === '/studio/profiles' || pathname === '/parent/access' || pathname === '/parent/gesp') return 'profiles';
  if (pathname === '/studio/settings' || pathname === '/parent/data') return 'settings';
  if (pathname === '/studio/whiteboards') return 'whiteboards';
  if (pathname.startsWith('/library') || pathname === '/studio/source-courses') return 'materials';
  if (pathname === '/studio/classroom' || pathname === '/studio/projects' || pathname === '/chemistry') return 'courses';
  if (pathname === '/studio') {
    const view = params.get('view');
    return workspaceEntries.some(entry => entry.id === view) ? view as WorkspaceArea : fallback;
  }
  return fallback;
}

/** Explicit compatibility fields, including both aliases so ambiguities stay visible. */
export function legacyWorkspaceHref(area: 'home' | 'reports', source: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const key of ['student', 'studentId', 'subject', 'audience', 'courseScope', ...(area === 'reports' ? ['session', 'reportAtom', 'planId'] : [])]) {
    const value = source[key];
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  if (area === 'reports' && !params.has('session')) params.set('tab', 'knowledge');
  return (area === 'home' ? '/studio' : '/studio/reports') + (params.size ? '?' + params : '');
}

const loginReturnPaths = new Set(['/studio', '/studio/tasks', '/studio/assessment', '/studio/reports', '/studio/profiles', '/studio/settings', '/studio/classroom', '/studio/projects', '/studio/whiteboards', '/studio/source-courses', '/student/assessment', '/student/today', '/student/gesp', '/library', '/library/practice', '/library/practice/review', '/parent/access', '/parent/data', '/parent/gesp']);
/** Login may return to an existing activity, never an external site or nested login. */
export function workspaceLoginDestination(value: string | null, role: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return '/studio';
  try {
    const url = new URL(value, 'https://workspace.invalid');
    if (url.origin !== 'https://workspace.invalid' || !loginReturnPaths.has(url.pathname) || role === 'student' && url.pathname.startsWith('/parent/') || role === 'student' && ['/studio/profiles', '/studio/source-courses'].includes(url.pathname)) return '/studio';
    if ([...url.searchParams.keys()].some(key => /token|credential|password|code|returnTo|next/i.test(key))) return '/studio';
    return url.pathname + url.search + url.hash;
  } catch { return '/studio'; }
}
