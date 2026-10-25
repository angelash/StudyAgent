'use client';
import * as React from 'react';
import { useCodeDraft, type CodeDraftContext } from './code-draft';

export function CodeWorkbench({ initialCode, context, onInteract }: { initialCode: string; context?: CodeDraftContext; onInteract?: () => void }) {
  const draft = useCodeDraft(initialCode, context), [output, setOutput] = React.useState<string[]>([]);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<'idle'|'running'|'success'|'error'|'timeout'|'stopped'>('idle'), [reset, setReset] = React.useState(false);
  const worker = React.useRef<Worker | null>(null), timeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  function stop() {
    worker.current?.terminate(); worker.current = null;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null; setRunning(false);
  }
  React.useEffect(() => () => { worker.current?.terminate(); if (timeout.current) clearTimeout(timeout.current); }, []);
  function exportDraft() {
    const value = { format: 'study-classroom-code-draft-v1', language: 'javascript', code: draft.code, input: draft.input, exportedAt: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'classroom-code-draft.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function run() {
    stop(); setOutput([]);
    if (draft.code.length > 16000 || draft.input.length > 8000) { setResult('error'); setOutput(['代码最多16000字符，输入最多8000字符。请缩短后运行，程序不会被截断。']); return; }
    setRunning(true); setResult('running');
    const runtime = new Worker('/studio/classroom/runner'); worker.current = runtime;
    const id = crypto.randomUUID();
    runtime.onmessage = event => {
      if (worker.current !== runtime) return;
      if (event.data?.id !== id || !['success','error'].includes(event.data.status) || !Array.isArray(event.data.lines) || !event.data.lines.every((line: unknown) => typeof line === 'string')) return;
      setResult(event.data.status); setOutput(event.data.lines.slice(0, 100).map((line: string) => line.slice(0, 2000))); stop();
    };
    runtime.onerror = () => { if (worker.current !== runtime) return; setResult('error'); setOutput(['运行器加载失败，请重试。']); stop(); };
    runtime.postMessage({ id, code: draft.code, input: draft.input });
    timeout.current = setTimeout(() => { if (worker.current !== runtime) return; setResult('timeout'); setOutput(['运行超过 2 秒，已停止。请检查循环的结束条件。']); stop(); }, 2000);
  }
  return <section className="cl-code" aria-label="代码实验" onFocusCapture={onInteract} onPointerDown={onInteract}>
    <header><span>JavaScript · 浏览器隔离计算</span><button onClick={() => setReset(true)}>重置</button>
      <button onClick={() => { stop(); setResult('stopped'); setOutput(['已停止运行']); }} disabled={!running}>停止运行</button>
      <button onClick={run} disabled={running}>{running ? '运行中…' : '▶ 运行代码'}</button></header>
    {reset && <div className="cl-code-reset" role="group" aria-label="确认重置代码"><p>恢复本课的原始代码和空输入？当前修改会被替换。</p><button onClick={() => setReset(false)}>继续编辑</button><button onClick={() => { draft.edit({ code: initialCode, input: '' }); setReset(false); }}>恢复原始示例</button></div>}
    <label><span className="sr-only">实验代码</span><textarea spellCheck={false} value={draft.code} onChange={event => draft.edit({ code: event.target.value })} /></label>
    <label className="cl-code-input"><span>程序输入 · 每行一项</span><textarea aria-label="程序输入" spellCheck={false} value={draft.input} onChange={event => draft.edit({ input: event.target.value })} placeholder="用 readLine() 逐行读取，结束时返回 null；input 是只读的输入行数组。" /></label>
    <div className="cl-code-save"><span role="status">{draft.labels[draft.state]}</span><button disabled={draft.state === 'saving' || draft.state === 'loading' || draft.state === 'conflict'} onClick={() => void draft.save()}>保存代码草稿</button>
      <button onClick={exportDraft}>导出我的实验草稿</button>
      {draft.state === 'conflict' && <><button onClick={draft.readSaved}>读取已保存版本</button><button onClick={draft.keepLocal}>用我的草稿保存为新版本</button></>}</div>
    {draft.notice && <p className="cl-code-notice" role="status">{draft.notice}</p>}
    <div className="cl-code-result" role="status">{({idle:'尚未运行',running:'运行中',success:'运行完成',error:'运行错误',timeout:'运行超时',stopped:'已停止运行'})[result]}</div>
    <div className="cl-console" role="log" aria-label="代码运行结果">{output.length ? output.map((line, index) => <div key={index}>{line}</div>) : '修改参数，再运行看看结果。'}</div>
    <small>修改会保存为你的实验草稿；输入可用 readLine() 逐行读取。也可以导出代码和输入，稍后继续。</small>
  </section>;
}
