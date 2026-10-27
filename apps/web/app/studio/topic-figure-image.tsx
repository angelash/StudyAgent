'use client';
import * as React from 'react';
import type { StudioWhiteboardFigure } from '@study-agent/contracts';
import { ApiRequestError, apiBaseUrl, getAuthToken } from '../../lib/api';
import { FigureReader } from './classroom/figure-reader';
import './topic-figure-image.css';

export type TopicFigureImageSource = Pick<StudioWhiteboardFigure, 'imageUrl' | 'sha256' | 'width' | 'height' | 'alt' | 'caption'>;
/** Use only our authorized image routes; no model/user supplied external image URL is fetched. */
export async function topicFigureBlob(source: TopicFigureImageSource, signal: AbortSignal) {
  if (!/^\/learning\/studio\/(?:topic-whiteboard-visuals\/topic_whiteboard_visual_[a-f0-9-]{36}\/image|topic-whiteboards\/[^/?#]+\/figures\/[^/?#]+\/(?:image|original)|whiteboard-question-visuals\/whiteboard_question_visual_[a-f0-9-]{36}\/(?:image|original)|(?:topic-whiteboards|whiteboards)\/[^/?#]+\/questions\/[^/?#]+\/teaching-versions\/[a-f0-9-]{36}\/figure\/(?:image|original))$/.test(source.imageUrl) ||
    !/^[a-f0-9]{64}$/.test(source.sha256) || source.width !== 1536 || source.height !== 1024) throw Error('图片身份暂不可用，完整文字稿仍保留。');
  const token = getAuthToken(), response = await fetch(apiBaseUrl + '/api' + source.imageUrl,
    { credentials: 'include', signal, headers: token ? { Authorization: 'Bearer ' + token } : {} });
  if (!response.ok) throw new ApiRequestError([401, 403, 404].includes(response.status) ? '原图片或当前访问权限已变化，请重新打开白板。' : '原图片暂时无法读取，请重试。', response.status);
  if (!response.headers.get('content-type')?.startsWith('image/png')) throw Error('原图片格式不一致，已保留完整文字。');
  const blob = await response.blob(); if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (!blob.size || blob.size > 24 * 1024 * 1024 || !crypto.subtle) throw Error('暂时无法完整核对图片，请在安全连接中重新打开。');
  const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(value => value.toString(16).padStart(2, '0')).join('');
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (actual !== source.sha256) throw Error('图片字节与已保存版本不一致，未展示替代图片。');
  return blob;
}
export async function decodeTopicFigure(source: TopicFigureImageSource, signal: AbortSignal) {
  const blob = await topicFigureBlob(source, signal), url = URL.createObjectURL(blob), image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { signal.removeEventListener('abort', abort); image.onload = null; image.onerror = null; };
      const abort = () => { cleanup(); image.removeAttribute('src'); reject(new DOMException('Cancelled', 'AbortError')); };
      image.onload = () => { cleanup(); resolve(); }; image.onerror = () => { cleanup(); reject(Error('图片无法解码，请重试读取原件。')); };
      signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) return abort(); image.src = url;
    });
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (image.naturalWidth !== source.width || image.naturalHeight !== source.height) throw Error('原图片尺寸与冻结版本不一致。');
    return { image, url, close: () => URL.revokeObjectURL(url) };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}
export function TopicFigureThumbnail({ source }: { source: TopicFigureImageSource }) {
  const [url, setUrl] = React.useState(''), [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    const request = new AbortController(); let release: (() => void) | undefined; setUrl(''); setFailed(false);
    void decodeTopicFigure(source, request.signal).then(result => {
      if (request.signal.aborted) { result.close(); return; } release = result.close; setUrl(result.url);
    }).catch(() => { if (!request.signal.aborted) setFailed(true); });
    return () => { request.abort(); release?.(); };
  }, [source.imageUrl, source.sha256, source.width, source.height]);
  return <span className="tw-figure-thumbnail">{url ? <img src={url} alt={source.alt} width={source.width} height={source.height}/> : <small>{failed ? '缩略图暂不可读' : '读取原图…'}</small>}</span>;
}
export function TopicFigureImage({ source, title, onOpen, onReady, compact = false }: { source: TopicFigureImageSource; title: string; onOpen?: () => void; onReady?: (value: boolean) => void; compact?: boolean }) {
  const [url, setUrl] = React.useState(''), [error, setError] = React.useState(''), [expanded, setExpanded] = React.useState(false), [attempt, setAttempt] = React.useState(0);
  const readyCallback = React.useRef(onReady); readyCallback.current = onReady;
  React.useEffect(() => {
    const controller = new AbortController(); let release: (() => void) | undefined;
    setUrl(''); setError(''); setExpanded(false); readyCallback.current?.(false);
    void decodeTopicFigure(source, controller.signal).then(result => {
      if (controller.signal.aborted) { result.close(); return; } release = result.close; setUrl(result.url); readyCallback.current?.(true);
    }).catch(error => { if (!controller.signal.aborted) setError((error as Error).message); });
    return () => { controller.abort(); release?.(); };
  }, [source.imageUrl, source.sha256, source.width, source.height, attempt]);
  return <figure className="tw-figure" data-image-sha={source.sha256} data-compact={compact}>
    {url ? <button type="button" className="tw-figure-open" aria-label={'放大参考图：' + title} onClick={() => { onOpen?.(); setExpanded(true); }}>
      <img src={url} alt={source.alt} width={source.width} height={source.height}/><span aria-hidden="true">↗</span></button> :
      error ? <div className="tw-figure-error" role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>重新读取图片</button></div> : <p role="status">正在核对原图片…</p>}
    <figcaption>{source.caption || 'AI参考图，标签和关系待核对。'}</figcaption>
    {expanded && url && <FigureReader title={title} onClose={() => setExpanded(false)}><img src={url} alt={source.alt} width={source.width} height={source.height}/><p>{source.caption}</p></FigureReader>}
  </figure>;
}
