import Link from 'next/link';
import type { LearningContext } from '../../../lib/learning-context';
import { workspaceHref } from '../../../lib/workspace-navigation';

export function ReportTabs({ active, context }: { active: 'sessions' | 'knowledge'; context?: LearningContext }) {
  const href = workspaceHref('reports', context);
  return <nav className="workspace-tabs" aria-label="学习报告分类"><Link href={href} aria-current={active === 'sessions' ? 'page' : undefined}>测评报告</Link><Link href={href + (href.includes('?') ? '&' : '?') + 'tab=knowledge'} aria-current={active === 'knowledge' ? 'page' : undefined}>知识与周记录</Link></nav>;
}
