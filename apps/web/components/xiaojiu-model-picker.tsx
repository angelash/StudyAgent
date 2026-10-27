'use client';
import * as React from 'react';
import type { XiaojiuModelCatalog } from '@study-agent/contracts';
import { apiRequest } from '../lib/api';
import './xiaojiu-model-picker.css';

export const XIAOJIU_MODEL_STORAGE_KEY = 'study-agent.xiaojiu-model';

export function useXiaojiuModels(enabled = true) {
  const [catalog, setCatalog] = React.useState<XiaojiuModelCatalog | null>(null);
  const [modelId, setModelIdState] = React.useState('auto');
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    if (!enabled) return;
    let alive = true;
    apiRequest<XiaojiuModelCatalog>('/ai/models').then(value => {
      if (!alive) return;
      setCatalog(value);
      let saved = '';
      try { saved = window.localStorage.getItem(XIAOJIU_MODEL_STORAGE_KEY) ?? ''; }
      catch { /* Local preference is optional. */ }
      setModelIdState(saved && (saved === 'auto' || value.models.some(model => model.id === saved))
        ? saved : value.defaultModel);
    }).catch(caught => { if (alive) setError((caught as Error).message); });
    return () => { alive = false; };
  }, [enabled]);
  function setModelId(value: string) {
    setModelIdState(value);
    try { window.localStorage.setItem(XIAOJIU_MODEL_STORAGE_KEY, value); }
    catch { /* Local preference is optional. */ }
  }
  return { catalog, modelId, setModelId, error };
}

export function XiaojiuModelPicker(input: {
  catalog: XiaojiuModelCatalog | null;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const selected = input.value === 'auto'
    ? input.catalog?.models.find(model => model.id === input.catalog?.defaultModel)
    : input.catalog?.models.find(model => model.id === input.value);
  const groups = ['OpenAI', 'xAI', '智谱', 'DeepSeek', 'Anthropic', '小米', '通义千问'] as const;
  const defaultName = input.catalog?.models.find(model => model.id === input.catalog?.defaultModel)?.label;
  return <div className="xiaojiu-model-picker" data-compact={input.compact}>
    <label><span>模型</span><select aria-label="选择大模型" value={input.value}
      disabled={input.disabled || !input.catalog} onChange={event => input.onChange(event.target.value)}>
      <option value="auto">Auto · {defaultName ? `平台默认 ${defaultName}` : '平台默认模型'}</option>
      <optgroup label="常用模型">{input.catalog?.models.filter(model => model.primary).map(model =>
        <option key={model.id} value={model.id}>{model.label}{model.default ? ' · 默认' : ''}</option>)}</optgroup>
      {groups.map(provider => {
        const rows = input.catalog?.models.filter(model => !model.primary && model.provider === provider) ?? [];
        return rows.length ? <optgroup key={provider} label={provider}>{rows.map(model =>
          <option key={model.id} value={model.id}>{model.label}</option>)}</optgroup> : null;
      })}
    </select></label>
    {!input.compact && <p><b>{selected?.label ?? '正在读取模型目录'}</b>
      <span>{input.value === 'auto' ? `使用平台默认${defaultName ? `：${defaultName}` : '模型'}` : selected?.description}</span></p>}
  </div>;
}
