'use client';
import { LoginLink } from '../../../components/login-link';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiRequest } from '../../../lib/api';
import { loadLearners } from '../../../lib/learners';
import { useSessionUser, type SessionUser } from '../../../lib/session-user';
import { learningContextIssue, readLearningContext } from '../../../lib/learning-context';
import { workspaceHref } from '../../../lib/workspace-navigation';
import { StudioNavigation } from '../studio-navigation';

type Profile = { id: string; nickname: string; grade: number; minor?: boolean };
export function ProfilesWorkspace() {
  const identity = useSessionUser();
  if (!identity) return <main className="learning-studio"><section className="workspace-page"><h1>学习档案</h1>{identity === undefined ? <p role="status">正在确认学习身份…</p> : <LoginLink>登录后管理学习档案</LoginLink>}</section></main>;
  return <ActorProfiles key={identity.id + ':' + identity.role} identity={identity} />;
}
function ActorProfiles({ identity }: { identity: SessionUser }) {
  const search = useSearchParams(), searchKey = search.toString(), canManage = ['parent', 'admin'].includes(identity.role), ownOnly = identity.role === 'student';
  const [profiles, setProfiles] = React.useState<Profile[]>([]), [loading, setLoading] = React.useState(true), [error, setError] = React.useState('');
  const [nickname, setNickname] = React.useState(''), [grade, setGrade] = React.useState(3), [busy, setBusy] = React.useState(false), [retry, setRetry] = React.useState(0);
  const context = readLearningContext(identity.id, '?' + searchKey);
  React.useEffect(() => {
    const controller = new AbortController(); setProfiles([]); setLoading(true); setError('');
    const issue = learningContextIssue('?' + searchKey);
    if (issue) { setError(issue); setLoading(false); return () => controller.abort(); }
    loadLearners(controller.signal)
      .then(value => { if (!controller.signal.aborted) setProfiles(ownOnly ? value.filter(item => item.id === identity.studentId) : value); })
      .catch(caught => { if (!controller.signal.aborted) setError((caught as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [identity.id, ownOnly, identity.studentId, searchKey, retry]);
  async function createProfile(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const created = await apiRequest<{ profile: Profile }>('/students', { method: 'POST', body: JSON.stringify({ nickname, grade, preferredSessionMinutes: 15,
        defaultVersionMap: { math: grade <= 6 ? 'common' : '', chinese: grade <= 6 ? 'common' : '', english: grade <= 6 ? 'common' : '', ...(grade === 9 ? { chemistry: 'guangzhou-pep-chemistry-9-upper-v1' } : {}) } }) });
      setProfiles(value => [...value, created.profile]); setNickname('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : '建档未完成，请重试'); }
    finally { setBusy(false); }
  }
  async function setMinor(item: Profile, minor: boolean) {
    setBusy(true); setError('');
    try {
      const saved = await apiRequest<{ studentId: string; minor: boolean }>('/students/' + encodeURIComponent(item.id) + '/settings', { method: 'POST', body: JSON.stringify({ minor }) });
      setProfiles(value => value.map(row => row.id === saved.studentId ? { ...row, minor: saved.minor } : row));
    } catch (caught) { setError(caught instanceof Error ? caught.message : '设置未保存，请重试'); }
    finally { setBusy(false); }
  }
  const intro = canManage ? '跨课程查看每位学习者的诊断、报告与任务，并管理授权和学习码。' : '查看自己的诊断、报告与学习任务。';
  const records = [['assessment', '知识诊断'], ['reports', '学习报告'], ['tasks', '学习任务']] as const;
  return <main className="learning-studio"><StudioNavigation active="profiles" context={context} />
    <section className="workspace-page"><h1>学习档案</h1><p className="workspace-page-intro">{intro}</p>
    {<>
      {error && <div className="workspace-error" role="alert"><p>{error}</p><button className="workspace-button" onClick={() => setRetry(value => value + 1)}>重新读取档案</button></div>}
      {loading ? <p role="status">正在读取学习档案…</p> : !error && <>
        {profiles.map(item => <article className="workspace-page-row" key={item.id}>
          <div><h2>{item.nickname}</h2><p>{item.grade}年级 · 学习记录按各门学科分别保存</p>
            {canManage && <label className="workspace-profile-minor"><input type="checkbox" checked={item.minor !== false} disabled={busy} onChange={event => void setMinor(item, event.target.checked)} />未成年（AI 输出按更严格的规则检查）</label>}</div>
          <nav className="workspace-profile-links" aria-label={item.nickname + '的学习记录'}>
            {records.map(([area, label]) => <Link key={area} className="workspace-button" href={workspaceHref(area, { studentId: item.id, subject: context.subject })}>{label}</Link>)}
            {canManage && <Link className="workspace-button" href={'/parent/access?' + new URLSearchParams({ studentId: item.id })}>授权与学习码</Link>}
          </nav></article>)}
        {canManage &&
        <section className="workspace-profile-create"><h2>添加学习档案</h2><form onSubmit={createProfile}><div className="workspace-page-controls"><label>孩子昵称<input required maxLength={50} value={nickname} disabled={busy} onChange={event => setNickname(event.target.value)} /></label><label>当前年级<select value={grade} disabled={busy} onChange={event => setGrade(Number(event.target.value))}>{[1,2,3,4,5,6,7,8,9].map(value => <option key={value} value={value}>{value}年级</option>)}</select></label><button className="workspace-button" disabled={busy || !nickname.trim()}>{busy ? '正在保存…' : '保存档案'}</button></div></form></section>}
      </>}
    </>}
  </section></main>;
}
