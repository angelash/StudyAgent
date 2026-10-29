import './globals.css';
import 'katex/dist/katex.min.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SessionConnection } from '../components/session-connection';
import { WorkspaceShell } from '../components/workspace-shell';

export const metadata: Metadata = {
  title: 'StudyAgent · 学习工作台',
  description: '从学习进度和知识点出发，用评测、指导和间隔复测陪伴孩子学会。',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN"><head><link rel="stylesheet" href="/reference/hyperknow/font/Satoshi_Complete/Fonts/WEB/css/satoshi.css" /><link rel="stylesheet" href="/reference/hyperknow/fonts/misans/misans.css" /></head>
      <body><SessionConnection /><WorkspaceShell>{children}</WorkspaceShell></body>
    </html>
  );
}
