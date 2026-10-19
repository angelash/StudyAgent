'use client';
import * as React from 'react';
import { AssistantDock } from '@study-agent/ui';
import { apiRequest } from '../lib/api';
import { useSessionUser } from '../lib/session-user';
import './assistant-widget.css';

type AssistantWidgetProps = {
  userRole: 'student' | 'parent'; studentId: string | null;
  subject?: 'math' | 'chinese' | 'english' | null;
  pageContext: 'student_home' | 'assessment' | 'mission' | 'review' | 'weekly_report';
  contextRefType?: 'practice' | 'diagnostic' | 'plan' | null;
  contextRefId?: string | null; contextItemId?: string | null;
  title: string; subtitle: string;
};
type AssistantMessage = { id: string; sender: 'user' | 'assistant'; content: string;
  source?: 'rules' | 'openai'; evidenceIds?: string[]; assistanceRecorded?: boolean };

export function AssistantWidget(props: AssistantWidgetProps) {
  const identity = useSessionUser();
  const [open, setOpen] = React.useState(false), [sessionId, setSessionId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<AssistantMessage[]>([]), [input, setInput] = React.useState('');
  const [error, setError] = React.useState(''), [sending, setSending] = React.useState(false), [loading, setLoading] = React.useState(false);
  const pending = React.useRef<AbortController | null>(null), generation = React.useRef(0), requestKey = React.useRef('');
  const context = JSON.stringify({ userRole: props.userRole, studentId: props.studentId, subject: props.subject ?? null,
    pageContext: props.pageContext, contextRefType: props.contextRefType ?? null, contextRefId: props.contextRefId ?? null, contextItemId: props.contextItemId ?? null });

  React.useEffect(() => {
    const revision = ++generation.current;
    pending.current?.abort(); setSessionId(null); setMessages([]); setInput(''); setError(''); setSending(false); requestKey.current = '';
    if (!open || identity === undefined) { setLoading(false); return; }
    if (!identity) { setLoading(false); setError('请先进入学习或登录家长账号，再使用助教。'); return; }
    const controller = new AbortController(); pending.current = controller; setLoading(true);
    (async () => {
      try {
        const session = await apiRequest<{ id: string }>('/ai/assistant/sessions', { method: 'POST', body: context, signal: controller.signal });
        const history = await apiRequest<AssistantMessage[]>(`/ai/assistant/sessions/${session.id}/messages`, { signal: controller.signal });
        if (generation.current === revision) { setSessionId(session.id); setMessages(history); }
      } catch(e) { if (generation.current === revision && !controller.signal.aborted) setError((e as Error).message); }
      finally { if (generation.current === revision) { pending.current = null; setLoading(false); } }
    })();
    return () => { generation.current++; controller.abort(); };
  }, [context, open, identity]);

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault(); if (!sessionId || !input.trim() || sending) return;
    const revision = generation.current, controller = new AbortController(); pending.current = controller;
    setError(''); setSending(true); requestKey.current ||= crypto.randomUUID();
    try {
      const response = await apiRequest<{ messages: AssistantMessage[] }>(`/ai/assistant/sessions/${sessionId}/messages`, {
        method: 'POST', signal: controller.signal, body: JSON.stringify({ message: input.trim(), requestKey: requestKey.current }),
      });
      if (generation.current === revision) { setMessages(response.messages); setInput(''); requestKey.current = ''; }
    } catch(e) { if (generation.current === revision) setError(controller.signal.aborted ? '已取消。你可以修改问题，或重新发送以核对已保存的回复。' : (e as Error).message); }
    finally { if (generation.current === revision) { pending.current = null; setSending(false); } }
  }

  return <AssistantDock title={props.title} subtitle={props.subtitle} open={open} onToggle={() => setOpen(v => !v)}>
    <div className="learning-assistant"><p className="assistant-intro">{props.contextItemId ? '围绕当前这道题，一起看清下一步。获得提示后的表现会单独记录。' : props.userRole === 'student' ? '告诉我卡住的一步，我们一起理清思路。' : '根据已有学习证据，一起商量怎样陪伴。'}</p>
      {loading && <p role="status">正在取回这段对话…</p>}
      <div className="assistant-history" role="log" aria-live="polite" aria-label="当前学习对话">{messages.map(m => <article className={`assistant-message from-${m.sender}`} key={m.id}><strong>{m.sender === 'assistant' ? '学习助教' : '我'}</strong><p>{m.content}</p>{m.sender === 'assistant' && <small>{m.source === 'openai' ? 'AI建议，请结合具体表现核对' : m.source === 'rules' ? '根据学习记录给出的引导' : '已保存的对话'}{m.evidenceIds?.length ? ` · 引用 ${m.evidenceIds.length} 条学习证据` : ''}{m.assistanceRecorded && <span>本题已记录使用助教提示。</span>}</small>}</article>)}</div>
      {!loading && !messages.length && !error && <p className="assistant-empty">{props.userRole === 'student' ? '可以先问：“这道题的已知条件怎样整理？”' : '可以先问：“哪些表现还需要用新题验证？”'}</p>}
      {sending && <p role="status">正在整理思路…</p>}{error && <p className="assistant-error" role="alert">{error}</p>}
      <form onSubmit={sendMessage}><label>想一起看看什么<textarea value={input} onChange={e => { setInput(e.target.value); requestKey.current = ''; }} rows={3} placeholder="写下卡住的一步，或想核对的学习表现" maxLength={3000} disabled={sending || loading || !sessionId} /></label><div className="assistant-controls"><small>刷新后可恢复最近50条对话。</small><button disabled={sending || loading || !sessionId || !input.trim()}>{sending ? '整理中…' : '一起想一想 →'}</button></div></form>
      {sending && <button className="assistant-cancel" onClick={() => pending.current?.abort()}>取消本次生成</button>}
    </div>
  </AssistantDock>;
}
