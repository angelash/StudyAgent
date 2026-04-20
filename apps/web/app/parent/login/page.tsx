'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest, setAuthToken, setCurrentUser } from '../../../lib/api';

export default function ParentLoginPage() {
  const router = useRouter();
  const [principal, setPrincipal] = React.useState('parent@example.com');
  const [credential, setCredential] = React.useState('study-agent');
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    try {
      const response = await apiRequest<{ token: string; user: { role: string } }>('/auth/login', {
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
    }
  }

  return (
    <main style={{ padding: 40, maxWidth: 560 }}>
      <h1>家长 / 管理员登录</h1>
      <p style={{ color: '#475569', lineHeight: 1.7 }}>
        开发版使用账号密码最小登录。普通账号默认是家长角色；账号里包含 <code>admin</code> 会自动创建管理员角色。
      </p>
      <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
        <input value={principal} onChange={(event) => setPrincipal(event.target.value)} placeholder="principal" />
        <input
          type="password"
          value={credential}
          onChange={(event) => setCredential(event.target.value)}
          placeholder="credential"
        />
        <button
          onClick={submit}
          style={{
            border: 'none',
            borderRadius: 14,
            background: '#0f172a',
            color: '#fff',
            padding: '12px 16px',
          }}
        >
          登录
        </button>
        {error ? <div style={{ color: '#b91c1c' }}>{error}</div> : null}
      </div>
    </main>
  );
}
