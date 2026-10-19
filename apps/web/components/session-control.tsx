'use client';
import * as React from 'react';
import Link from 'next/link';
import { apiRequest, setAuthToken } from '../lib/api';
import { useSessionUser } from '../lib/session-user';
import './session-control.css';
export function SessionControl() {
  const role = useSessionUser()?.role;
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  async function logout() { setBusy(true); try { await apiRequest('/auth/logout', { method: 'POST', body: '{}' }); setAuthToken(''); window.sessionStorage.removeItem('study_agent_user'); window.location.href = role === 'student' ? '/student/login' : '/parent/login'; } catch { setError('退出未完成，请重试'); setBusy(false); } }
  return <div className="study-account">{['admin', 'teacher'].includes(role ?? '') && <Link href="/admin/curriculum">教研后台</Link>}{role === 'admin' && <Link href="/admin/accounts">账号权限</Link>}{role ? <button onClick={logout} disabled={busy}>{busy ? '正在退出…' : '退出'}</button> : <Link href="/parent/login">登录</Link>}{error && <span role="alert">{error}</span>}</div>;
}
