import { expect, test, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { browserEvidence } from './evidence';
import { join } from 'node:path';
import { installNarrationTiming } from './whiteboard-timing';

const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107'), base = '/learning/studio/topic-whiteboards';
const figureBase = '/learning/studio/topic-whiteboard-visuals';
// Complete in-flight overview/media routes before Playwright disposes their API responses.
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });
async function fixture(page: Page, child = false) {
  const hash = createHash('sha256').update(test.info().testId).digest(), address = '198.19.' + hash[0] + '.' + hash[1];
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address });
  const principal = 'topic-browser-' + randomUUID() + '@local.test', credential = 'Topic-Browser-Only-20261026';
  let token = '';
  async function call(path: string, body?: unknown, method = 'POST') {
    const response = await fetch(api + '/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address, ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    expect(response.ok, path + ': ' + response.status).toBe(true); return (await response.json()).data;
  }
  const actor = await call('/auth/register', { principal, credential }); token = actor.token;
  let studentId: string | null = null;
  if (child) {
    const created = await call('/students', { nickname: '匿名AI白板学习者', grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }); studentId = created.profile.id;
    await call('/students/' + studentId + '/learning-scope', { subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null,
      textbookVersion: '匿名已学范围', learnedAtomIds: ['core:math:fractionadd'], currentAtomId: 'core:math:fractionadd', minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [] }, 'PUT');
  }
  await page.route('**/api/learning/studio/overview?*', async route => {
    const response = await route.fetch(); if (!response.ok()) { await route.fulfill({ response }); return; }
    const payload = await response.json(); payload.data.narrationAvailable = true; payload.data.speech = { available: true, provider: 'minimax', defaultVoice: 'fixture-a', voices: [{ id: 'fixture-a', label: '合成音轨 A' }] };
    await route.fulfill({ response, json: payload });
  });
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.goto('/studio/whiteboards'); await expect(page.getByLabel('讲解主题')).toBeVisible();
  await expect(page.getByLabel('选择大模型')).toHaveValue('deepseek-v4-flash');
  return { actor, call, studentId };
}
async function generate(page: Page, topic = '用匿名观察解释条件与推断') {
  await page.getByLabel('讲解主题').fill(topic); await page.getByLabel('希望弄懂什么').fill('保留完整条件，说明观察、推断和替代解释的区别。');
  await page.getByRole('button', { name: '预检主题与范围', exact: true }).click(); await expect(page.getByRole('button', { name: '生成教学稿', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '生成教学稿', exact: true }).click();
}
async function ready(page: Page) { await expect(page.locator('.tw-generation-state')).toHaveText('待你核对', { timeout: 25000 }); await expect(page.getByLabel('白板标题')).toBeVisible(); }
async function figure(page: Page, requirements = '以两个有交集的圆说明条件和观察的关系，保留完整标签。') {
  const pane = page.getByRole('region', { name: '白板配图工作区' });
  await pane.getByLabel('希望图片说明什么').fill(requirements);
  await pane.getByRole('button', { name: '预检配图范围', exact: true }).click();
  await expect(pane.getByText('本次完整教学范围与配图要求', { exact: true })).toBeVisible();
  await expect(pane.getByRole('button', { name: '生成参考图', exact: true })).toBeEnabled();
  await pane.getByRole('button', { name: '生成参考图', exact: true }).click(); return pane;
}

test('continuity: a confirmed adult topic also overlaps its adjacent WAV and preserves its frozen sentence identity', async ({ page }) => {
  const timing = await installNarrationTiming(page); await fixture(page); await generate(page); await ready(page);
  await page.getByRole('button', { name: '确认并保存这份白板', exact: true }).click();
  await page.getByRole('button', { name: '打开已保存白板', exact: true }).click();
  const player = page.getByRole('dialog', { name: '白板视频' });
  try {
    await player.getByRole('button', { name: '播放', exact: true }).click();
    await expect.poll(async () => (await timing.read()).audio.some(row => row.index === 1 && row.event === 'playing'), { timeout: 10000 }).toBe(true);
    await player.getByRole('button', { name: '暂停', exact: true }).click(); const result = await timing.save('adult-topic-transfer');
    const ended = result.audio.find(row => row.index === 0 && row.event === 'ended')!, next = result.audio.find(row => row.index === 1 && row.event === 'playing')!;
    expect(result.requests[1].startedAt).toBeLessThan(ended.at - 100);
    expect(next.at - ended.at).toBeLessThan(result.delayMs * .75); expect(next.currentTime).toBeLessThan(.15);
    expect(result.requests.filter(row => row.unitId === result.requests[1].unitId)).toHaveLength(1);
    await expect(player.locator('.wb-current-sentence')).toContainText('保留未知条件');
  } finally { await page.unrouteAll({ behavior: 'wait' }); }
});

async function formulaBoard(page: Page, expressions: string[], withFigure = false) {
  const f = await fixture(page); await generate(page); await ready(page);
  const id = new URL(page.url()).searchParams.get('draft')!, view = await f.call(base + '/drafts/' + id, undefined, 'GET');
  const content = { ...view.content, scenes: expressions.map((latex, index) => ({ ...view.content.scenes[index % 3], title: '公式示例 ' + (index + 1),
    narration: '[whiteboard-fixture] 核对完整表达。 [whiteboard-fixture] 保留最后一项。',
    bullets: ['核对完整表达', '保留最后一项'], figure: undefined, exhibit: { kind: 'formula', latex, explanation: '分式、根号与对齐关系需要完整保留，最后一项不能省略。' } })) };
  const edited = await f.call(base + '/drafts/' + id + '/content', { expectedRevision: view.revision, contentFingerprint: view.contentFingerprint, content, requestKey: randomUUID() }, 'PATCH');
  let current = edited;
  if (withFigure) {
    await page.reload(); await ready(page);
    await page.getByRole('button', { name: '采用服务器稿', exact: true }).click();
    await expect(page.getByRole('region', { name: '白板配图工作区' }).getByRole('button', { name: '预检配图范围', exact: true })).toBeEnabled();
    const pane = await figure(page); await pane.getByRole('checkbox', { name: '我已阅读图片，并核对本次要使用的标签和关系。' }).check();
    await pane.getByRole('button', { name: '选入当前完整稿', exact: true }).click(); await page.getByRole('button', { name: '保存完整改稿', exact: true }).click();
    await expect(page.locator('.tw-review')).toContainText('针对旧稿');
    current = await f.call(base + '/drafts/' + id, undefined, 'GET');
  }
  await f.call(base + '/drafts/' + id + '/confirm', { expectedRevision: current.revision, contentFingerprint: current.contentFingerprint,
    acknowledgeAiGeneratedContent: true, acknowledgeUnreviewedChanges: true, requestKey: randomUUID() });
  await page.reload(); await page.getByRole('button', { name: '打开已保存白板', exact: true }).click();
  const player = page.getByRole('dialog', { name: '白板视频' }); await expect(player).toBeVisible();
  return { ...f, player };
}

test('topic-formula: complete vector fractions, aligned roots and Unicode fit narrow notes and preserve copyable source and safe fallback', async ({ page }) => {
  const expressions = ['\\frac{1}{2}+\\sqrt{x^2+1}', '\\begin{aligned}a&=b+c\\\\d&=\\frac{e}{f}\\end{aligned}', '\\frac{1}{2}\\text{个整体}', '\\unknownprivate{最后一项}', 'a+'.repeat(280) + 'z'];
  const { player } = await formulaBoard(page, expressions);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [index, latex] of expressions.entries()) {
      const detail = player.locator('.wb-reading-notes > details').nth(index);
      if (!(await detail.getAttribute('open') !== null)) await detail.locator(':scope > summary').click();
      const formula = detail.locator('.wb-complete-formula');
      if (index !== 3) { await expect(formula.locator('.wb-formula-vector svg')).toHaveCount(1); await expect(formula.locator('math')).toHaveCount(1); }
      else await expect(formula.getByRole('status')).toContainText('分页保留原式');
      const raw = formula.locator('details'); if (await raw.getAttribute('open') === null) await raw.locator('summary').click();
      expect(await raw.locator('pre').textContent()).toBe(latex);
      expect(await formula.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: join(browserEvidence('topic-whiteboard'), 'topic-formula-reader-' + width + '.png'), fullPage: false });
  }
  expect(await page.locator('[href^="javascript:"],script[src*="mathjax"],image[href^="http"]').count()).toBe(0);
});

