'use client';
import * as React from 'react';
import katex from 'katex';
import type { StudioOverview, StudioPdfStructureBlock, StudioSourceMaterial, StudioSubject, StudioWhiteboard } from '@study-agent/contracts';
import { apiBaseUrl, apiRequest, getAuthToken } from '../../lib/api';

type Props = {
  studentId: string;
  subject: StudioSubject;
  materials: StudioSourceMaterial[];
  atoms: NonNullable<StudioOverview['selected']>['atoms'];
  onChanged: () => Promise<void>;
  onOpenWhiteboard: (whiteboard: StudioWhiteboard) => void;
  onError: (message: string) => void;
};

const statusNames = {
  queued: '等待处理',
  processing: 'OCR 与结构恢复中',
  ready: '可核对',
  needs_review: '结构待核对',
  failed: '处理失败',
} as const;
const methodNames = {
  native_text: '原生文字层',
  pdf_text: '原生文字层',
  ocr: 'OCR',
  hybrid: '文字层 + OCR',
  unreadable: '未识别',
} as const;
const warningNames: Record<string, string> = {
  ocr_requires_visual_review: 'OCR 文字需对照原页',
  native_and_ocr_text_require_review: '文字层与 OCR 合并，需核对',
  low_confidence_lines: '存在低置信文字',
  no_readable_text: '没有识别出可读文字',
  formula_structure_requires_review: '公式结构需核对',
  table_structure_requires_review: '表格结构需核对',
  model_structure_review_unavailable: '小九AI 复核暂不可用，已保留本地恢复结果',
  model_review_page_limit: '结构页较多，仅对前 8 个复核页调用模型；其余保留本地结果',
  review_against_source_page: '请对照原页核对结构',
};

function FormulaBlock({ latex, plainText }: { latex: string; plainText: string }) {
  const html = React.useMemo(() => katex.renderToString(latex || plainText, {
    throwOnError: false, trust: false, strict: 'ignore', maxExpand: 500, output: 'html',
  }), [latex, plainText]);
  return <div className="sa-pdf-formula"><div dangerouslySetInnerHTML={{ __html: html }} />
    <small>候选 LaTeX：{latex || '未恢复'} · 原文：{plainText}</small></div>;
}

function StructureBlock({ block }: { block: StudioPdfStructureBlock }) {
  if (block.kind === 'table') {
    return <article className="sa-pdf-table-block" data-review={block.reviewRequired}>
      <header><span>TABLE</span><b>表格结构</b>{block.reviewRequired && <em>待核对</em>}</header>
      <div><table><thead><tr>{block.headers.map((cell, index) => <th key={index}>{cell}</th>)}</tr></thead>
        <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody></table></div>
    </article>;
  }
  if (block.kind === 'formula') return <article className="sa-pdf-formula-block" data-review={block.reviewRequired}>
    <header><span>FORMULA</span><b>公式结构</b>{block.reviewRequired && <em>待核对</em>}</header>
    <FormulaBlock latex={block.latex} plainText={block.plainText} /></article>;
  return <article className="sa-pdf-paragraph-block"><span>PARAGRAPH</span><p>{block.text}</p></article>;
}

