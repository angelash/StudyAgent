'use client';
import { createContext } from 'react';
import type { WorkspaceNavigation } from './workspace-navigation';

export type WorkspaceRegistration = {
  register: (token: symbol, ownerId: string, navigation: WorkspaceNavigation) => void;
  unregister: (token: symbol) => void;
  registerExitGuard: (token: symbol, ownerId: string, guard: WorkspaceExitGuard) => void;
  unregisterExitGuard: (token: symbol) => void;
};
export type WorkspaceExitGuard = { request: (href: string, proceed: () => void) => void; isInternal?: (destination: string, current: string) => boolean };
export const WorkspaceShellContext = createContext<WorkspaceRegistration | null>(null);
