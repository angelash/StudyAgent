'use client';
import * as React from 'react';
import type { ClassroomSessionView, ClassroomVisualView, ClassroomVisualCapabilities, ClassroomVisualPurpose } from '@study-agent/contracts';
import { apiRequest, apiBaseUrl, getAuthToken } from '../../../lib/api';
import { WorkspaceDialog } from '../workspace-dialog';
import './visuals.css';
const purposeNames = { scene: '情境插画', concept: '概念说明', comparison: '场景对比' };
const statusNames = { queued: '等待生成', generating: '正在生成参考图', cancelling: '正在停止生成', ready: '待核对的参考图', failed: '生成未完成', cancelled: '生成已取消', deleted: '已删除' };
export async function visualBlob(row: ClassroomVisualView) { if (!row.imageUrl || !row.sha256)
    throw new Error('图片尚未就绪'); const token = getAuthToken(), response = await fetch(apiBaseUrl + '/api' + row.imageUrl, { credentials: 'include', headers: token ? { Authorization: 'Bearer ' + token } : {} }); if (!response.ok)
    throw new Error('图片暂时无法读取，请刷新或重新登录后重试'); return response.blob(); }
export function useClassroomVisuals(sessionId: string) {
    const [rows, setRows] = React.useState<ClassroomVisualView[]>([]), [capabilities, setCapabilities] = React.useState<ClassroomVisualCapabilities | null>(null), [error, setError] = React.useState('');
    const mounted = React.useRef(true), epoch = React.useRef(0);
    const refresh = React.useCallback(async () => { const version = ++epoch.current; const result = await apiRequest<{
        visuals: ClassroomVisualView[];
        capabilities: ClassroomVisualCapabilities;
    }>('/learning/classroom/sessions/' + sessionId + '/visuals'); if (mounted.current && version === epoch.current) {
        setRows(result.visuals);
        setCapabilities(result.capabilities);
        setError('');
    } }, [sessionId]);
    React.useEffect(() => { mounted.current = true; setRows([]); setCapabilities(null); setError(''); let pending = false, active = true; const poll = async () => { if (pending)
        return; pending = true; try {
        await refresh();
    }
    catch (error) {
        if (active && mounted.current)
            setError((error as Error).message);
    }
    finally {
        pending = false;
    } }; void poll(); const timer = setInterval(() => void poll(), 2500); return () => { active = false; mounted.current = false; epoch.current++; clearInterval(timer); }; }, [refresh]);
    return { rows, capabilities, error, refresh };
}
export function VisualImage({ row, compact = false }: {
    row: ClassroomVisualView;
    compact?: boolean;
}) {
    const [url, setUrl] = React.useState(''), [error, setError] = React.useState(''), [expanded, setExpanded] = React.useState(false), [attempt, setAttempt] = React.useState(0);
    React.useEffect(() => { let active = true, owned = ''; setUrl(''); setError(''); void visualBlob(row).then(blob => { if (active) {
        owned = URL.createObjectURL(blob);
        setUrl(owned);
    } }).catch(error => { if (active)
        setError(error.message); }); return () => { active = false; if (owned)
        URL.revokeObjectURL(owned); }; }, [row.id, row.sha256, attempt]);
    return <figure className="cl-generated-figure" data-visual-id={row.id} data-compact={compact}>{url ? <button type="button" className="cl-generated-open" aria-label={'放大参考图：' + row.stepTitle} onClick={() => setExpanded(true)}><img src={url} alt={row.stepTitle + ' · ' + purposeNames[row.purpose]}/><span>↗</span></button> : error ? <div className="cl-visual-error" role="alert">{error}<button type="button" onClick={() => setAttempt(value => value + 1)}>重新读取图片</button></div> : <div className="cl-visual-loading" role="status">正在读取图片…</div>}<figcaption>{row.selected ? '已选作课堂参考 · ' : 'AI生成参考图 · '}{row.stepTitle} · 标注仍需核对</figcaption>
    {expanded && url && <WorkspaceDialog onClose={() => setExpanded(false)}><div className="cl-visual-backdrop" onClick={() => setExpanded(false)}><section className="cl-visual-lightbox" role="dialog" aria-modal="true" aria-label="讲解参考图大图" onClick={event => event.stopPropagation()}><header><div><small>CLASSROOM REFERENCE</small><h2>{row.stepTitle}</h2></div><button aria-label="关闭参考图大图" onClick={() => setExpanded(false)}>×</button></header><img src={url} alt={row.stepTitle + ' · ' + purposeNames[row.purpose]}/><p>AI生成 · {row.modelId} · 标注仍需核对</p></section></div></WorkspaceDialog>}
  </figure>;
}
export function VisualPanel({ session, visuals, onClose }: {
    session: ClassroomSessionView;
    visuals: ReturnType<typeof useClassroomVisuals>;
    onClose: () => void;
}) {
    const step = session.lesson.steps[session.cursor], rows = visuals.rows.filter(row => row.stepId === step.id), [purpose, setPurpose] = React.useState<ClassroomVisualPurpose>('scene'), [requirements, setRequirements] = React.useState(''), [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
    const keys = React.useRef(new Map<string, {
        body: unknown;
        key: string;
    }>()), creation = React.useRef({ signature: '', key: '' });
    async function create(event: React.FormEvent) { event.preventDefault(); const payload = { stepId: step.id, contentFingerprint: session.contentFingerprint, purpose, requirements }, signature = JSON.stringify(payload); if (creation.current.signature !== signature)
        creation.current = { signature, key: crypto.randomUUID() }; setBusy(true); setError(''); try {
        await apiRequest('/learning/classroom/sessions/' + session.id + '/visuals', { method: 'POST', body: JSON.stringify({ ...payload, requestKey: creation.current.key }) });
        await visuals.refresh();
        creation.current = { signature: '', key: '' };
    }
    catch (error) {
        setError((error as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function action(row: ClassroomVisualView, action: string) { const id = row.id + ':' + action; let command = keys.current.get(id); if (!command) {
        command = { body: { expectedRevision: row.revision, expectedTaskVersion: row.task?.version, ...(action === 'cancel' ? { expectedGeneration: row.task?.generation } : {}), requestKey: crypto.randomUUID() }, key: id };
        keys.current.set(id, command);
    } setBusy(true); setError(''); try {
        await apiRequest('/learning/classroom/sessions/' + session.id + '/visuals/' + row.id + '/' + action, { method: 'POST', body: JSON.stringify(command.body) });
        keys.current.delete(id);
        await visuals.refresh();
    }
    catch (error) {
        setError((error as Error).message);
    }
    finally {
        setBusy(false);
    } }
    const generating = rows.some(row => ['queued', 'generating', 'cancelling'].includes(row.status));
    return <WorkspaceDialog onClose={onClose} busy={busy}><div className="cl-visual-backdrop" onClick={() => { if (!busy)
        onClose(); }}><section className="cl-visual-panel" role="dialog" aria-modal="true" aria-label="当前讲解参考图" onClick={event => event.stopPropagation()}><header><div><small>MAKE IT VISIBLE</small><h2>为这个环节补一张图。</h2><p>{step.title}</p></div><button aria-label="关闭讲解参考图" disabled={busy} onClick={onClose}>×</button></header>
    <div className="cl-visual-context"><small>围绕当前讲解</small><p>{step.narration}</p></div>
    {(error || visuals.error) && <div className="cl-visual-error" role="alert"><p>{error || visuals.error}</p><button disabled={busy} onClick={() => void visuals.refresh().then(() => { keys.current.clear(); setError(''); }).catch(error => setError(error.message))}>读取已保存状态</button></div>}
    {visuals.capabilities && !visuals.capabilities.available && <p className="cl-visual-unavailable">{visuals.capabilities.message}</p>}
    <form onSubmit={event => void create(event)}><label>图片用途<select aria-label="讲解图片用途" disabled={busy || generating} value={purpose} onChange={event => setPurpose(event.target.value as ClassroomVisualPurpose)}>{Object.entries(purposeNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>补充要求 <small>可不填</small><textarea aria-label="参考图补充要求" maxLength={1000} disabled={busy || generating} value={requirements} onChange={event => setRequirements(event.target.value)} placeholder="例如：用并排的生活场景说明区别，减少图内文字。"/></label><div className="cl-visual-create"><span>gpt-image-2 · 生成期间可以继续文字课堂</span><button disabled={busy || generating || !visuals.capabilities?.available}>{busy ? '正在保存任务…' : generating ? '已有图片正在生成' : rows.length ? '再生成一版' : '生成讲解参考图'}</button></div></form>
    <div className="cl-visual-candidates" aria-label="这个环节的图片版本">{!rows.length ? <p className="cl-visual-empty">生成的图片会保存在这节课堂。回来时可继续查看与选用。</p> : [...rows].reverse().map((row, index) => <article key={row.id} className="cl-visual-candidate" data-selected={row.selected}><header><b>{row.selected ? '已选作参考' : statusNames[row.status]}</b><span>版本 {rows.length - index} · {purposeNames[row.purpose]}</span></header>{row.status === 'ready' ? <VisualImage row={row} compact/> : <p>{row.status === 'failed' ? '已保留生成目标，可以重试。' : row.status === 'cancelled' ? '这次任务已停止，可以重新尝试。' : '已保存任务。可以离开页面，图片返回后仍绑定这个环节。'}</p>}{row.task?.errorCode && <details><summary>任务诊断</summary><code>{row.task.errorCode}</code></details>}<footer>{row.status === 'ready' && <button disabled={busy} onClick={() => void action(row, row.selected ? 'unselect' : 'select')}>{row.selected ? '暂不使用这张图' : '选作当前环节参考'}</button>}{['queued', 'generating'].includes(row.status) && <button disabled={busy} onClick={() => void action(row, 'cancel')}>取消生成</button>}{['failed', 'cancelled'].includes(row.status) && <button disabled={busy} onClick={() => void action(row, 'retry')}>重试图片任务</button>}<button className="cl-visual-remove" disabled={busy} onClick={() => void action(row, 'delete')}>删除这个版本</button></footer></article>)}</div>
    <p className="cl-visual-footnote">选用只表示这节课堂使用参考图。图内数量、关系与文字仍需核对，不作为正式评分依据。</p>
  </section></div></WorkspaceDialog>;
}
const html = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
/** Hidden print notes also load authenticated blobs; do not open a PDF dialog while they are placeholders. */
export function waitForVisualPrint(root:HTMLElement,ids:string[],signal:AbortSignal):Promise<void>{
    return new Promise((resolve,reject)=>{
        let done=false,timer:ReturnType<typeof setTimeout>|undefined,observer:MutationObserver|undefined;
        const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);observer?.disconnect();root.removeEventListener('load',check,true);signal.removeEventListener('abort',abort);if(error)reject(error);else resolve();};
        const abort=()=>finish(new DOMException('Print preparation cancelled','AbortError'));
        const check=()=>{if(!root.isConnected)return abort();const figures=[...root.querySelectorAll<HTMLElement>('figure[data-visual-id]')];
            if(figures.some(figure=>ids.includes(figure.dataset.visualId!)&&figure.querySelector('[role="alert"]')))return finish(new Error('参考图读取失败，请重新读取图片后打印。'));
            if(ids.every(id=>figures.some(figure=>{const image=figure.querySelector('img');return figure.dataset.visualId===id&&image?.complete&&image.naturalWidth>0;})))finish();};
        if(signal.aborted)return abort();
        signal.addEventListener('abort',abort,{once:true});root.addEventListener('load',check,true);observer=new MutationObserver(check);observer.observe(root,{subtree:true,childList:true,attributes:true});timer=setTimeout(()=>finish(new Error('参考图尚未完整读取，请稍后重试打印。')),20000);check();
    });
}
export async function downloadVisualNotes(source: string, title: string, rows: ClassroomVisualView[]) {
    const images: string[] = [];
    for (const row of rows) {
        const blob = await visualBlob(row), data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('参考图读取失败')); reader.readAsDataURL(blob); });
        images.push('<figure><h2>' + html(row.stepTitle) + '</h2><img src="' + data + '" alt="' + html(row.stepTitle) + '"><figcaption>AI生成 · ' + html(row.modelId) + ' · 标注仍需核对</figcaption></figure>');
    }
    const content = '<!doctype html><html lang="zh"><meta charset="utf-8"><title>' + html(title) + '</title><style>body{max-width:900px;margin:40px auto;padding:0 24px;color:#24344d;font:16px/1.8 sans-serif}pre{white-space:pre-wrap;overflow-wrap:anywhere}figure{margin:40px 0;break-inside:avoid}img{max-width:100%;height:auto}figcaption{font-size:12px;color:#60718a}</style><h1>' + html(title) + '</h1><pre>' + html(source) + '</pre>' + images.join('') + '</html>', url = URL.createObjectURL(new Blob([content], { type: 'text/html;charset=utf-8' })), anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = title + '-含参考图.html';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
