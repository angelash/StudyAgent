import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  const previousEnabled = process.env.XIAOJIU_CHAT_ENABLED;
  beforeEach(() => { process.env.XIAOJIU_CHAT_ENABLED = 'true'; });
  afterEach(() => {
    spawnMock.mockReset();
    if (previousEnabled === undefined) delete process.env.XIAOJIU_CHAT_ENABLED;
    else process.env.XIAOJIU_CHAT_ENABLED = previousEnabled;
    if (previousCatalog === undefined) delete process.env.XIAOJIU_MODEL_CATALOG;
    else process.env.XIAOJIU_MODEL_CATALOG = previousCatalog;
  });

  const board = { title: '个人行动与社会条件', points: ['先比较岗位变化，再核查个人条件。'],
    diagram: { kind: 'flow', title: '可核查的分析路线', labels: ['观察处境', '比较条件', '核对证据'] } };

  function respondWith(payload: unknown) {
    spawnMock.mockImplementation(() => {
      const child = new MockChildProcess();
      child.stdin.on('finish', () => queueMicrotask(() => {
        child.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message',
          text: JSON.stringify(payload) } }) + '\n');
        child.stdout.end(); child.stderr.end(); child.emit('close', 0);
      }));
      return child;
    });
  }

  it('includes custom schema in the model prompt and retries with the missing field path', async () => {
    const prompts: string[] = [];
    const attempts: Array<{ attempt: number; status: string; failureKind?: string }> = [];
    spawnMock.mockImplementation(() => {
      const child = new MockChildProcess(); let prompt = '';
      child.stdin.on('data', chunk => { prompt += String(chunk); });
      child.stdin.on('finish', () => queueMicrotask(() => {
        prompts.push(prompt);
        const payload = prompts.length === 1 ? { title: 'Incomplete' } : { title: 'Complete', overview: 'From the supplied source' };
        child.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(payload) } }) + '\n');
        child.stdout.end(); child.stderr.end(); child.emit('close', 0);
      }));
      return child;
    });
    const { z } = await import('zod');
    const schema = { type: 'object', properties: { title: { type: 'string' }, overview: { type: 'string' } }, required: ['title', 'overview'], additionalProperties: false };
    const result = await new XiaojiuChatService(new XiaojiuModelsService()).structured({ modelId: 'deepseek-v4-flash',
      system: 'Create a source-backed course', context: '', history: [], message: 'Generate' }, schema,
      value => z.object({ title: z.string(), overview: z.string() }).strict().parse(value), true, event => attempts.push(event));
    expect(result.overview).toBe('From the supplied source');
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain('<输出schema>' + JSON.stringify(schema));
    expect(prompts[1]).toContain('"path":["overview"]');
    expect(prompts[0]).not.toContain('{"reply":string');
    expect(attempts.map(({ attempt, status, failureKind }) => ({ attempt, status, ...(failureKind ? { failureKind } : {}) }))).toEqual([
      { attempt: 1, status: 'started' }, { attempt: 1, status: 'failed', failureKind: 'invalid-output' },
      { attempt: 2, status: 'started' }, { attempt: 2, status: 'succeeded' },
    ]);
  });

  it.each(['context', 'history'] as const)('rejects excessive %s before starting a CLI or model request', async field => {
    const service = new XiaojiuChatService(new XiaojiuModelsService());
    const input = { modelId: 'deepseek-v4-flash', system: '只依据证据回答', context: '',
      history: [] as Array<{ role: 'user'; content: string }>, message: '检查条件' };
    if (field === 'context') input.context = '条'.repeat(18000) + '末尾公式不能丢失';
    else input.history = Array.from({ length: 11 }, (_, i) => ({ role: 'user', content: '第' + i + '个完整条件' }));
    await expect(service.reply(input)).rejects.toThrow(field === 'context' ? '原文不会被截断' : '消息不会被静默省略');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('sends the complete boundary-sized evidence and all ten selected history messages', async () => {
    respondWith({ reply: '完整条件均已核对', evidenceIds: [] });
    let prompt = '';
    const implementation = spawnMock.getMockImplementation()!;
    spawnMock.mockImplementation((...args: unknown[]) => {
      const child = implementation(...args); child.stdin.on('data', (chunk: Buffer) => { prompt += String(chunk); }); return child;
    });
    const tail = '末尾必要条件：x=\\frac{11}{13}，单位不能省略。';
    const context = '始'.repeat(18000 - tail.length) + tail;
    const history = Array.from({ length: 10 }, (_, i) => ({ role: 'user' as const, content: '完整消息' + i + '。' }));
    await new XiaojiuChatService(new XiaojiuModelsService()).reply({ modelId: 'deepseek-v4-flash',
      system: '检查边界', context, history, message: '根据原条件回答' });
    expect(prompt).toContain('<学习证据>' + context + '</学习证据>');
    expect(prompt).toContain('<历史>' + JSON.stringify(history) + '</历史>');
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the original successful result even if an internal observer fails', async () => {
    respondWith({ reply: '原结果保留', evidenceIds: [] });
    const result = await new XiaojiuChatService(new XiaojiuModelsService()).structured({ modelId: 'deepseek-v4-flash',
      system: '检查观察器隔离', context: '', history: [], message: '检查' }, {}, value => value as { reply: string }, true,
      () => { throw Error('diagnostic sink failed'); });
    expect(result.reply).toBe('原结果保留'); expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('retains validated classroom board and requests its structured output schema', async () => {
    respondWith({ reply: '从一个匿名社区的岗位变化开始核查。', evidenceIds: [], board });
    let schema: { required: string[] } | undefined;
    const implementation = spawnMock.getMockImplementation()!;
    spawnMock.mockImplementation((...args: unknown[]) => {
      const cliArgs = args[1] as string[];
      schema = JSON.parse(readFileSync(cliArgs[cliArgs.indexOf('--output-schema') + 1], 'utf8'));
      return implementation(...args);
    });
    const service = new XiaojiuChatService(new XiaojiuModelsService());
    const result = await service.reply({ modelId: 'deepseek-v4-flash', classroomBoard: true,
      system: '解释概念', context: '', history: [], message: '如何比较？' });
    expect(result.board).toEqual(board);
    expect(schema?.required).toContain('board');
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
  it('uses the richer board protocol only for the explicit presentation path', async () => {
    respondWith({ reply: '先固定总量。再比较份数。', evidenceIds: [], board: { title: '平均分', points: ['固定总量','比较份数'], diagram: null,
      table: null, formulas: [], anchors: { points: ['固定总量','比较份数'], tableRows: [], formulas: [] } } });
    const prompts: string[] = []; const implementation = spawnMock.getMockImplementation()!;
    spawnMock.mockImplementation((...args: unknown[]) => { const child = implementation(...args); child.stdin.on('data', (chunk: Buffer) => prompts.push(String(chunk))); return child; });
    const result = await new XiaojiuChatService(new XiaojiuModelsService()).reply({ modelId: 'deepseek-v4-flash', classroomBoard: true, classroomPresentation: true,
      system: '解释概念', context: '', history: [], message: '请比较。' });
    expect(prompts.join('')).toContain('<输出schema>'); expect(prompts.join('')).toContain('"headers"');
    expect(result.board?.reveal?.pointUnitIds).toHaveLength(2); expect(result.board).not.toHaveProperty('anchors'); expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...board, html: '<script>alert(1)</script>' },
    { ...board, diagram: { ...board.diagram, kind: 'script' } },
    { ...board, diagram: { ...board.diagram, labels: ['一', '二', '三', '四'] } },
  ])('rejects unsupported board fields or diagrams after a bounded retry', async invalidBoard => {
    respondWith({ reply: '补充说明', evidenceIds: [], board: invalidBoard });
    const service = new XiaojiuChatService(new XiaojiuModelsService());
    await expect(service.reply({ modelId: 'deepseek-v4-flash', classroomBoard: true,
      system: '', context: '', history: [], message: '继续' })).rejects.toThrow('连续两次');
    expect(spawnMock).toHaveBeenCalledTimes(2);
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
    child.stdin.once('finish', () => queueMicrotask(() => {
      child.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message',
        text: JSON.stringify({ reply: '先核对公开证据，再安排新题验证。', evidenceIds: ['evidence-1'] }) } }) + '\n');
      child.stdout.end(); child.stderr.end(); child.emit('close', 0);
    }));
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
      const options = spawnMock.mock.calls[0][2] as { cwd: string; env: NodeJS.ProcessEnv };
      expect(options.cwd).not.toBe(process.cwd());
      expect(options.cwd).toContain('empty-work');
      expect(options.env.MINIMAX_API_KEY).toBeUndefined();
      expect(args).toContain('features.shell_tool=false');
      expect(args).toContain('developer_instructions=""');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
