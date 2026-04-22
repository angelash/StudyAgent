import type { CSSProperties } from 'react';

const linkStyle: CSSProperties = {
  display: 'inline-block',
  padding: '12px 16px',
  borderRadius: 14,
  background: '#0f172a',
  color: '#f8fafc',
  marginRight: 12,
  marginBottom: 12,
};

export default function HomePage() {
  return (
    <main style={{ padding: 40 }}>
      <h1 style={{ fontSize: 36, marginBottom: 8 }}>StudyAgent</h1>
      <p style={{ maxWidth: 760, lineHeight: 1.7 }}>
        当前系统已经支持小学语文、数学、英语闭环：家长登录与建档、管理员导入内容、学生入门评估、今日任务和悬浮助教都可按学科切换运行。
      </p>

      <div style={{ marginTop: 24 }}>
        <a href="/parent/login" style={linkStyle}>
          家长/管理员登录
        </a>
        <a href="/parent/dashboard" style={linkStyle}>
          家长控制台
        </a>
        <a href="/admin/content" style={linkStyle}>
          内容后台
        </a>
      </div>
    </main>
  );
}
