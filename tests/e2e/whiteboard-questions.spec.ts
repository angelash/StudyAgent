import { test, expect, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { browserEvidence } from './evidence';
const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4172') + '/api';
test.afterEach(async ({ page }) => page.unrouteAll({ behavior: 'wait' }));
async function fixture(page: Page, speech = false, adult = false) {
  const hash = createHash('sha256').update(test.info().testId).digest(), address = '198.19.' + hash[0] + '.' + hash[1];
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address });
  const principal = 'whiteboard-question-' + randomUUID() + '@local.test', credential = 'Synthetic-questions-only-20261027';
  async function call(path: string, body: unknown, token?: string, method = 'POST') {
    const response = await fetch(api + path, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address,
      ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
    expect(response.ok, path + ' ' + response.status).toBe(true); return (await response.json()).data;
  }
  const actor = await call('/auth/register', { principal, credential });
  let child: string | null = null, board: any;
  if (adult) {
    const base = '/learning/studio/topic-whiteboards', input = { audience: { kind: 'adult' }, prompt: '匿名成人学习：观察与推断', objective: '分清观察事实与推断条件', modelId: 'deepseek-v4-flash' };
    const preflight = await call(base + '/preflight', input, actor.token), draft = await call(base + '/drafts', { ...input, preflightFingerprint: preflight.fingerprint, requestKey: randomUUID() }, actor.token);
    let view: any;
    await expect.poll(async () => { view = await call(base + '/drafts/' + draft.id, undefined, actor.token, 'GET'); return view.status; }, { timeout: 25000 }).toBe('ready');
    const saved = await call(base + '/drafts/' + draft.id + '/confirm', { expectedRevision: view.revision, contentFingerprint: view.contentFingerprint,
      acknowledgeAiGeneratedContent: true, acknowledgeUnreviewedChanges: false, requestKey: randomUUID() }, actor.token);
    board = await call(base + '/' + saved.whiteboardId, undefined, actor.token, 'GET'); expect(board.studentId).toBeNull();
  } else {
  child = (await call('/students', { nickname: '匿名插问验证', grade: 5, preferredSessionMinutes: 15,
    defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }, actor.token)).profile.id;
  await call('/students/' + child + '/learning-scope', { subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null, textbookVersion: '合成范围',
    learnedAtomIds: ['core:math:fractionadd'], currentAtomId: 'core:math:fractionadd', minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [] }, actor.token, 'PUT');
  const input = { studentId: child, subject: 'math', prompt: '解释异分母分数加法', atomId: 'core:math:fractionadd' };
  const preview = await call('/learning/studio/whiteboards/preview', input, actor.token), saved = await call('/learning/studio/whiteboards', { ...input, fingerprint: preview.fingerprint, requestKey: randomUUID() }, actor.token);
  board = await call('/qa/whiteboard-media', { boardId: saved.id }, actor.token);
  }
  if (speech) {
    await page.route('**/api/learning/studio/overview?*', async route => { const response=await route.fetch(),payload=await response.json();
      payload.data.narrationAvailable=true;payload.data.speech={available:true,provider:'minimax',defaultVoice:'fixture-a',voices:[{id:'fixture-a',label:'合成音色A'},{id:'fixture-b',label:'合成音色B'}]};await route.fulfill({response,json:payload}); });
    await page.addInitScript(()=>{const NativeAudio=window.Audio;(window as any).questionAudio=[];(window as any).Audio=function(src?:string){const audio=new NativeAudio(src);(window as any).questionAudio.push(audio);return audio;};});
  }
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  const href = adult ? '/studio/whiteboards?whiteboard=' + board.id : '/studio?student=' + child + '&subject=math&whiteboard=' + board.id; await page.goto(href);
  const player = page.getByRole('dialog', { name: '白板视频', exact: true }); await expect(player).toHaveAttribute('data-original-font-status', 'ready');
  const region = page.getByRole('region', { name: '原句提问', exact: true }), current = player.locator('.wb-current-sentence');
  if ((await page.viewportSize())!.width <= 900) await player.getByRole('button', { name: '讲稿与笔记', exact: true }).click();
  const inputBox = region.getByRole('textbox', { name: '向老师提问', exact: true }); await expect(inputBox).toBeEnabled();
  return { player, region, current, inputBox, href, actor, board, call };
}