test('topic-formula: actual shared image and fraction/root/alignment vector video decodes with full audio and caption timeline', async ({ page }) => {
  const { player } = await formulaBoard(page, ['\\frac{1}{2}+\\sqrt{x^2+1}', '\\begin{aligned}a&=b+c\\\\d&=\\frac{e}{f}\\end{aligned}', 'a+'.repeat(280) + 'z'], true);
  await expect(player.locator('.sa-whiteboard-notice')).not.toContainText('无法解码');
  await expect(player.locator('.wb-formula-vector svg').first()).toBeVisible();
  const download = page.waitForEvent('download', { timeout: 30000 }); await player.getByRole('button', { name: '导出视频', exact: true }).click();
  const video = (await (await download).path())!, directory = browserEvidence('topic-whiteboard'); copyFileSync(video, join(directory, 'topic-formula-video.webm'));
  const probe = JSON.parse(execFileSync(process.env.STUDY_FFPROBE ?? 'ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', video], { windowsHide: true, encoding: 'utf8' }));
  expect(probe.streams.some((stream: any) => stream.codec_type === 'audio')).toBe(true); expect(probe.streams.some((stream: any) => stream.codec_type === 'video')).toBe(true);
  const receipts: unknown[] = [];
  for (const [name, time, left] of [['first', .2, 740], ['aligned', 4.2, 88], ['last', 11.9, 88]] as const) {
    const frame = spawnSync(process.env.STUDY_FFMPEG ?? 'ffmpeg', ['-v', 'error', '-ss', String(time), '-i', video, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    expect(frame.status).toBe(0); const decoded = await sharp(frame.stdout).removeAlpha().raw().toBuffer({ resolveWithObject: true }); let ink = 0;
    for (let y = 220; y < 500; y++) for (let x = left; x < 1190; x++) { const offset = (y * 1280 + x) * 3;
      if (decoded.data[offset] < 120 && decoded.data[offset + 1] < 130 && decoded.data[offset + 2] < 120) ink++; }
    expect(ink).toBeGreaterThan(100); receipts.push({ name, time, ink }); writeFileSync(join(directory, 'topic-formula-video-' + name + '.png'), frame.stdout);
  }
  writeFileSync(join(directory, 'topic-formula-video-probe.json'), JSON.stringify({ probe, frames: receipts }, null, 2) + '\n');
  const captions = page.waitForEvent('download'); await player.getByRole('button', { name: '导出字幕', exact: true }).click(); const srt = readFileSync((await (await captions).path())!, 'utf8');
  expect(srt).toContain('00:00:00,000 --> 00:00:02,000'); expect(srt).toContain('00:00:10,000 --> 00:00:12,000'); expect(srt).toContain('保留最后一项');
  writeFileSync(join(directory, 'topic-formula-video.srt'), srt);
  const later: string[] = []; page.on('download', item => later.push(item.suggestedFilename()));
  await player.getByRole('button', { name: '导出视频', exact: true }).click(); await player.getByRole('button', { name: '取消导出', exact: true }).click();
  await expect(player.locator('.sa-whiteboard-notice')).toContainText('没有下载半成品'); expect(later).toEqual([]);
  const retained = page.waitForEvent('download'); await player.getByRole('button', { name: '导出字幕', exact: true }).click(); expect(readFileSync((await (await retained).path())!, 'utf8')).toBe(srt);
});

test('login forms cannot submit before their client handlers are ready', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL });
  try {
    const page = await context.newPage();
    for (const path of ['/parent/login', '/student/login']) {
      await page.goto(path);
      for (const input of await page.locator('form input, form button').all()) await expect(input).toBeDisabled();
    }
  } finally { await context.close(); }
});

