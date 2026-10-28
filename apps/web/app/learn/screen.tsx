'use client';
import * as React from 'react';
import Link from 'next/link';
import type { LearningHome, LearningHomeAction, Subject } from '@study-agent/contracts';
import { apiRequest } from '../../lib/api';
import { useSessionUser } from '../../lib/session-user';
import { clearLearningContext, learningContextHref, readLearningContext, saveLearningContext, type LearningContext } from '../../lib/learning-context';
import { StudyNav } from '../../components/study-nav';
import '../student/assessment/studio.css';
import './home.css';

const subjects: Array<[Subject, string]> = [['math', '数学'], ['chinese', '语文'], ['english', '英语'], ['chemistry', '化学']];

function Action({ action, primary = false }: { action: LearningHomeAction; primary?: boolean }) {
  return <article className={primary ? 'learn-next' : 'learn-action'} data-action={action.kind}>
    {primary && <span className="learn-eyebrow">这次，从这里继续</span>}
    {primary ? <h2>{action.title}</h2> : <h3>{action.title}</h3>}
    <p>{action.reason}</p>
    <div className="learn-action-foot"><span>{action.estimatedMinutes ? `约 ${action.estimatedMinutes} 分钟 · ` : ''}{action.saved}</span>
      <Link className={primary ? 'learn-primary' : 'learn-text-link'} href={action.href}>{action.label}<span aria-hidden="true"> →</span></Link></div>
  </article>;
}