test('whiteboard questions: selected model, exact sentence and pause bookmark survive a real queued answer and return', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 }); const f = await fixture(page), commands: any[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/questions')) commands.push(request.postDataJSON()); });
  await f.region.getByRole('combobox', { name: '选择大模型', exact: true }).selectOption('gpt-6-astra');
  const unit = await f.current.getAttribute('data-unit-id'); await f.player.getByRole('button', { name: '播放', exact: true }).click();
  await expect(f.player.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await f.inputBox.fill('为什么需要统一计数单位？'); await f.region.getByRole('button', { name: '发送', exact: true }).click();
  await expect(f.region.locator('.wb-question-answer')).toContainText('当前原句：'); await expect(f.player.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  expect(commands).toHaveLength(1); expect(commands[0]).toMatchObject({ modelId: 'gpt-6-astra', unitId: unit, intent: 'question' });
  expect(commands[0].bookmark.progress).toBeGreaterThanOrEqual(0); expect(commands[0].bookmark.progress).toBeLessThan(1);
  await f.player.getByRole('button', { name: '下一句', exact: true }).click(); await expect(f.current).not.toHaveAttribute('data-unit-id', unit!);
  await f.region.getByRole('button', { name: /回到这句/ }).click(); await expect(f.current).toHaveAttribute('data-unit-id', unit!);
  await expect(f.player.getByRole('button', { name: '播放', exact: true })).toBeVisible(); await expect(f.region.locator('.wb-question-meta')).toContainText('gpt-6-astra');
  writeFileSync(join(browserEvidence('whiteboard-questions'), 'original-sentence-command.json'), JSON.stringify({ commands, restoredUnit: unit }, null, 2));
});

test('supplementary board: explicit audio, whole structured items, real video/SRT and original camera restoration', async ({page})=>{
  const f=await fixture(page,true),writes:any[]=[];let audioRequests=0;
  page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/questions'))writes.push(request.postDataJSON());if(request.url().includes('/questions/')&&request.url().includes('/board/narration/'))audioRequests++;});
  for(let index=0;index<5;index++)await f.player.getByRole('button',{name:'放大白板',exact:true}).click();const originalCanvas=f.player.locator('canvas');
  await originalCanvas.focus();await page.keyboard.press('ArrowRight');
  await expect.poll(async()=>JSON.parse((await originalCanvas.getAttribute('data-frame-camera'))??'{}').follow).toBe(false);
  const pixels=()=>originalCanvas.evaluate(async element=>{const canvas=element as HTMLCanvasElement,bytes=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(value=>value.toString(16).padStart(2,'0')).join('');});
  const originalPixels=await pixels();
  await f.inputBox.fill('[question-structure] 请用表格与公式讲解。');await f.region.getByRole('button',{name:'发送',exact:true}).click();await expect(f.region.locator('.wb-question-answer')).toHaveCount(1);
  await f.region.getByRole('button',{name:'查看补充板书与声音',exact:true}).click();const lesson=page.getByRole('dialog',{name:'AI补充讲解',exact:true});await expect(lesson).toHaveAttribute('data-original-font-status','ready');
  expect(audioRequests).toBe(0);await expect(lesson.getByRole('region',{name:'原句提问',exact:true})).toHaveCount(0);const canvas=lesson.locator('canvas');
  const parts=()=>canvas.getAttribute('data-frame-parts');await expect.poll(parts).not.toContain('exhibit:0:row:1');await expect.poll(parts).toContain('question-answer:diagram');
  await lesson.getByRole('button',{name:'下一句',exact:true}).click();await expect.poll(parts).toContain('exhibit:0:row:1');await expect.poll(parts).not.toContain('exhibit:0:row:2');
  await lesson.getByRole('button',{name:'下一句',exact:true}).click();await expect.poll(parts).toContain('exhibit:0:row:2');await expect.poll(parts).not.toContain('exhibit:1:formula');
  await lesson.getByRole('button',{name:'下一句',exact:true}).click();await expect.poll(parts).toContain('exhibit:1:formula');await expect.poll(parts).not.toContain('exhibit:2:formula');
  await lesson.getByRole('button',{name:'下一句',exact:true}).click();await expect.poll(parts).toContain('exhibit:2:formula');
  await lesson.getByRole('button',{name:'播放',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).questionAudio.some((audio:HTMLAudioElement)=>!audio.paused&&audio.currentTime>0))).toBe(true);
  await lesson.getByRole('button',{name:'暂停',exact:true}).click();await lesson.getByRole('combobox',{name:'播放速度',exact:true}).selectOption('2');
  const videoPromise=page.waitForEvent('download');await lesson.getByRole('button',{name:'导出视频',exact:true}).click();const video=await videoPromise,videoPath=(await video.path())!;
  const probe=JSON.parse(execFileSync(process.env.STUDY_FFPROBE??'ffprobe',['-v','error','-show_format','-show_streams','-of','json',videoPath],{encoding:'utf8',windowsHide:true}));
  expect(probe.streams.some((stream:any)=>stream.codec_type==='audio')).toBe(true);expect(Math.abs(Number(probe.format.duration)-5.12)).toBeLessThan(.6);
  copyFileSync(videoPath,join(browserEvidence('whiteboard-questions'),'supplement-2x.webm'));writeFileSync(join(browserEvidence('whiteboard-questions'),'supplement-2x-probe.json'),JSON.stringify(probe,null,2));
  const srtPromise=page.waitForEvent('download');await lesson.getByRole('button',{name:'导出字幕',exact:true}).click();const srt=readFileSync((await(await srtPromise).path())!,'utf8');expect((srt.match(/ --> /g)??[]).length).toBe(5);expect(srt).toContain('最后解释根式公式');writeFileSync(join(browserEvidence('whiteboard-questions'),'supplement-2x.srt'),srt);
  await lesson.getByRole('button',{name:'返回原讲解',exact:true}).click();await expect(lesson).toHaveCount(0);await expect(f.player.getByRole('button',{name:'重置白板视图',exact:true})).toHaveText('150%');
  await expect.poll(pixels).toBe(originalPixels);expect(writes[0].bookmark.camera.follow).toBe(false);expect(writes[0].bookmark.camera.zoom).toBeCloseTo(1.5,8);
  expect(await page.evaluate(()=>(window as any).questionAudio.every((audio:HTMLAudioElement)=>audio.paused))).toBe(true);
});

