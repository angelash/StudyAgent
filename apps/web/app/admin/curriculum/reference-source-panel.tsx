'use client';
import * as React from 'react';
import { apiBaseUrl, apiRequest } from '../../../lib/api';

export type TextbookReferenceSource = { id: string; title: string; edition: string; pages: number; sha256: string; available: boolean; notice: string };
export function ReferenceSourcePanel({ bookId, bookTitle, sources, actorId, onDenied }: {
  bookId: string; bookTitle: string; sources: TextbookReferenceSource[]; actorId: string; onDenied: (denied: boolean) => void;
}) {
  const [choice, setChoice] = React.useState(''), [opened, setOpened] = React.useState(''), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false);
  const life = React.useRef({ generation: 0, alive: true });
  React.useEffect(() => {
    life.current.alive = true;
    const check = async () => {
      try { const actor = await apiRequest<{ id: string; role: string }>('/auth/me');
        if (life.current.alive && (actor.id !== actorId || !['admin', 'teacher'].includes(actor.role))) { setOpened(''); onDenied(true); }
      } catch { if (life.current.alive) { setOpened(''); onDenied(true); } }
    };
    const focus = () => { if (document.visibilityState === 'visible') void check(); };
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus);
    return () => { life.current.alive = false; life.current.generation++; window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [actorId, onDenied]);
  async function open() {
    const generation = ++life.current.generation; setBusy(true); setError(''); setOpened('');
    try { const actor = await apiRequest<{ id: string; role: string }>('/auth/me');
      if (!life.current.alive || generation !== life.current.generation) return;
      if (actor.id !== actorId || !['admin', 'teacher'].includes(actor.role)) { onDenied(true); return; }
      if (sources.some(source => source.id === choice && source.available)) setOpened(choice);
    } catch { if (life.current.alive && generation === life.current.generation) setError('当前参考原件暂时无法打开，请重新核对登录和原件。'); }
    finally { if (life.current.alive && generation === life.current.generation) setBusy(false); }
  }
  const selected = sources.find(source => source.id === choice), current = sources.find(source => source.id === opened),
    url = current ? `${apiBaseUrl}/api/admin/curriculum/textbooks/${encodeURIComponent(bookId)}/reference-sources/${encodeURIComponent(current.id)}/document` : '';
  if (!sources.length) return null;
  return <section className="admin-textbook-source" aria-label="参考版本原件">
    <div><div><strong>参考版本原件</strong><p>先选择要核对的原件。当前教材的整册版本依据仍须单独确认，查看不会采用教学稿或更改学习范围。</p></div></div>
    <label>选择参考原件<select aria-label="选择参考原件" value={choice} onChange={event => { life.current.generation++; setChoice(event.target.value); setOpened(''); setBusy(false); setError(''); }}>
      <option value="">请选择参考版本</option>{sources.map(source => <option key={source.id} value={source.id}>{source.edition} · {source.title} · {source.pages}页{source.available ? '' : ' · 未安装'}</option>)}</select></label>
    {selected && <p role="status">{selected.notice}</p>}
    <button type="button" className="studio-secondary" disabled={busy || !selected?.available} onClick={() => void open()}>{busy ? '正在核对身份…' : '查看所选参考原件'}</button>
    {error && <p className="studio-error" role="alert">{error}</p>}
    {current && <><p>参考原件 · {current.pages}个物理页 · 版次以原件核对记录为准。<a href={url} target="_blank" rel="noreferrer">在新窗口打开参考原件 ↗</a></p>
      <iframe key={current.id} title={`${bookTitle}参考版本原件`} src={url} /></>}
  </section>;
}
