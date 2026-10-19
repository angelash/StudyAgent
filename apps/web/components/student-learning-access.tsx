'use client';
import * as React from 'react';
import Link from 'next/link';
import { apiRequest } from '../lib/api';
import type { StudentProgressProposal } from '@study-agent/contracts';
import { subjectNames } from '../lib/learning';
import './student-learning-access.css';
type Access = { status: 'enabled' | 'disabled'; version: number;
  sessions: Array<{ id: string; createdAt: string; expiresAt: string }>;
  codes: Array<{ id: string; createdAt: string; expiresAt: string; usedAt: string | null; revokedAt: string | null }>;
  history: Array<{ version: number; status: string; at: string; reason: string }> };
const send = <T,>(path: string, body?: unknown) => apiRequest<T>(path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
export function StudentLearningAccess({ studentId, nickname }: { studentId: string; nickname: string }) {
  const [access, setAccess] = React.useState<Access | null>(null), [reason, setReason] = React.useState('');
  const [code, setCode] = React.useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [notice, setNotice] = React.useState('');
  const commandKey = React.useRef('');
  const path = `/students/${studentId}/learning-access`;
  React.useEffect(() => { let alive = true; setAccess(null); setCode(null); setReason(''); setError(''); setNotice(''); commandKey.current = '';
    send<Access>(path).then(value => { if (alive) setAccess(value); }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [path]);
  async function run(fn: () => Promise<void>) { setBusy(true); setError(''); setNotice(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <section className="access-section learning-access"><span className="studio-eyebrow">孩子独立学习</span><h2>把学习交给孩子，把管理留给家长。</h2><p>开启后，{nickname}可以在自己的设备上完成评测、练习和到期复测。学习码十分钟内有效，只能使用一次；设备上的学习身份持续八小时，可随时结束。</p>
    {error && <p className="studio-error" role="alert">{error}</p>}{notice && <p role="status" className="access-notice">{notice}</p>}
    {!access ? <p role="status">正在读取学习权限…</p> : <><span className="studio-badge">{access.status === 'enabled' ? '独立学习已开启' : '等待家长开启'}</span>
      <form onSubmit={e => { e.preventDefault(); void run(async () => { commandKey.current ||= crypto.randomUUID();
        setAccess(await send<Access>(path, { enabled: access.status !== 'enabled', expectedVersion: access.version, requestKey: commandKey.current, reason }));
        setCode(null); setReason(''); commandKey.current = ''; setNotice(access.status === 'enabled' ? '独立学习已关闭，原学习码与设备身份已结束。学习记录继续保留。' : '已开启。生成一个学习码，交给孩子在学习入口使用。'); }); }}>
        <label>{access.status === 'enabled' ? '为什么关闭独立学习' : '开启前，记录准备怎样陪伴'}<input required minLength={5} maxLength={1500} value={reason} disabled={busy} onChange={e => { setReason(e.target.value); commandKey.current = ''; }} placeholder="例如：先陪孩子熟悉任务，再每天一起看一次学习记录。" /></label>
        <button className="studio-secondary" disabled={busy || reason.trim().length < 5}>{access.status === 'enabled' ? '关闭并结束所有学习设备' : '开启孩子独立学习'}</button>
      </form>
      {access.status === 'enabled' && <div className="learning-code-panel"><button className="studio-primary" disabled={busy} onClick={() => run(async () => {
        const result = await send<{ code: string | null; expiresAt: string }>(`${path}/codes`, { expectedVersion: access.version, requestKey: crypto.randomUUID() });
        if (result.code) setCode({ code: result.code, expiresAt: result.expiresAt }); else { setCode(null); setNotice('学习码已生成过，请再生成一份并交给孩子。'); }
        setAccess(await send<Access>(path));
      })}>生成一次性学习码</button><p>重新生成后，之前尚未使用的学习码失效。已有学习设备可以继续，最多同时使用五个设备。</p>
        {code && <div className="learning-code-reveal"><strong>交给{nickname}的学习码</strong><input aria-label="孩子一次性学习码" readOnly value={code.code.match(/.{1,4}/g)?.join(' ') ?? code.code} onFocus={e => e.target.select()} /><p>有效期至 {new Date(code.expiresAt).toLocaleTimeString('zh-CN')}。请孩子打开学习入口，输入此码。</p><Link className="studio-secondary" href="/student/login">打开孩子学习入口 ↗</Link><small>此设备使用学习码后将切换为孩子身份，返回家长空间需要重新登录。</small></div>}
      </div>}
      <div className="access-assignments">{access.sessions.map((s, i) => <article key={s.id}><div><strong>学习设备 {i + 1}</strong><p>{new Date(s.createdAt).toLocaleString('zh-CN')} 开始 · 至 {new Date(s.expiresAt).toLocaleTimeString('zh-CN')}</p></div><button className="studio-secondary" disabled={busy} onClick={() => run(async () => { await send(`${path}/sessions/${s.id}/revoke`, {}); setAccess(await send<Access>(path)); setNotice('这个设备的学习身份已结束，已保存的作答保留。'); })}>结束这个学习设备</button></article>)}</div>
      {!!access.history.length && <details><summary>独立学习权限记录</summary>{access.history.map(h => <p key={h.version}>{new Date(h.at).toLocaleString('zh-CN')} · {h.status === 'enabled' ? '开启' : '关闭'}<br />{h.reason}</p>)}</details>}
    </>}
  </section>;
}

export function StudentProgressInbox({ studentId }: { studentId: string }) {
  const [proposals, setProposals] = React.useState<StudentProgressProposal[]>([]), [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false), [notes, setNotes] = React.useState<Record<string, string>>({});
  const path = `/students/${studentId}/progress-proposals`;
  React.useEffect(() => { let alive = true; setProposals([]); setNotes({}); setError(''); send<StudentProgressProposal[]>(path).then(p => { if (alive) setProposals(p); }).catch(e => { if (alive) setError(e.message); }); return () => { alive = false; }; }, [path]);
  if (!proposals.length && !error) return null;
  return <section className="access-section progress-inbox"><span className="studio-eyebrow">孩子提出的学习进度</span><h2>先听孩子说，再一起确认。</h2><p>孩子提出的新年级、教材和已学范围，确认后才用于新评测；之前的评测继续保留原范围。</p>{error && <p className="studio-error" role="alert">{error}</p>}
    {proposals.map(p => <article key={p.id}><span className="studio-badge">{({ pending: '等待确认', accepted: '已确认', rejected: '已说明需再核对', superseded: '已有更新的提议' })[p.status]}</span><h3>{subjectNames[p.scope.subject]} · {p.scope.grade}年级{p.scope.term === 'upper' ? '上学期' : '下学期'}</h3><p>{p.scope.textbookVersion} · {p.scope.learnedAtomIds.length} 个已学知识点 · {p.scope.selectedLessonIds.length} 个课时 · 每次 {p.scope.minutesPerSession} 分钟</p>
      {p.knowledgeSnapshot && <details><summary>核对孩子选择的具体知识点</summary>{p.knowledgeSnapshot.map(a => <p key={a.id}><strong>{a.name}</strong><br />{a.objective}</p>)}</details>}
      {p.decisionNote && <p>{p.decisionNote}</p>}{p.status === 'pending' && <form onSubmit={e => e.preventDefault()}><label>陪孩子核对后的说明<textarea rows={3} minLength={5} maxLength={1500} required value={notes[p.id] ?? ''} onChange={e => setNotes(n => ({ ...n, [p.id]: e.target.value }))} placeholder="核对实际教材与课堂进度，再记录确认或需要调整的原因。" /></label><div className="learning-access-controls">{(['accept', 'reject'] as const).map(decision => <button className="studio-secondary" key={decision} disabled={busy || (notes[p.id]?.trim().length ?? 0) < 5} onClick={async () => { setBusy(true); setError(''); try { await send(`${path}/${p.id}/decision`, { decision, expectedVersion: p.version, requestKey: crypto.randomUUID(), note: notes[p.id] }); setProposals(await send<StudentProgressProposal[]>(path)); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }}>{decision === 'accept' ? '核对并确认此进度' : '说明后请孩子再核对'}</button>)}</div></form>}
    </article>)}
  </section>;
}