test('topic-figure: restores a lost original image prepare without duplicate writes, edits its PNG and publishes an image with pause/read/resume', async ({ page }) => {
  const f = await fixture(page); await generate(page); await ready(page); const id = new URL(page.url()).searchParams.get('draft')!;
  let dropped = true, writes = 0;
  await page.route('**/api/learning/studio/topic-whiteboard-visuals', async route => {
    if (route.request().method() !== 'POST') return route.continue(); writes++;
    if (dropped) { dropped = false; expect((await route.fetch()).status()).toBe(201); await route.abort('failed'); } else await route.continue();
  });
  await figure(page); const pane = page.getByRole('region', { name: '白板配图工作区' });
  await expect(pane.getByRole('button', { name: '恢复原配图请求', exact: true })).toBeEnabled(); await page.reload(); await ready(page);
  await pane.getByRole('button', { name: '恢复原配图请求', exact: true }).click();
  await expect(pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeVisible(); expect(writes).toBe(1);
  expect((await f.call(figureBase + '?draftId=' + id + '&sceneIndex=0', undefined, 'GET')).total).toBe(1);
  await pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true }).click();
  await expect(page.locator('.cl-figure-reader-sheet img')).toBeVisible(); await page.keyboard.press('Escape');
  await expect(pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeFocused();
  await pane.getByRole('button', { name: '以原图继续修订', exact: true }).click();
  await pane.getByLabel('具体修改').fill('只去掉顶端标题，保留圆、交集和其他标签。');
  await pane.getByRole('button', { name: '预检配图范围', exact: true }).click(); await expect(pane.getByRole('button', { name: '生成修订图片', exact: true })).toBeEnabled();
  await pane.getByRole('button', { name: '生成修订图片', exact: true }).click();
  await expect(pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeVisible();
  await pane.getByRole('textbox', { name: '图片替代说明', exact: true }).fill('两个概念圆及其交集，说明观察和条件的关系。');
  await pane.getByRole('textbox', { name: '图注', exact: true }).fill('比较观察与条件，保留这条完整图注。');
  await expect(pane.locator('.tw-figure-list .tw-figure-thumbnail img').first()).toBeVisible();
  await pane.getByRole('button', { name: '加入对照', exact: true }).last().click(); await expect(pane.getByRole('region', { name: '两个图片候选对照' })).toBeVisible();
  await expect(pane.getByRole('region', { name: '两个图片候选对照' }).locator('img').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('studyagent.topic-whiteboard.figures.')).map(key => JSON.parse(localStorage.getItem(key)!).caption))).toContain('比较观察与条件，保留这条完整图注。');
  await page.reload(); await ready(page); await expect(pane.getByRole('textbox', { name: '图片替代说明', exact: true })).toHaveValue('两个概念圆及其交集，说明观察和条件的关系。');
  await expect(pane.getByRole('textbox', { name: '图注', exact: true })).toHaveValue('比较观察与条件，保留这条完整图注。');
  await pane.getByRole('checkbox', { name: '我已阅读图片，并核对本次要使用的标签和关系。' }).check();
  await pane.getByRole('button', { name: '选入当前完整稿', exact: true }).click(); await page.getByRole('button', { name: '保存完整改稿', exact: true }).click();
  await expect(page.locator('.tw-review')).toContainText('针对旧稿');
  const draft = await f.call(base + '/drafts/' + id, undefined, 'GET'); expect(draft.content.scenes[0].figure).toBeTruthy();
  const candidate = await f.call(figureBase + '/' + draft.content.scenes[0].figure.visualId, undefined, 'GET'); expect(candidate.operation).toBe('edit'); expect(candidate.parentVisualId).toBeTruthy();
  await page.getByRole('checkbox', { name: '我已阅读未确定问题或手工改稿，知晓仍需内容核对' }).check();
  await page.getByRole('button', { name: '确认并保存这份白板', exact: true }).click(); await page.getByRole('button', { name: '打开已保存白板', exact: true }).click();
  const player = page.getByRole('dialog', { name: '白板视频' }); await expect(player).toBeVisible();
  await expect(player.getByRole('button', { name: '放大参考图：先核对观察', exact: true }).first()).toBeVisible();
  await player.getByRole('button', { name: '播放', exact: true }).click();
  await player.getByRole('button', { name: '放大参考图：先核对观察', exact: true }).first().click();
  const unit = await page.locator('.wb-current-sentence').getAttribute('data-unit-id');
  await expect(page.locator('.cl-figure-reader-sheet')).toBeVisible(); await expect(player.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(player).toBeVisible(); await expect(page.locator('.cl-figure-reader-sheet')).toHaveCount(0);
  await expect(page.locator('.wb-current-sentence')).toHaveAttribute('data-unit-id', unit!);
  await page.screenshot({ path: join(browserEvidence('topic-whiteboard'), 'topic-figure-saved-player.png'), fullPage: false });
  const board = await f.call(base + '/' + (await f.call(base + '/drafts/' + id, undefined, 'GET')).whiteboardId, undefined, 'GET');
  expect(JSON.stringify(board)).not.toContain(candidate.id); expect(board.scenes[0].figure.sha256).toBe(candidate.sha256);
  const downloaded = page.waitForEvent('download', { timeout: 30000 }); await player.getByRole('button', { name: '导出视频', exact: true }).click();
  const video = await downloaded, videoPath = (await video.path())!, directory = browserEvidence('topic-whiteboard'); copyFileSync(videoPath, join(directory, 'topic-figure-video.webm'));
  const probe = JSON.parse(execFileSync(process.env.STUDY_FFPROBE ?? 'ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', videoPath], { encoding: 'utf8', windowsHide: true }));
  expect(probe.streams.some((stream: any) => stream.codec_type === 'audio')).toBe(true); expect(probe.streams.some((stream: any) => stream.codec_type === 'video')).toBe(true);
  const frame = spawnSync(process.env.STUDY_FFMPEG ?? 'ffmpeg', ['-v', 'error', '-ss', '0.2', '-i', videoPath, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  expect(frame.status).toBe(0); const decoded = await sharp(frame.stdout).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  expect([decoded.info.width, decoded.info.height, decoded.info.channels]).toEqual([1280, 720, 3]);
  let blue = 0, warm = 0;
  for (let y = 206; y < 566; y++) for (let x = 88; x < 698; x++) {
    const offset = (y * 1280 + x) * 3, r = decoded.data[offset], g = decoded.data[offset + 1], b = decoded.data[offset + 2];
    if (b > r + 5 && b > g) blue++; if (r > b + 10 && g > b + 5) warm++;
  }
  expect(blue).toBeGreaterThan(9000); expect(warm).toBeGreaterThan(9000);
  writeFileSync(join(directory, 'topic-figure-video-first-frame.png'), frame.stdout); writeFileSync(join(directory, 'topic-figure-video-probe.json'), JSON.stringify({ probe, decodedImageRegion: { blue, warm } }, null, 2) + '\n');
  const captions = page.waitForEvent('download'); await player.getByRole('button', { name: '导出字幕', exact: true }).click(); const srt = readFileSync((await (await captions).path())!, 'utf8');
  expect(srt).toContain('00:00:00,000 --> 00:00:02,000'); expect(srt).toContain('00:00:10,000 --> 00:00:12,000'); writeFileSync(join(directory, 'topic-figure-video.srt'), srt);
  const later: string[] = []; page.on('download', value => later.push(value.suggestedFilename()));
  await page.route('**/api/learning/studio/topic-whiteboards/*/figures/*/image', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('Changed frozen image fixture') }));
  await player.getByRole('button', { name: '导出视频', exact: true }).click(); await expect(player.locator('.sa-whiteboard-notice')).toContainText('字节与已保存版本不一致'); expect(later).toEqual([]);
  const retained = page.waitForEvent('download'); await player.getByRole('button', { name: '导出字幕', exact: true }).click(); expect(readFileSync((await (await retained).path())!, 'utf8')).toBe(srt);
});

