'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { adminWorkspaceEntries,allowedAdminWorkspace } from '../../lib/admin-navigation';
import { useSessionStatus,refreshSessionUser,type SessionUser } from '../../lib/session-user';
import { readLearningContext,type LearningContext } from '../../lib/learning-context';
import { StudioNavigation } from '../studio/studio-navigation';
import { apiRequest,ApiRequestError } from '../../lib/api';
import './workspace-shell.css';

export function AdminWorkspaceShell({children}:{children:React.ReactNode}) {
  const session=useSessionStatus(),pathname=usePathname(),params=useSearchParams();
  const user=session.user,scope=user?user.id+':'+user.role+':'+pathname:'', [verified,setVerified]=React.useState(''),[checkError,setCheckError]=React.useState(false),[attempt,setAttempt]=React.useState(0);
  React.useEffect(()=>{
    if(!user){setVerified('');setCheckError(false);return;}
    const request=new AbortController();let running=false;
    const verify=async()=>{
      if(running)return;running=true;
      try{
        const current=await apiRequest<SessionUser>('/auth/me',{signal:request.signal});if(request.signal.aborted)return;
        if(current.id!==user.id||current.role!==user.role){setVerified('');await refreshSessionUser();return;}
        setVerified(scope);setCheckError(false);
      }catch(error){
        if(request.signal.aborted)return;
        if(error instanceof ApiRequestError&&[401,403].includes(error.status)){setVerified('');await refreshSessionUser();}
        else setCheckError(true);
      }finally{running=false;}
    };
    void verify();const focus=()=>void verify(),timer=setInterval(focus,15000);window.addEventListener('focus',focus);
    return()=>{request.abort();clearInterval(timer);window.removeEventListener('focus',focus);};
  },[user?.id,user?.role,pathname,attempt]);
  const login='/parent/login?'+new URLSearchParams({returnTo:pathname+(params.size?'?'+params:'')});
  if(!session.user)return <main className="workspace-entry"><h1>教研与管理</h1><p role="status">{session.status==='anonymous'?'登录后按当前身份查看可用管理功能。':session.status==='unavailable'?'暂时无法核对当前身份，原资料保持。':'正在核对当前教研身份…'}</p>{session.status==='anonymous'?<Link className="workspace-button" href={login}>登录工作台</Link>:session.status==='unavailable'?<button className="workspace-button" onClick={()=>void refreshSessionUser()}>重新确认登录</button>:null}</main>;
  if(verified!==scope)return <main className="workspace-entry"><h1>教研与管理</h1><p role="status">{checkError?'暂时无法核对管理身份，请重试。':'正在核对当前模块的管理身份…'}</p>{checkError&&<button className="workspace-button" onClick={()=>setAttempt(value=>value+1)}>重新核对身份</button>}</main>;
  return <><AuthorizedAdminWorkspace key={session.user.id+':'+session.user.role} user={session.user} pathname={pathname}>{children}</AuthorizedAdminWorkspace>{checkError&&<aside className="session-connection" role="status"><p>管理身份暂未重新核对。当前表单保持，可重试连接。</p><button onClick={()=>setAttempt(value=>value+1)}>重新核对身份</button></aside>}</>;
}
function AuthorizedAdminWorkspace({user,pathname,children}:{user:SessionUser;pathname:string;children:React.ReactNode}) {
  const [context,setContext]=React.useState<LearningContext>();
  React.useEffect(()=>setContext(readLearningContext(user.id,'')),[user.id]);
  const entries=adminWorkspaceEntries.filter(entry=>(entry.roles as readonly string[]).includes(user.role)),allowed=allowedAdminWorkspace(user.role,pathname);
  const selected=adminWorkspaceEntries.find(entry=>entry.path===pathname);
  return <div className="workspace-admin learning-studio" data-admin-module={selected?.id}>
    <StudioNavigation active="admin" context={context} contextState={context?'ready':'pending'}/>
    <header className="workspace-admin-header"><p>工作台 / 教研与管理</p>{entries.length>0&&<nav aria-label="管理功能">{entries.map(entry=><Link key={entry.id} href={entry.path} aria-current={entry.path===pathname?'page':undefined}>{entry.label}</Link>)}</nav>}</header>
    <div className="workspace-admin-body">{allowed?children:<main className="workspace-admin-denied"><h1>当前身份无法访问此管理功能</h1><p>请从上方选择已有权限的功能。作答复核仍需相应学习档案的有效授权。</p><Link className="workspace-button" href="/studio">返回学习工作台</Link></main>}</div>
  </div>;
}
