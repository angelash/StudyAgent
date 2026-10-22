const { createHash } = require('node:crypto');
const { mkdirSync, writeFileSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const evidencePath = join(root, 'doc/evidence/2026-10-22/xiaojiu-model-chat-runtime.json');

async function main() {
  const { XiaojiuModelsService } = require(join(root,
    'apps/api/dist/apps/api/src/modules/ai/xiaojiu-models.service.js'));
  const { XiaojiuChatService } = require(join(root,
    'apps/api/dist/apps/api/src/modules/ai/xiaojiu-chat.service.js'));
  const models = new XiaojiuModelsService();
  const service = new XiaojiuChatService(models);
  const started = Date.now();
  const result = await service.reply({
    modelId: 'deepseek-v4-flash',
    system: '你是学习助教。回答必须简短，只给出可执行的下一步，不给标准答案。',
    context: JSON.stringify({ evidenceIds: [], currentQuestion: null }),
    history: [],
    message: '学生还没有确认已学范围，下一步应该做什么？',
  });
  const evidence = {
    at: new Date().toISOString(),
    passed: Boolean(result.reply) && result.modelId === 'deepseek-v4-flash',
    requestedLabel: 'DeepSeek V4.1 Flash',
    modelId: result.modelId,
    modelName: result.modelName,
    replyCharacters: result.reply.length,
    replySha256: createHash('sha256').update(result.reply).digest('hex'),
    evidenceIds: result.evidenceIds,
    latencyMs: Date.now() - started,
    completedAt: new Date().toISOString(),
  };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ passed: evidence.passed, modelId: evidence.modelId,
    modelName: evidence.modelName, latencyMs: evidence.latencyMs }) + '\n');
  if (!evidence.passed) process.exitCode = 1;
}

main().catch(error => {
  const evidence = { at: new Date().toISOString(), passed: false,
    error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  console.error(evidence.error);
  process.exitCode = 1;
});
