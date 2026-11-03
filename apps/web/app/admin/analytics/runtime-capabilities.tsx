'use client';

import * as React from 'react';
import type { OperationsCapabilities, OperationsCapability } from '@study-agent/contracts';
import { apiRequest } from '../../../lib/api';
import './runtime-capabilities.css';

const stateLabels: Record<OperationsCapability['state'], string> = { ready: '本地检查通过', configured: '配置已读取', unavailable: '需处理', disabled: '已关闭' };

export function RuntimeCapabilities({ ownerId }: { ownerId: string }) {
  const [result, setResult] = React.useState<{ ownerId: string; value: OperationsCapabilities } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const request = React.useRef<AbortController | null>(null);
  React.useEffect(() => {
    request.current?.abort(); setResult(null); setError(null); setLoading(false);
    return () => { request.current?.abort(); };
  }, [ownerId]);

  async function check() {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setResult(null); setError(null); setLoading(true);
    try {
      const value = await apiRequest<OperationsCapabilities>('/admin/operations/capabilities', { signal: controller.signal });
      if (!controller.signal.aborted) setResult({ ownerId, value });
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : '检查暂未完成，请稍后重试。');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }
  const current = result?.ownerId === ownerId ? result.value : null;
  return <section className="runtime-capabilities" aria-labelledby="runtime-capabilities-title">
    <div className="runtime-capabilities-heading"><div><h2 id="runtime-capabilities-title">工具与依赖</h2>
      <p>分别查看各项能力的准备情况。缺少可选工具时，已有课程和普通文字学习仍可继续。</p></div>
      <button type="button" className="workspace-button" onClick={() => void check()} disabled={loading}>{loading ? '正在检查…' : current ? '重新检查依赖' : '检查工具与依赖'}</button></div>
    {loading && <p role="status">正在检查本地环境，通常需要数秒。运营指标仍可查看。</p>}
    {error && <p role="alert" className="runtime-capabilities-error">{error}</p>}
    {current && <><p className="runtime-capabilities-note">检查于 {new Date(current.at).toLocaleString('zh-CN')} · {current.cacheSeconds} 秒内复用结果。{current.scope}</p>
      <ul className="runtime-capabilities-list">{current.checks.map(item => <li key={item.id} data-state={item.state}>
        <div className="runtime-capabilities-item-title"><h3>{item.title}</h3><span>{stateLabels[item.state]}</span></div>
        <p>{item.message}</p>{item.repair && <p className="runtime-capabilities-repair">处理建议：{item.repair}</p>}
      </li>)}</ul></>}
  </section>;
}
