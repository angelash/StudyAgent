export type XiaojiuTextCheckReason = 'not-checked' | 'report-unavailable' | 'report-invalid' |
  'catalog-changed' | 'connection-changed' | 'request-failed';

export type XiaojiuTextCheck = {
  status: 'unknown' | 'passed' | 'failed';
  checkedAt: string | null;
  expiresAt: string | null;
  historical: boolean;
  reason: XiaojiuTextCheckReason | null;
};

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
  textCheck?: XiaojiuTextCheck;
};

export type XiaojiuModelCatalog = {
  defaultModel: string;
  models: XiaojiuModelOption[];
  textCheck?: {
    scope: 'anonymous-text-json';
    receiptFingerprint: string | null;
    completedAt: string | null;
    passed: number;
    failed: number;
    unknown: number;
    allModelsPassed: boolean | null;
    reason: XiaojiuTextCheckReason | null;
  };
};