test('topic-figure: uncached complete image commands block leaving until their exact complete download', async ({ page }) => {
  await fixture(page); await generate(page); await ready(page);
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) {
    if (key.startsWith('studyagent.topic-whiteboard.figures.')) throw new DOMException('Synthetic unavailable image storage', 'QuotaExceededError'); return original.call(this, key, value);
  }; });
  let writes = 0;
  await page.route('**/api/learning/studio/topic-whiteboard-visuals', async route => {
    if (route.request().method() !== 'POST') return route.continue(); writes++; expect((await route.fetch()).status()).toBe(201); await route.abort('failed');
  });
  const pane = await figure(page, '即使本机拒写，也要保留这一完整需求及原图生成命令。');
  await expect(pane.getByRole('button', { name: '恢复原配图请求', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '＋ 新白板', exact: true }).click(); await expect(pane).toBeVisible();
  const download = page.waitForEvent('download'); await pane.getByRole('button', { name: '下载完整配图请求', exact: true }).click();
  const saved = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
  expect(saved.pending.body).toMatchObject({ operation: 'generate', requirements: '即使本机拒写，也要保留这一完整需求及原图生成命令。' });
  expect(saved.pending.body.requestKey).toBeTruthy(); expect(saved.draftId).toBe(saved.pending.body.draftId); expect(writes).toBe(1);
  expect(saved.pending.path).toBe(figureBase);
  await page.getByRole('button', { name: '＋ 新白板', exact: true }).click(); await expect(pane).toHaveCount(0);
});

