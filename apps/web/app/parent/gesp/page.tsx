'use client';
import Link from 'next/link';
import { useSessionUser } from '../../../lib/session-user';
import { GespWorkspaceNavigation } from '../../../components/gesp-workspace-navigation';
import { GespParentWorkbench } from './workbench';
import '../../student/gesp/gesp-student.css';

export default function ParentGespPage(){
  const user=useSessionUser();
  if(!user||!['parent','admin'].includes(user.role))return <main className="learning-studio gesp-page"><GespWorkspaceNavigation mode="manage" pending={user===undefined} unavailable={user!==undefined}/><div className="gesp-shell"><h1>GESP认证范围与计划</h1><p>{user===undefined?'正在确认当前身份…':'认证范围与计划需要当前监护人确认。'}</p><Link className="studio-primary" href="/parent/login?returnTo=%2Fparent%2Fgesp">家长登录</Link></div></main>;
  return <GespParentWorkbench key={user.id+':'+user.role} user={user}/>;
}
