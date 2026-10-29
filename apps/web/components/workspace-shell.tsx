'use client';
import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useSessionUser } from '../lib/session-user';
import { WorkspaceShellContext } from '../lib/workspace-shell-context';
import type { WorkspaceNavigation } from '../lib/workspace-navigation';
import { WorkspaceSidebar } from '../app/studio/studio-navigation';
import './workspace-shell.css';

/** One persistent navigation host; pages register their original context and callbacks. */
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const user = useSessionUser(), pathname = usePathname();
  const [page, setPage] = React.useState<{ token: symbol; ownerId: string; navigation: WorkspaceNavigation } | null>(null);
  const register = React.useCallback((token: symbol, ownerId: string, navigation: WorkspaceNavigation) => setPage({ token, ownerId, navigation }), []);
  const unregister = React.useCallback((token: symbol) => setPage(value => value?.token === token ? null : value), []);
  const value = React.useMemo(() => ({ register, unregister }), [register, unregister]);
  const protectedPage = pathname !== '/' && !pathname.endsWith('/login');
  return <WorkspaceShellContext.Provider value={value}>{children}
    {protectedPage && user && page?.ownerId === user.id && <WorkspaceSidebar {...page.navigation} />}
  </WorkspaceShellContext.Provider>;
}