test('topic-figure: mismatched image bytes stay hidden and can be reread without creating another candidate', async ({ page }) => {
  const f = await fixture(page); await generate(page); await ready(page); const id = new URL(page.url()).searchParams.get('draft')!;
  await page.route('**/api/learning/studio/topic-whiteboard-visuals/*/image', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('Synthetic changed PNG bytes') }));
  const pane = await figure(page), current = pane.getByRole('article', { name: '当前图片候选' });
  await expect(current.getByRole('alert')).toContainText('字节与已保存版本不一致'); await expect(current.getByRole('button', { name: '选入当前完整稿', exact: true })).toBeDisabled();
  await expect(current.locator('.tw-figure-open')).toHaveCount(0);
  await page.unroute('**/api/learning/studio/topic-whiteboard-visuals/*/image');
  await current.getByRole('button', { name: '重新读取图片', exact: true }).click();
  await expect(current.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeVisible();
  expect((await f.call(figureBase + '?draftId=' + id + '&sceneIndex=0', undefined, 'GET')).total).toBe(1);
});

test('topic-figure: an explicit running cancellation and retry keep the same original candidate and advance its task generation', async ({ page }) => {
  const f = await fixture(page); await generate(page); await ready(page); const id = new URL(page.url()).searchParams.get('draft')!;
  const pane = await figure(page, '[image-pause-once] 暂停的匿名概念图，用于验证原任务取消和重试。');
  const current = pane.getByRole('article', { name: '当前图片候选' }); await expect(current.getByRole('heading', { name: '正在生成参考图', exact: true })).toBeVisible();
  await current.getByRole('button', { name: '取消图片生成', exact: true }).click();
  await expect(current.getByRole('heading', { name: '生成已取消', exact: true })).toBeVisible();
  await current.getByRole('button', { name: '重试原图片任务', exact: true }).click(); await expect(current.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeVisible();
  const list = await f.call(figureBase + '?draftId=' + id + '&sceneIndex=0', undefined, 'GET'); expect(list.total).toBe(1); expect(list.items[0].task.generation).toBe(2);
});

test('topic-figure: two actual tabs retain separate full figure inputs and metadata across reloads', async ({ page }) => {
  await fixture(page); await generate(page); await ready(page); const second = await page.context().newPage();
  try {
    await second.goto(page.url()); await ready(second);
    const firstPane = page.getByRole('region', { name: '白板配图工作区' }), secondPane = second.getByRole('region', { name: '白板配图工作区' });
    await firstPane.getByLabel('希望图片说明什么').fill('第一标签页完整的配图要求。'); await secondPane.getByLabel('希望图片说明什么').fill('第二标签页不同的配图要求。');
    const copies = () => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('studyagent.topic-whiteboard.figures.')).map(key => JSON.parse(localStorage.getItem(key)!).form.requirements));
    await expect.poll(copies).toContain('第一标签页完整的配图要求。'); await expect.poll(copies).toContain('第二标签页不同的配图要求。');
    await page.reload(); await ready(page); await expect(firstPane.getByLabel('希望图片说明什么')).toHaveValue('第一标签页完整的配图要求。');
    await second.reload(); await ready(second); await expect(secondPane.getByLabel('希望图片说明什么')).toHaveValue('第二标签页不同的配图要求。');
  } finally { await second.close(); }
});

