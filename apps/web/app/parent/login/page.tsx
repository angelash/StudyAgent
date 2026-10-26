'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiRequest, setAuthToken, setCurrentUser } from '../../../lib/api';
import { refreshSessionUser, SessionUser } from '../../../lib/session-user';
import '../../../components/learning-login.css';
export default function ParentLoginPage() {
  const router = useRouter();
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => setReady(true), []);
  const [principal, setPrincipal] = React.useState(''), [credential, setCredential] = React.useState('');
  const [registering, setRegistering] = React.useState(false), [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await apiRequest<{ token: string; user: SessionUser }>(registering ? '/auth/register' : '/auth/login', {
        method: 'POST', body: JSON.stringify({ principal, credential }),
      });
      setAuthToken(result.token); setCurrentUser(result.user); await refreshSessionUser();
      router.push(result.user.role === 'admin' ? '/admin/analytics' : '/learn');
    } catch (caught) { setError((caught as Error).message); } finally { setBusy(false); }
  }
  return <main className="learning-login"><aside><Link href="/" className="login-brand"><span>学</span>学习观察室</Link><div><span className="login-eyebrow">FAMILY / 每一步，都看得见</span><h1>先看见孩子，<br /><em>怎样学会。</em></h1><p>从一个具体知识点开始，找到卡住的一步，再通过新题和时间，看看是否真的留下来。</p></div><Link href="/student/login" className="login-other">孩子自己来学习？使用学习码进入 ↗</Link></aside>
    <section aria-busy={busy}><span className="login-eyebrow">家长与教师入口</span><h2>{registering ? '从一份学习档案开始。' : '继续孩子的学习旅程。'}</h2><p>{registering ? '创建家长账号，确认孩子的年级和实际学习进度。' : '登录后查看孩子的知识证据、指导计划和复测记录。'}</p>
      <form onSubmit={submit}><label>登录账号<input required minLength={3} maxLength={254} autoComplete="username" value={principal} disabled={!ready || busy} onChange={e => setPrincipal(e.target.value)} placeholder="账号或邮箱" /></label><label>密码<input type="password" required minLength={10} maxLength={128} autoComplete={registering ? 'new-password' : 'current-password'} value={credential} disabled={!ready || busy} onChange={e => setCredential(e.target.value)} placeholder="至少 10 个字符" /></label>{error && <p className="login-error" role="alert">{error}</p>}<button className="login-primary" disabled={!ready || busy}>{busy ? '正在处理…' : registering ? '创建家长账号 →' : '登录，查看学习记录 →'}</button></form>
      <button className="login-switch" disabled={!ready || busy} onClick={() => { setRegistering(!registering); setError(''); }}>{registering ? '已有账号，去登录' : '首次使用，创建家长账号'}</button><p className="login-footnote">教师与教研权限由管理员配置。孩子使用家长生成的一次性学习码。</p>
    </section></main>;
}
