import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));
vi.mock('./codex-command', () => ({ resolveCodexInvocation: (command: string) => ({ command, shell: false }) }));

import { XiaojiuChatService } from './xiaojiu-chat.service';
import { XiaojiuModelsService } from './xiaojiu-models.service';

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn(() => true);
}

describe('XiaojiuChatService', () => {
  const previousCatalog = process.env.XIAOJIU_MODEL_CATALOG;
  afterEach(() => {
    spawnMock.mockReset();
    if (previousCatalog === undefined) delete process.env.XIAOJIU_MODEL_CATALOG;
    else process.env.XIAOJIU_MODEL_CATALOG = previousCatalog;
  });

  it('runs the selected model through the current Xiaojiu CLI and validates evidence JSON', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-xiaojiu-chat-'));
    const catalogPath = join(directory, 'catalog.json');
    writeFileSync(catalogPath, JSON.stringify({ models: [
      { slug: 'claude-opus-5.5', display_name: 'Claude Opus 5.5', supported_in_api: true,
        input_modalities: ['text', 'image'] },
    ] }));
    process.env.XIAOJIU_MODEL_CATALOG = catalogPath;
    const child = new MockChildProcess();
    spawnMock.mockReturnValue(child);
    const service = new XiaojiuChatService(new XiaojiuModelsService());
    const promise = service.reply({
      modelId: 'claude-opus-5.5',
      system: '只依据证据回答。',
      context: JSON.stringify({ report: { summary: '已有证据' }, evidenceIds: ['evidence-1'] }),
      history: [], message: '下一步做什么？',
    });
    queueMicrotask(() => {
      child.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message',
        text: JSON.stringify({ reply: '先核对公开证据，再安排新题验证。', evidenceIds: ['evidence-1'] }) } }) + '\n');
      child.stdout.end(); child.stderr.end(); child.emit('close', 0);
    });
    try {
      const result = await promise;
      expect(result).toMatchObject({ modelId: 'claude-opus-5.5', modelName: 'Claude Opus 5.5',
        evidenceIds: ['evidence-1'] });
      const [command, args] = spawnMock.mock.calls[0] as [string, string[]];
      expect(command).toBe('codex');
      expect(args.slice(0, 7)).toEqual(['exec', '--ephemeral', '--json', '--sandbox', 'read-only',
        '--skip-git-repo-check', '--color']);
      expect(args.join(' ')).toContain('-m claude-opus-5.5');
      expect(args).not.toContain('--ignore-user-config');
      expect(args).toContain('--output-schema');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