test('supplementary board: a delayed authorized audio response cannot play after the original grant is revoked',async({page})=>{
  const f=await fixture(page,true);await f.inputBox.fill('迟到声音仍须复核原权限。');await f.region.getByRole('button',{name:'发送',exact:true}).click();await expect(f.region.locator('.wb-question-answer')).toHaveCount(1);
  await f.region.getByRole('button',{name:'查看补充板书与声音',exact:true}).click();const lesson=page.getByRole('dialog',{name:'AI补充讲解',exact:true});await expect(lesson).toHaveAttribute('data-original-font-status','ready');
  let reached=false,delivered=false,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/questions/*/board/narration/*',async route=>{const response=await route.fetch();reached=true;await gate;try{await route.fulfill({response});}catch{}finally{delivered=true;}});
  await lesson.getByRole('button',{name:'播放',exact:true}).click();await expect.poll(()=>reached).toBe(true);await f.call('/qa/whiteboard-media',{boardId:f.board.id,revoke:true},f.actor.token);release();
  await expect.poll(()=>delivered).toBe(true);await expect(lesson).toHaveCount(0);await expect(f.player).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).questionAudio.every((audio:HTMLAudioElement)=>audio.paused&&audio.currentTime===0))).toBe(true);
});

test('teaching notes: full JSON and Markdown include twelve saved answers while only the last history page is loaded',async({page})=>{
  const f=await fixture(page);
  for(let index=0;index<12;index++){await f.inputBox.fill('完整导出问题 '+index);await f.region.getByRole('button',{name:'发送',exact:true}).click();await expect(f.region.locator('.wb-question-answer')).toHaveCount(index+1);}
  await page.reload();await expect(f.region.locator('.wb-question-answer')).toHaveCount(2);await f.region.getByText('带走完整教学笔记',{exact:true}).click();
  const jsonPromise=page.waitForEvent('download');await f.region.getByRole('button',{name:'下载完整教学笔记 JSON',exact:true}).click();const notes=JSON.parse(readFileSync((await(await jsonPromise).path())!,'utf8'));
  expect(notes.turns).toHaveLength(12);expect(notes.turns[0].message).toBe('完整导出问题 0');expect(notes.turns[11].message).toBe('完整导出问题 11');expect(notes.original.fingerprint).toBe(f.board.fingerprint);
  const mdPromise=page.waitForEvent('download');await f.region.getByRole('button',{name:'下载完整教学笔记 Markdown',exact:true}).click();const markdown=readFileSync((await(await mdPromise).path())!,'utf8');expect(markdown).toContain('### 提问 12');expect(markdown).toContain('完整导出问题 0');expect(markdown).toContain('完整导出问题 11');
  writeFileSync(join(browserEvidence('whiteboard-questions'),'complete-notes.json'),JSON.stringify(notes,null,2));writeFileSync(join(browserEvidence('whiteboard-questions'),'complete-notes.md'),markdown);
});

test('teaching notes: closing the whiteboard discards a late full-note response',async({page})=>{
  const f=await fixture(page);let reached=false,delivered=false,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),downloads:string[]=[];page.on('download',download=>downloads.push(download.suggestedFilename()));
  await page.route('**/questions/notes',async route=>{const response=await route.fetch();reached=true;await gate;try{await route.fulfill({response});}catch{}finally{delivered=true;}});
  await f.region.getByText('带走完整教学笔记',{exact:true}).click();await f.region.getByRole('button',{name:'下载完整教学笔记 JSON',exact:true}).click();await expect.poll(()=>reached).toBe(true);
  await f.player.getByRole('button',{name:'关闭白板',exact:true}).click();await expect(f.player).toHaveCount(0);release();await expect.poll(()=>delivered).toBe(true);await page.waitForTimeout(250);expect(downloads).toEqual([]);
});

test('mobile draft: closing and reopening the reading layer preserves blocked-storage input without remounting the composer',async({page})=>{
  await page.setViewportSize({width:390,height:800});await page.addInitScript(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('studyagent.whiteboard.questions.v1.'))throw new DOMException('Blocked','QuotaExceededError');return set.call(this,key,value);};});
  const f=await fixture(page),message='手机未发送首部。'+ '完整条件。'.repeat(80)+'未发送尾部。';await f.inputBox.fill(message);await expect(f.region).toContainText('本机副本暂未保存');
  await page.getByRole('dialog',{name:'讲稿与笔记',exact:true}).getByRole('button',{name:'返回白板画面',exact:true}).click();await f.player.getByRole('button',{name:'讲稿与笔记',exact:true}).click();await expect(f.inputBox).toHaveValue(message);
});

