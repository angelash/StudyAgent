'use client';

// Last-resort boundary for errors in the root layout itself; it replaces <html>,
// so it cannot rely on global CSS having loaded.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: '"Segoe UI", "PingFang SC", sans-serif', background: '#f8fafc', color: '#0f172a' }}>
        <main role="alert" style={{ maxWidth: 560, margin: '12vh auto', padding: '32px 28px', background: '#fff', border: '1px solid #dbe3ef', borderRadius: 16 }}>
          <h1 style={{ marginTop: 0, fontSize: 24 }}>页面加载失败</h1>
          <p style={{ lineHeight: 1.7 }}>已经提交或保存的内容不会因此丢失。请重试，或稍后刷新页面。</p>
          {error.digest ? <p style={{ fontSize: 13, color: '#64748b' }}>错误编号：{error.digest}</p> : null}
          <button type="button" onClick={reset} style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #1d4ed8', background: '#1d4ed8', color: '#fff', cursor: 'pointer' }}>重试</button>
        </main>
      </body>
    </html>
  );
}
