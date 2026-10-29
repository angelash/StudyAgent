'use client';
import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useSessionUser } from '../lib/session-user';
import { WorkspaceShellContext, type WorkspaceExitGuard } from '../lib/workspace-shell-context';
import { installWorkspaceExitGuard } from '../lib/workspace-exit-guard';
import type { WorkspaceNavigation } from '../lib/workspace-navigation';
import { WorkspaceSidebar } from '../app/studio/studio-navigation';
import './workspace-shell.css';

/** One persistent navigation host; pages register their original context and callbacks. */
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const user = useSessionUser(), pathname = usePathname();
  const [pages, setPages] = React.useState(new Map<symbol,{ ownerId: string; navigation: WorkspaceNavigation }>());
  const guards=React.useRef(new Map<symbol,{ownerId:string;guard:WorkspaceExitGuard}>()),owner=React.useRef(user?.id);owner.current=user?.id;
  const register = React.useCallback((token: symbol, ownerId: string, navigation: WorkspaceNavigation) => setPages(previous => new Map(previous).set(token,{ownerId,navigation})), []);
  const unregister = React.useCallback((token: symbol) => setPages(previous => { const next=new Map(previous);next.delete(token);return next; }), []);
  const registerExitGuard=React.useCallback((token:symbol,ownerId:string,guard:WorkspaceExitGuard)=>{guards.current.set(token,{ownerId,guard});},[]);
  const unregisterExitGuard=React.useCallback((token:symbol)=>{guards.current.delete(token);},[]);
  const value = React.useMemo(() => ({ register, unregister,registerExitGuard,unregisterExitGuard }), [register, unregister,registerExitGuard,unregisterExitGuard]);
  React.useLayoutEffect(()=>installWorkspaceExitGuard(()=>{
    if(!owner.current)return null;
    const entry=[...guards.current.entries()].filter(([,value])=>value.ownerId===owner.current).at(-1);
    return entry?{token:entry[0],...entry[1].guard}:null;
  }),[]);
  const protectedPage = pathname !== '/' && !pathname.endsWith('/login');
  const candidates=[...pages.values()].filter(page=>page.ownerId===user?.id);
  const page=candidates.filter(page=>page.navigation.layout==='focus').at(-1)??candidates.at(-1);
  return <WorkspaceShellContext.Provider value={value}>{children}
    {protectedPage && user && page?.ownerId === user.id && <WorkspaceSidebar {...page.navigation} />}
  </WorkspaceShellContext.Provider>;
}
