// One default-model synthetic teaching call; contains no family records or account identifiers.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..'); if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
process.env.XIAOJIU_CHAT_ENABLED = 'true'; require('reflect-metadata');
const { XiaojiuModelsService } = require('../../apps/api/dist/apps/api/src/modules/ai/xiaojiu-models.service.js');
const { XiaojiuChatService } = require('../../apps/api/dist/apps/api/src/modules/ai/xiaojiu-chat.service.js');
const { freezeSpeechTrack } = require('../../apps/api/dist/apps/api/src/modules/learning/classroom-presentation.js');
const { classroomBoardProgress } = require('@study-agent/contracts');
const candidates=[];
(async () => {
  const models = new XiaojiuModelsService(), model = models.resolve('auto'), started = Date.now();
  const chat=new XiaojiuChatService(models),structured=chat.structured.bind(chat);
  chat.structured=(input,schema,check,custom)=>structured(input,schema,value=>{candidates.push(value);return check(value);},custom);
  const value = await chat.reply({ modelId: model.id, classroomBoard: true, classroomPresentation: true,
    system: '你是课堂陪伴老师。只解释所给合成例子。请用表格比较平均分的两种情况，列名明确使用总量、份数、平均每份；给出一个平均每份的分式公式及自然语言含义。口语解释不能直接朗读LaTeX。表格行和公式的锚点分别引用口语解释里的唯一短语。不声称学生已掌握，不选择任何练习答案。',
    context: JSON.stringify({ title: '合成案例：平均分', objective: '比较总量相同而份数不同', teaching: [{ title: '两种分法', narration: '总量都是12颗珠子；第一种平均分给3组，第二种平均分给4组。' }] }),
    history: [], message: '请用对照表比较两种分法，保留总量、份数和平均每份三个维度，再写公式解释。' });
  const speech = freezeSpeechTrack(value.reply), board = value.board, table = board?.table, progress = board && classroomBoardProgress(board, speech);
  const headers = table?.headers.map(x => x.replace(/\s/g, '')) ?? [];
  const totalIndex = headers.indexOf('总量'), groupIndex = headers.indexOf('份数'), meanIndex = headers.indexOf('平均每份');
  const number = text => Number(String(text).match(/\d+(?:\.\d+)?/)?.[0]);
  const values = table?.rows.map(row => ({ total: number(row[totalIndex]), groups: number(row[groupIndex]), mean: number(row[meanIndex]) })) ?? [];
  const arithmetic = [totalIndex, groupIndex, meanIndex].every(x => x >= 0) && values.length === 2 && [3,4].every(groups => values.some(row => row.total === 12 && row.groups === groups && row.mean === 12 / groups));
  const passed = value.modelId === model.id && progress?.mode === 'verified' && arithmetic && Boolean(board?.formulas?.length);
  const report = { at: new Date().toISOString(), kind: 'live-default-model-synthetic-board', modelId: value.modelId, modelName: value.modelName,
    durationMs: Date.now() - started, passed, candidates, reply: value.reply, board, speech, checks: { frozenAnchors: progress?.mode === 'verified', syntheticComparisonArithmetic: arithmetic },
    limits: ['One synthetic default-model call, not all model/provider combinations.', 'The two rows are checked mechanically; general formula correctness, teacher approval and real learning effectiveness remain separate.', 'No live TTS or image generation in this receipt.'] };
  const target = path.resolve(root, process.argv[2] ?? 'doc/evidence/2026-10-25/classroom-board-live-default.json'); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed, modelId: value.modelId, durationMs: report.durationMs, tableRows: table?.rows.length, formulas: board?.formulas?.length, anchors: progress?.mode, arithmetic })); if (!passed) process.exitCode = 1;
})().catch(error => { const report={at:new Date().toISOString(),passed:false,kind:'live-default-model-synthetic-board-failed',candidates,error:String(error.message??'unknown error').slice(0,2000)};fs.writeFileSync(path.resolve(root,process.argv[2]??'doc/evidence/2026-10-25/classroom-board-live-default.json'),JSON.stringify(report,null,2)+'\n');console.error('Synthetic board check failed: '+report.error.slice(0,180));process.exitCode=1; });