for (const adult of [false, true]) test('supplementary private link: restores its actual answer and original sentence for ' + (adult ? 'an adult topic without a child' : 'a child guidance board'), async ({ page }) => {
  const f = await fixture(page, true, adult), originalUnit = await f.current.getAttribute('data-unit-id');
  await f.inputBox.fill('[question-structure] 请保留原句解释条件。'); await f.region.getByRole('button', { name: '发送', exact: true }).click();
  await expect(f.region.locator('.wb-question-answer')).toHaveCount(1); await f.region.getByRole('button', { name: '查看补充板书与声音', exact: true }).click();
  const lesson = page.getByRole('dialog', { name: 'AI补充讲解', exact: true }); await expect(lesson).toHaveAttribute('data-original-font-status', 'ready');
  await lesson.getByRole('button', { name: '分享与导出', exact: true }).click();
  const link = await lesson.getByRole('textbox', { name: '原白板私有链接', exact: true }).inputValue(), url = new URL(link);
  expect(url.searchParams.get('whiteboard')).toBe(f.board.id); expect(url.searchParams.get('question')).toBeTruthy();
  expect(url.pathname).toBe(adult ? '/studio/whiteboards' : '/studio'); expect(url.searchParams.has('token')).toBe(false);
  await page.goto(link); await expect(lesson).toHaveAttribute('data-original-font-status', 'ready');
  await expect(lesson.locator('.wb-current-sentence')).toHaveText('先确认计数单位。');
  expect(await page.evaluate(() => (window as any).questionAudio.every((audio: HTMLAudioElement) => audio.paused))).toBe(true);
  await lesson.getByRole('button', { name: '返回原讲解', exact: true }).click(); await expect(lesson).toHaveCount(0);
  await expect(f.current).toHaveAttribute('data-unit-id', originalUnit!); await expect(f.region.locator('.wb-question-answer')).toHaveCount(1);
  expect(await f.inputBox.inputValue()).toBe(''); await expect(f.player.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  await page.screenshot({ path: join(browserEvidence('whiteboard-questions'), 'supplement-return-' + (adult ? 'adult' : 'child') + '.png') });
});

test('supplementary close: a late authorized sentence stays silent while the original board remains open', async ({ page }) => {
  const f = await fixture(page, true); await f.inputBox.fill('关闭补充层后保留原讲解。'); await f.region.getByRole('button', { name: '发送', exact: true }).click();
  await expect(f.region.locator('.wb-question-answer')).toHaveCount(1); await f.region.getByRole('button', { name: '查看补充板书与声音', exact: true }).click();
  const lesson = page.getByRole('dialog', { name: 'AI补充讲解', exact: true }); await expect(lesson).toHaveAttribute('data-original-font-status', 'ready');
  let reached = false, delivered = false, release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/questions/*/board/narration/*', async route => { const response = await route.fetch(); reached = true; await gate; try { await route.fulfill({ response }); } catch {} finally { delivered = true; } });
  try {
    await lesson.getByRole('button', { name: '播放', exact: true }).click(); await expect.poll(() => reached).toBe(true);
    await lesson.getByRole('button', { name: '关闭白板', exact: true }).click(); await expect(lesson).toHaveCount(0); release(); await expect.poll(() => delivered).toBe(true);
    await expect(f.player).toBeVisible(); expect(await page.evaluate(() => (window as any).questionAudio.every((audio: HTMLAudioElement) => audio.paused && audio.currentTime === 0))).toBe(true);
    await expect(f.region.getByRole('button', { name: '查看补充板书与声音', exact: true })).toBeFocused();
  } finally { release(); }
});

test('whiteboard questions: five intentions produce distinct original commands and retain completed history', async ({ page }) => {
  const f = await fixture(page), intentions = ['question','example','simplify','prerequisite','compare'], commands: any[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/questions')) commands.push(request.postDataJSON()); });
  for (const [index, intent] of intentions.entries()) {
    await f.region.getByRole('combobox', { name: '讲解方式', exact: true }).selectOption(intent); await f.inputBox.fill('匿名讲解方式验证 ' + intent);
    await f.region.getByRole('button', { name: '发送', exact: true }).click(); await expect(f.region.locator('.wb-question-answer')).toHaveCount(index + 1);
  }
  expect(commands.map(command => command.intent)).toEqual(intentions); expect(new Set(commands.map(command => command.requestKey)).size).toBe(5);
  await page.reload(); await expect(f.region.locator('.wb-question-answer')).toHaveCount(5); await expect(f.inputBox).toHaveValue('');
});

test('whiteboard questions: a failed answer has an explicit original-model retry and preserves the next unsent question', async ({ page }) => {
  const f = await fixture(page); await f.region.getByRole('combobox', { name: '选择大模型', exact: true }).selectOption('deepseek-v4-flash');
  await f.inputBox.fill('[question-fail-once] 请解释相同单位。'); await f.region.getByRole('button', { name: '发送', exact: true }).click();
  await expect(f.region.getByRole('button', { name: '用原模型重试', exact: true })).toBeVisible();
  await f.region.getByRole('combobox', { name: '选择大模型', exact: true }).selectOption('gpt-6-astra'); await f.inputBox.fill('这是下一条未发送的完整问题，保留尾部。');
  await f.region.getByRole('button', { name: '用原模型重试', exact: true }).click(); await expect(f.region.locator('.wb-question-answer')).toHaveCount(1);
  await expect(f.region.locator('.wb-question-meta')).toContainText('deepseek-v4-flash'); await expect(f.inputBox).toHaveValue('这是下一条未发送的完整问题，保留尾部。');
});

test('whiteboard questions: cancelling running work blocks the late answer and the same original can be retried', async ({ page }) => {
  const f = await fixture(page); await f.inputBox.fill('[question-pause-once] 保留当前原句。'); await f.region.getByRole('button', { name: '发送', exact: true }).click();
  await expect(f.region.locator('.wb-question-meta')).toContainText('正在思考'); await f.region.getByRole('button', { name: '取消回答', exact: true }).click();
  await expect(f.region.locator('.wb-question-meta')).toContainText('已取消'); await expect(f.region.locator('.wb-question-answer')).toHaveCount(0);
  await f.region.getByRole('button', { name: '用原模型重试', exact: true }).click(); await expect(f.region.locator('.wb-question-answer')).toHaveCount(1);
});

test('whiteboard questions: a lost create response is recovered after reload without a second write', async ({ page }) => {
  const f = await fixture(page), commands: any[] = [];
  await page.route('**/api/learning/studio/whiteboards/*/questions', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    commands.push(route.request().postDataJSON()); const response = await route.fetch(); expect(response.status()).toBe(201); await route.abort('failed');
  });
  await f.inputBox.fill('原创建回执丢失仍保留全部内容。'); await f.region.getByRole('button', { name: '发送', exact: true }).click();
  await expect.poll(() => commands.length).toBe(1); await page.reload();
  await expect(f.region.locator('.wb-question-user')).toContainText('原创建回执丢失仍保留全部内容。');
  await expect(f.region.locator('.wb-question-answer')).toHaveCount(1); expect(commands).toHaveLength(1); await expect(f.inputBox).toHaveValue('');
});

test('whiteboard questions: unavailable local storage keeps the full input, protects closing and round trips the downloaded JSON', async ({ page }) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function(key) { if (key.startsWith('studyagent.whiteboard.questions.v1.')) throw new DOMException('Blocked', 'SecurityError'); return get.call(this,key); };
    Storage.prototype.setItem = function(key,value) { if (key.startsWith('studyagent.whiteboard.questions.v1.')) throw new DOMException('Blocked', 'QuotaExceededError'); return set.call(this,key,value); };
  });
  const f = await fixture(page), message = '完整输入首部。' + '条件与理由。'.repeat(180) + '完整输入尾部。';
  await f.inputBox.fill(message); await expect(f.region).toContainText('本机副本暂未保存'); await f.player.getByRole('button', { name: '关闭白板', exact: true }).click();
  await expect(f.player).toBeVisible(); await expect(f.inputBox).toHaveValue(message);
  const downloadPromise = page.waitForEvent('download'); await f.region.getByRole('button', { name: '下载完整提问副本', exact: true }).click(); const download = await downloadPromise;
  const bytes = readFileSync((await download.path())!); expect(JSON.parse(bytes.toString('utf8')).form.message).toBe(message);
  await f.player.getByRole('button', { name: '关闭白板', exact: true }).click(); await expect(f.player).toHaveCount(0);
  await page.goto(f.href); await expect(f.player).toHaveAttribute('data-original-font-status','ready'); await expect(f.inputBox).toBeEnabled();
  await f.region.getByLabel('导入完整提问副本', { exact: true }).setInputFiles({ name: 'original-question.json', mimeType: 'application/json', buffer: bytes });
  await expect(f.inputBox).toHaveValue(message);
});

test('whiteboard questions: duplicated documents keep separate full drafts across independent reloads', async ({ page, context }) => {
  const f = await fixture(page), second = await context.newPage(); await second.goto(f.href);
  const other = second.getByRole('region', { name: '原句提问', exact: true }).getByRole('textbox', { name: '向老师提问', exact: true }); await expect(other).toBeEnabled();
  await f.inputBox.fill('第一标签页的完整问题 A 尾部。'); await other.fill('第二标签页的完整问题 B 尾部。');
  await page.reload(); await expect(f.inputBox).toHaveValue('第一标签页的完整问题 A 尾部。');
  await second.reload(); await expect(other).toHaveValue('第二标签页的完整问题 B 尾部。'); await second.close();
});

for (const width of [390,768,1280]) test('whiteboard questions: the real composer, model selection and return controls remain usable at ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 }); const f = await fixture(page);
  await f.inputBox.fill('窄屏完整提问，回答后返回原句。'); await f.region.getByRole('button', { name: '发送', exact: true }).click();
  await expect(f.region.locator('.wb-question-answer')).toHaveCount(1);
  for (const control of [f.inputBox, f.region.getByRole('combobox', { name: '讲解方式', exact: true }), f.region.getByRole('combobox', { name: '选择大模型', exact: true }),
    f.region.getByRole('button', { name: '发送', exact: true })]) {
    const box = await control.boundingBox(); expect(box).not.toBeNull(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
  }
  await page.screenshot({ path: join(browserEvidence('whiteboard-questions'), 'question-panel-' + width + '.png') });
  await f.region.getByRole('button', { name: /回到这句/ }).click(); await expect(f.player.getByRole('button', { name: '播放', exact: true })).toBeVisible();
});

const questionFigureBase = '/learning/studio/whiteboard-question-visuals';
async function questionFigure(page: Page, f: Awaited<ReturnType<typeof fixture>>, requirements = '用两个圆与交集说明单位、条件和共同结论，保留全部中文标签。', generate = true) {
  await f.inputBox.fill('[question-structure] 请将完整条件、表格和公式讲清楚。');
  await f.region.getByRole('button', { name: '发送', exact: true }).click(); await expect(f.region.locator('.wb-question-answer')).toHaveCount(1);
  await f.region.getByRole('button', { name: '为这段讲解配图', exact: true }).click();
  const pane = page.getByRole('region', { name: '回答配图工作区', exact: true });
  await pane.getByRole('textbox', { name: '完整配图要求', exact: true }).fill(requirements);
  if (generate) {
    await pane.getByRole('button', { name: '预检完整配图提示', exact: true }).click();
    await expect(pane.getByRole('button', { name: '生成这段讲解的配图', exact: true })).toBeEnabled();
    await pane.getByRole('button', { name: '生成这段讲解的配图', exact: true }).click();
    await expect(pane.getByRole('button', { name: '下载实际原PNG', exact: true })).toBeEnabled({ timeout: 25000 });
  }
  return pane;
}

test('question figures: exact PNG adoption binds voice, video, private links, complete notes and original-version review', async ({ page }) => {
  const f = await fixture(page, true), pane = await questionFigure(page, f), commands: any[] = [], audio: any[] = [];
  page.on('request', request => { if (request.method() !== 'POST') return;
    if (request.url().endsWith(questionFigureBase + '/adopt')) commands.push(request.postDataJSON());
    if (request.url().includes('/questions/') && request.url().includes('/board/narration/')) audio.push(request.postDataJSON()); });
  const selected = pane.getByRole('region', { name: '所选回答图片', exact: true });
  await selected.getByRole('button', { name: '放大参考图：回答配图', exact: true }).click(); await expect(page.getByRole('dialog', { name: '回答配图', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭图片', exact: true }).click();
  const originalPromise = page.waitForEvent('download'); await pane.getByRole('button', { name: '下载实际原PNG', exact: true }).click();
  const original = readFileSync((await (await originalPromise).path())!); expect(original.subarray(0, 8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
  await selected.getByLabel('图片说明', { exact: true }).fill('单位与完整条件的交集，图中关系已经逐项核对。'); await selected.getByLabel('展示图注', { exact: true }).fill('先统一单位，再比较条件。');
  await expect(selected.getByRole('button', { name: '采用并打开这个讲解版本', exact: true })).toBeDisabled();
  await selected.getByRole('checkbox', { name: '我已核对图中文字、条件和关系', exact: true }).check();
  await selected.getByRole('button', { name: '采用并打开这个讲解版本', exact: true }).click();
  const lesson = page.getByRole('dialog', { name: 'AI补充讲解', exact: true }); await expect(lesson).toHaveAttribute('data-original-font-status', 'ready');
  expect(commands).toHaveLength(1); expect(commands[0].originalSha256).toBe(createHash('sha256').update(original).digest('hex'));
  await lesson.getByRole('button', { name: '分享与导出', exact: true }).click(); const link = await lesson.getByLabel('原白板私有链接', { exact: true }).inputValue();
  const versionId = new URL(link).searchParams.get('teachingVersion'); expect(versionId).toMatch(/^[a-f0-9-]{36}$/); await page.keyboard.press('Escape');
  await lesson.getByRole('button', { name: '播放', exact: true }).click(); await expect.poll(() => audio.length).toBeGreaterThan(0); expect(audio[0].teachingVersionId).toBe(versionId);
  await lesson.getByRole('button', { name: '暂停', exact: true }).click();
  await lesson.getByRole('combobox', { name: '播放速度', exact: true }).selectOption('2');
  const videoPromise = page.waitForEvent('download'); await lesson.getByRole('button', { name: '导出视频', exact: true }).click();
  const videoPath = (await (await videoPromise).path())!, probe = JSON.parse(execFileSync(process.env.STUDY_FFPROBE ?? 'ffprobe', ['-v','error','-show_format','-show_streams','-of','json',videoPath], { encoding: 'utf8', windowsHide: true }));
  expect(probe.streams.some((stream: any) => stream.codec_type === 'audio')).toBe(true); expect(audio.every(item => item.teachingVersionId === versionId)).toBe(true);
  copyFileSync(videoPath, join(browserEvidence('whiteboard-question-figures'), 'adopted-2x.webm'));
  await lesson.getByRole('button', { name: '返回原讲解', exact: true }).click(); await expect(lesson).toHaveCount(0);
  await f.region.getByText('带走完整教学笔记', { exact: true }).click(); const jsonPromise = page.waitForEvent('download');
  await f.region.getByRole('button', { name: '下载完整教学笔记 JSON', exact: true }).click(); const notes = JSON.parse(readFileSync((await (await jsonPromise).path())!, 'utf8'));
  expect(notes.turns[0].teachingVersions).toHaveLength(2); expect(notes.turns[0].teachingVersions.find((item: any) => item.current).id).toBe(versionId);
  const mdPromise = page.waitForEvent('download'); await f.region.getByRole('button', { name: '下载完整教学笔记 Markdown', exact: true }).click();
  const markdown = readFileSync((await (await mdPromise).path())!, 'utf8'); expect(markdown).toContain(versionId!); expect(markdown).toContain(commands[0].imageSha256); expect(markdown).not.toContain('sessionTokenHash');
  await f.region.getByRole('combobox', { name: '讲解版本', exact: true }).selectOption('original'); await f.region.getByRole('button', { name: '查看补充板书与声音', exact: true }).click();
  await expect(lesson).toHaveAttribute('data-original-font-status', 'ready'); await expect(lesson.locator('.tw-figure')).toHaveCount(0); await lesson.getByRole('button', { name: '返回原讲解', exact: true }).click();
  await page.goto(link); await expect(lesson).toHaveAttribute('data-original-font-status', 'ready');
  await expect(lesson.locator('.sa-whiteboard-frame > .tw-figure')).toHaveCount(1); await expect(lesson.locator('.sa-whiteboard-frame > .tw-figure')).toHaveAttribute('data-image-sha', commands[0].imageSha256);
  await page.screenshot({ path: join(browserEvidence('whiteboard-question-figures'), 'adopted-version.png') });
});

test('question figures: lost prepare and adoption receipts retain original commands through reload without duplicate images or versions', async ({ page }) => {
  const f = await fixture(page), pane = await questionFigure(page, f, '保留原请求的完整配图要求。', false); let prepareWrites = 0;
  await page.route('**/api/learning/studio/whiteboard-question-visuals', async route => {
    if (route.request().method() !== 'POST') return route.continue(); prepareWrites++; await route.fetch(); await route.abort('failed'); });
  await pane.getByRole('button', { name: '预检完整配图提示', exact: true }).click(); await expect(pane.getByRole('button', { name: '生成这段讲解的配图', exact: true })).toBeEnabled();
  await pane.getByRole('button', { name: '生成这段讲解的配图', exact: true }).click(); await expect(pane.getByRole('button', { name: '按原请求继续', exact: true })).toBeEnabled();
  await page.reload(); await f.region.getByRole('button', { name: '为这段讲解配图', exact: true }).click(); await expect(pane.getByRole('textbox', { name: '完整配图要求', exact: true })).toHaveValue('保留原请求的完整配图要求。');
  await pane.getByRole('button', { name: '按原请求继续', exact: true }).click(); await expect(pane.getByRole('button', { name: '下载实际原PNG', exact: true })).toBeEnabled(); expect(prepareWrites).toBe(1);
  let adoptionWrites = 0, first: any;
  await page.route('**/whiteboard-question-visuals/adopt', async route => { adoptionWrites++; const response = await route.fetch();
    if (adoptionWrites === 1) { first = (await response.json()).data; await route.abort('failed'); } else await route.fulfill({ response }); });
  await pane.getByLabel('图片说明', { exact: true }).fill('所有标签与条件已经核对。'); await pane.getByRole('checkbox', { name: '我已核对图中文字、条件和关系', exact: true }).check();
  await pane.getByRole('button', { name: '采用并打开这个讲解版本', exact: true }).click(); await expect(pane.getByRole('button', { name: '按原请求继续', exact: true })).toBeEnabled();
  await page.reload(); await f.region.getByRole('button', { name: '为这段讲解配图', exact: true }).click(); await pane.getByRole('button', { name: '按原请求继续', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'AI补充讲解', exact: true })).toHaveAttribute('data-original-font-status', 'ready'); expect(adoptionWrites).toBe(2);
  const versions = await f.call('/learning/studio/whiteboards/' + f.board.id + '/questions/' + first.board.turnId + '/teaching-versions', undefined, f.actor.token, 'GET');
  expect(versions).toHaveLength(2); expect(versions.find((item: any) => item.current).id).toBe(first.versionId);
});

