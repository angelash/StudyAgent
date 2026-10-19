import * as React from 'react';

export type AssistantDockProps = {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

export function AssistantDock(props: AssistantDockProps) {
  const { title, subtitle, open, onToggle, children } = props;

  return (
    <div
      style={{
        position: 'fixed',
        right: 'min(24px, 4vw)',
        bottom: 'max(16px, env(safe-area-inset-bottom))',
        width: open ? 'min(380px, 92vw)' : 180,
        borderRadius: 12,
        border: '1px solid #cdd5c6',
        background: '#fffef8',
        boxShadow: '0 24px 48px rgba(15, 23, 42, 0.16)',
        overflow: 'hidden',
        zIndex: 50,
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${open ? '收起' : '打开'}${title}`}
        style={{
          width: '100%',
          border: 'none',
          padding: '16px 18px',
          textAlign: 'left',
          background: '#2b5244',
          color: '#f8fafc',
          cursor: 'pointer',
        }}
      >
        <div style={{ fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>{subtitle}</div>
      </button>
      {open ? <div style={{ padding: 16, maxHeight: 'min(540px, 65dvh)', overflowY: 'auto' }}>{children}</div> : null}
    </div>
  );
}
