'use client';
import * as React from 'react';
import Link from 'next/link';
import { apiRequest } from '../../../lib/api';
import { StudyNav } from '../../../components/study-nav';
import '../../student/assessment/studio.css';
import '../workbench.css';
type Account = { id: string; principal: string; displayName: string; role: string; status: string; version: number };
const roles: Record<string, string> = { parent: '家长', teacher: '教师 / 教研', operator: '运营', admin: '管理员', student: '学生' };
export default function AccountWorkbench() {
  const [rows, setRows] = React.useState<Account[]>([]), [total, setTotal] = React.useState(0), [search, setSearch] = React.useState(''), [filter, setFilter] = React.useState(''), [page, setPage] = React.useState(1), [reload, setReload] = React.useState(0);
  const [selected, setSelected] = React.useState<Account | null>(null), [role, setRole] = React.useState('teacher'), [status, setStatus] = React.useState('active'), [reason, setReason] = React.useState(''), [credential, setCredential] = React.useState('');
  const [loading, setLoading] = React.useState(true), [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [notice, setNotice] = React.useState('');
  React.useEffect(() => { let alive = true; setLoading(true); apiRequest<{ rows: Account[]; total: number }>(`/admin/accounts?page=${page}&search=${encodeURIComponent(filter)}`)
    .then((data) => { if (alive) { setRows(data.rows); setTotal(data.total); } }).catch((e) => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [page, filter, reload]);
  function select(account: Account) { setSelected(account); setRole(account.role); setStatus(account.status); setReason(''); setCredential(''); setError(''); setNotice(''); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return; setBusy(true); setError(''); setNotice('');
    try {
      const account = await apiRequest<Account>(`/admin/accounts/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ role, status, expectedVersion: selected.version, reason, adminCredential: credential }) });
      setSelected(account); setReason(''); setReload((n) => n + 1); setNotice('账号权限已更新并记录依据。身份或状态变化后，该账号需要重新登录。');
    } catch (e) { setError(e instanceof Error ? e.message : '变更未完成，请重试'); } finally { setCredential(''); setBusy(false); }
  }
  return <main className="learning-studio"><StudyNav /><div className="admin-workbench"><nav className="admin-links"><Link href="/admin/curriculum">课程与覆盖</Link><Link href="/admin/reviews">作答复核与反馈</Link><Link href="/admin/accounts" aria-current="page">账号权限</Link></nav><span className="studio-eyebrow">ACCOUNT ACCESS / 明确每一份权限</span><h1>身份先核实，权限有依据。</h1><p>注册账号默认是家长。管理员核实后可授予教研或运营身份；教师查看孩子作答仍需监护人单独授权。</p>
    {error && <div className="studio-error" role="alert">{error}</div>}{notice && <p role="status">{notice}</p>}
    <form className="admin-toolbar" onSubmit={(e) => { e.preventDefault(); setFilter(search.trim()); setPage(1); }}><label>搜索账号或显示名<input maxLength={254} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="输入账号关键词" /></label><button className="studio-secondary" disabled={busy}>查找</button><span className="studio-muted">{loading ? '正在读取…' : `${total} 个账号`}</span></form>
    <div className="admin-columns"><section><div className="admin-atom-list">{rows.map((account) => <button key={account.id} disabled={busy} aria-pressed={selected?.id === account.id} onClick={() => select(account)}><strong>{account.displayName}</strong><span>{account.principal}</span><small>{roles[account.role]} · {account.status === 'active' ? '可用' : '已停用'} · v{account.version}</small></button>)}</div><div className="admin-toolbar"><button className="studio-secondary" disabled={page <= 1 || busy} onClick={() => setPage((n) => n - 1)}>上一页</button><span className="studio-muted">{page} / {Math.max(1, Math.ceil(total / 25))}</span><button className="studio-secondary" disabled={page * 25 >= total || busy} onClick={() => setPage((n) => n + 1)}>下一页</button></div></section>
      <section className="admin-editor">{selected ? <><h2>{selected.displayName}</h2><p>{selected.principal}</p>{selected.role === 'student' ? <p>学生学习身份由监护人在家庭空间管理。</p> : <form onSubmit={submit} className="admin-form"><label>身份<select value={role} disabled={busy} onChange={(e) => setRole(e.target.value)}>{Object.entries(roles).filter(([key]) => key !== 'student').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>账号状态<select value={status} disabled={busy} onChange={(e) => setStatus(e.target.value)}><option value="active">可用</option><option value="disabled">停用</option></select></label><label className="wide">变更依据<textarea required minLength={5} maxLength={2000} rows={3} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} placeholder="记录身份核实情况和授权原因" /></label><label className="wide">你的管理员密码<input required type="password" autoComplete="current-password" minLength={10} maxLength={128} value={credential} disabled={busy} onChange={(e) => setCredential(e.target.value)} /></label><p className="wide">本次：{roles[selected.role]} / {selected.status === 'active' ? '可用' : '停用'} → {roles[role]} / {status === 'active' ? '可用' : '停用'}。角色或状态变更会撤销旧登录会话。</p><button className="studio-primary wide" disabled={busy || reason.trim().length < 5 || !credential}>{busy ? '正在核对…' : '确认角色与状态变更'}</button></form>}</> : <><h2>选择需要核实的账号。</h2><p>账号变更会保留管理员、时间、前后状态和具体依据。当前管理员不能撤销自己的管理身份。</p></>}</section></div>
  </div></main>;
}
