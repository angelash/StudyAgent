import { Suspense,type ReactNode } from 'react';
import { AdminWorkspaceShell } from './workspace-shell';
export const metadata={title:'教研与管理 · StudyAgent'};
export default function AdminLayout({children}:{children:ReactNode}) {return <Suspense fallback={<main className="workspace-entry" role="status">正在恢复管理工作台…</main>}><AdminWorkspaceShell>{children}</AdminWorkspaceShell></Suspense>;}
