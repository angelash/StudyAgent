import { BadRequestException, Injectable } from '@nestjs/common';
import { loadApiEnv } from '@study-agent/config';
import type { XiaojiuModelCatalog, XiaojiuModelOption } from '@study-agent/contracts';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

type CatalogModel = {
  slug?: unknown;
  display_name?: unknown;
  description?: unknown;
  supported_in_api?: unknown;
  input_modalities?: unknown;
  visibility?: unknown;
};

type ModelSeed = Omit<XiaojiuModelOption, 'primary' | 'default'> & { primary?: boolean };

const primaryOrder = [
  'gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna', 'grok-4.7', 'glm-5.3-flash',
  'deepseek-v4-flash', 'claude-opus-5.5', 'claude-sonnet-5',
];

const fallbackModels: ModelSeed[] = [
  { id: 'gpt-6-astra', label: 'GPT-6 Astra', catalogLabel: 'GPT-6-Astra', description: '复杂任务与高质量推理', provider: 'OpenAI', providerKey: 'openai', inputModalities: ['text', 'image'] },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', catalogLabel: 'GPT-6.1-Sol', description: '日常学习与通用工作模型', provider: 'OpenAI', providerKey: 'openai', inputModalities: ['text', 'image'] },
  { id: 'gpt-6-sol', label: 'GPT-6 Sol', catalogLabel: 'GPT-6-Sol', description: '上一代通用工作模型', provider: 'OpenAI', providerKey: 'openai', inputModalities: ['text'] },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna', catalogLabel: 'GPT-6-Luna', description: '轻量快速模型', provider: 'OpenAI', providerKey: 'openai', inputModalities: ['text'] },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', catalogLabel: 'GPT-5.6-Sol', description: '稳定通用模型', provider: 'OpenAI', providerKey: 'openai', inputModalities: ['text'] },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', catalogLabel: 'GPT-5.6-Terra', description: '平衡型模型', provider: 'OpenAI', providerKey: 'openai', inputModalities: ['text'] },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', catalogLabel: 'GPT-5.6-Luna', description: '快速高效模型', provider: 'OpenAI', providerKey: 'openai', inputModalities: ['text'] },
  { id: 'gpt-5.5', label: 'GPT-5.5', catalogLabel: 'GPT-5.5', description: '兼容旧对话的通用模型', provider: 'OpenAI', providerKey: 'openai', inputModalities: ['text'] },
  { id: 'glm-5.2', label: 'GLM-5.2', catalogLabel: 'GLM-5.2', description: '智谱通用模型', provider: '智谱', providerKey: 'zhipu', inputModalities: ['text'] },
  { id: 'glm-5.3-flash', label: 'GLM-5.3 Flash', catalogLabel: 'GLM-5.3 Flash', description: '智谱快速模型', provider: '智谱', providerKey: 'zhipu', inputModalities: ['text', 'image'] },
  { id: 'glm-5.3', label: 'GLM-5.3', catalogLabel: 'GLM-5.3', description: '智谱旗舰模型', provider: '智谱', providerKey: 'zhipu', inputModalities: ['text'] },
  { id: 'grok-4.6', label: 'Grok-4.6', catalogLabel: 'Grok-4.6', description: 'xAI 通用模型', provider: 'xAI', providerKey: 'xai', inputModalities: ['text', 'image'] },
  { id: 'grok-4.7', label: 'Grok-4.7', catalogLabel: 'Grok-4.7', description: 'xAI 最新通用模型', provider: 'xAI', providerKey: 'xai', inputModalities: ['text', 'image'] },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4.1 Flash', catalogLabel: 'DeepSeek V4 Flash', description: '当前渠道：DeepSeek V4 Flash · 快速推理与文档复核', provider: 'DeepSeek', providerKey: 'deepseek', inputModalities: ['text', 'image'] },
  { id: 'claude-opus-5', label: 'Claude Opus 5', catalogLabel: 'Claude Opus 5', description: 'Anthropic 旗舰模型', provider: 'Anthropic', providerKey: 'anthropic', inputModalities: ['text', 'image'] },
  { id: 'claude-opus-5.5', label: 'Claude Opus 5.5', catalogLabel: 'Claude Opus 5.5', description: 'Anthropic 复杂任务模型', provider: 'Anthropic', providerKey: 'anthropic', inputModalities: ['text', 'image'] },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', catalogLabel: 'Claude Sonnet 5', description: 'Anthropic 平衡型模型', provider: 'Anthropic', providerKey: 'anthropic', inputModalities: ['text', 'image'] },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', catalogLabel: 'Claude Fable 5.1', description: 'Anthropic 创作与表达模型', provider: 'Anthropic', providerKey: 'anthropic', inputModalities: ['text', 'image'] },
  { id: 'mimo-v2.6-pro', label: 'MiMo V2.6 Pro', catalogLabel: 'MiMo V2.6 Pro', description: '小米通用模型', provider: '小米', providerKey: 'xiaomi', inputModalities: ['text'] },
  { id: 'mimo-v2.6-flash', label: 'MiMo V2.6 Flash', catalogLabel: 'MiMo V2.6 Flash', description: '小米快速模型', provider: '小米', providerKey: 'xiaomi', inputModalities: ['text'] },
  { id: 'mimo-v2.6-pro-ultraspeed', label: 'MiMo V2.6 Pro Ultraspeed', catalogLabel: 'MiMo V2.6 Pro Ultraspeed', description: '小米高速模型', provider: '小米', providerKey: 'xiaomi', inputModalities: ['text'] },
  { id: 'qwen3.8-max', label: 'Qwen3.8 Max', catalogLabel: 'Qwen3.8 Max', description: '通义千问旗舰模型', provider: '通义千问', providerKey: 'qwen', inputModalities: ['text'] },
];