for (const width of [390, 768, 1440]) test('topic-figure: complete verified image and keyboard reader fit ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await fixture(page); await generate(page); await ready(page); const pane = await figure(page);
  await expect(pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true }).click();
  const reader = page.locator('.cl-figure-reader-sheet'); await expect(reader).toBeVisible();
  const image = reader.locator('img'); expect(await image.evaluate((item: HTMLImageElement) => [item.naturalWidth, item.naturalHeight])).toEqual([1536, 1024]);
  expect(await reader.evaluate(item => item.scrollWidth <= item.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: join(browserEvidence('topic-whiteboard'), 'topic-figure-reader-' + width + '.png'), fullPage: false });
  await page.keyboard.press('Escape'); await expect(reader).toHaveCount(0);
  await expect(pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeFocused();
});

test('adult original generation, lost edit and confirmation replies recover without duplicates and reach a complete table/formula player', async ({ page }) => {
  const f = await fixture(page); let dropped = true;
  await page.route('**/api/learning/studio/topic-whiteboards/drafts', async route => {
    if (route.request().method() === 'POST' && dropped) { dropped = false; expect((await route.fetch()).status()).toBe(201); await route.abort('failed'); } else await route.continue();
  });
  await generate(page); await expect(page.getByRole('button', { name: '恢复原生成请求', exact: true })).toBeEnabled(); await page.reload();
  await page.getByRole('button', { name: '恢复原生成请求', exact: true }).click(); await ready(page);
  const id = new URL(page.url()).searchParams.get('draft')!;
  expect((await f.call(base + '/drafts', undefined, 'GET')).total).toBe(1);
  let editDropped = true, editWrites = 0;
  await page.route('**/api/learning/studio/topic-whiteboards/drafts/*/content', async route => {
    editWrites++;
    if (editDropped) { editDropped = false; expect((await route.fetch()).status()).toBe(200); await route.abort('failed'); } else await route.continue();
  });
  await page.getByLabel('讲解概要').fill('保留这段完整的本机修订说明。');
  await expect(page.getByRole('button', { name: '确认并保存这份白板', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '保存完整改稿', exact: true }).click(); await expect(page.getByRole('button', { name: '恢复原修改请求', exact: true })).toBeEnabled();
  await page.reload(); await ready(page); await expect(page.getByLabel('讲解概要')).toHaveValue('保留这段完整的本机修订说明。');
  await page.getByRole('button', { name: '恢复原修改请求', exact: true }).click(); await expect(page.locator('.tw-review')).toContainText('针对旧稿');
  expect(editWrites).toBe(1);
  await expect(page.getByRole('button', { name: '确认并保存这份白板', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: '我已阅读未确定问题或手工改稿，知晓仍需内容核对' }).check();
  let confirmationDropped = true, confirmationWrites = 0;
  await page.route('**/api/learning/studio/topic-whiteboards/drafts/*/confirm', async route => {
    confirmationWrites++;
    if (confirmationDropped) { confirmationDropped = false; expect((await route.fetch()).status()).toBe(201); await route.abort('failed'); } else await route.continue();
  });
  await page.getByRole('button', { name: '确认并保存这份白板', exact: true }).click(); await expect(page.getByRole('button', { name: '恢复原确认请求', exact: true })).toBeEnabled();
  await page.reload(); await page.getByRole('button', { name: '恢复原确认请求', exact: true }).click();
  await page.getByRole('button', { name: '打开已保存白板', exact: true }).click(); await expect(page.getByRole('dialog', { name: '白板视频' })).toBeVisible();
  expect(confirmationWrites).toBe(1);
  await expect(page.locator('.wb-ai-origin')).toContainText('AI生成');
  await page.getByLabel('完整讲稿与要点').locator('details').nth(1).locator('summary').click(); await expect(page.getByRole('table')).toContainText('完整尾行条件');
  await page.getByLabel('完整讲稿与要点').locator('details').nth(2).locator(':scope > summary').click(); await expect(page.locator('math')).toBeVisible(); await expect(page.locator('.wb-complete-formula')).toContainText('计数单位相同');
  const view = await f.call(base + '/drafts/' + id, undefined, 'GET'); expect(view).toMatchObject({ status: 'confirmed', modelId: 'deepseek-v4-flash', studentId: null, subject: null });
  expect((await f.call(base, undefined, 'GET')).total).toBe(1);
  await page.screenshot({ path: join(browserEvidence('topic-whiteboard'), 'adult-complete-player.png'), fullPage: true });
});

test('cancelled and failed review generations retain the original selected model through refresh and explicit retry', async ({ page }) => {
  const f = await fixture(page); await generate(page, '匿名观察 [topic-pause-once] [topic-review-fail-once]');
  await expect(page.getByRole('button', { name: '取消生成', exact: true })).toBeVisible(); await page.getByRole('button', { name: '取消生成', exact: true }).click();
  await expect(page.locator('.tw-generation-state')).toHaveText('已取消', { timeout: 15000 }); await page.reload();
  await page.getByLabel('选择大模型').selectOption('gpt-6-astra'); await page.getByRole('button', { name: '用原模型重试', exact: true }).click();
  await expect(page.locator('.tw-generation-state')).toHaveText('生成未完成', { timeout: 25000 });
  await page.getByRole('button', { name: '用原模型重试', exact: true }).click(); await ready(page);
  const id = new URL(page.url()).searchParams.get('draft')!, view = await f.call(base + '/drafts/' + id, undefined, 'GET');
  expect(view.modelId).toBe('deepseek-v4-flash'); expect(view.originalContent).not.toBeNull(); expect(view.generation).toBe(3);
});

test('incomplete local teaching edits survive reload and another saved draft cannot silently replace them', async ({ page }) => {
  await fixture(page); await generate(page); await ready(page); await page.getByLabel('白板标题').fill('');
  await page.getByLabel('讲解概要').fill('尚未保存的完整说明，保留结尾空格。  ');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('studyagent.topic-whiteboard.editor.v1.')).map(key => JSON.parse(localStorage.getItem(key)!).content.title))).toEqual(['']);
  await page.reload(); await ready(page); await expect(page.getByLabel('白板标题')).toHaveValue(''); await expect(page.getByLabel('讲解概要')).toHaveValue('尚未保存的完整说明，保留结尾空格。  ');
  await expect(page.getByRole('button', { name: '确认并保存这份白板', exact: true })).toBeDisabled();
  await page.getByLabel('白板标题').fill('补全后仍需核对'); await page.getByRole('button', { name: '保存完整改稿', exact: true }).click();
  await expect(page.locator('.tw-editor')).toContainText('完整改稿已保存'); await page.getByRole('button', { name: '查看完整修改历史', exact: true }).click();
  await expect(page.locator('.tw-history')).toContainText('1个旧版本');
});

