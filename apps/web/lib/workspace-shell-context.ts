'use client';
import { createContext } from 'react';
import type { WorkspaceNavigation } from './workspace-navigation';

export type WorkspaceRegistration = {
  register: (token: symbol, ownerId: string, navigation: WorkspaceNavigation) => void;
  unregister: (token: symbol) => void;
};
export const WorkspaceShellContext = createContext<WorkspaceRegistration | null>(null);
