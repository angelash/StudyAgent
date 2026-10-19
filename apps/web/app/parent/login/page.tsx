'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest, setAuthToken, setCurrentUser } from '../../../lib/api';

export default function ParentLoginPage() {
  const router = useRouter();
  const [principal, setPrincipal] = React.useState('');
  const [credential, setCredential] = React.useState('');
  const [registering, setRegistering] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const response = await apiRequest<{ token: string; user: { role: string } }>(registering ? '/auth/register' : '/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          principal,
          credential,
        }),
      });

      setAuthToken(response.token);
      setCurrentUser(response.user);
      router.push(response.user.role === 'admin' ? '/admin/analytics' : '/parent/dashboard');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '登录失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 40, maxWidth: 560 }}>
      <h1>家长 / 管理员登录</h1>
      <p style={{ color: '#475569', lineHeight: 1.7 }}>
        登录后管理孩子的学习档案、能力评测与指导计划。首次使用请创建家长账号。
      </p>
      <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
        <label>账号<input autoComplete="username" value={principal} onChange={(event) => setPrincipal(event.target.value)} placeholder="输入账号或邮箱" /></label>
        <input
          type="password"
          value={credential}
          onChange={(event) => setCredential(event.target.value)}
          aria-label="密码"
          autoComplete={registering ? 'new-password' : 'current-password'}
          placeholder="密码（至少 10 个字符）"
        />
        <button
          onClick={submit}
          disabled={busy}
          style={{
            border: 'none',
            borderRadius: 14,
            background: '#0f172a',
            color: '#fff',
            padding: '12px 16px',
          }}
        >
          {busy ? '正在处理…' : registering ? '创建家长账号' : '登录'}
        </button>
        <button onClick={() => { setRegistering(!registering); setError(null); }} disabled={busy}>{registering ? '已有账号，去登录' : '首次使用，创建账号'}</button>
        {error ? <div role="alert" style={{ color: '#b91c1c' }}>{error}</div> : null}
      </div>
    </main>
  );
}
