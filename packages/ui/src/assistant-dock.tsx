import * as React from 'react';

export type AssistantDockProps = {
  title: string;
  subtitle: string;
  open: boolean;
  compact?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

export function AssistantDock(props: AssistantDockProps) {
  const { title, subtitle, open, compact = false, onToggle, children } = props;
  const panelId = React.useId(), collapsed = compact && !open;

  return (
    <div
      style={{
        position: 'fixed',
        right: 'min(24px, 4vw)',
        bottom: 'max(16px, env(safe-area-inset-bottom))',
        width: open ? 'min(380px, 92vw)' : collapsed ? 56 : 180,
        borderRadius: collapsed ? 28 : 12,
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
        aria-controls={open ? panelId : undefined}
        aria-label={`${open ? '收起' : '打开'}${title}`}
        title={`${title}：${subtitle}`}
        style={{
          width: '100%',
          border: 'none',
          padding: collapsed ? 0 : '16px 18px',
          minHeight: collapsed ? 56 : undefined,
          textAlign: collapsed ? 'center' : 'left',
          background: '#2b5244',
          color: '#f8fafc',
          cursor: 'pointer',
        }}
      >
        {collapsed ? <span aria-hidden="true" style={{ fontSize: 25, lineHeight: 1, fontFamily: 'Georgia,serif' }}>?</span> : <><div style={{ fontWeight: 700 }}>{title}</div><div style={{ fontSize: 12, opacity: 0.85 }}>{subtitle}</div></>}
      </button>
      {open ? <div id={panelId} style={{ padding: 16, maxHeight: 'min(540px, 65dvh)', overflowY: 'auto' }}>{children}</div> : null}
    </div>
  );
}
