import Link from 'next/link';
import { SessionControl } from './session-control';

export function StudyNav({ current }: { current?: 'family' | 'assessment' | 'today' | 'library' }) {
  return <header className="studio-nav">
    <Link href="/" className="studio-brand"><span aria-hidden="true">学</span>学习观察室</Link>
    <nav aria-label="主要导航">{([
      ['family', '/parent/dashboard', '家长空间'], ['assessment', '/student/assessment', '知识诊断'],
      ['today', '/student/today', '今日学习'], ['library', '/library', '题卷资料'],
    ] as const).map(([key, href, label]) => <Link key={key} href={href} aria-current={current === key ? 'page' : undefined}>{label}</Link>)}</nav>
    <SessionControl />
  </header>;
}