test('question figures: original PNG editing and two explicit adoptions preserve both prior teaching versions', async ({ page }) => {
  const f = await fixture(page, false, true), pane = await questionFigure(page, f); const versions: string[] = [];
  for (let pass = 0; pass < 2; pass++) {
    if (pass) { await pane.getByRole('button', { name: '以这张原图继续修改', exact: true }).click(); await pane.getByLabel('具体修改说明', { exact: true }).fill('把交集标签加大，并保留两个原始圆圈。');
      await pane.getByRole('button', { name: '预检完整配图提示', exact: true }).click(); await expect(pane.getByRole('button', { name: '用原PNG生成修改图', exact: true })).toBeEnabled();
      await pane.getByRole('button', { name: '用原PNG生成修改图', exact: true }).click(); await expect(pane.getByRole('button', { name: '下载实际原PNG', exact: true })).toBeEnabled(); }
    await pane.getByLabel('图片说明', { exact: true }).fill('第' + pass + '幅已核对的关系图。'); await pane.getByRole('checkbox', { name: '我已核对图中文字、条件和关系', exact: true }).check();
    const responsePromise = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(questionFigureBase + '/adopt'));
    await pane.getByRole('button', { name: '采用并打开这个讲解版本', exact: true }).click(); const value = (await (await responsePromise).json()).data; versions.push(value.versionId);
    const lesson = page.getByRole('dialog', { name: 'AI补充讲解', exact: true }); await expect(lesson).toHaveAttribute('data-original-font-status', 'ready');
    await lesson.getByRole('button', { name: '返回原讲解', exact: true }).click();
  }
  expect(versions[0]).not.toBe(versions[1]); await expect(f.region.getByRole('combobox', { name: '讲解版本', exact: true }).locator('option')).toHaveCount(3);
  await f.region.getByRole('combobox', { name: '讲解版本', exact: true }).selectOption(versions[0]); await f.region.getByRole('button', { name: '查看补充板书与声音', exact: true }).click();
  const lesson = page.getByRole('dialog', { name: 'AI补充讲解', exact: true }); await expect(lesson).toHaveAttribute('data-original-font-status', 'ready');
  await lesson.getByRole('button', { name: '分享与导出', exact: true }).click(); expect(await lesson.getByLabel('原白板私有链接').inputValue()).toContain('teachingVersion=' + versions[0]);
});

