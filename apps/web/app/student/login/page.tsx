'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiRequest, setAuthToken, setCurrentUser } from '../../../lib/api';
import { refreshSessionUser, SessionUser, useSessionUser } from '../../../lib/session-user';
import '../../../components/learning-login.css';
export default function StudentLogin() {
  const router = useRouter(), identity = useSessionUser();
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => setReady(true), []);
  const [code, setCode] = React.useState(''), [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  async function enter(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await apiRequest<{ token: string; user: SessionUser }>('/auth/learning-code', { method: 'POST', body: JSON.stringify({ code }) });
      setCode(''); setAuthToken(result.token); setCurrentUser(result.user); await refreshSessionUser(); router.push('/learn');
    } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="learning-login student-login"><aside><Link href="/" className="login-brand"><span>学</span>学习观察室</Link><div><span className="login-eyebrow">LEARN / 一次一小步</span><h1>带着好奇，<br /><em>开始今天。</em></h1><p>可以想一想，可以问一问。不会的地方，就是我们下一次一起看清楚的地方。</p></div><Link href="/parent/login" className="login-other">我是家长，查看学习记录 ↗</Link></aside>
    <section aria-busy={busy}><span className="login-eyebrow">孩子学习入口</span><h2>把家长给你的学习码，<br />填在这里。</h2><p>学习码由家长在“独立学习”中生成，十分钟内有效，只能使用一次。</p>
      {identity?.role === 'student' && <Link className="login-primary" href="/learn">继续我的学习 →</Link>}
      <form onSubmit={enter}><label>一次性学习码<input className="login-code" required maxLength={40} autoComplete="off" spellCheck={false} value={code} disabled={!ready || busy} onChange={e => setCode(e.target.value)} placeholder="输入家长给你的学习码" /></label>{identity && identity.role !== 'student' && <p className="login-footnote">此设备将切换为孩子的学习身份。返回家长空间时，需要重新登录。</p>}{error && <p className="login-error" role="alert">{error}</p>}<button className="login-primary" disabled={!ready || busy || code.replace(/\s/g, '').length !== 20}>{busy ? '正在准备…' : '进入我的学习 →'}</button></form><p className="login-footnote">学习记录会保存。若学习码已过期，请家长重新生成；若设备上的学习已结束，也可以使用新的学习码继续。</p>
    </section></main>;
}
