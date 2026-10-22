import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));
vi.mock('./codex-command', () => ({ resolveCodexInvocation: (command: string) => ({ command, shell: false }) }));
vi.mock('@study-agent/config', () => ({
  loadApiEnv: () => ({ CODEX_COMMAND: 'codex', CODEX_PDF_TIMEOUT_MS: 5000, CODEX_PDF_MODEL: 'deepseek-v4-flash' }),
}));

import { CodexPdfStructureService } from './codex-pdf-structure.service';
import { XiaojiuModelsService } from './xiaojiu-models.service';

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn(() => true);
}

describe('CodexPdfStructureService', () => {
  afterEach(() => {
    spawnMock.mockReset();
    delete process.env.CODEX_HOME;
  });

  it('uses the selected DeepSeek V4 Flash model with current CLI settings', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-codex-pdf-test-'));
    const catalog = join(directory, 'catalog.json');
    writeFileSync(catalog, JSON.stringify({ models: [{ slug: 'gpt-5.5', display_name: 'Current' }] }));
    writeFileSync(join(directory, 'config.toml'),
      'model = "gpt-5.5"\nmodel_provider = "jiuwork"\nmodel_catalog_json = "' + catalog.replace(/\\/g, '\\\\') + '"\n');
    process.env.CODEX_HOME = directory;
    const child = new MockChildProcess();
    spawnMock.mockReturnValue(child);
    const service = new CodexPdfStructureService(new XiaojiuModelsService());
    let prompt = '';
    child.stdin.on('data', chunk => { prompt += chunk.toString(); });
    const promise = service.structure({ materialTitle: '分数讲义', pages: [{
      pageNumber: 1, text: '1/2 + 1/3 = 5/6', method: 'ocr', lines: [
        { text: '1/2 + 1/3 = 5/6', confidence: 0.93 },
      ], imagePath: join(directory, 'page.png'), warnings: ['formula_structure_requires_review'],
    }] });
    queueMicrotask(() => {
      child.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify({
        pages: [{ pageNumber: 1, paragraphs: [{ text: '分数加法', confidence: 0.94 }],
          formulas: [{ latex: '\\frac{1}{2}+\\frac{1}{3}=\\frac{5}{6}', plainText: '1/2 + 1/3 = 5/6', confidence: 0.91 }],
          tables: [], warnings: ['review_against_source_page'] }],
      }) } }) + '\n');
      child.stdout.end(); child.stderr.end(); child.emit('close', 0);
    });
    try {
      const result = await promise;
      expect(result.pages[0].formulas[0].latex).toContain('\\frac{1}{2}');
      const [command, args] = spawnMock.mock.calls[0] as [string, string[]];
      expect(command).toBe('codex');
      expect(args).toContain('--ephemeral');
      expect(args).toContain('--sandbox');
      expect(args).toContain('read-only');
      expect(args).not.toContain('--ignore-user-config');
      expect(args.join(' ')).toContain('-m deepseek-v4-flash');
      expect(args.join(' ')).not.toContain('deepseek-v4.1-flash');
      expect(args).not.toContain('model_reasoning_effort');
      expect(args.join(' ')).toContain('model_catalog_json=');
      expect(prompt).toContain('不可信数据');
      expect(prompt).toContain('不得补写');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('retries once when the selected model returns an invalid structure', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-codex-pdf-retry-'));
    process.env.CODEX_HOME = directory;
    const first = new MockChildProcess(), second = new MockChildProcess();
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const service = new CodexPdfStructureService(new XiaojiuModelsService());
    const promise = service.structure({ materialTitle: 'Retry fixture', pages: [{
      pageNumber: 1, text: '1/2 + 1/3 = 5/6', method: 'ocr', lines: [], imagePath: '',
      warnings: ['formula_structure_requires_review'],
    }] });
    queueMicrotask(() => {
      first.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message',
        text: JSON.stringify({ pages: [{ pageNumber: 1 }] }) } }) + '\n');
      first.stdout.end(); first.stderr.end(); first.emit('close', 0);
    });
    setTimeout(() => {
      second.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message',
        text: JSON.stringify({ pages: [{ pageNumber: 1, paragraphs: [], formulas: [{
          latex: '\\frac{1}{2}+\\frac{1}{3}=\\frac{5}{6}', plainText: '1/2 + 1/3 = 5/6', confidence: 0.9,
        }], tables: [], warnings: [] }] }) } }) + '\n');
      second.stdout.end(); second.stderr.end(); second.emit('close', 0);
    }, 0);
    try {
      const result = await promise;
      expect(result.pages[0].formulas).toHaveLength(1);
      expect(spawnMock).toHaveBeenCalledTimes(2);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
