'use client';
import * as React from 'react';
import Link from 'next/link';
import { SessionControl } from './session-control';
import { useSessionUser } from '../lib/session-user';
import { learningContextIssue, readLearningContext, saveLearningContext, type LearningContext } from '../lib/learning-context';
import { StudioNavigation } from '../app/studio/studio-navigation';
import { workspaceArea, type WorkspaceArea } from '../lib/workspace-navigation';
import { usePathname } from 'next/navigation';

export function StudyNav({ current, context }: { current?: 'home' | 'studio' | 'family' | 'assessment' | 'today' | 'library' | 'reports'; context?: LearningContext }) {
  const user = useSessionUser();
  const pathname = usePathname();
  const [restored, setRestored] = React.useState<{ actorId: string; context: LearningContext } | null>(null);
  React.useEffect(() => {
    if (!user) { setRestored(null); return; }
    const restore = () => {
      if (learningContextIssue(window.location.search)) { setRestored(null); return; }
      const selected = context?.studentId || context?.audience === 'self' ? context : readLearningContext(user.id, window.location.search);
      const value = user.role === 'student' ? { studentId: user.studentId, subject: selected.subject } : selected;
      setRestored({ actorId: user.id, context: value });
      if (context?.studentId && ['math', 'chinese', 'english', 'chemistry'].includes(value.subject)) saveLearningContext(user.id, value);
    };
    restore(); window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [user?.id, context?.studentId, context?.subject, context?.audience]);
  const selectedContext = context ?? (restored?.actorId === user?.id ? restored?.context : undefined);
  const areas: Record<string, WorkspaceArea> = { home: 'home', studio: 'home', family: 'profiles', assessment: 'assessment', today: 'tasks', library: 'materials', reports: 'reports' };
  if (user && pathname !== '/') return <StudioNavigation active={workspaceArea(pathname, typeof window === 'undefined' ? '' : window.location.search, areas[current ?? ''] ?? 'home')} context={selectedContext} />;
  return <header className="studio-nav">
    <Link href={user ? '/studio' : '/'} className="studio-brand"><span aria-hidden="true">学</span>StudyAgent</Link>
    <nav aria-label="主要导航"><Link href="/studio">学习工作台</Link><Link href="/student/login">孩子学习码</Link><Link href="/library">题卷资料</Link></nav>
    <SessionControl />
  </header>;
}
