'use client';

import * as React from 'react';
import { AssistantDock } from '@study-agent/ui';
import { apiRequest, getAuthToken } from '../lib/api';

type AssistantWidgetProps = {
  userRole: 'student' | 'parent';
  studentId: string | null;
  subject?: 'math' | 'chinese' | 'english' | null;
  pageContext: 'student_home' | 'assessment' | 'mission' | 'review' | 'weekly_report';
  title: string;
  subtitle: string;
};

type AssistantMessage = {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
};

export function AssistantWidget(props: AssistantWidgetProps) {
  const [open, setOpen] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<AssistantMessage[]>([]);
  const [input, setInput] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);

  async function ensureSession() {
    if (sessionId) {
      return sessionId;
    }

    const created = await apiRequest<{ id: string }>(
      '/ai/assistant/sessions',
      {
        method: 'POST',
        body: JSON.stringify({
          userRole: props.userRole,
          studentId: props.studentId,
          subject: props.subject ?? null,
          pageContext: props.pageContext,
        }),
      },
      getAuthToken(),
    );
    setSessionId(created.id);
    return created.id;
  }

  async function sendMessage() {
    if (!input.trim()) {
      return;
    }

    try {
      setError(null);
      setOpen(true);
      setSending(true);
      const ensuredSessionId = await ensureSession();
      const response = await apiRequest<{ reply: string; messages: AssistantMessage[] }>(
        `/ai/assistant/sessions/${ensuredSessionId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            message: input.trim(),
          }),
        },
        getAuthToken(),
      );

      setMessages(response.messages);
      setInput('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '助教暂时不可用');
      setOpen(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <AssistantDock
      title={props.title}
      subtitle={props.subtitle}
      open={open}
      onToggle={() => setOpen((value) => !value)}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 12, color: '#475569' }}>
          {props.userRole === 'student' ? '可以问我：这道题第一步怎么想？' : '可以问我：现在我该怎么陪孩子做？'}
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {messages.map((message) => (
            <div
              key={message.id}
              style={{
                padding: 10,
                borderRadius: 12,
                background: message.sender === 'assistant' ? '#ecfeff' : '#f8fafc',
                border: '1px solid #cbd5e1',
              }}
            >
              <strong style={{ display: 'block', marginBottom: 4 }}>
                {message.sender === 'assistant' ? '助教' : '我'}
              </strong>
              <span style={{ lineHeight: 1.6 }}>{message.content}</span>
            </div>
          ))}
        </div>
        {sending ? (
          <div
            style={{
              padding: 10,
              borderRadius: 12,
              background: '#f8fafc',
              border: '1px dashed #94a3b8',
              color: '#334155',
              fontSize: 13,
            }}
          >
            助教正在整理回复，请稍等一下。
          </div>
        ) : null}
        {error ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div> : null}
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={4}
          placeholder="输入你的问题..."
          disabled={sending}
          style={{ borderRadius: 12, border: '1px solid #cbd5e1', padding: 10 }}
        />
        <button
          onClick={sendMessage}
          disabled={sending || !input.trim()}
          style={{
            border: 'none',
            borderRadius: 12,
            padding: '10px 14px',
            background: sending || !input.trim() ? '#94a3b8' : '#0f766e',
            color: '#f8fafc',
            cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {sending ? '发送中...' : '发送'}
        </button>
      </div>
    </AssistantDock>
  );
}
