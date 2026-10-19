'use client';
import * as React from 'react';
import Link from 'next/link';
import type { EvidenceFeedback, TeacherStudentAssignment } from '@study-agent/contracts';
import { apiRequest } from '../../../lib/api';
import { Child, subjectNames } from '../../../lib/learning';
import { StudyNav } from '../../../components/study-nav';
import { useSessionUser } from '../../../lib/session-user';
import { StudentLearningAccess, StudentProgressInbox } from '../../../components/student-learning-access';
import '../../student/assessment/studio.css';
import '../../admin/workbench.css';
import './access.css';

type Assignment = TeacherStudentAssignment & { displayName: string; principal: string };
const feedbackStates = { open: '已收到', investigating: '核查中', resolved: '已处理', dismissed: '已说明处理依据' };
const send = <T,>(path: string, body?: unknown) => apiRequest<T>(path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
export default function FamilyAccess() {
  const identity = useSessionUser();
  React.useEffect(() => { if (identity?.role === 'student') window.location.replace('/student/today'); }, [identity]);
  const [children, setChildren] = React.useState<Child[]>([]), [studentId, setStudentId] = React.useState(''), [userId, setUserId] = React.useState('');
  const [assignments, setAssignments] = React.useState<Assignment[]>([]), [feedback, setFeedback] = React.useState<EvidenceFeedback[]>([]), [feedbackTotal, setFeedbackTotal] = React.useState(0), [page, setPage] = React.useState(1);
  const [principal, setPrincipal] = React.useState(''), [recipient, setRecipient] = React.useState(''), [invitation, setInvitation] = React.useState<{ code: string; expiresAt: string; recipient: string } | null>(null), [inviteCode, setInviteCode] = React.useState('');
  const [busy, setBusy] = React.useState(false), [loading, setLoading] = React.useState(true), [error, setError] = React.useState(''), [notice, setNotice] = React.useState(''), [revision, setRevision] = React.useState(0);
  React.useEffect(() => { let alive = true; Promise.all([send<Child[]>('/learning/students'), send<{ id: string }>('/auth/me')])
    .then(([list, user]) => { if (alive) { setChildren(list); setUserId(user.id); const requested = new URLSearchParams(window.location.search).get('studentId'); setStudentId((current) => list.some((c) => c.id === current) ? current : list.find((c) => c.id === requested)?.id ?? list[0]?.id ?? ''); } })
    .catch((e) => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [revision]);
  React.useEffect(() => { if (!studentId) return; let alive = true; setAssignments([]); setFeedback([]); setInvitation(null);
    Promise.all([send<Assignment[]>(`/students/${studentId}/reviewers`), send<{ rows: EvidenceFeedback[]; total: number }>(`/learning/feedback?studentId=${studentId}&page=${page}`)])
      .then(([list, data]) => { if (alive) { setAssignments(list); setFeedback(data.rows); setFeedbackTotal(data.total); } }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [studentId, page, revision]);
  async function run(fn: () => Promise<void>) { setBusy(true); setError(''); setNotice(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : '操作未完成，请重试'); } finally { setBusy(false); } }
  const child = children.find((c) => c.id === studentId);
  return <main className="learning-studio"><StudyNav current="family" /><div className="admin-workbench family-access"><Link className="studio-text-button" href="/parent/dashboard">← 返回家长空间</Link><span className="studio-eyebrow">FAMILY & REVIEW / 一起把依据看清楚</span><h1>谁来陪伴，由你确认。</h1><p>管理监护人邀请、教师评分复核权限，并查看每一条反馈的处理依据。</p>
    {error && <div className="studio-error" role="alert">{error}</div>}{notice && <p className="access-notice" role="status">{notice}</p>}{loading && <p role="status">正在读取档案…</p>}
    {children.length > 0 && <label className="access-child">孩子的档案<select value={studentId} disabled={busy} onChange={(e) => { setStudentId(e.target.value); setPage(1); }}>{children.map((c) => <option key={c.id} value={c.id}>{c.nickname} · {c.grade}年级</option>)}</select></label>}
    {child && <><StudentLearningAccess studentId={studentId} nickname={child.nickname} /><StudentProgressInbox studentId={studentId} /><section className="access-section"><div><span className="studio-eyebrow">01 / 教师复核授权</span><h2>让熟悉孩子的人，核对具体表达。</h2><p>获授权教师可以查看{child.nickname}已完成评测和练习中的作答，按量规复核并处理反馈。你可以随时撤销此权限。</p></div>
      <form onSubmit={(event) => { event.preventDefault(); void run(async () => { await send(`/students/${studentId}/reviewers`, { principal }); setPrincipal(''); setAssignments(await send<Assignment[]>(`/students/${studentId}/reviewers`)); setNotice('教师复核权限已保存。'); }); }}><label>已开通教师身份的账号<input required minLength={3} maxLength={254} value={principal} disabled={busy} onChange={(e) => setPrincipal(e.target.value)} autoComplete="off" placeholder="填写教师的登录账号" /></label><button className="studio-primary" disabled={busy || principal.trim().length < 3}>授予复核权限 →</button></form>
      <div className="access-assignments">{assignments.filter((a) => a.status === 'active').map((a) => <article key={a.id}><div><strong>{a.displayName}</strong><p>{a.principal} · {new Date(a.createdAt).toLocaleDateString('zh-CN')} 授权</p></div><button className="studio-secondary" disabled={busy} onClick={() => run(async () => { await send(`/students/${studentId}/reviewers/${a.id}/revoke`, {}); setAssignments(await send<Assignment[]>(`/students/${studentId}/reviewers`)); setNotice('权限已撤销，教师无法再读取或复核这个孩子的作答。'); })}>撤销权限</button></article>)}{!assignments.some((a) => a.status === 'active') && <p>当前尚未授予教师复核权限。</p>}</div>
      {assignments.some((a) => a.status === 'revoked') && <details><summary>已撤销授权记录</summary>{assignments.filter((a) => a.status === 'revoked').map((a) => <p key={a.id}>{a.displayName} · {a.principal} · {a.revokedAt ? new Date(a.revokedAt).toLocaleString('zh-CN') : ''} 已撤销</p>)}</details>}
    </section><section className="access-section"><span className="studio-eyebrow">02 / 邀请另一位监护人</span><h2>共同查看学习，与孩子一起复盘。</h2><p>邀请有效期24小时，只能由你填写的接收账号使用一次。监护人可以管理学习档案、进度和授权。</p>
      <form onSubmit={(event) => { event.preventDefault(); void run(async () => { const result = await send<{ token: string; expiresAt: string; recipientPrincipal: string }>(`/students/${studentId}/invitations`, { recipientPrincipal: recipient }); setInvitation({ code: `study1.${btoa(JSON.stringify({ studentId, token: result.token }))}`, expiresAt: result.expiresAt, recipient: result.recipientPrincipal }); }); }}><label>接收邀请的登录账号<input required minLength={3} maxLength={254} disabled={busy} value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="填写另一位监护人的登录账号" /></label><button className="studio-secondary" disabled={busy || recipient.trim().length < 3}>生成一次性邀请码</button></form>
      {invitation && <div className="access-invitation"><strong>交给 {invitation.recipient} 的邀请码</strong><p>有效期至 {new Date(invitation.expiresAt).toLocaleString('zh-CN')}。接收方登录后，在本页下方粘贴接受。</p><textarea aria-label="一次性监护人邀请码" readOnly value={invitation.code} rows={3} onFocus={(e) => e.target.select()} /></div>}
    </section><section className="access-section"><span className="studio-eyebrow">03 / 反馈与处理依据</span><h2>提出疑问，也能看到后续。</h2><p>在评测报告或练习题下提交反馈后，核查过程和处理说明会保存在这里。</p>{feedback.length ? feedback.map((item) => <article className="access-feedback" key={item.id}><span className="studio-badge">{feedbackStates[item.status]} · {subjectNames[item.subject]}</span><p>{item.message}</p>{item.history.slice(1).map((entry) => <p key={entry.version}><strong>{feedbackStates[entry.status]}</strong>：{entry.note}</p>)}<small>{new Date(item.updatedAt).toLocaleString('zh-CN')}</small></article>) : <p>当前还没有反馈记录。</p>}
      {feedbackTotal > 25 && <div className="access-pages"><button className="studio-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button><span>{page} / {Math.ceil(feedbackTotal / 25)}</span><button className="studio-secondary" disabled={page * 25 >= feedbackTotal} onClick={() => setPage((p) => p + 1)}>下一页</button></div>}
    </section></>}
    <section className="access-section"><span className="studio-eyebrow">接受监护人邀请</span><h2>加入孩子的陪伴记录。</h2><form onSubmit={(event) => { event.preventDefault(); void run(async () => { const encoded = inviteCode.trim(); if (!encoded.startsWith('study1.')) throw new Error('请粘贴完整的监护人邀请码'); let parsed: { studentId: string; token: string }; try { parsed = JSON.parse(atob(encoded.slice(7))); } catch { throw new Error('邀请码格式有误，请重新复制完整内容'); } if (typeof parsed.studentId !== 'string' || typeof parsed.token !== 'string') throw new Error('邀请码格式有误'); await send(`/parents/${userId}/bindings`, { studentId: parsed.studentId, inviteToken: parsed.token }); setInviteCode(''); setRevision((n) => n + 1); setNotice('邀请已接受，可以查看孩子的学习记录。'); }); }}><label>邀请码<textarea required maxLength={3000} rows={3} value={inviteCode} disabled={busy || !userId} onChange={(e) => setInviteCode(e.target.value)} placeholder="粘贴对方发给当前登录账号的完整邀请码" /></label><button className="studio-primary" disabled={busy || !userId || !inviteCode.trim()}>接受邀请</button></form>{!userId && !loading && <Link href="/parent/login" className="studio-text-button">先登录接收邀请的账号 ↗</Link>}</section>
  </div></main>;
}
