// One live default-model call with synthetic teaching evidence. Never uses family records.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..');
if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
process.env.XIAOJIU_CHAT_ENABLED = 'true';
require('reflect-metadata');
const { XiaojiuModelsService } = require('../../apps/api/dist/apps/api/src/modules/ai/xiaojiu-models.service.js');
const { XiaojiuChatService } = require('../../apps/api/dist/apps/api/src/modules/ai/xiaojiu-chat.service.js');
const { freezeSpeechTrack } = require('../../apps/api/dist/apps/api/src/modules/learning/classroom-presentation.js');
(async () => {
  const models = new XiaojiuModelsService(), selected = models.resolve('auto'), started = Date.now();
  const response = await new XiaojiuChatService(models).reply({ modelId: selected.id, classroomBoard: true,
    system: '你是课堂陪伴老师。围绕当前知识点梳理先修基础；没有已审核先修资料时明确标为讲解建议。不声称已测出学生根因或掌握情况，不提供选择题答案。板书只提炼关键点。',
    context: JSON.stringify({ title: '合成教学案例：平均数', objective: '理解总量与份数的关系', intent: 'prerequisite',
      teaching: [{ title: '平均分', narration: '把12颗珠子平均分给3个小组，每组4颗。总量除以份数可以求平均每份。' }] }),
    history: [], message: '理解平均数之前我需要会什么？请标明只是讲解建议，再给我一个小问题检查。' });
  const speech = freezeSpeechTrack(response.reply);
  const result = { at: new Date().toISOString(), kind: 'live-default-model-synthetic-classroom-call', modelId: response.modelId,
    modelName: response.modelName, durationMs: Date.now() - started, reply: response.reply, board: response.board, speechUnits: speech.units,
    passed: response.modelId === selected.id && Boolean(response.board?.points.length) && speech.units.length > 0,
    limits: ['One live synthetic default-model call; other models are outside this receipt.', 'No live TTS or image generation in this check.', 'Pedagogical effectiveness and teacher approval remain pending.'] };
  const target = path.resolve(root, process.argv[2] ?? 'doc/evidence/2026-10-25/classroom-turn-live-default.json');
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed: result.passed, modelId: result.modelId, speechUnits: speech.units.length, boardPoints: response.board?.points.length, durationMs: result.durationMs }));
  if (!result.passed) process.exitCode = 1;
})().catch(error => { console.error('Synthetic classroom model check failed: ' + (error.message ?? 'unknown error').slice(0, 180)); process.exitCode = 1; });
