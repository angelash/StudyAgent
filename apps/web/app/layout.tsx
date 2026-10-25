import './globals.css';
import 'katex/dist/katex.min.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SessionConnection } from '../components/session-connection';

export const metadata: Metadata = {
  title: '学习观察室 · 看见孩子怎样学会',
  description: '从学习进度和知识点出发，用评测、指导和间隔复测陪伴孩子学会。',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body><SessionConnection />{children}</body>
    </html>
  );
}