export function LearningHomeScreen() {
  const user = useSessionUser();
  const [selection, setSelection] = React.useState<LearningContext | null>(null);
  const [selectionActorId, setSelectionActorId] = React.useState('');
  const [home, setHome] = React.useState<LearningHome | null>(null);
  const [profiles, setProfiles] = React.useState<LearningHome['children']>([]);
  const [error, setError] = React.useState(''), [retry, setRetry] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const generation = React.useRef(0);

  React.useEffect(() => {
    generation.current++; setHome(null); setProfiles([]); setError(''); setSelection(null); setSelectionActorId('');
    if (!user) { if (user === null) clearLearningContext(); return; }
    const restore = () => {
      generation.current++; setHome(null); setError('');
      setSelectionActorId(user.id);
      setSelection(readLearningContext(user.id, window.location.search));
    };
    restore(); window.addEventListener('popstate', restore);
    return () => { generation.current++; window.removeEventListener('popstate', restore); };
  }, [user?.id]);

  React.useEffect(() => {
    if (!user || !selection || selectionActorId !== user.id) return;
    const version = ++generation.current, controller = new AbortController();
    setHome(null); setError(''); setLoading(true);
    const query = new URLSearchParams({ subject: selection.subject });
    if (selection.studentId !== undefined) query.set('studentId', selection.studentId);
    apiRequest<LearningHome>('/learning/home?' + query, { signal: controller.signal }).then(result => {
      if (version !== generation.current || controller.signal.aborted || result.actor.id !== user.id) return;
      const confirmed = { subject: result.subject, ...(result.selected ? { studentId: result.selected.id } : {}) };
      setHome(result); setProfiles(result.children); saveLearningContext(user.id, confirmed);
      window.history.replaceState(null, '', learningContextHref('/learn', confirmed));
    }).catch(caught => {
      if (version === generation.current && !controller.signal.aborted) setError((caught as Error).message);
    }).finally(() => { if (version === generation.current && !controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user?.id, selectionActorId, selection, retry]);

  function choose(next: LearningContext) {
    generation.current++; setHome(null); setError(''); setSelection(next);
    window.history.pushState(null, '', learningContextHref('/learn', next));
    if (user) saveLearningContext(user.id, next);
  }
  // Never render a previous actor's projection while session restoration catches up.
  const data = home?.actor.id === user?.id ? home : null;
  const context = selection && selectionActorId === user?.id ? { ...selection, studentId: selection.studentId ?? data?.selected?.id } : undefined;
  const name = subjects.find(([value]) => value === data?.subject)?.[1] ?? '学习';
  const manage = data?.actor.canManage ?? ['parent', 'admin'].includes(user?.role ?? '');

  return <main className="learning-studio learn-home"><StudyNav current="home" context={context} />
    <div className="learn-shell">
      <header className="learn-heading"><div><span className="learn-eyebrow">每天，一次有依据的进步</span><h1>{user?.role === 'student' ? '开始今天的一小步。' : '把下一步，安排明白。'}</h1><p>继续保存的学习，看看已经知道什么，再决定接下来做什么。</p></div>
        {user && selection && selectionActorId === user.id && <div className="learn-controls">{profiles.length > 0 && <label>学习档案<select aria-label="当前学习档案" value={selection.studentId ?? data?.selected?.id ?? ''} disabled={user.role === 'student'} onChange={event => choose({ ...selection, studentId: event.target.value })}>
          {profiles.map(child => <option key={child.id} value={child.id}>{child.nickname} · {child.grade}年级</option>)}</select></label>}
          <label>学科<select aria-label="当前学习学科" value={selection.subject} onChange={event => choose({ ...selection, studentId: selection.studentId ?? data?.selected?.id, subject: event.target.value as Subject })}>{subjects.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>}
      </header>

      {user === undefined ? <section className="learn-state" role="status">正在恢复登录状态…</section> : !user ? <section className="learn-entry"><div><span className="learn-eyebrow">继续学习</span><h2>用自己的身份，留下每一步。</h2><p>孩子使用家长给的学习码；家长登录后安排学习、核对报告，也可以直接进入独立课程。</p></div><div className="learn-entry-actions"><Link className="learn-primary" href="/student/login">孩子使用学习码进入 →</Link><Link className="learn-secondary" href="/parent/login">家长 / 教师登录 →</Link></div></section> : <>
        {error && <section className="learn-error" role="alert"><h2>这次没有取回学习安排</h2><p>{error}</p><div><button className="learn-secondary" onClick={() => setRetry(value => value + 1)}>重新读取</button><button className="learn-secondary" onClick={() => { clearLearningContext(); choose({ subject: 'math' }); }}>重新选择可用档案</button></div><p className="learn-muted">已保存的记录会保留。不会自动切换为另一个孩子的学习内容。</p></section>}
        {loading && !error && <section className="learn-state" role="status">正在取回当前档案的学习安排…</section>}
        {data && <>
          <div className="learn-body"><section className="learn-main" aria-label="下一步学习">
            {data.selected && <div className="learn-scope"><strong>{data.selected.nickname}的{name}</strong><span>{data.scope.summary}</span><Link href={learningContextHref('/student/assessment', context)}>{data.scope.confirmed ? '查看学习范围' : '确认学习范围'} →</Link></div>}
            {data.primary && <Action action={data.primary} primary />}
            {data.secondary.length > 0 && <details className="learn-more"><summary>还有 {data.secondary.length} 项可以继续</summary><div>{data.secondary.map(action => <Action key={action.id} action={action} />)}</div></details>}
            {!data.selected && manage && <section className="learn-profile"><h2>为孩子建立一份学习档案</h2><p>确认年级、教材和已学范围后，再安排适合的评测与指导。</p><Link className="learn-secondary" href="/parent/dashboard">建立学习档案 →</Link></section>}
            <section className="learn-tools" aria-label="学习工具"><h2>学习工具</h2><div><Link href={learningContextHref('/studio', context)}>课程、白板与资料 <span aria-hidden="true">↗</span></Link><Link href={learningContextHref('/student/today', context)}>今日安排与错题 <span aria-hidden="true">↗</span></Link>{manage && <Link href={learningContextHref('/parent/dashboard', context)}>报告与家长决定 <span aria-hidden="true">↗</span></Link>}{data.actor.canUseAdultCourses && <Link href="/studio?view=courses">独立课程 <span aria-hidden="true">↗</span></Link>}{['admin', 'teacher', 'operator'].includes(data.actor.role) && <Link href="/admin/reviews">教研与评分复核 <span aria-hidden="true">↗</span></Link>}</div></section>
          </section><aside className="learn-journal" aria-label="当前学习记录"><span className="learn-eyebrow">{data.day} / 已保存的记录</span><h2>{data.selected ? '先看清，再往前。' : '从一节课开始。'}</h2>
            {data.selected ? <><dl><div><dt>已确认的已学知识</dt><dd>{data.scope.learnedPoints}<span> 点</span></dd></div><div><dt>尚无独立证据</dt><dd>{data.counts.unknownPoints}<span> 点</span></dd></div><div><dt>已有表现，仍需补证据</dt><dd>{data.counts.insufficientPoints}<span> 点</span></dd></div></dl><p>还不知道的地方，先保持未知。一次提示后的成功，也值得与独立作答分开记录。</p></> : <p>不必先创建孩子档案。成人课程的阅读、练习与项目属于当前账号，独立保存。</p>}
            {data.memory && <details className="learn-facts"><summary>这些安排依据了什么</summary>{data.memory.facts.length ? <ul>{data.memory.facts.map(fact => <li key={fact.id}><span>{fact.text}</span><small>{fact.provenance}</small></li>)}</ul> : <p>这门学科还没有确认过学习范围。</p>}</details>}
            <footer>{data.notice}</footer>
          </aside></div>
        </>}
      </>}
    </div>
  </main>;
}
