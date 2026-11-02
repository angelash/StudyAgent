'use client';
import { LoginLink } from '../../../components/login-link';
import Link from 'next/link';
import { StudioNavigation } from '../studio-navigation';
import { useSessionUser } from '../../../lib/session-user';

export default function SettingsPage() {
  const user = useSessionUser();
  return <main className="learning-studio"><StudioNavigation active="settings" /><section className="workspace-page"><h1>账号与设置</h1>
    <p className="workspace-page-intro">账号、数据与授权各有明确入口。课堂播放设置保留在播放器中。</p>
    {user === undefined ? <p role="status">正在确认账号…</p> : !user ? <LoginLink>登录账号</LoginLink> : <>
      <article className="workspace-page-row"><div><h2>当前账号</h2><p>{user.displayName} · {user.role === 'student' ? '学生学习身份' : user.role === 'parent' ? '家长账号' : '教学账号'}</p></div></article>
      {user.role === 'parent' && <><article className="workspace-page-row"><div><h2>家庭资料管理</h2><p>核对导出、删除与注销的实际范围，保留原确认流程。</p></div><Link className="workspace-button" href="/parent/data">管理资料</Link></article><article className="workspace-page-row"><div><h2>学习档案与授权</h2><p>孩子档案、监护、教师授权、学习码和设备。</p></div><Link className="workspace-button" href="/studio/profiles">管理档案</Link></article></>}
      {['admin', 'teacher'].includes(user.role) && <article className="workspace-page-row"><div><h2>本人资料管理</h2><p>核对并导出私有教研稿件、来源核对和操作回执，或查看注销本人账号的影响。</p></div><Link className="workspace-button" href="/parent/data">管理本人资料</Link></article>}
      <article className="workspace-page-row"><div><h2>课堂与白板设置</h2><p>音色、语速、字体和背景在原学习位置调整。</p></div><Link className="workspace-button" href="/studio?view=courses">打开课程</Link></article>
    </>}
  </section></main>;
}