test('question figures: explicit cancel and original retry keep the same image requirement and target', async ({ page }) => {
  const f = await fixture(page), pane = await questionFigure(page, f, '[image-pause-once] 完整条件与原图要求在重试后仍然保持。', false), commands: any[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith(questionFigureBase)) commands.push(request.postDataJSON()); });
  await pane.getByRole('button', { name: '预检完整配图提示', exact: true }).click(); await expect(pane.getByRole('button', { name: '生成这段讲解的配图', exact: true })).toBeEnabled();
  await pane.getByRole('button', { name: '生成这段讲解的配图', exact: true }).click(); await pane.getByRole('button', { name: '取消图片生成', exact: true }).click();
  await expect(pane.getByRole('button', { name: '按原要求重试图片', exact: true })).toBeEnabled({ timeout: 20000 }); await pane.getByRole('button', { name: '按原要求重试图片', exact: true }).click();
  await expect(pane.getByRole('button', { name: '下载实际原PNG', exact: true })).toBeEnabled({ timeout: 25000 }); expect(commands).toHaveLength(1);
  await expect(pane.getByRole('textbox', { name: '完整配图要求', exact: true })).toHaveValue(commands[0].requirements);
});

test('question figures: duplicated documents keep separate full inputs and a closed workbench discards late preflight', async ({ page, context }) => {
  const f = await fixture(page), pane = await questionFigure(page, f, '第一标签的完整条件 A 尾部。', false), second = await context.newPage(); await second.goto(f.href);
  await second.getByRole('button', { name: '为这段讲解配图', exact: true }).click(); const other = second.getByRole('region', { name: '回答配图工作区', exact: true });
  await other.getByRole('textbox', { name: '完整配图要求', exact: true }).fill('第二标签的完整条件 B 尾部。');
  await page.reload(); await f.region.getByRole('button', { name: '为这段讲解配图', exact: true }).click(); await expect(pane.getByRole('textbox', { name: '完整配图要求', exact: true })).toHaveValue('第一标签的完整条件 A 尾部。');
  await second.reload(); await second.getByRole('button', { name: '为这段讲解配图', exact: true }).click(); await expect(other.getByRole('textbox', { name: '完整配图要求', exact: true })).toHaveValue('第二标签的完整条件 B 尾部。'); await second.close();
  let reached = false, delivered = false, release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/whiteboard-question-visuals/preflight', async route => { const response = await route.fetch(); reached = true; await gate; try { await route.fulfill({ response }); } catch {} finally { delivered = true; } });
  await pane.getByRole('button', { name: '预检完整配图提示', exact: true }).click(); await expect.poll(() => reached).toBe(true); await pane.getByRole('button', { name: '关闭回答配图', exact: true }).click();
  release(); await expect.poll(() => delivered).toBe(true); await f.region.getByRole('button', { name: '为这段讲解配图', exact: true }).click(); await expect(pane.getByRole('button', { name: '生成这段讲解的配图', exact: true })).toBeDisabled();
});