test('unavailable local storage keeps the full editable draft and requires a real downloaded copy before leaving', async ({ page }) => {
  await page.addInitScript(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key.startsWith('studyagent.topic-whiteboard')) throw new DOMException('Synthetic unavailable storage', 'QuotaExceededError'); return original.call(this, key, value); }; });
  await fixture(page); await generate(page); await ready(page); await page.getByLabel('讲解概要').fill('存储不可用时仍保留的完整改稿。');
  await page.getByRole('button', { name: '＋ 新白板', exact: true }).click(); await expect(page.getByLabel('讲解概要')).toHaveValue('存储不可用时仍保留的完整改稿。');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '下载完整改稿', exact: true }).click();
  const copy = JSON.parse(readFileSync((await (await download).path())!, 'utf8')); expect(copy.content.description).toBe('存储不可用时仍保留的完整改稿。');
  await page.getByRole('button', { name: '＋ 新白板', exact: true }).click(); await expect(page.getByLabel('完整白板改稿')).toHaveCount(0);
});

test('stale-topic: another real tab keeps the local manuscript and opens a comparison before any replacement save', async ({ page }) => {
  await fixture(page); await generate(page); await ready(page); const href = page.url(), second = await page.context().newPage();
  try {
    await second.goto(href); await ready(second);
    await page.getByLabel('讲解概要').fill('本机持有的冲突原稿。');
    await second.getByLabel('讲解概要').fill('其他页已经保存的完整稿。'); await second.getByRole('button', { name: '保存完整改稿', exact: true }).click();
    await expect(second.locator('.tw-editor')).toContainText('完整改稿已保存');
    await page.getByRole('button', { name: '保存完整改稿', exact: true }).click();
    await expect(page.locator('.tw-conflict')).toContainText('服务器稿已变化');
    await expect(page.getByLabel('讲解概要')).toHaveValue('本机持有的冲突原稿。');
    await page.getByText('阅读当前服务器完整稿', { exact: true }).click(); await expect(page.locator('.tw-conflict')).toContainText('其他页已经保存的完整稿。');
    await page.getByRole('button', { name: '以服务器为基线继续我的改稿', exact: true }).click(); await page.getByRole('button', { name: '保存完整改稿', exact: true }).click();
    await expect(page.locator('.tw-editor')).toContainText('完整改稿已保存');
  } finally { await second.close(); }
});

test('uncached original topic cannot disappear on a scope change until its complete input is downloaded', async ({ page }) => {
  const f = await fixture(page, true);
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) {
    if (key.startsWith('studyagent.topic-whiteboard')) throw new DOMException('Synthetic unavailable storage', 'QuotaExceededError'); return original.call(this, key, value);
  }; });
  await page.getByLabel('讲解主题').fill('尚未生成也不能丢失的匿名主题');
  await page.getByLabel('希望弄懂什么').fill('保留我的完整教学目标。');
  await page.getByLabel('白板学习对象').selectOption(f.studentId!);
  await expect(page.getByLabel('白板学习对象')).toHaveValue('');
  await expect(page.getByLabel('讲解主题')).toHaveValue('尚未生成也不能丢失的匿名主题');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '下载原主题与请求', exact: true }).click();
  const copy = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
  expect(copy.form).toMatchObject({ prompt: '尚未生成也不能丢失的匿名主题', objective: '保留我的完整教学目标。' });
  await page.getByLabel('白板学习对象').selectOption(f.studentId!);
  await expect(page.getByLabel('白板学习对象')).toHaveValue(f.studentId!);
});

