'use client';
import * as React from 'react';
import type { XiaojiuModelCatalog, XiaojiuTextCheck } from '@study-agent/contracts';
import { apiRequest } from '../lib/api';
import './xiaojiu-model-picker.css';

export const XIAOJIU_MODEL_STORAGE_KEY = 'study-agent.xiaojiu-model';

export function useXiaojiuModels(enabled = true) {
  const [catalog, setCatalog] = React.useState<XiaojiuModelCatalog | null>(null);
  const [modelId, setModelIdState] = React.useState('auto');
  const [error, setError] = React.useState('');
  const [revision, setRevision] = React.useState(0);
  const choiceRevision = React.useRef(0);
  React.useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const originalChoice = choiceRevision.current;
    setError('');
    apiRequest<XiaojiuModelCatalog>('/ai/models').then(value => {
      if (!alive) return;
      setCatalog(value);
      let saved = '';
      try { saved = window.localStorage.getItem(XIAOJIU_MODEL_STORAGE_KEY) ?? ''; }
      catch { /* Local preference is optional. */ }
      if (choiceRevision.current === originalChoice) setModelIdState(saved && (saved === 'auto' || value.models.some(model => model.id === saved))
        ? saved : value.defaultModel);
    }).catch(caught => { if (alive) setError((caught as Error).message); });
    return () => { alive = false; };
  }, [enabled, revision]);
  function setModelId(value: string) {
    choiceRevision.current += 1;
    setModelIdState(value);
    try { window.localStorage.setItem(XIAOJIU_MODEL_STORAGE_KEY, value); }
    catch { /* Local preference is optional. */ }
  }
  return { catalog, modelId, setModelId, error, reload: () => setRevision(value => value + 1) };
}

function checkLabel(check: XiaojiuTextCheck | undefined) {
  if (!check || check.status === 'unknown' || !check.checkedAt || !Number.isFinite(Date.parse(check.checkedAt))) return '尚未进行文字检查';
  const historical = check.historical || Boolean(check.expiresAt && Date.parse(check.expiresAt) <= Date.now());
  const state = check.status === 'passed' ? '文字检查通过' : '文字检查未通过';
  const at = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(check.checkedAt));
  return `${historical ? '历史' : '上次'}${state} · ${at}`;
}

function checkNote(check: XiaojiuTextCheck | undefined) {
  if (check?.status === 'failed') return '未取得可核对的完整回答，可重试或换型。';
  if (check?.reason === 'catalog-changed') return '模型目录已变化，原检查需要更新。';
  if (check?.reason === 'connection-changed') return '连接已变化，原检查需要更新。';
  if (check?.reason === 'report-invalid' || check?.reason === 'report-unavailable') return '检查记录暂时无法核对。';
  return check?.status === 'passed' ? '记录的是当时的完整文字回答。' : '';
}

export function XiaojiuModelPicker(input: {
  catalog: XiaojiuModelCatalog | null;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
  presentation?: 'panel' | 'inline';
  error?: string;
  onRetry?: () => void;
}) {
  const selected = input.value === 'auto'
    ? input.catalog?.models.find(model => model.id === input.catalog?.defaultModel)
    : input.catalog?.models.find(model => model.id === input.value);
  const groups = ['OpenAI', 'xAI', '智谱', 'DeepSeek', 'Anthropic', '小米', '通义千问'] as const;
  const defaultName = input.catalog?.models.find(model => model.id === input.catalog?.defaultModel)?.label;
  const label = (model: XiaojiuModelCatalog['models'][number]) => model.label +
    (model.textCheck?.status === 'failed' ? ' · 上次未通过' : '');
  const qualification=<><span>{checkLabel(selected?.textCheck)}</span>{checkNote(selected?.textCheck)&&<small>{checkNote(selected?.textCheck)}</small>}</>;
  return <div className="xiaojiu-model-picker" data-compact={input.compact} data-presentation={input.presentation??'panel'}>
    <label><span>模型</span><select aria-label="选择大模型" value={input.value}
      disabled={input.disabled || !input.catalog} onChange={event => input.onChange(event.target.value)}>
      <option value="auto">Auto · {defaultName ? `平台默认 ${defaultName}` : '平台默认模型'}</option>
      <optgroup label="常用模型">{input.catalog?.models.filter(model => model.primary).map(model =>
        <option key={model.id} value={model.id}>{label(model)}{model.default ? ' · 默认' : ''}</option>)}</optgroup>
      {groups.map(provider => {
        const rows = input.catalog?.models.filter(model => !model.primary && model.provider === provider) ?? [];
        return rows.length ? <optgroup key={provider} label={provider}>{rows.map(model =>
          <option key={model.id} value={model.id}>{label(model)}</option>)}</optgroup> : null;
      })}
    </select></label>
    {input.catalog&&(input.presentation==='inline'?<details className="xiaojiu-model-check-popover" data-status={selected?.textCheck?.status??'unknown'}>
      <summary aria-label="模型文字检查说明" title={checkLabel(selected?.textCheck)}>{selected?.textCheck?.status==='failed'?'!':'ⓘ'}</summary><div className="xiaojiu-model-check">{qualification}</div>
    </details>:<div className="xiaojiu-model-check" data-status={selected?.textCheck?.status??'unknown'}>{qualification}</div>)}
    {input.error && <div className="xiaojiu-model-reload" role="alert"><span>模型目录暂未读取成功。</span>
      {input.onRetry && <button type="button" onClick={input.onRetry}>重新读取模型目录</button>}</div>}
    {!input.compact && <p><b>{selected?.label ?? '正在读取模型目录'}</b>
      <span>{input.value === 'auto' ? `使用平台默认${defaultName ? `：${defaultName}` : '模型'}` : selected?.description}</span></p>}
  </div>;
}
