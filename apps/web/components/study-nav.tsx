'use client';
import * as React from 'react';
import Link from 'next/link';
import { SessionControl } from './session-control';
import { useSessionUser } from '../lib/session-user';
import { learningContextHref, readLearningContext, saveLearningContext, type LearningContext } from '../lib/learning-context';

export function StudyNav({ current, context }: { current?: 'home' | 'studio' | 'family' | 'assessment' | 'today' | 'library'; context?: LearningContext }) {
  const user = useSessionUser();
  const [restored, setRestored] = React.useState<{ actorId: string; context: LearningContext } | null>(null);
  React.useEffect(() => {
    if (!user) { setRestored(null); return; }
    const restore = () => {
      const value = context?.studentId ? context : readLearningContext(user.id, window.location.search);
      setRestored({ actorId: user.id, context: value });
      if (['math', 'chinese', 'english', 'chemistry'].includes(value.subject)) saveLearningContext(user.id, value);
    };
    restore(); window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [user?.id, context?.studentId, context?.subject]);
  const selectedContext = context ?? (restored?.actorId === user?.id ? restored?.context : undefined);
  return <header className="studio-nav">
    <Link href="/" className="studio-brand"><span aria-hidden="true">学</span>学习观察室</Link>
    <nav aria-label="主要导航">{([
      ['home', '/learn', '学习首页'],
      ['studio', '/studio', '学习工作台'],
      ['family', '/parent/dashboard', '家长空间'], ['assessment', '/student/assessment', '知识诊断'],
      ['today', '/student/today', '今日学习'], ['library', '/library', '题卷资料'],
    ] as const).filter(([key]) => user?.role !== 'student' || !['family', 'library'].includes(key)).map(([key, href, label]) => <Link key={key} href={learningContextHref(href, selectedContext)} aria-current={current === key ? 'page' : undefined}>{label}</Link>)}</nav>
    <SessionControl />
  </header>;
}
