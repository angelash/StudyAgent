'use client';
import * as React from 'react';
import Link from 'next/link';
import { apiRequest, setAuthToken } from '../lib/api';
export function SessionControl() {
  const [role, setRole] = React.useState<string | null>(null), [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  React.useEffect(() => { let alive = true; apiRequest<{ role: string }>('/auth/me').then((user) => { if (alive) setRole(user.role); }).catch(() => {}); return () => { alive = false; }; }, []);
  async function logout() { setBusy(true); try { await apiRequest('/auth/logout', { method: 'POST', body: '{}' }); setAuthToken(''); window.sessionStorage.removeItem('study_agent_user'); window.location.href = '/parent/login'; } catch { setError('退出未完成，请重试'); setBusy(false); } }
  return <div className="study-account">{['admin', 'teacher'].includes(role ?? '') && <Link href="/admin/curriculum">教研后台</Link>}{role ? <button onClick={logout} disabled={busy}>{busy ? '正在退出…' : '退出'}</button> : <Link href="/parent/login">登录</Link>}{error && <span role="alert">{error}</span>}</div>;
}
