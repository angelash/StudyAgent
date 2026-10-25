import { browserEvidence } from './evidence';
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const apiUrl = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}`;
const evidenceDirectory = browserEvidence('classroom');
async function login(page: import('@playwright/test').Page) {
  const suffix = Date.now() + '-' + Math.floor(Math.random() * 100000), principal = 'classroom-' + suffix + '@local.test', credential = 'Classroom-' + suffix;
  const registered = await fetch(apiUrl + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ principal, credential }) });
  expect(registered.status).toBe(201);
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
}

function wav(seconds = 0.6) {
  const samples = Math.floor(seconds * 16000), bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8); bytes.write('fmt ', 12);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(16000, 24);
  bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(800 * Math.sin(i * 2 * Math.PI * 440 / 16000)), 44 + i * 2);
  return bytes;
}

test('course classroom supports teaching, executable examples, learning checks and durable resume', async ({ page }) => {
  test.setTimeout(120000); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 }); await login(page); await page.goto('/studio/classroom');
  await expect(page.getByRole('heading', { name: '社会学概论', exact: true })).toBeVisible();
  await expect(page.locator('.cl-unit-nav button')).toHaveCount(5); await expect(page.locator('.cl-lecture')).toHaveCount(5);
  if (!process.env.CI) { mkdirSync(evidenceDirectory, { recursive: true }); await page.screenshot({ path: evidenceDirectory + '/classroom-course.png', fullPage: true }); }
  await page.getByRole('button', { name: '▶ 学习', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: '课堂新手引导' })).toBeVisible(); await page.getByRole('button', { name: '跳过', exact: true }).click();
  await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
  await expect(page.getByRole('img', { name: '个人处境与社会条件的交汇' })).toBeVisible();
  await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
  await expect(page.getByLabel('实验代码')).toBeVisible(); await page.getByRole('button', { name: '▶ 运行代码' }).click();
  await expect(page.getByRole('log', { name: '代码运行结果' })).toContainText('甲地区: 20.0%');
  await page.getByLabel('实验代码').fill('console.log(typeof document); console.log(typeof window);');
  await page.getByRole('button', { name: '▶ 运行代码' }).click(); await expect(page.getByRole('log')).toContainText('undefined');
  await page.getByLabel('实验代码').fill('while (true) {}'); await page.getByRole('button', { name: '▶ 运行代码' }).click();
  await expect(page.getByRole('log')).toContainText('运行超过 2 秒');
  await page.getByLabel('实验代码').fill('fetch("https://example.com").catch(() => console.log("network-blocked"));');
  await page.getByRole('button', { name: '▶ 运行代码' }).click();
  await expect(page.getByRole('log')).toContainText(/运行完成|network-blocked/);
  if (!process.env.CI) await page.screenshot({ path: evidenceDirectory + '/classroom-board.png', fullPage: true });
  await page.getByRole('button', { name: '课堂设置', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '课堂设置' })).toBeVisible(); await page.getByRole('button', { name: '1.5×', exact: true }).click();
  await page.getByRole('switch', { name: /Background dots/ }).click();
  if (!process.env.CI) await page.screenshot({ path: evidenceDirectory + '/classroom-settings.png', fullPage: true });
  await page.getByRole('button', { name: '关闭课堂设置' }).click();
  await page.getByRole('tab', { name: '课堂练习' }).click(); await page.locator('.cl-practice-options input[type=radio]').first().check();
  await page.getByRole('button', { name: '先给我一个提示' }).click(); await page.getByRole('button', { name: 'Check →' }).click();
  await expect(page.locator('.cl-answer-feedback')).toContainText('使用过提示');
  const receipt = await page.locator('.cl-answer-feedback').innerText();
  await page.getByRole('tab', { name: '单元项目' }).click(); await page.getByLabel('我的项目草稿').fill('匿名案例：社区图书馆如何组织排队。需要核查不同规则与资源条件。');
  await page.getByRole('button', { name: '保存项目草稿' }).click(); await expect(page.getByText('草稿已保存，重新打开仍可继续。')).toBeVisible();
  await page.reload(); await expect(page.getByText('2 / 8', { exact: true })).toHaveCount(0);
  await expect(page.locator('.cl-session-navigation')).toContainText('3 / 8');
  await page.getByRole('tab', { name: '课堂练习' }).click(); await page.getByRole('button', { name: '第1题', exact: true }).click(); await expect(page.locator('.cl-answer-feedback')).toHaveText(receipt, { useInnerText: true });
  await page.getByRole('tab', { name: '单元项目' }).click(); await expect(page.getByLabel('我的项目草稿')).toHaveValue(/社区图书馆/);
  const notes = page.waitForEvent('download'); await page.getByRole('button', { name: '导出课堂笔记' }).click(); expect((await notes).suggestedFilename()).toMatch(/\.md$/);
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: '对话与练习', exact: true }).click();
  await expect(page.getByLabel('我的项目草稿')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: '白板', exact: true }).click();
  if (!process.env.CI) await page.screenshot({ path: evidenceDirectory + '/classroom-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '离开课堂', exact: true }).click(); await page.getByRole('button', { name: '保存并离开' }).click();
  await expect(page.getByRole('heading', { name: '社会学概论', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('audio playback ends drive teaching progress and pause prevents later automatic advancement', async ({ page }) => {
  test.setTimeout(90000); await login(page);
  await page.addInitScript(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  const withTestAudio = async (route: import('@playwright/test').Route) => {
    const response = await route.fetch(), body = await response.json();
    body.data.speech = { available: true, provider: 'minimax', defaultVoice: 'fixture', voices: [{ id: 'fixture', label: '合成测试音轨' }] };
    await route.fulfill({ response, json: body });
  };
  await page.route('**/api/learning/classroom/sessions', withTestAudio);
  await page.route('**/api/learning/classroom/sessions/*', withTestAudio);
  let audioRequests = 0;
  await page.route('**/api/learning/classroom/sessions/*/narration/*', async route => { audioRequests++; await route.fulfill({ contentType: 'audio/wav', body: wav() }); });
  await page.goto('/studio/classroom?lesson=soc-1-1-1'); await expect(page.getByRole('button', { name: '▶ 开始学习' })).toBeVisible();
  await page.getByRole('button', { name: '▶ 开始学习' }).click(); await expect(page.locator('.cl-session-navigation')).not.toContainText('1 / 8');
  await page.getByRole('button', { name: '暂停讲解' }).click();
  await expect(page.getByRole('button', { name: '继续讲解' })).toBeVisible();
  const cursor = await page.locator('.cl-session-navigation').innerText();
  await page.waitForTimeout(1200); expect(await page.locator('.cl-session-navigation').innerText()).toBe(cursor);
  expect(audioRequests).toBeGreaterThan(0);
  for (let step = 0; step < 8; step++) {
    const before = await page.locator('.cl-session-navigation').innerText(); if (before.includes('7 / 8')) break;
    await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
    await expect(page.locator('.cl-session-navigation')).not.toHaveText(before, { useInnerText: true });
  }
  await page.getByRole('button', { name: '继续讲解' }).click();
  await expect(page.getByRole('tab', { name: '课堂练习' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: '继续讲解' })).toBeVisible();
  await expect(page.locator('.cl-session-navigation')).toContainText('7 / 8');
  await page.locator('.cl-practice-options input[type=radio]').first().check(); await page.getByRole('button', { name: 'Check →' }).click();
  await expect(page.locator('.cl-answer-feedback')).toBeVisible();
  await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
  await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '课堂学习里程碑' })).toBeVisible();
});

test('question replies add safe board notes with page links, export and restored session rendering', async ({ page }) => {
  test.setTimeout(90000); await page.setViewportSize({ width: 1552, height: 1199 }); await login(page);
  await page.addInitScript(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  const board = { title: '把困惑拆成可核查的问题', points: ['比较不同条件，再找相同处境中的反例。', '<img src=x onerror="window.boardExecuted=true">'],
    page: 0, diagram: { kind: 'flow', title: '核查路线', labels: ['观察处境', '比较条件', '寻找反例'] } };
  let messages: unknown[] | undefined;
  const withBoardNotes = async (route: import('@playwright/test').Route) => {
    const response = await route.fetch(), body = await response.json();
    if (messages) body.data.messages = messages;
    await route.fulfill({ response, json: body });
  };
  await page.route('**/api/learning/classroom/sessions', withBoardNotes);
  await page.route('**/api/learning/classroom/sessions/*', withBoardNotes);
  await page.route('**/api/learning/classroom/sessions/*/turns', async route => {
    if(route.request().method()!=='POST'){await route.fallback();return;}
    const response = await route.fetch({ method: 'GET', url: route.request().url().replace(/\/turns$/, '') });
    const body = await response.json(), at = new Date().toISOString();
    messages = [{ id: 'question-fixture', role: 'user', content: route.request().postDataJSON().message, at },
      { id: 'answer-fixture', role: 'assistant', content: '先比较情境中的条件，再寻找能否排除其他解释的证据。', at, modelName: '课堂测试模型', board }];
    const input=route.request().postDataJSON(),session=body.data,step=session.lesson.steps[session.cursor];
    await route.fulfill({ status: 201, json: {data:{id:'turn-fixture',sessionId:session.id,requestKey:input.requestKey,message:input.message,intent:input.intent,modelId:input.modelId,modelName:'课堂测试模型',status:'completed',revision:1,createdAt:at,updatedAt:at,assistantMessageId:'answer-fixture',position:{...input,cursor:session.cursor,stepTitle:step.title,sentenceText:session.presentation.tracks[step.id].units[session.sentenceCursor??0].text},task:{state:'succeeded',version:2,generation:1,errorCode:null}}} });
  });
  await page.goto('/studio/classroom?lesson=soc-1-1-1');
  await page.getByLabel('向课堂老师提问').fill('如何把解释变成可验证的问题？');
  await page.getByRole('button', { name: '发送课堂问题' }).click();
  await expect(page.locator('.cl-ai-board')).toContainText(board.title);
  await expect(page.locator('.cl-ai-board')).toContainText(board.points[1]);
  await expect(page.locator('.cl-ai-board img')).toHaveCount(0);
  await expect(page.locator('.cl-ai-board').getByRole('img', { name: '核查路线' })).toBeVisible();
  for (let index = 0; index < 3; index++) {
    await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
    await expect(page.locator('.cl-session-navigation')).toContainText((index + 2) + ' / 8');
  }
  await expect(page.locator('.cl-ai-board')).toHaveCount(0);
  await page.getByRole('button', { name: '♧ ' + board.title, exact: true }).click();
  await expect(page.locator('.cl-ai-board')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '♧ ' + board.title, exact: true }).click();
  await expect(page.locator('.cl-ai-board')).toContainText(board.points[0]);
  await expect(page.locator('.cl-print-notes')).toContainText(board.title);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出课堂笔记' }).click();
  const stream = await (await download).createReadStream(); let markdown = '';
  for await (const chunk of stream!) markdown += chunk.toString();
  expect(markdown).toContain('### ' + board.title); expect(markdown).toContain('核查路线：观察处境 / 比较条件 / 寻找反例');
  if (!process.env.CI) {
    board.points[1] = '用新的匿名情境检验解释，保留反例。'; await page.reload();
    await page.getByRole('button', { name: '♧ ' + board.title, exact: true }).click();
    await expect(page.locator('.cl-ai-board')).toContainText(board.points[1]);
    await expect(page.locator('.cl-ai-board')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: evidenceDirectory + '/classroom-ai-board.png', fullPage: true });
  }
});

test('board notes reveal whole items and subtitle advances only at spoken sentence boundaries', async ({ page }) => {
  test.setTimeout(60000); await login(page);
  await page.addInitScript(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  const withSpeech = async (route: import('@playwright/test').Route) => {
    const response = await route.fetch(), body = await response.json();
    body.data.speech = { available: true, provider: 'minimax', defaultVoice: 'fixture', voices: [{ id: 'fixture', label: '测试音轨' }] };
    await route.fulfill({ response, json: body });
  };
  await page.route('**/api/learning/classroom/sessions', withSpeech);
  await page.route('**/api/learning/classroom/sessions/*', withSpeech);
  const requested: number[] = [];
  await page.route('**/api/learning/classroom/sessions/*/narration/*', async route => {
    requested.push(route.request().postDataJSON().sentenceIndex);
    await route.fulfill({ contentType: 'audio/wav', body: wav(3) });
  });
  await page.goto('/studio/classroom?lesson=soc-1-1-1');
  await page.getByRole('button', { name: '▶ 开始学习' }).click();
  await expect(page.locator('.cl-subtitle')).toHaveText('今天一起研究“社会学想象力”。');
  await expect(page.locator('.cl-board-area .cl-board-points li')).toHaveCount(1);
  await expect(page.locator('.cl-board-area .cl-board-points li')).toHaveText('概念是什么？');
  await page.waitForTimeout(600);
  await expect(page.locator('.cl-subtitle')).toHaveText('今天一起研究“社会学想象力”。');
  await expect(page.locator('.cl-board-area .cl-board-points li')).toHaveCount(1);
  await expect(page.locator('.cl-subtitle')).toHaveAttribute('data-sentence', '1');
  await page.getByRole('button', { name: '暂停讲解' }).click();
  await expect(page.locator('.cl-board-area .cl-board-points li')).toHaveCount(2);
  await expect(page.locator('.cl-board-area .cl-board-points li').nth(1)).toHaveText('怎样解释生活？');
  const subtitle = await page.locator('.cl-subtitle').innerText();
  await page.waitForTimeout(3500); await expect(page.locator('.cl-subtitle')).toHaveText(subtitle);
  await page.reload(); await expect(page.locator('.cl-subtitle')).toHaveText(subtitle);
  await expect(page.locator('.cl-board-area .cl-board-points li')).toHaveCount(2);
  expect(requested.slice(0, 2)).toEqual([0, 1]);
  await page.getByRole('button', { name: '继续讲解' }).click();
  await expect.poll(() => requested.filter(index => index === 1).length).toBe(2);
  await expect(page.locator('.cl-subtitle')).toHaveText(subtitle);
  await page.getByRole('button', { name: '暂停讲解' }).click();
});

test('independent practice matches four-option illustrated question flow on desktop and phone', async ({ page }) => {
  await page.setViewportSize({ width: 1250, height: 1199 }); await login(page);
  await page.addInitScript(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  await page.goto('/studio/classroom?lesson=soc-1-1-1&tab=practice');
  await expect(page.getByRole('region', { name: '课堂练习题目' })).toBeVisible();
  await expect(page.locator('.cl-practice-progress button')).toHaveCount(6);
  await expect(page.locator('.cl-practice-options label')).toHaveCount(4);
  await expect(page.locator('.cl-practice-prompt .cl-lesson-image img')).toHaveJSProperty('complete', true);
  await expect(page.locator('.cl-practice-prompt .cl-lesson-image img')).toHaveJSProperty('naturalWidth', 1024);
  await expect(page.getByRole('button', { name: 'Check →' })).toBeDisabled();
  if (!process.env.CI) await page.screenshot({ path: evidenceDirectory + '/classroom-practice-v2.png', fullPage: true });
  await page.locator('.cl-practice-prompt h2').click(); await page.keyboard.press('1');
  await page.getByRole('button', { name: 'Check →' }).click();
  await expect(page.locator('.cl-answer-feedback')).toContainText('这次区分正确');
  await page.getByRole('button', { name: '下一题 →' }).click();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.locator('.cl-answer-feedback')).toContainText('已跳过');
  await page.getByRole('button', { name: '☏ Assistant' }).click();
  await expect(page.getByLabel('向课堂老师提问')).toBeVisible();
  await page.getByRole('button', { name: '隐藏对话面板' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if (!process.env.CI) await page.screenshot({ path: evidenceDirectory + '/classroom-practice-phone-v2.png', fullPage: true });
  await page.reload(); await page.getByRole('button', { name: '第2题', exact: true }).click();
  await expect(page.locator('.cl-answer-feedback')).toContainText('已跳过');
});

test.describe('reference viewport and display scaling', () => {
  test.use({ viewport: { width: 1000, height: 959 }, deviceScaleFactor: 1.25 });
  test('practice geometry, whiteboard image and comparison table use the observed display scale', async ({ page }) => {
    await login(page); await page.addInitScript(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
    await page.goto('/studio/classroom?lesson=soc-1-1-1&tab=practice');
    await expect(page.locator('.cl-practice-options')).toBeVisible();
    const card = await page.locator('.cl-practice-card').boundingBox();
    expect(card?.x).toBe(36); expect(card?.y).toBe(52); expect(card?.width).toBe(928);
    if (!process.env.CI) await page.screenshot({ path: evidenceDirectory + '/classroom-practice-reference-scale-v2.png' });
    await page.goto('/studio/classroom?lesson=soc-1-1-1');
    await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
    await page.getByRole('button', { name: '放大图片：传记与历史的交汇点 · 社会学想象力' }).click();
    await expect(page.getByRole('dialog', { name: '传记与历史的交汇点 · 社会学想象力' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '传记与历史的交汇点 · 社会学想象力' })).toHaveCount(0);
    await expect(page.locator('.cl-board-area .cl-board-step[data-current=true]')).toHaveCSS('opacity', '1');
    await page.locator('.cl-board-area .cl-lesson-image').scrollIntoViewIfNeeded();
    await expect(page.locator('.cl-board-area .cl-lesson-image')).toBeInViewport({ ratio: 0.8 });
    if (!process.env.CI) await page.screenshot({ path: evidenceDirectory + '/classroom-board-reference-scale-v2.png' });
    for (let index = 0; index < 4; index++) {
      const before = await page.locator('.cl-session-navigation').innerText();
      await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
      await expect(page.locator('.cl-session-navigation')).not.toHaveText(before, { useInnerText: true });
    }
    await expect(page.locator('.cl-board-area table')).toBeVisible();
    await expect(page.locator('.cl-board-area table tbody tr')).toHaveCount(2);
    await expect(page.locator('.cl-board-area .cl-board-step[data-current=true]')).toHaveCSS('opacity', '1');
    await page.locator('.cl-board-area table').scrollIntoViewIfNeeded();
    await expect(page.locator('.cl-board-area table')).toBeInViewport({ ratio: 0.8 });
    if (!process.env.CI) await page.screenshot({ path: evidenceDirectory + '/classroom-table-reference-scale-v2.png' });
  });
});