test('another explicit local manuscript cannot replace uncached dirty input until the current complete copy is downloaded', async ({ page }) => {
  await fixture(page); await generate(page); await ready(page);
  await page.getByLabel('讲解概要').fill('第一份可恢复的完整本机改稿。');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('studyagent.topic-whiteboard.editor.v1.')).map(key => JSON.parse(localStorage.getItem(key)!).content.description))).toContain('第一份可恢复的完整本机改稿。');
  await page.reload(); await ready(page);
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) {
    if (key.startsWith('studyagent.topic-whiteboard')) throw new DOMException('Synthetic unavailable storage', 'QuotaExceededError'); return original.call(this, key, value);
  }; });
  await page.getByLabel('讲解概要').fill('尚无本机缓存的第二份完整改稿。');
  await page.getByText('查看其他本机改稿', { exact: true }).click();
  const restore = page.getByRole('button', { name: '恢复这份本机改稿', exact: true }).first(); await expect(restore).toBeDisabled();
  await expect(page.getByLabel('讲解概要')).toHaveValue('尚无本机缓存的第二份完整改稿。');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '下载完整改稿', exact: true }).click();
  const copy = JSON.parse(readFileSync((await (await download).path())!, 'utf8')); expect(copy.content.description).toBe('尚无本机缓存的第二份完整改稿。');
  await expect(restore).toBeEnabled(); await restore.click();
  await expect(page.getByLabel('讲解概要')).toHaveValue('第一份可恢复的完整本机改稿。');
});

test('recovery: an uncached original cancellation survives object changes until its exact command is downloaded', async ({ page }) => {
  await fixture(page); await generate(page, '匿名观察 [topic-pause-once]');
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) {
    if (key.startsWith('studyagent.topic-whiteboard.command.')) throw new DOMException('Synthetic unavailable command storage', 'QuotaExceededError'); return original.call(this, key, value);
  }; });
  let writes = 0;
  await page.route('**/api/learning/studio/topic-whiteboards/drafts/*/cancel', async route => {
    writes++; expect((await route.fetch()).status()).toBe(201); await route.abort('failed');
  });
  await page.getByRole('button', { name: '取消生成', exact: true }).click();
  await expect(page.getByRole('button', { name: '恢复原取消请求', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '＋ 新白板', exact: true }).click(); await expect(page.locator('.tw-candidate')).toBeVisible();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '下载原稿与请求', exact: true }).click();
  const copy = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
  expect(copy.pending.action).toBe('cancel'); expect(copy.pending.body.requestKey).toBeTruthy(); expect(writes).toBe(1);
  await page.getByRole('button', { name: '＋ 新白板', exact: true }).click(); await expect(page.locator('.tw-candidate')).toHaveCount(0);
});

test('topic-slot: two real tabs keep their own complete incomplete edits after either tab reloads', async ({ page }) => {
  await fixture(page); await generate(page); await ready(page); const second = await page.context().newPage();
  try {
    await second.goto(page.url()); await ready(second);
    await page.getByLabel('讲解概要').fill('第一标签页尚未保存的完整稿。');
    const copies = () => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('studyagent.topic-whiteboard.editor.v1.')).map(key => JSON.parse(localStorage.getItem(key)!).content.description));
    await expect.poll(copies).toContain('第一标签页尚未保存的完整稿。');
    await second.getByLabel('讲解概要').fill('第二标签页的另一份完整稿。'); await expect.poll(copies).toContain('第二标签页的另一份完整稿。');
    await page.reload(); await ready(page); await expect(page.getByLabel('讲解概要')).toHaveValue('第一标签页尚未保存的完整稿。');
    await second.reload(); await ready(second); await expect(second.getByLabel('讲解概要')).toHaveValue('第二标签页的另一份完整稿。');
  } finally { await second.close(); }
});

for (const width of [390, 768, 1440]) test('explicit child goals, adult separation and complete edit controls fit at ' + width, async ({ page }) => {
  const f = await fixture(page, true); await page.setViewportSize({ width, height: 1000 }); await page.getByLabel('白板学习对象').selectOption(f.studentId!);
  await expect(page.locator('.tw-goals input')).toHaveCount(1); await page.locator('.tw-goals input').check(); await generate(page, '在相同整体下解释分数单位'); await ready(page);
  const id = new URL(page.url()).searchParams.get('draft')!, view = await f.call(base + '/drafts/' + id, undefined, 'GET'); expect(view.studentId).toBe(f.studentId); expect(view.audience.atomIds).toEqual(['core:math:fractionadd']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: join(browserEvidence('topic-whiteboard'), 'child-editor-' + width + '.png'), fullPage: true });
  await page.getByRole('button', { name: '确认并保存这份白板', exact: true }).click(); await page.getByRole('button', { name: '打开已保存白板', exact: true }).click();
  await expect(page.locator('.wb-current-sentence')).toContainText('先核对观察'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: '关闭白板', exact: true }).click();
});
