'use client';
import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useSessionUser } from '../lib/session-user';
import { WorkspaceShellContext, type WorkspaceExitGuard } from '../lib/workspace-shell-context';
import { installWorkspaceExitGuard,sameWorkspaceActivity } from '../lib/workspace-exit-guard';
import type { WorkspaceNavigation } from '../lib/workspace-navigation';
import { WorkspaceSidebar } from '../app/studio/studio-navigation';
import './workspace-shell.css';

/** One persistent navigation host; pages register their original context and callbacks. */
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const user = useSessionUser(), pathname = usePathname();
  const [pages, setPages] = React.useState(new Map<symbol,{ ownerId: string; navigation: WorkspaceNavigation }>());
  const guardGeneration=React.useRef(0);
  const guardInstallation=React.useRef<ReturnType<typeof installWorkspaceExitGuard>|null>(null);
  const guards=React.useRef(new Map<symbol,{ownerId:string;guard:WorkspaceExitGuard}>()),owner=React.useRef(user?.id);owner.current=user?.id;
  const register = React.useCallback((token: symbol, ownerId: string, navigation: WorkspaceNavigation) => setPages(previous => new Map(previous).set(token,{ownerId,navigation})), []);
  const unregister = React.useCallback((token: symbol) => setPages(previous => { const next=new Map(previous);next.delete(token);return next; }), []);
  const registerExitGuard=React.useCallback((token:symbol,ownerId:string,guard:WorkspaceExitGuard)=>{guards.current.set(token,{ownerId,guard});},[]);
  const unregisterExitGuard=React.useCallback((token:symbol)=>{guards.current.delete(token);},[]);
  const value = React.useMemo(() => ({ register, unregister,registerExitGuard,unregisterExitGuard }), [register, unregister,registerExitGuard,unregisterExitGuard]);
  // Traversal protection precedes the router listener; history wrapping waits
  // for the root passive effect so blocked writes cannot update its URL store.
  React.useLayoutEffect(()=>{const installed=installWorkspaceExitGuard(()=>{
    if(!owner.current)return null;
    const entries=[...guards.current.entries()].filter(([,value])=>value.ownerId===owner.current).reverse(),top=entries[0];if(!top)return null;
    return{token:top[0],isInternal:(destination,current)=>entries.every(([,entry])=>(entry.guard.isInternal??sameWorkspaceActivity)(destination,current)),request:(destination,proceed,kind)=>{
      const actor=owner.current,generation=++guardGeneration.current,current=window.location.href;let index=0;
      function next(){if(actor!==owner.current||generation!==guardGeneration.current||!guards.current.has(top[0]))return;const original=entries[index++];if(!original){proceed();return;}const present=guards.current.get(original[0]);if(!present||present.ownerId!==actor)return;const guard=present.guard;if((guard.isInternal??sameWorkspaceActivity)(destination,current)){next();return;}let used=false;guard.request(destination,()=>{if(used)return;used=true;next();},kind);}next();
    }};
  },{deferHistoryPatch:true});guardInstallation.current=installed;return()=>{if(guardInstallation.current===installed)guardInstallation.current=null;installed();};},[]);
  React.useEffect(()=>{const timer=window.setTimeout(()=>guardInstallation.current?.patchHistory(),0);return()=>window.clearTimeout(timer);},[]);
  const protectedPage = pathname !== '/' && !pathname.endsWith('/login');
  const candidates=[...pages.values()].filter(page=>page.ownerId===user?.id);
  const page=candidates.filter(page=>page.navigation.layout==='focus').at(-1)??candidates.at(-1);
  return <WorkspaceShellContext.Provider value={value}>{children}
    {protectedPage && user && page?.ownerId === user.id && <WorkspaceSidebar {...page.navigation} />}
  </WorkspaceShellContext.Provider>;
}
