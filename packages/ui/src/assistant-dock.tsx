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
        right: 24,
        bottom: 24,
        width: open ? 360 : 180,
        borderRadius: 20,
        border: '1px solid #d1d5db',
        background: '#ffffff',
        boxShadow: '0 24px 48px rgba(15, 23, 42, 0.16)',
        overflow: 'hidden',
        zIndex: 50,
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          border: 'none',
          padding: '16px 18px',
          textAlign: 'left',
          background: 'linear-gradient(135deg, #0f766e, #0f172a)',
          color: '#f8fafc',
          cursor: 'pointer',
        }}
      >
        <div style={{ fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>{subtitle}</div>
      </button>
      {open ? <div style={{ padding: 16, maxHeight: 420, overflowY: 'auto' }}>{children}</div> : null}
    </div>
  );
}
