'use client';
import { LoginLink } from './login-link';
import * as React from 'react';
import Link from 'next/link';
import { apiRequest, setAuthToken } from '../lib/api';
import { useSessionStatus } from '../lib/session-user';
import { clearLearningContext } from '../lib/learning-context';
import './session-control.css';
export function SessionControl({ navigation = true, onRequestLogout }: { navigation?: boolean; onRequestLogout?: (proceed: () => void) => void } = {}) {
  const session = useSessionStatus(), role = session.user?.role;
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  async function logout() { if (!window.dispatchEvent(new Event('studyagent:before-logout', { cancelable: true }))) return; setBusy(true); try { await apiRequest('/auth/logout', { method: 'POST', body: '{}' }); setAuthToken(''); clearLearningContext(); window.sessionStorage.removeItem('study_agent_user'); window.location.href = role === 'student' ? '/student/login' : '/parent/login'; } catch { setError('退出未完成，请重试'); setBusy(false); } }
  return <div className="study-account">{navigation && role === 'parent' && <Link href="/parent/data">资料管理</Link>}{navigation && ['admin', 'teacher'].includes(role ?? '') && <Link href="/admin/curriculum">教研后台</Link>}{navigation && role === 'admin' && <><Link href="/admin/ai-tools">AI教研</Link><Link href="/admin/accounts">账号权限</Link></>}{role ? <button onClick={() => onRequestLogout ? onRequestLogout(() => void logout()) : void logout()} disabled={busy}>{busy ? '正在退出…' : '退出'}</button> : session.status === 'anonymous' ? <LoginLink>登录</LoginLink> : <span role="status">{session.status === 'unavailable' ? '登录状态待确认' : '正在确认登录…'}</span>}{error && <span role="alert">{error}</span>}</div>;
}
