'use client';

import * as React from 'react';
import type { CurriculumPackage, CurriculumPackagePreview, ImportFile, Subject } from '@study-agent/contracts';
import { apiRequest } from '../../../lib/api';

type ApplyCommand = { fileId: string; fingerprint: string; requestKey: string; reviewed: true };
type Receipt = { title: string; applied: number; unchanged: number; at: string; receiptId: string };
const send = <T,>(path: string, body?: unknown, signal?: AbortSignal) => apiRequest<T>(path,
  body === undefined ? { signal } : { method: 'POST', body: JSON.stringify(body), signal });
const readStorage = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const writeStorage = (key: string, value?: string) => { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* Retry is still available in the current page. */ } };
const fields: Record<string, string> = { name: '名称', strand: '领域', grade: '建议年级', term: '学期', objective: '可观察目标',
  successCriterion: '成功标准', prerequisiteIds: '先修点', parentId: '上位知识点', confusableAtomIds: '易混淆点', transferAtomIds: '迁移关联',
  teaching: '教学资料', status: '发布状态', subject: '学科', curriculumVersion: '课程版本', id: '稳定标识' };

export function CurriculumPackagePanel({ subject, canImport, userId, onApplied }: {
  subject: Subject; canImport: boolean; userId: string; onApplied: () => Promise<void>;
}) {
  const [preview, setPreview] = React.useState<CurriculumPackagePreview | null>(null), [reviewed, setReviewed] = React.useState(false);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [receipt, setReceipt] = React.useState<Receipt | null>(null);
  const [progress, setProgress] = React.useState<{ name: string; done: number; total: number } | null>(null);
  const [pending, setPending] = React.useState<ApplyCommand | null>(null), [page, setPage] = React.useState(1), [changedOnly, setChangedOnly] = React.useState(true);
  const controller = React.useRef<AbortController | null>(null), pendingKey = `study:curriculum-apply:${userId}`;
  React.useEffect(() => {
    try { const previous = JSON.parse(readStorage(pendingKey) ?? 'null');
      if (previous?.reviewed === true && typeof previous.fileId === 'string' && /^[a-f0-9]{64}$/.test(previous.fingerprint) && typeof previous.requestKey === 'string') setPending(previous);
    } catch { writeStorage(pendingKey); }
    return () => controller.current?.abort();
  }, [pendingKey]);
  async function run(operation: () => Promise<void>) {
    setBusy(true); setError(''); try { await operation(); } catch (e) { setError(e instanceof Error ? e.message : '操作未完成，请重试'); } finally { setBusy(false); }
  }
  async function upload(input: File) {
    setPreview(null); setReviewed(false); setReceipt(null); setPage(1);
    await run(async () => {
      if (!input.name.toLowerCase().endsWith('.json') || input.size > 8 * 1024 * 1024 || !input.size) throw new Error('请选择8MB以内的JSON课程包。');
      const abort = new AbortController(); controller.current = abort;
      const storageKey = `study:curriculum-upload:${userId}:${input.name}:${input.size}:${input.lastModified}`;
      const requestKey = readStorage(storageKey) ?? crypto.randomUUID(); writeStorage(storageKey, requestKey);
      let file = await send<ImportFile>('/admin/import-files', { name: input.name, size: input.size, mediaType: 'application/json', requestKey }, abort.signal);
      setProgress({ name: input.name, done: 0, total: input.size });
      for (let index = 0; index < Math.ceil(input.size / file.chunkSize); index++) {
        if (abort.signal.aborted) throw new Error('上传已暂停。重新选择同一文件可以续传。');
        const bytes = await input.slice(index * file.chunkSize, Math.min(input.size, (index + 1) * file.chunkSize)).arrayBuffer();
        const existing = file.chunks.find(chunk => chunk.index === index);
        if (existing) {
          const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(n => n.toString(16).padStart(2, '0')).join('');
          if (existing.sha256 !== digest) { writeStorage(storageKey); throw new Error('文件内容与上次分块不同，请重新选择以建立新上传。'); }
        } else file = await apiRequest<ImportFile>(`/admin/import-files/${file.id}/chunks/${index}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes, signal: abort.signal });
        setProgress({ name: input.name, done: Math.min(input.size, (index + 1) * file.chunkSize), total: input.size });
      }
      file = await send<ImportFile>(`/admin/import-files/${file.id}/complete`, {}, abort.signal);
      const result = await send<CurriculumPackagePreview>('/admin/curriculum/packages/preview', { fileId: file.id }, abort.signal);
      setPreview(result); setProgress(null);
    });
    controller.current = null;
  }
  async function apply(command: ApplyCommand) {
    await run(async () => {
      writeStorage(pendingKey, JSON.stringify(command)); setPending(command);
      const result = await send<Receipt>('/admin/curriculum/packages/apply', command);
      setReceipt(result); setPreview(null); setPending(null); setReviewed(false); writeStorage(pendingKey);
      await onApplied();
    });
  }
  const changes = preview?.changes.filter(change => !changedOnly || change.kind !== 'unchanged') ?? [];
  return <section className="curriculum-package admin-section" aria-labelledby="curriculum-package-title">
    <div className="curriculum-package-heading"><div><span className="studio-eyebrow">课程定义 · 版本流转</span><h2 id="curriculum-package-title">先比较，再整批应用。</h2>
      <p>课程包包含知识定义、知识关系和教学资料。题目量规与教材课时映射继续分别审核。</p></div>
      <button className="studio-secondary" disabled={busy} onClick={() => void run(async () => {
        const content = await send<CurriculumPackage>(`/admin/curriculum/package?subject=${subject}`);
        const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = `study-curriculum-${subject}-${new Date().toISOString().slice(0, 10)}.json`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      })}>导出本学科定义</button>
    </div>
    {error && <p className="studio-error" role="alert">{error}</p>}
    {receipt && <p className="curriculum-receipt" role="status">《{receipt.title}》已整批保存：更新 {receipt.applied} 点，{receipt.unchanged} 点保持原版本。各知识点修改记录可继续查看。</p>}
    {canImport ? <>
      {pending && <div className="curriculum-pending" role="status"><p>上一次导入的结果仍待确认。恢复请求会查询同一回执，成功的定义不会重复升版。</p><div className="admin-toolbar">
        <button className="studio-primary" disabled={busy} onClick={() => void apply(pending)}>恢复并确认上次导入</button>
        <button className="studio-text-button" disabled={busy} onClick={() => { setPending(null); writeStorage(pendingKey); }}>清除待确认状态</button></div></div>}
      <label className="curriculum-file-label">选择课程包 · JSON / 最大8MB<input type="file" accept=".json,application/json" disabled={busy || !!pending} onChange={e => {
        const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file) void upload(file);
      }} /></label>
      {progress && <div role="status"><p>{progress.name} · 已传 {Math.round(progress.done / progress.total * 100)}%</p><progress value={progress.done} max={progress.total} aria-label="课程包上传进度" />
        {busy && controller.current && <button className="studio-text-button" onClick={() => controller.current?.abort()}>暂停上传</button>}</div>}
      {preview && <div className="curriculum-preview"><h3>{preview.title}</h3><p>{preview.provenance}</p>
        <div className="curriculum-package-counts"><span><strong>{preview.added}</strong>新增</span><span><strong>{preview.changed}</strong>修改</span><span><strong>{preview.unchanged}</strong>无变化</span><span><strong>{preview.draft}</strong>草稿定义</span></div>
        <p>不在包内的知识点会保留。定义整体通过关系检查后一起应用；预览后若版本有变动，需要重新比较。</p>
        <label className="curriculum-inline-check"><input type="checkbox" checked={changedOnly} onChange={e => { setChangedOnly(e.target.checked); setPage(1); }} />只看有变化的定义</label>
        <div className="curriculum-differences">{changes.slice((page - 1) * 20, page * 20).map(change => <details key={change.id}><summary><strong>{change.name}</strong><span>{change.kind === 'added' ? '新增' : change.kind === 'changed' ? '修改' : '无变化'} · v{change.previousVersion} → v{change.nextVersion}</span></summary>
          <small>{change.id}</small>{change.fields.map(field => <div className="curriculum-field-change" key={field.field}><h4>{fields[field.field] ?? field.field}</h4><div><section><strong>当前</strong><pre>{JSON.stringify(field.before, null, 2)}</pre></section><section><strong>应用后</strong><pre>{JSON.stringify(field.after, null, 2)}</pre></section></div></div>)}
        </details>)}</div>
        {changes.length > 20 && <div className="admin-toolbar"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button><span>{page} / {Math.ceil(changes.length / 20)}</span><button disabled={page * 20 >= changes.length} onClick={() => setPage(p => p + 1)}>下一页</button></div>}
        <label className="curriculum-inline-check"><input type="checkbox" checked={reviewed} disabled={busy || !!pending} onChange={e => setReviewed(e.target.checked)} />我已核对来源、定义与教学资料差异，并确认各项审核状态。</label>
        <button className="studio-primary" disabled={busy || !reviewed || !!pending} onClick={() => void apply({ fileId: preview.fileId, fingerprint: preview.fingerprint, requestKey: crypto.randomUUID(), reviewed: true })}>确认整批应用</button>
      </div>}
    </> : <p>可以导出定义供教研整理；课程包的上传与整批应用由管理员执行。</p>}
  </section>;
}
