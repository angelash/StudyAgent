'use client';
import * as React from 'react';

export function CodeWorkbench({ initialCode }: { initialCode: string }) {
  const [code, setCode] = React.useState(initialCode), [output, setOutput] = React.useState<string[]>([]);
  const [running, setRunning] = React.useState(false);
  const worker = React.useRef<Worker | null>(null), timeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  function stop() {
    worker.current?.terminate(); worker.current = null;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null; setRunning(false);
  }
  React.useEffect(() => () => { worker.current?.terminate(); if (timeout.current) clearTimeout(timeout.current); }, []);
  function run() {
    stop(); setOutput([]); setRunning(true);
    const runtime = new Worker('/studio/classroom/runner'); worker.current = runtime;
    runtime.onmessage = event => {
      if (worker.current !== runtime) return;
      if (!Array.isArray(event.data?.lines) || !event.data.lines.every((line: unknown) => typeof line === 'string')) return;
      setOutput(event.data.lines.slice(0, 100).map((line: string) => line.slice(0, 2000))); stop();
    };
    runtime.onerror = () => { setOutput(['运行器加载失败，请重试。']); stop(); };
    runtime.postMessage({ code: code.slice(0, 16000) });
    timeout.current = setTimeout(() => { setOutput(['运行超过 2 秒，已停止。请检查循环的结束条件。']); stop(); }, 2000);
  }
  return <section className="cl-code" aria-label="代码实验">
    <header><span>JavaScript · 浏览器隔离计算</span><button onClick={() => setCode(initialCode)}>重置</button>
      <button onClick={() => { stop(); setOutput(['已停止运行']); }} disabled={!running}>停止运行</button>
      <button onClick={run} disabled={running}>{running ? '运行中…' : '▶ 运行代码'}</button></header>
    <label><span className="sr-only">实验代码</span><textarea spellCheck={false} value={code} onChange={event => setCode(event.target.value)} /></label>
    <div className="cl-console" role="log" aria-label="代码运行结果">{output.length ? output.map((line, index) => <div key={index}>{line}</div>) : '修改参数，再运行看看结果。'}</div>
    <small>仅运行当前 JavaScript 计算；不执行服务器命令。演示数字为自编样例。</small>
  </section>;
}
