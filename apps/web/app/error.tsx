'use client';
import Link from 'next/link';
import './route-status.css';

// Route-level boundary: a rendering error in one page no longer blanks the whole app.
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="route-status" role="alert">
      <h1>这个页面暂时出错了</h1>
      <p>已经提交或保存的内容不会因此丢失。可以重试，或返回首页继续。</p>
      {error.digest ? <p className="route-status-code">错误编号：{error.digest}</p> : null}
      <div className="route-status-actions">
        <button type="button" onClick={reset}>重试</button>
        <Link href="/">返回首页</Link>
      </div>
    </main>
  );
}