for (const width of [390, 768, 1280]) test('question figures: full input, storage failure, download and import remain usable at ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 }); await page.addInitScript(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) {
    if (key.startsWith('studyagent.question-figures.v1.')) throw new DOMException('Blocked', 'QuotaExceededError'); return set.call(this, key, value); }; });
  const f = await fixture(page), requirements = '完整首部。' + '图示保留全部条件。'.repeat(100) + '完整尾部。', pane = await questionFigure(page, f, requirements, false);
  await pane.getByRole('button', { name: '关闭回答配图', exact: true }).click(); await expect(pane).toBeVisible(); await expect(pane.getByRole('textbox', { name: '完整配图要求', exact: true })).toHaveValue(requirements);
  if (width <= 900) await f.player.getByRole('button', { name: '返回白板画面', exact: true }).click();
  await f.player.getByRole('button', { name: '关闭白板', exact: true }).click(); await expect(f.player).toBeVisible();
  await expect(pane.getByRole('textbox', { name: '完整配图要求', exact: true })).toHaveValue(requirements); await expect(f.player).toContainText('完整输入或原请求尚未保存到本机');
  for (const control of [pane.getByRole('textbox', { name: '完整配图要求', exact: true }), pane.getByRole('button', { name: '预检完整配图提示', exact: true })]) {
    const box = await control.boundingBox(); expect(box).not.toBeNull(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
  }
  const promise = page.waitForEvent('download'); await pane.getByRole('button', { name: '下载完整配图副本', exact: true }).click(); const bytes = readFileSync((await (await promise).path())!);
  expect(JSON.parse(bytes.toString('utf8')).form.requirements).toBe(requirements); await pane.getByRole('button', { name: '关闭回答配图', exact: true }).click(); await expect(pane).toHaveCount(0);
  await f.region.getByRole('button', { name: '为这段讲解配图', exact: true }).click(); await pane.getByText('保留与恢复完整配图要求', { exact: true }).click();
  await pane.getByLabel('导入完整配图副本', { exact: true }).setInputFiles({ name: 'complete-figure-copy.json', mimeType: 'application/json', buffer: bytes });
  await expect(pane.getByRole('textbox', { name: '完整配图要求', exact: true })).toHaveValue(requirements);
  await page.screenshot({ path: join(browserEvidence('whiteboard-question-figures'), 'full-input-' + width + '.png') });
});

