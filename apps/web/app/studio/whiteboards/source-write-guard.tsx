'use client';
import * as React from 'react';
import type { AssistantWhiteboardPreflight, AssistantWhiteboardSourceView, TopicWhiteboardDraftView } from '@study-agent/contracts';
import { apiRequest, ApiRequestError } from '../../../lib/api';
import { internalAssistantHref } from '../../../lib/assistant-course-navigation';
type Block = { code: string; message: string; href?: string };
const Context = React.createContext({ blocked: false, checking: false, capture: (_error: unknown) => {} });
export const useSourceWriteGuard = () => React.useContext(Context);
export function SourceWriteBoundary({ row, children }: { row: TopicWhiteboardDraftView; children: React.ReactNode }) {
  const enabled = row.audience.kind === 'assistant';
  const [block, setBlock] = React.useState<Block | null>(null), [checking, setChecking] = React.useState(enabled), [notice, setNotice] = React.useState('');
  const request = React.useRef<AbortController | null>(null), epoch = React.useRef(0);
  const capture = React.useCallback((error: unknown) => {
    if (!enabled || !(error instanceof ApiRequestError) || error.details?.code !== 'assessment_in_progress') return;
    const href = typeof error.details.href === 'string' ? internalAssistantHref(error.details.href) : null;
    setBlock({ code: 'assessment_in_progress', message: error.message, ...(href ? { href } : {}) });
  }, [enabled]);
  async function verify(initial = false) {
    if (!enabled) return; request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const version = ++epoch.current; setChecking(true); setNotice('');
    try {
      const source = await apiRequest<AssistantWhiteboardSourceView>('/learning/studio/topic-whiteboards/drafts/' + encodeURIComponent(row.id) + '/source', { signal: controller.signal });
      const preview = await apiRequest<AssistantWhiteboardPreflight>('/ai/assistant/sessions/' + encodeURIComponent(source.origin.sessionId) + '/artifacts/whiteboards/preflight', {
        method: 'POST', signal: controller.signal, body: JSON.stringify({ selection: source.selection, objective: row.objective, modelId: row.modelId, acknowledgeHistoricalSource: source.acknowledgeHistoricalSource }) });
      if (controller.signal.aborted || version !== epoch.current) return;
      const href = internalAssistantHref(source.origin.location.href);
      if (preview.sourceFingerprint !== source.sourceFingerprint) setBlock({ code: 'source_changed', message: '原对话内容已变化。请保留本机改稿，回到原对话重新选择；已有原稿仍可阅读。', ...(href ? { href } : {}) });
      else if (preview.blocked && preview.blocked.code !== 'model_unavailable') setBlock({ code: preview.blocked.code, message: preview.blocked.message, ...(href ? { href } : {}) });
      else { setBlock(null); if (!initial) setNotice('已重新核对当前权限。原稿和原请求保持，请明确选择下一次操作。'); }
    } catch (error) {
      if (controller.signal.aborted || version !== epoch.current) return;
      if (error instanceof ApiRequestError && error.details?.code === 'assessment_in_progress') capture(error);
      else setBlock({ code: 'source_unavailable', message: (error as Error).message + '。本机全文与原请求继续保留。' });
    } finally { if (!controller.signal.aborted && version === epoch.current) setChecking(false); }
  }
  React.useEffect(() => { void verify(true); return () => { epoch.current++; request.current?.abort(); }; }, [row.id, enabled]);
  return <Context.Provider value={{ blocked: !!block, checking, capture }}>
    {enabled && <aside className="tw-source-write-guard" aria-label={block?.code === 'assessment_in_progress' ? '当前评测保护' : '当前白板写入权限'}>
      {block && <p role="status">{block.message}</p>}{block?.href && <a href={block.href}>{block.code === 'assessment_in_progress' ? '进入原评测' : '返回原学习位置'}</a>}
      <button type="button" disabled={checking} onClick={() => void verify()}>{checking ? '正在核对当前权限…' : '重新核对白板权限'}</button>{notice && <p role="status">{notice}</p>}
    </aside>}
    {children}
  </Context.Provider>;
}
