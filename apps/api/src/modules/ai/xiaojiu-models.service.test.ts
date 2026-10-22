import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { XiaojiuModelsService } from './xiaojiu-models.service';

describe('XiaojiuModelsService', () => {
  const previousCatalog = process.env.XIAOJIU_MODEL_CATALOG;
  afterEach(() => {
    if (previousCatalog === undefined) delete process.env.XIAOJIU_MODEL_CATALOG;
    else process.env.XIAOJIU_MODEL_CATALOG = previousCatalog;
  });

  it('merges the current Xiaojiu catalog with the complete tested fallback set', () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-xiaojiu-models-'));
    const path = join(directory, 'catalog.json');
    writeFileSync(path, JSON.stringify({ models: [
      { slug: 'deepseek-v4-flash', display_name: 'DeepSeek V4 Flash', description: 'DeepSeek V4 Flash',
        supported_in_api: true, input_modalities: ['text', 'image'] },
      { slug: 'disabled-model', display_name: 'Disabled', supported_in_api: false },
    ] }));
    process.env.XIAOJIU_MODEL_CATALOG = path;
    try {
      const service = new XiaojiuModelsService(), catalog = service.catalog();
      expect(catalog.models).toHaveLength(22);
      expect(catalog.models.find(model => model.id === 'deepseek-v4-flash')).toMatchObject({
        label: 'DeepSeek V4.1 Flash', catalogLabel: 'DeepSeek V4 Flash', provider: 'DeepSeek' });
      expect(catalog.models.some(model => model.id === 'claude-sonnet-5')).toBe(true);
      expect(catalog.models.some(model => model.id === 'disabled-model')).toBe(false);
      expect(service.resolve('claude-sonnet-5').label).toBe('Claude Sonnet 5');
      expect(() => service.resolve('arbitrary-model')).toThrow('不在小九AI可用模型目录');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