function providerFor(slug: string): Pick<XiaojiuModelOption, 'provider' | 'providerKey'> {
  if (slug.startsWith('gpt-')) return { provider: 'OpenAI', providerKey: 'openai' };
  if (slug.startsWith('grok-')) return { provider: 'xAI', providerKey: 'xai' };
  if (slug.startsWith('glm-')) return { provider: '智谱', providerKey: 'zhipu' };
  if (slug.startsWith('deepseek-')) return { provider: 'DeepSeek', providerKey: 'deepseek' };
  if (slug.startsWith('claude-')) return { provider: 'Anthropic', providerKey: 'anthropic' };
  if (slug.startsWith('mimo-')) return { provider: '小米', providerKey: 'xiaomi' };
  return { provider: '通义千问', providerKey: 'qwen' };
}

export function codexHomeDirectory() {
  return process.env.CODEX_HOME ?? resolve(homedir(), '.codex');
}

export function compatibleCodexCatalog(sourcePath: string) {
  const catalog = JSON.parse(readFileSync(sourcePath, 'utf8')) as Record<string, unknown>;
  const models = Array.isArray(catalog.models) ? catalog.models : [];
  for (const value of models) {
    if (!value || typeof value !== 'object') continue;
    const model = value as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(model, 'supports_reasoning_summaries'))
      model.supports_reasoning_summaries = false;
    if (!Object.prototype.hasOwnProperty.call(model, 'supports_parallel_tool_calls'))
      model.supports_parallel_tool_calls = false;
  }
  return catalog;
}

@Injectable()
export class XiaojiuModelsService {
  private readonly env = loadApiEnv();

  catalog(): XiaojiuModelCatalog {
    const configured = this.readConfiguredCatalog();
    const byId = new Map(fallbackModels.map(model => [model.id, model]));
    for (const model of configured) {
      const existing = byId.get(model.id);
      byId.set(model.id, {
        ...(existing ?? { id: model.id, label: model.label, catalogLabel: model.catalogLabel,
          description: model.description, ...providerFor(model.id), inputModalities: model.inputModalities }),
        catalogLabel: model.catalogLabel,
        description: model.description || existing?.description || model.catalogLabel,
        inputModalities: model.inputModalities.length ? model.inputModalities : existing?.inputModalities ?? ['text'],
      });
    }
    const models = [...byId.values()].map((model, index) => ({
      ...model,
      primary: primaryOrder.includes(model.id),
      default: model.id === this.env.XIAOJIU_CHAT_DEFAULT_MODEL,
    })).sort((a, b) => {
      const ai = primaryOrder.includes(a.id) ? primaryOrder.indexOf(a.id) : primaryOrder.length + fallbackModels.findIndex(x => x.id === a.id);
      const bi = primaryOrder.includes(b.id) ? primaryOrder.indexOf(b.id) : primaryOrder.length + fallbackModels.findIndex(x => x.id === b.id);
      return ai - bi;
    }) as XiaojiuModelOption[];
    return { defaultModel: this.env.XIAOJIU_CHAT_DEFAULT_MODEL, models };
  }

  resolve(modelId?: string) {
    const requested = modelId?.trim();
    const id = !requested || requested === 'auto' ? this.env.XIAOJIU_CHAT_DEFAULT_MODEL : requested;
    const model = this.catalog().models.find(item => item.id === id);
    if (!model) throw new BadRequestException('所选模型不在小九AI可用模型目录中');
    return model;
  }

  writeCompatibleCatalog(targetPath: string) {
    const catalogPath = this.catalogPath();
    if (!catalogPath) return null;
    writeFileSync(targetPath, JSON.stringify(compatibleCodexCatalog(catalogPath)));
    return 'model_catalog_json="' + targetPath.replace(/\\/g, '/') + '"';
  }

  private catalogPath() {
    if (process.env.XIAOJIU_MODEL_CATALOG && existsSync(process.env.XIAOJIU_MODEL_CATALOG))
      return process.env.XIAOJIU_MODEL_CATALOG;
    const configPath = resolve(codexHomeDirectory(), 'config.toml');
    if (!existsSync(configPath)) return null;
    const config = readFileSync(configPath, 'utf8');
    const match = config.match(/^\s*model_catalog_json\s*=\s*"([^"]+)"\s*$/m);
    return match?.[1] && existsSync(match[1]) ? match[1] : null;
  }

  private readConfiguredCatalog(): ModelSeed[] {
    const path = this.catalogPath();
    if (!path) return [];
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as { models?: CatalogModel[] };
      return (parsed.models ?? []).flatMap(value => {
        if (typeof value.slug !== 'string' || !value.slug.trim() || value.supported_in_api === false) return [];
        if (value.visibility === 'hide') return [];
        const slug = value.slug.trim(), catalogLabel = typeof value.display_name === 'string' && value.display_name.trim()
          ? value.display_name.trim() : slug;
        const description = typeof value.description === 'string' ? value.description.trim() : catalogLabel;
        const modalities = Array.isArray(value.input_modalities)
          ? value.input_modalities.filter((item): item is string => typeof item === 'string') : ['text'];
        return [{ id: slug, label: catalogLabel, catalogLabel, description, ...providerFor(slug),
          inputModalities: modalities.length ? modalities : ['text'] }];
      });
    } catch {
      return [];
    }
  }
}