test('question figures: a stale second tab preserves its full requirements and rechecks the current adoption before choosing again', async ({ page, context }) => {
  const f = await fixture(page), pane = await questionFigure(page, f), second = await context.newPage(); await second.goto(f.href);
  await second.getByRole('button', { name: '为这段讲解配图', exact: true }).click();
  const other = second.getByRole('region', { name: '回答配图工作区', exact: true });
  await other.getByRole('textbox', { name: '完整配图要求', exact: true }).fill('第二标签保留的完整选择理由与条件尾部。');
  await other.getByLabel('这段讲解的图片候选', { exact: true }).getByRole('button').first().click();
  await expect(other.getByRole('button', { name: '下载实际原PNG', exact: true })).toBeEnabled();
  for (const target of [pane, other]) { await target.getByLabel('图片说明', { exact: true }).fill('已核对相同原PNG与全部标签。'); await target.getByRole('checkbox', { name: '我已核对图中文字、条件和关系', exact: true }).check(); }
  const responsePromise = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(questionFigureBase + '/adopt'));
  await pane.getByRole('button', { name: '采用并打开这个讲解版本', exact: true }).click(); const first = (await (await responsePromise).json()).data;
  await other.getByRole('button', { name: '采用并打开这个讲解版本', exact: true }).click();
  await expect(other).toContainText('当前采用版本已变化'); await expect(other.getByRole('textbox', { name: '完整配图要求', exact: true })).toHaveValue('第二标签保留的完整选择理由与条件尾部。');
  await expect(other.getByRole('button', { name: '重新读取原回答范围', exact: true })).toBeVisible();
  const versions = await f.call('/learning/studio/whiteboards/' + f.board.id + '/questions/' + first.board.turnId + '/teaching-versions', undefined, f.actor.token, 'GET');
  expect(versions).toHaveLength(2); expect(versions.find((item: any) => item.current).id).toBe(first.versionId);
  await other.getByRole('button', { name: '重新读取原回答范围', exact: true }).click(); await expect(other).toContainText('当前采用图片：');
  await expect(other.getByRole('checkbox', { name: '我已核对图中文字、条件和关系', exact: true })).not.toBeChecked(); await second.close();
});

for (const width of [390, 768]) test('question figures: mobile adopted image layers contain keyboard focus and return to the actual original control at ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 }); const f = await fixture(page), pane = await questionFigure(page, f);
  const open = pane.getByRole('button', { name: '放大参考图：回答配图', exact: true }); await open.click();
  const reader = page.getByRole('dialog', { name: '回答配图', exact: true }); await expect(reader).toBeVisible();
  await page.screenshot({ path: join(browserEvidence('whiteboard-question-figures'), 'image-reader-' + width + '.png') });
  await reader.getByRole('button', { name: '关闭图片', exact: true }).click(); await expect(open).toBeFocused();
  await pane.getByLabel('图片说明', { exact: true }).fill('窄屏核对过的完整标签与关系。'); await pane.getByRole('checkbox', { name: '我已核对图中文字、条件和关系', exact: true }).check();
  const adopt = pane.getByRole('button', { name: '采用并打开这个讲解版本', exact: true }); await adopt.click();
  const lesson = page.getByRole('dialog', { name: 'AI补充讲解', exact: true }); await expect(lesson).toHaveAttribute('data-original-font-status', 'ready');
  const imageButton = lesson.locator('.sa-whiteboard-frame .tw-figure-open'); await expect(imageButton).toBeVisible();
  const imageButtonBox = await imageButton.boundingBox(); expect(imageButtonBox!.width).toBeLessThanOrEqual(36); expect(imageButtonBox!.height).toBeLessThanOrEqual(36);
  await lesson.getByRole('button', { name: '关闭白板', exact: true }).focus(); await page.keyboard.press('Tab');
  await page.screenshot({ path: join(browserEvidence('whiteboard-question-figures'), 'adopted-mobile-' + width + '.png') });
  expect(await lesson.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape'); await expect(lesson).toHaveCount(0); await expect(pane).toBeVisible(); await expect(adopt).toBeFocused();
  await expect(pane.getByRole('textbox', { name: '完整配图要求', exact: true })).not.toHaveValue('');
});
