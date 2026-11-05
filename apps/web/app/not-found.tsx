import Link from 'next/link';
import './route-status.css';

export const metadata = { title: '页面不存在 · StudyAgent' };

export default function NotFound() {
  return (
    <main className="route-status">
      <h1>没有找到这个页面</h1>
      <p>链接可能已经失效，或者地址输入有误。</p>
      <div className="route-status-actions">
        <Link href="/">返回首页</Link>
      </div>
    </main>
  );
}
