'use client';
import * as React from 'react';
import Link from 'next/link';
import type { PrivacyCounts, PrivacyExport, PrivacyOverview, PrivacyPreview, PrivacyReceipt } from '@study-agent/contracts';
import { apiRequest, setAuthToken } from '../../../lib/api';
import { refreshSessionUser, useSessionUser } from '../../../lib/session-user';
import { StudyNav } from '../../../components/study-nav';
import '../../student/assessment/studio.css';
import './privacy.css';

const operationNames = { account_export: '账号与学习资料导出', student_export: '孩子资料导出', student_delete: '孩子档案删除', account_delete: '家长账号注销' };
function Counts({ counts }: { counts: PrivacyCounts }) {
  return <dl className="privacy-counts">{[[counts.observations, '作答观察'], [counts.activities, '学习活动'], [counts.plans, '计划与复测记录'], [counts.conversations, '助教消息']].map(([number, label]) => <div key={label}><dt>{label}</dt><dd>{number}</dd></div>)}</dl>;
}
export default function FamilyDataPage() {
  const user = useSessionUser();
  const [overview, setOverview] = React.useState<PrivacyOverview | null>(null), [scope, setScope] = React.useState('account');
  const [loading, setLoading] = React.useState(true), [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [notice, setNotice] = React.useState('');
  const [operation, setOperation] = React.useState<'export' | 'delete' | null>(null), [preview, setPreview] = React.useState<PrivacyPreview | null>(null);
  const [credential, setCredential] = React.useState(''), [confirmation, setConfirmation] = React.useState(''), [understood, setUnderstood] = React.useState(false);
  const [receipt, setReceipt] = React.useState<PrivacyReceipt | null>(null), [closed, setClosed] = React.useState(false);
  const requestKey = React.useRef(''); const formRef = React.useRef<HTMLFormElement>(null);
  async function reload() { const data = await apiRequest<PrivacyOverview>('/privacy/overview'); setOverview(data); return data; }
  React.useEffect(() => { const controller = new AbortController();
    apiRequest<PrivacyOverview>('/privacy/overview', { signal: controller.signal }).then(setOverview)
      .catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  React.useEffect(() => { if (operation) formRef.current?.querySelector<HTMLInputElement>('input')?.focus(); }, [operation, preview]);
  const endpoint = scope === 'account' ? '/privacy/account' : `/privacy/students/${scope}`;
  const child = overview?.children.find(item => item.id === scope);
  function reset() { setOperation(null); setPreview(null); setCredential(''); setConfirmation(''); setUnderstood(false); }
  async function begin(kind: 'export' | 'delete') {
    setBusy(true); setError(''); setNotice(''); reset(); requestKey.current = crypto.randomUUID();
    try { if (kind === 'delete') setPreview(await apiRequest<PrivacyPreview>(`${endpoint}/deletion-preview`)); setOperation(kind); }
    catch (e) { setError(e instanceof Error ? e.message : '暂时无法读取资料范围'); } finally { setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!operation) return; setBusy(true); setError('');
    const action = operation;
    try {
      const body = { credential, requestKey: requestKey.current, ...(action === 'delete' ? { confirmation, fingerprint: preview?.fingerprint } : {}) };
      if (action === 'export') {
        const data = await apiRequest<PrivacyExport>(`${endpoint}/export`, { method: 'POST', body: JSON.stringify(body) });
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = `学习资料-${data.exportedAt.slice(0, 10)}-${data.receipt.id}.json`;
        document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
        setNotice('资料副本已准备下载。请妥善保存，其中包含孩子的学习记录。'); reset(); await reload();
      } else {
        const result = await apiRequest<PrivacyReceipt>(`${endpoint}/delete`, { method: 'POST', body: JSON.stringify(body) }); setReceipt(result); reset();
        if (scope === 'account') { setClosed(true); setAuthToken(''); window.sessionStorage.removeItem('study_agent_user'); void refreshSessionUser(); }
        else { setScope('account'); setNotice('孩子的档案及关联学习记录已删除。删除回执保留在下方。'); await reload().catch(() => setError('删除已完成，资料列表暂未刷新，请重新打开本页。')); }
      }
    } catch (e) { setError(e instanceof Error ? e.message : '操作未完成，请检查后重试'); }
    finally { setBusy(false); setCredential(''); }
  }
  return <main className="learning-studio privacy-studio"><StudyNav current="family" /><div className="privacy-layout">
    <aside className="privacy-intro"><Link className="studio-text-button" href="/parent/dashboard">← 返回家长空间</Link><span className="studio-eyebrow">FAMILY DATA / 资料由你掌握</span><h1>学习留下痕迹，<br /><em>去留由你决定。</em></h1><p>查看为谁保存了什么。下载一份属于家庭的学习记录，或在核对后删除不再保留的资料。</p><div className="privacy-note"><strong>先了解，再决定。</strong><p>学习资料包含作答、草稿、评分、指导计划和复测历史。删除后，这些记录将无法在当前服务中恢复。</p></div></aside>
    <section className="privacy-main" aria-busy={loading || busy}>
      {error && <div className="studio-error" role="alert">{error}<button onClick={() => setError('')} aria-label="关闭错误提示">×</button></div>}
      {notice && <p className="privacy-success" role="status">{notice}</p>}
      {closed ? <section className="privacy-panel" role="status"><span className="studio-eyebrow">已完成</span><h2>账号已注销。</h2><p>本人登录与关联学习权限已结束。共同监护的孩子档案继续由其他监护人保留。</p><Link className="studio-secondary" href="/parent/login">返回登录页 →</Link></section>
        : loading ? <p role="status">正在核对家庭资料范围…</p> : !overview ? <section className="privacy-panel"><h2>请由家长本人管理资料。</h2><p>使用家长账号登录后，才能查看并管理自己的家庭资料。</p><Link className="studio-primary" href="/parent/login">家长登录 →</Link>{user?.role === 'student' && <Link className="studio-secondary" href="/student/today">继续今日学习</Link>}</section> : <>
          <section className="privacy-panel"><span className="studio-eyebrow">01 / 当前保存范围</span><h2>{overview.account.displayName}的家庭资料</h2><label className="privacy-scope">选择本次管理的范围<select value={scope} disabled={busy || !!operation} onChange={e => { setScope(e.target.value); setReceipt(null); }}><option value="account">我的账号与全部可见孩子档案</option>{overview.children.map(item => <option key={item.id} value={item.id}>{item.nickname} · {item.grade}年级</option>)}</select></label>
            {child ? <><Counts counts={child.counts} /><p>{child.guardianCount} 位有效监护人{child.canDelete ? '。你可以在核对后删除此档案。' : '。永久删除需要先处理共同监护关系。'}</p></> : <div className="privacy-children">{overview.children.length ? overview.children.map(item => <article key={item.id}><div><strong>{item.nickname}</strong><span>{item.grade}年级 · {item.guardianCount} 位监护人</span></div><p>{item.counts.observations} 条作答 · {item.counts.activities} 次学习活动</p></article>) : <p>当前没有绑定孩子档案。账号资料和本人收藏、私有对话仍可导出。</p>}</div>}
            <div className="privacy-actions"><button className="studio-primary" disabled={busy || !!operation} onClick={() => begin('export')}>下载资料副本 ↗</button><button className="privacy-delete-link" disabled={busy || !!operation} onClick={() => begin('delete')}>{scope === 'account' ? '查看注销账号的影响' : '查看删除档案的影响'}</button></div></section>
          {operation && <form ref={formRef} className={`privacy-panel ${operation === 'delete' ? 'privacy-danger' : ''}`} onSubmit={submit}><span className="studio-eyebrow">02 / 本人核对</span><h2>{operation === 'export' ? '将学习记录带在身边。' : scope === 'account' ? '核对注销后的变化。' : '核对将删除的记录。'}</h2>
            {operation === 'export' ? <p>下载JSON资料文件，包含进度、作答、评分版本、报告、指导和复测历史。密码、学习码及他人的私有对话不会被导出。</p> : preview && <><Counts counts={preview.counts} />
              <p>本次将删除 {preview.counts.records} 条业务记录，包括相关身份、草稿与历史。{scope === 'account' && '本人账号和登录会话也会结束。'}</p>
              {preview.deletedChildren.length > 0 && <p><strong>将删除的孩子档案：</strong>{preview.deletedChildren.map(item => item.nickname).join('、')}</p>}
              {preview.retainedChildren.length > 0 && <p><strong>继续由其他监护人保留：</strong>{preview.retainedChildren.map(item => item.nickname).join('、')}。{scope === 'account' && '会移除你的绑定、私有对话和所授予的复核权限，保留学习事实与匿名历史。'}</p>}
              <p className="privacy-retention">{preview.retentionNotice}</p>{preview.blockers.map(blocker => <p key={blocker} role="alert">{blocker}</p>)}
              {preview.canDelete && <><label>请输入“{preview.confirmation}”确认<input required maxLength={254} autoComplete="off" value={confirmation} disabled={busy} onChange={e => setConfirmation(e.target.value)} /></label><label className="privacy-check"><input required type="checkbox" checked={understood} disabled={busy} onChange={e => setUnderstood(e.target.checked)} /><span>我已核对范围，并了解删除后当前记录无法恢复。</span></label></>}</>}
            {(operation === 'export' || preview?.canDelete) && <label>当前家长账号密码<input required type="password" minLength={10} maxLength={128} autoComplete="current-password" value={credential} disabled={busy} onChange={e => setCredential(e.target.value)} /></label>}
            <div className="privacy-actions">{(operation === 'export' || preview?.canDelete) && <button className={operation === 'delete' ? 'privacy-delete-button' : 'studio-primary'} disabled={busy || credential.length < 10 || (operation === 'delete' && (!understood || confirmation !== preview?.confirmation))}>{busy ? '正在处理…' : operation === 'export' ? '确认并下载副本' : scope === 'account' ? '永久注销账号' : '永久删除这个档案'}</button>}<button type="button" className="studio-secondary" disabled={busy} onClick={reset}>取消</button></div></form>}
          <section className="privacy-panel"><span className="studio-eyebrow">资料说明</span><h2>保留与删除的边界</h2><p>{overview.retentionNotice}</p><p>题卷原始资产为共享教学资料，不随家庭资料JSON导出或随账号删除。学生学习身份只能学习，资料导出和删除均由家长本人核对密码。</p></section>
          {overview.receipts.length > 0 && <section className="privacy-panel"><span className="studio-eyebrow">操作留痕</span><h2>最近的资料管理记录</h2><ol className="privacy-history">{overview.receipts.map(item => <li key={item.id}><strong>{operationNames[item.kind]}</strong><span>{new Date(item.completedAt).toLocaleString('zh-CN')}</span><small>{item.counts.records} 条记录 · 回执 {item.id}</small></li>)}</ol></section>}
        </>}
      {receipt && <section className="privacy-panel privacy-receipt"><span className="studio-eyebrow">删除回执</span><h2>{operationNames[receipt.kind]}已完成</h2><p>{new Date(receipt.completedAt).toLocaleString('zh-CN')} · 清除 {receipt.counts.records} 条业务记录。</p><code>{receipt.id}</code><button className="studio-secondary" onClick={() => { const link = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' })); link.href = url; link.download = `${receipt.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30_000); }}>保存删除回执</button></section>}
    </section></div></main>;
}
