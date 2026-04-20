import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

vi.mock('@study-agent/config', () => ({
  loadApiEnv: () => ({
    API_PORT: 4000,
    PORT: 4000,
    DATABASE_URL: 'postgresql://user:password@localhost:5432/study_agent',
    OPENAI_API_KEY: undefined,
    OPENAI_BASE_URL: 'http://localhost:43111/v1',
    OPENAI_MODEL: '5.3-proxy',
    CODEX_COMMAND: 'codex',
    CODEX_MODEL: undefined,
    CODEX_TIMEOUT_MS: 5000,
    JWT_SECRET: 'study-agent-dev-secret',
    TEXTBOOK_BASE_PATH: 'E:\\ChinaTextbook',
  }),
}));

import { CodexSearchService } from './codex-search.service';

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn(() => true);
}

describe('CodexSearchService', () => {
  afterEach(() => {
    spawnMock.mockReset();
  });

  it('launches codex search with plugin disable and low reasoning defaults', async () => {
    const child = new MockChildProcess();
    spawnMock.mockReturnValue(child);
    const service = new CodexSearchService();

    const promise = service.search('小学数学学生学习辅导 训练任务 这道题先做哪一步？');

    queueMicrotask(() => {
      child.stdout.write('{"type":"thread.started","thread_id":"thread-123"}\n');
      child.stdout.write(
        '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"answer\\":\\"先读题并圈出关键信息。\\",\\"results\\":[]}"}}\n',
      );
      child.stdout.end();
      child.stderr.end();
      child.emit('close', 0);
    });

    const result = await promise;

    expect(result.answer).toBe('先读题并圈出关键信息。');

    const [command, args] = spawnMock.mock.calls[0] as [string, string[]];
    expect(command).toBe('codex');
    expect(args).toContain('--search');
    expect(args).toContain('exec');
    expect(args).toContain('--disable');
    expect(args).toContain('plugins');
    expect(args).toContain('-c');
    expect(args).toContain('model_reasoning_effort="low"');
    expect(args).toContain('model_verbosity="low"');
  });
});
