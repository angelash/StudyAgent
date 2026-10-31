'use client';
import * as React from 'react';
import { WorkspaceShellContext, type WorkspaceExitGuard } from './workspace-shell-context';
import { sameWorkspaceActivity } from './workspace-exit-guard';

export function useWorkspaceExitGuard(ownerId: string, enabled: boolean, guard: WorkspaceExitGuard) {
  const host=React.useContext(WorkspaceShellContext),token=React.useRef(Symbol('workspace-exit')),latest=React.useRef(guard);latest.current=guard;
  React.useLayoutEffect(()=>{
    if(!host||!enabled)return;
    const key=token.current;
    host.registerExitGuard(key,ownerId,{request:(href,proceed,kind)=>latest.current.request(href,proceed,kind),isInternal:(next,current)=>(latest.current.isInternal??sameWorkspaceActivity)(next,current)});
    return()=>host.unregisterExitGuard(key);
  },[host,ownerId,enabled]);
  return Boolean(host);
}
