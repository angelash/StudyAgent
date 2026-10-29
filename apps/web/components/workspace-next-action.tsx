'use client';
import * as React from 'react';
import Link from 'next/link';
import type { ClassroomCatalog, LearningHome } from '@study-agent/contracts';
import { apiRequest } from '../lib/api';
import type { LearningContext } from '../lib/learning-context';
import { workspaceHref } from '../lib/workspace-navigation';
import { subjectNames } from '../lib/learning';

function actionHref(action: LearningHome['primary']) {
  if (!action) return '';
  const url = new URL(action.href, 'https://workspace.invalid');
  if (url.pathname === '/student/today') url.pathname = '/studio/tasks';
  if (url.pathname === '/student/assessment') url.pathname = url.searchParams.get('view') === 'plan' ? '/studio/tasks' : action.kind === 'report' ? '/studio/reports' : '/studio/assessment';
  return url.pathname + url.search + url.hash;
}

export function WorkspaceNextAction({ actorId, context, classroom }: { actorId: string; context: LearningContext; classroom: ClassroomCatalog | null }) {
  const [home, setHome] = React.useState<LearningHome | null>(null), [error, setError] = React.useState(''), [retry, setRetry] = React.useState(0);
  const generation = React.useRef(0);
  React.useEffect(() => {
    const version = ++generation.current, controller = new AbortController();setHome(null);setError('');
    if (!context.studentId || context.audience === 'self') return () => controller.abort();
    apiRequest<LearningHome>('/learning/home?' + new URLSearchParams({studentId:context.studentId,subject:context.subject}),{signal:controller.signal})
      .then(value=>{if(version===generation.current&&!controller.signal.aborted&&value.actor.id===actorId&&value.selected?.id===context.studentId&&value.subject===context.subject)setHome(value);})
      .catch(caught=>{if(version===generation.current&&!controller.signal.aborted)setError((caught as Error).message);});
    return()=>controller.abort();
  },[actorId,context.studentId,context.subject,context.audience,retry]);
  const selected=home?.actor.id===actorId&&home.selected?.id===context.studentId&&home.subject===context.subject?home:null;
  const latest=[...(classroom?.progress??[])].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
  const independent=context.audience==='self';
  if(error)return <section className="workspace-home-next" aria-label="下一步学习"><div role="alert"><p>{error}</p><button className="workspace-button" onClick={()=>setRetry(value=>value+1)}>重新读取学习安排</button></div></section>;
  if(!independent&&!selected)return <section className="workspace-home-next" aria-label="下一步学习"><p role="status">正在取回当前学习安排…</p></section>;
  const action=selected?.primary;
  return <>{selected?.selected && <div className="workspace-home-context"><strong>{selected.selected.nickname}的{subjectNames[selected.subject]}</strong><span>{selected.scope.summary}</span><Link href={workspaceHref('assessment',context)}>查看学习范围</Link></div>}
    <section className="workspace-home-next" aria-label="下一步学习"><div><small>继续学习</small><h2>{action?.title??(latest?'继续自己的课程':'从一门课程开始')}</h2><p>{action?.reason??'阅读、练习和项目分别保存，在自己的账号下接着学习。'}</p><span>{action?.saved??(latest?'已保存原课堂位置':'独立课程无需创建孩子档案')}</span></div><Link className="workspace-button" href={action?actionHref(action):(latest?'/studio/classroom?'+new URLSearchParams({lesson:latest.lessonId,session:latest.sessionId}):workspaceHref('courses',context))}>{action?.label??(latest?'继续原课堂':'浏览课程')}</Link></section>
    {selected && (selected.secondary.length > 0 || selected.memory) && <details className="workspace-home-options"><summary>其他安排与依据</summary>{selected.secondary.map(item=><Link key={item.id} href={actionHref(item)}>{item.title} →</Link>)}{selected.memory?.facts.map(fact=><p key={fact.id}>{fact.text} · {fact.provenance}</p>)}<p>{selected.notice}</p></details>}
  </>;
}
