export type XiaojiuModelOption = {
  id: string;
  label: string;
  catalogLabel: string;
  description: string;
  provider: 'OpenAI' | 'xAI' | '智谱' | 'DeepSeek' | 'Anthropic' | '小米' | '通义千问';
  providerKey: 'openai' | 'xai' | 'zhipu' | 'deepseek' | 'anthropic' | 'xiaomi' | 'qwen';
  primary: boolean;
  default: boolean;
  inputModalities: string[];
};

export type XiaojiuModelCatalog = {
  defaultModel: string;
  models: XiaojiuModelOption[];
};