export function PdfMaterialLab({ studentId, subject, materials, atoms, onChanged, onOpenWhiteboard, onError }: Props) {
  const [selectedId, setSelectedId] = React.useState(materials[0]?.id ?? '');
  const [atomId, setAtomId] = React.useState(atoms.find(atom => atom.teaching)?.id ?? atoms[0]?.id ?? '');
  const [page, setPage] = React.useState(1);
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState<StudioWhiteboard | null>(null);
  const [pageImage, setPageImage] = React.useState('');
  const [pageImageError, setPageImageError] = React.useState('');
  const [pageView, setPageView] = React.useState<'page' | 'text' | 'structure'>('page');
  const input = React.useRef<HTMLInputElement | null>(null);
  const material = materials.find(item => item.id === selectedId) ?? materials[0];
  const current = material?.pages.find(item => item.page === page) ?? material?.pages[0];
  const status = material?.status ?? 'ready';
  const processing = status === 'queued' || status === 'processing';

  React.useEffect(() => {
    if (!materials.some(item => item.id === selectedId)) setSelectedId(materials[0]?.id ?? '');
  }, [materials, selectedId]);

  React.useEffect(() => {
    if (!materials.some(item => ['queued', 'processing'].includes(item.status ?? 'ready'))) return;
    const timer = window.setInterval(() => void onChanged().catch(() => undefined), 1200);
    return () => window.clearInterval(timer);
  }, [materials, onChanged]);

  React.useEffect(() => {
    setPageImage(''); setPageImageError('');
    if (!material?.hasPageImages || !current) return;
    const controller = new AbortController(); let objectUrl = '';
    const token = getAuthToken();
    void fetch(apiBaseUrl + '/api/learning/studio/materials/' + encodeURIComponent(material.id) + '/pages/' + current.page, {
      credentials: 'include', signal: controller.signal, headers: token ? { authorization: 'Bearer ' + token } : {},
    }).then(response => {
      if (!response.ok) throw new Error('原页预览不可用');
      return response.blob();
    }).then(blob => { objectUrl = URL.createObjectURL(blob); setPageImage(objectUrl); })
      .catch(error => {
        if ((error as Error).name !== 'AbortError') {
          setPageImage(''); setPageImageError('原版页面暂时无法打开，可切换到文字层或结构层继续核对。');
        }
      });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [material?.id, material?.hasPageImages, current?.page]);

  async function upload(file: File) {
    if (file.size > 10 * 1024 * 1024) { onError('PDF 不能超过 10MB'); return; }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file); body.append('studentId', studentId); body.append('subject', subject);
      body.append('requestKey', crypto.randomUUID());
      const token = getAuthToken();
      const response = await fetch(apiBaseUrl + '/api/learning/studio/materials/pdf', {
        method: 'POST', credentials: 'include', headers: token ? { authorization: 'Bearer ' + token } : {}, body,
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error?.message || 'PDF 上传失败');
      setSelectedId(payload.data.id); setPage(1); setPageView('page'); await onChanged();
    } catch (error) { onError((error as Error).message); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }

  async function makePreview() {
    if (!material) return;
    setBusy(true);
    try {
      setPreview(await apiRequest<StudioWhiteboard>('/learning/studio/materials/' + encodeURIComponent(material.id) +
        '/whiteboard/preview', { method: 'POST', body: JSON.stringify({ ...(atomId ? { atomId } : {}) }) }));
    } catch (error) { onError((error as Error).message); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!material || !preview) return;
    setBusy(true);
    try {
      const board = await apiRequest<StudioWhiteboard>('/learning/studio/materials/' + encodeURIComponent(material.id) +
        '/whiteboard', { method: 'POST', body: JSON.stringify({ ...(atomId ? { atomId } : {}),
          fingerprint: preview.fingerprint, requestKey: crypto.randomUUID() }) });
      setPreview(null); await onChanged(); onOpenWhiteboard(board);
    } catch (error) { onError((error as Error).message); }
    finally { setBusy(false); }
  }

  async function reviewStructure() {
    if (!material?.structure) return;
    setBusy(true);
    try {
      await apiRequest('/learning/studio/materials/' + encodeURIComponent(material.id) + '/structure/review', {
        method: 'POST', body: JSON.stringify({ expectedUpdatedAt: material.updatedAt ?? material.createdAt,
          requestKey: crypto.randomUUID() }),
      });
      await onChanged();
    } catch (error) { onError((error as Error).message); }
    finally { setBusy(false); }
  }

  async function retryProcessing() {
    if (!material) return;
    setBusy(true);
    try {
      await apiRequest('/learning/studio/materials/' + encodeURIComponent(material.id) + '/process/retry', {
        method: 'POST', body: JSON.stringify({ expectedUpdatedAt: material.updatedAt ?? material.createdAt,
          requestKey: crypto.randomUUID() }),
      });
      await onChanged();
    } catch (error) { onError((error as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="sa-pdf-lab">
    <header className="sa-page-head sa-calendar-heading"><div><span className="studio-kicker">SOURCE MATERIALS</span>
      <h1>把 PDF 变成逐页课堂。</h1><p>上传讲义或课件后，系统会识别文字层或扫描页，恢复段落、表格与公式候选，并保留原页供逐项核对。
        <span className="sa-pdf-privacy">启用小九AI复核时，最多 8 页原图与 OCR 文字会交给当前 CLI 配置的模型服务。</span></p></div>
      <div className="sa-page-actions"><input ref={input} type="file" accept="application/pdf" hidden
        onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
        <button disabled={busy} onClick={() => input.current?.click()}>{busy ? '上传中…' : '＋ 上传 PDF'}</button></div></header>
    <div className="sa-pdf-workbench"><aside><span className="studio-kicker">YOUR FILES</span>
      {materials.length ? materials.map(item => {
        const itemStatus = item.status ?? 'ready';
        return <button key={item.id} data-active={item.id === material?.id} onClick={() => {
          setSelectedId(item.id); setPage(item.pages[0]?.page ?? 1);
        }}><span>PDF</span><div><b>{item.title}</b><small>{item.pageCount} 页 · {statusNames[itemStatus]}</small></div></button>;
      }) : <div className="sa-pdf-empty"><b>还没有材料</b><p>上传 10MB 以内的文字型或扫描型 PDF。处理结果始终保留来源页与核对边界。</p></div>}
    </aside><main>{material && processing ? <div className="sa-pdf-processing">
      <span className="studio-kicker">PROCESSING PDF</span><h2>正在拆开文字与版面。</h2>
      <p>{material.status === 'queued' ? '文件已安全保存，等待后台任务开始。' : '正在执行 OCR、表格识别和公式结构恢复。复杂扫描页可能需要更长时间。'}</p>
      <div><i /><i /><i /></div><small>离开页面不会中断任务；完成后会自动刷新。</small>
    </div> : material?.status === 'failed' ? <div className="sa-pdf-failed"><span className="studio-kicker">PROCESSING FAILED</span>
      <h2>这份 PDF 还没有完成结构恢复。</h2><p>{material.error || '处理任务中断，请重新上传或检查文件。'}</p>
      <button disabled={busy} onClick={() => void retryProcessing()}>{busy ? '正在重新排队…' : '重试处理'}</button></div>
      : material && current ? <>
        <div className="sa-pdf-summary"><div><span className="studio-kicker">EXTRACTION</span>
          <b>{methodNames[material.structure?.method ?? (current.method === 'ocr' ? 'ocr' : 'native_text')]}</b>
          <small>{material.structure ? [material.structure.ocrPageCount ? material.structure.ocrPageCount + ' 页 OCR' : '',
            material.structure.tableCount + ' 个表格', material.structure.formulaCount + ' 个公式'].filter(Boolean).join(' · ') : '等待结构摘要'}</small></div>
          <div data-review={material.structure?.reviewRequired}><span>STRUCTURE</span>
            <b>{material.structure?.reviewRequired ? '需要对照原页' : '结构已恢复'}</b>
            <small>{material.structure?.modelSource === 'xiaojiu_cli' ? '小九AI · ' +
              (material.structure.modelId === 'deepseek-v4-flash' ? 'DeepSeek V4 Flash' : material.structure.modelId ?? '模型复核') :
              material.structure?.modelSource === 'local_fallback' ? '本地结构恢复' : '本地版面恢复'}</small>
            {material.structure?.modelSource === 'local_fallback' && <button disabled={busy}
              onClick={() => void retryProcessing()}>重新用小九AI复核</button>}
            {material.structure?.reviewRequired && <button disabled={busy} onClick={() => void reviewStructure()}>已对照原页确认结构</button>}
          </div>
        </div>
        <div className="sa-pdf-controls"><label>关联知识点<select value={atomId} onChange={event => setAtomId(event.target.value)}>
          {atoms.map(atom => <option key={atom.id} value={atom.id}>{atom.name}</option>)}</select></label>
          <div className="sa-pdf-view-toggle"><button data-active={pageView === 'page'} onClick={() => setPageView('page')}>原版页面</button>
            <button data-active={pageView === 'text'} onClick={() => setPageView('text')}>文字层</button>
            <button data-active={pageView === 'structure'} onClick={() => setPageView('structure')}>结构恢复</button>
            <button disabled={busy || !atomId} onClick={() => void makePreview()}>生成页级白板</button></div></div>
        <div className="sa-pdf-pages">{material.pages.map(item => <button key={item.page} data-active={item.page === current.page}
          onClick={() => setPage(item.page)}>{item.page}</button>)}</div>
        <article className="sa-pdf-page"><header><div><span className="studio-kicker">PAGE {current.page}/{material.pageCount}</span>
          <h2>{material.title}</h2></div><small>{material.filename} · {Math.max(1, Math.ceil(material.byteSize / 1024))} KB</small></header>
          <div className="sa-pdf-paper">{pageView === 'page' ? (pageImage ? <img
            alt={material.title + ' 第 ' + current.page + ' 页原版预览'} src={pageImage} /> :
            <div className="sa-pdf-paper-loading">{pageImageError || (material.hasPageImages ? '正在打开原版页面…' : '该页未能生成原版预览；文字层仍可核对。')}</div>)
            : pageView === 'text' ? <p>{current.text || '这一页没有识别出可读文字，请对照原页。'}</p> :
              <div className="sa-pdf-structured"><header><span>{methodNames[current.method ?? 'pdf_text']}</span>
                <small>置信度 {current.confidence === null || current.confidence === undefined ? '—' : Math.round(current.confidence * 100) + '%'}</small></header>
                {(current.blocks ?? []).length ? current.blocks!.map(block => <StructureBlock key={block.id} block={block} />) :
                  <div className="sa-pdf-empty"><b>这一页没有可恢复的结构块</b><p>可切换到文字层或原版页面继续核对。</p></div>}
                {!!current.warnings?.length && <div className="sa-pdf-warnings">{current.warnings.map(warning =>
                  <span key={warning}>{warningNames[warning] ?? warning}</span>)}</div>}
              </div>}</div>
          <footer><span>页级来源 · SHA {material.sha256.slice(0, 12)}</span>
            <button onClick={() => setPage(Math.max(material.pages[0]?.page ?? 1, current.page - 1))}>上一页</button>
            <button onClick={() => setPage(Math.min(material.pages.at(-1)?.page ?? current.page, current.page + 1))}>下一页</button>
            <button onClick={() => { window.location.href = apiBaseUrl + '/api/learning/studio/materials/' +
              encodeURIComponent(material.id) + '/original'; }}>下载原文件</button></footer></article>
      </> : <div className="sa-pdf-empty"><b>选择一份材料</b><p>上传后可在原版页面、文字层和结构恢复之间来回核对。</p></div>}</main></div>
    {preview && <div className="sa-whiteboard-preview-modal"><button className="sa-scrim" onClick={() => setPreview(null)} />
      <section><header><div><span className="studio-kicker">PDF WHITEBOARD</span><h2>{preview.title}</h2></div>
        <button aria-label="关闭页级白板预览" onClick={() => setPreview(null)}>×</button></header>
        <div className="sa-pdf-preview-scenes">{preview.scenes.filter(scene => scene.kind === 'pdf_page').map(scene =>
          <article key={scene.id}><span>{scene.source?.label}</span><b>{scene.title}</b><p>{scene.body}</p></article>)}</div>
        <div className="sa-whiteboard-preview-copy"><strong>{preview.scenes.length} 幕 · {Math.ceil(preview.durationMs / 1000)} 秒</strong>
          <p>每页保留来源页码；讲解完成后会用独立新题检查，不把观看当成掌握。</p></div>
        <footer><button onClick={() => onOpenWhiteboard(preview)}>播放预览</button>
          <button disabled={busy} onClick={() => void save()}>{busy ? '正在保存…' : '保存页级白板'}</button></footer></section></div>}
  </section>;
}
