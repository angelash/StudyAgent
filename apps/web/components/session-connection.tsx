'use client';
import { refreshSessionUser, useSessionStatus } from '../lib/session-user';
import './session-connection.css';

export function SessionConnection() {
  const session = useSessionStatus();
  if (session.status !== 'unavailable') return null;
  return <aside className="session-connection" role="alert" aria-label="身份确认未完成">
    <p><strong>暂时无法确认登录状态</strong><span>请检查网络后重试。已保存的学习记录会保留。</span></p>
    <button type="button" onClick={() => void refreshSessionUser()}>重新确认登录</button>
  </aside>;
}
