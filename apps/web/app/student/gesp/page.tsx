'use client';
import { useSessionUser } from '../../../lib/session-user';
import { GespWorkspaceNavigation } from '../../../components/gesp-workspace-navigation';
import { GespLearnerWorkspace } from './workbench';
import Link from 'next/link';
import './gesp-student.css';

export default function StudentGespPage(){
  const user=useSessionUser();
  if(!user||user.role!=='student'||!user.studentId)return <main className="learning-studio gesp-page"><GespWorkspaceNavigation mode="learn" pending={user===undefined} unavailable={user!==undefined}/><div className="gesp-shell"><h1>GESP C++认证课程</h1><p>{user===undefined?'正在确认学习身份…':'请先使用本人独立学习码进入。'}</p><Link className="studio-primary" href="/student/login?returnTo=%2Fstudent%2Fgesp">打开学习入口</Link></div></main>;
  return <GespLearnerWorkspace key={user.id+':'+user.studentId} user={user}/>;
}
