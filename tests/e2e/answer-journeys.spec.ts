import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
const api = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}/api`;
const modes = ['single_choice','multiple_choice','boolean','numeric_blank','text_blank','formula_blank','multi_blank','table_fill','matching','sorting','drag_drop','hotspot','geometry_draw','stepwise','image_upload','short_answer','audio_record'] as const;
let address = 0;
async function call(actor: any, path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(api + path, { method, headers: { 'content-type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + actor.token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json(); expect(response.ok, JSON.stringify(result.error)).toBe(true); return result.data;
}

test('recovery: a late save receipt cannot mark a newer local answer saved or overwrite its queue', async ({ page }) => {
  const f = await setup(page, 'diagnostic', 'numeric_blank'), commands: any[] = []; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**' + f.itemPath + '/draft', async route => { commands.push(route.request().postDataJSON()); const response = await route.fetch(); if (commands.length === 1) await gate; await route.fulfill({ response }); });
  try { await page.getByLabel('数字或分数答案').fill('1'); await expect.poll(() => commands.length).toBe(1); await page.getByLabel('数字或分数答案').fill('23'); await expect(page.locator('.studio-question-top')).not.toContainText('草稿已保存'); release();
    await expect.poll(async () => (await call(f.actor, f.itemPath)).draft?.response.value).toBe('23'); await expect(page.locator('.studio-question-top')).toContainText('草稿已保存'); expect(commands).toHaveLength(2); expect(commands[1].expectedRevision).toBe(1);
  } finally { release(); }
});

test('recovery: a dropped save acknowledgment survives refresh with its original command and one server revision', async ({ page }) => {
  const f = await setup(page, 'diagnostic', 'numeric_blank'), commands: any[] = []; let first = true;
  page.on('dialog', dialog => dialog.accept());
  await page.route('**' + f.itemPath + '/draft', async route => { commands.push(route.request().postDataJSON()); if (first) { first = false; await route.fetch(); await route.abort('failed'); } else await route.continue(); });
  await page.getByLabel('数字或分数答案').fill('16'); await expect(page.locator('.studio-question-top')).toContainText('仅本地草稿');
  await page.reload(); await expect(page.getByLabel('数字或分数答案')).toHaveValue('16'); await expect(page.locator('.studio-question-top')).toContainText('草稿已保存');
  expect(commands).toHaveLength(2); expect(commands[1]).toEqual(commands[0]); expect((await call(f.actor, f.itemPath)).draftState.revision).toBe(1);
});

test('recovery: two real tabs retain conflicting input and explicitly download before keeping the local version', async ({ page }) => {
  const f = await setup(page, 'diagnostic', 'numeric_blank'), other = await page.context().newPage();
  try { await other.goto(f.href); await expect(other.getByLabel('数字或分数答案')).toBeVisible();
    await page.getByLabel('数字或分数答案').fill('11'); await expect(page.locator('.studio-question-top')).toContainText('草稿已保存');
    await other.getByLabel('数字或分数答案').fill('99'); await expect(other.locator('.studio-question-top')).toContainText('草稿版本有冲突'); await expect(other.getByLabel('数字或分数答案')).toHaveValue('99'); expect((await call(f.actor, f.itemPath)).draft.response.value).toBe('11');
    await expect(other.locator('.answer-draft-comparison > section').nth(0)).toContainText('99'); await expect(other.locator('.answer-draft-comparison > section').nth(1)).toContainText('11');
    mkdirSync('data/qa/answer-draft-screens', { recursive: true }); for (const width of [390,768,1440]) { await other.setViewportSize({ width, height: 1000 }); expect(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); await other.locator('.answer-draft-status').scrollIntoViewIfNeeded(); await other.screenshot({ path: `data/qa/answer-draft-screens/conflict-${width}.png`, fullPage: true }); }
    const download = other.waitForEvent('download'); await other.getByRole('button', { name: '保留副本，继续本地稿' }).click(); const copy = JSON.parse(readFileSync((await (await download).path())!, 'utf8')); expect(copy.localAnswer.response.value).toBe('99');
    await expect(other.locator('.studio-question-top')).toContainText('草稿已保存'); expect((await call(f.actor, f.itemPath)).draft.response.value).toBe('99');
  } finally { await other.close(); }
});

test('recovery: a lost diagnostic first-submit reply replays the frozen time and advances exactly one question after reload', async ({ page }) => {
  const f = await setup(page, 'diagnostic', 'numeric_blank'), commands: any[] = []; let first = true, receipt: any;
  page.on('dialog', dialog => dialog.accept());
  await page.route('**' + f.responsesPath, async route => { commands.push(route.request().postDataJSON()); if (first) { first = false; const response = await route.fetch(); receipt = (await response.json()).data; await route.abort('failed'); } else await route.continue(); });
  await page.getByLabel('数字或分数答案').fill('6'); await page.getByRole('button', { name: '提交，下一步 →', exact: true }).click(); await expect(page.getByRole('button', { name: '核对原提交', exact: true })).toBeVisible(); await expect.poll(() => !!receipt).toBe(true);
  await page.reload(); await expect(page.getByLabel('数字或分数答案')).toHaveValue(''); const actual = await call(f.actor, '/diagnostics/sessions/' + f.sessionId); expect(actual.answeredCount).toBe(1); expect(actual.items[0].answered).toBe(true); expect(commands).toHaveLength(2); expect(commands[1]).toEqual(commands[0]);
  const replay = await call(f.actor, f.responsesPath, commands[0]); expect(replay).toMatchObject({ responseId: receipt.responseId, idempotent: true });
});

test('recovery: practice correction drafts and their lost submit reply preserve the original first answer and the current question', async ({ page }) => {
  const f = await setup(page, 'practice', 'numeric_blank'); page.on('dialog', dialog => dialog.accept());
  await page.getByLabel('数字或分数答案').fill('6'); const firstResponse = page.waitForResponse(response => response.url().endsWith(f.responsesPath) && response.request().method() === 'POST'); await page.getByRole('button', { name: '完成这一题 →', exact: true }).click(); const first = await firstResponse, originalCommand = first.request().postDataJSON(), original = (await first.json()).data;
  await expect(page.locator('.daily-feedback')).toBeVisible(); await page.getByRole('button', { name: '再想一次', exact: true }).click(); await page.getByLabel('数字或分数答案').fill('9'); await page.reload(); await expect(page.getByLabel('数字或分数答案')).toHaveValue('9'); await expect(page.getByRole('button', { name: '提交这次订正 →', exact: true })).toBeVisible();
  let once = true; const commands: any[] = []; await page.route('**' + f.responsesPath, async route => { commands.push(route.request().postDataJSON()); if (once) { once = false; await route.fetch(); await route.abort('failed'); } else await route.continue(); });
  await page.getByRole('button', { name: '提交这次订正 →', exact: true }).click(); await expect(page.getByRole('button', { name: '核对原提交', exact: true })).toBeVisible(); await page.reload(); await expect(page.locator('.daily-feedback')).toContainText('第 2 次作答');
  expect(commands[1]).toEqual(commands[0]); const history = await call(f.actor, f.itemPath); expect(history.feedback.attempt).toMatchObject({ attempt: 2, answer: { response: { value: '9' } }, solutionExposedBefore: true }); expect((await call(f.actor, f.responsesPath, originalCommand)).attempt).toEqual(original.attempt);
});

test('recovery: leaving before debounce flushes the exact question, while offline navigation retains its local input', async ({ page, context }) => {
  const f = await setup(page, 'practice', 'numeric_blank'); await page.getByLabel('数字或分数答案').fill('21'); await page.locator('.daily-question-index button').nth(1).click(); await expect(page.getByLabel('数字或分数答案')).toHaveValue('');
  await page.locator('.daily-question-index button').nth(0).click(); await expect(page.getByLabel('数字或分数答案')).toHaveValue('21');
  await context.setOffline(true); await page.getByLabel('数字或分数答案').fill('22'); await page.locator('.daily-question-index button').nth(1).click(); await expect(page.getByLabel('数字或分数答案')).toHaveValue('22'); await expect(page.locator('.daily-question-index button').nth(0)).toHaveAttribute('aria-current', 'step');
  await context.setOffline(false); await expect.poll(async () => (await call(f.actor, f.itemPath)).draft?.answer.response.value).toBe('22'); await expect(page.locator('.studio-question-top')).toContainText('草稿已保存');
});

test('recovery: unavailable browser storage keeps the full answer editable and offers a real downloaded copy', async ({ page }) => {
  await page.addInitScript(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.startsWith('studyagent.answer.')) throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); return original.call(this, key, value); }; });
  const f = await setup(page, 'diagnostic', 'numeric_blank'); await page.getByLabel('数字或分数答案').fill('17'); await expect(page.getByLabel('作答保存状态')).toContainText('暂不能保留离线副本'); await expect.poll(async () => (await call(f.actor, f.itemPath)).draft?.response.value).toBe('17');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '下载我的作答', exact: true }).click(); const received = await download, copy = JSON.parse(readFileSync((await received.path())!, 'utf8')); expect(copy.localAnswer.response.value).toBe('17'); expect(copy).not.toHaveProperty('token');
});

test('recovery: attachment completion revalidates a conflict without another upload or a manufactured first answer', async ({ page }) => {
  const f = await setup(page, 'practice', 'audio_record'); let starts = 0, completions = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/learning/media')) starts++; });
  await page.route('**/api/learning/media/*/complete', async route => { completions++; if (completions === 1) await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ data: null, error: { code: 'conflict', message: '数据已更新，请重试本次操作' } }) }); else await route.continue(); });
  await fill(page, 'audio_record', true); await expect.poll(async () => (await call(f.actor, f.itemPath)).draft?.answer.response.mediaIds?.length).toBe(1);
  expect(starts).toBe(1); expect(completions).toBeGreaterThanOrEqual(2); expect(completions).toBeLessThanOrEqual(3); expect((await call(f.actor, '/learning/practice/' + f.sessionId)).summary.attempted).toBe(0);
});

test('recovery: a delayed old question read cannot reopen a practice after the learner has left', async ({ page }) => {
  const f = await setup(page, 'practice', 'numeric_blank'), session = await call(f.actor, '/learning/practice/' + f.sessionId), nextPath = '/learning/practice/' + f.sessionId + '/questions/' + session.questions[1].id;
  let release!: () => void, reached = false, finished = false; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**' + nextPath, async route => { const response = await route.fetch(); reached = true; await gate; await route.fulfill({ response }); finished = true; });
  try { await page.locator('.daily-question-index button').nth(1).click(); await expect.poll(() => reached).toBe(true); await page.getByRole('button', { name: '← 返回今日安排', exact: true }).click(); await expect(page.locator('.daily-question-index')).toHaveCount(0); release(); await expect.poll(() => finished).toBe(true); await expect(page.locator('.studio-question')).toHaveCount(0); }
  finally { release(); }
});

test('recovery: an older tab keeps its original attempt binding after another page submits the first answer', async ({ page }) => {
  const f = await setup(page, 'practice', 'numeric_blank'), other = await page.context().newPage(); other.on('dialog', dialog => dialog.accept());
  try { await other.goto(f.href); await expect(other.getByLabel('数字或分数答案')).toBeVisible(); await other.route('**' + f.itemPath + '/draft', route => route.abort('failed'));
    await other.getByLabel('数字或分数答案').fill('9'); await expect(other.locator('.studio-question-top')).toContainText('仅本地草稿');
    await page.getByLabel('数字或分数答案').fill('6'); await page.getByRole('button', { name: '完成这一题 →', exact: true }).click(); await expect(page.locator('.daily-feedback')).toBeVisible();
    await other.unroute('**' + f.itemPath + '/draft'); await other.reload(); await expect(other.locator('.studio-question-top')).toContainText('草稿版本有冲突');
    const copy = other.waitForEvent('download'); await other.getByRole('button', { name: '保留副本，继续本地稿' }).click(); await copy; await expect(other.getByLabel('作答保存状态')).toContainText('作答次数已变化');
    await other.reload(); await expect(other.locator('.studio-question-top')).toContainText('草稿版本有冲突'); await expect(other.getByLabel('数字或分数答案')).toHaveValue('9'); expect((await call(f.actor, f.itemPath)).draft).toBeNull(); expect((await call(f.actor, '/learning/practice/' + f.sessionId)).questions[0].attempts).toBe(1);
    const saved = other.waitForEvent('download'); await other.getByRole('button', { name: '保留副本，读取服务端稿' }).click(); await saved; await expect(other.getByLabel('数字或分数答案')).toHaveValue('6'); await expect(other.getByRole('button', { name: '再想一次', exact: true })).toBeEnabled();
  } finally { await other.close(); }
});
async function setup(page: Page, kind: string, mode: string) {
  const suffix = Date.now() + '-' + Math.floor(Math.random() * 100000), principal = 'answer-' + suffix + '@local.test', credential = 'Answer-only-' + suffix;
  const response = await fetch(api + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Forwarded-For': '198.19.12.' + (++address) }, body: JSON.stringify({ principal, credential }) });
  expect(response.status).toBe(201); const actor = (await response.json()).data;
  const child = (await call(actor, '/students', { nickname: '题型验收', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile;
  const fixture = await call(actor, '/qa/answer-journeys', { studentId: child.id, mode, kind });
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential); await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.goto(fixture.href); await expect(page.locator('.studio-question fieldset').first()).toBeVisible();
  return { actor, ...fixture };
}
function wav() {
  const frames = 16000, raw = Buffer.alloc(44 + frames * 2); raw.write('RIFF'); raw.writeUInt32LE(raw.length - 8, 4); raw.write('WAVEfmt ', 8); raw.writeUInt32LE(16, 16); raw.writeUInt16LE(1, 20); raw.writeUInt16LE(1, 22); raw.writeUInt32LE(16000, 24); raw.writeUInt32LE(32000, 28); raw.writeUInt16LE(2, 32); raw.writeUInt16LE(16, 34); raw.write('data', 36); raw.writeUInt32LE(frames * 2, 40); for (let n = 0; n < frames; n++) raw.writeInt16LE(Math.round(Math.sin(n * Math.PI * 440 / 8000) * 2000), 44 + n * 2); return raw;
}
async function fill(page: Page, mode: string, full: boolean) {
  const field = page.locator('.studio-question fieldset').first();
  if (mode === 'single_choice') await field.getByRole('radio').nth(full ? 0 : 1).check();
  if (mode === 'multiple_choice') await field.getByRole('checkbox').nth(full ? 1 : 0).check();
  if (mode === 'boolean') await field.getByRole('radio').nth(full ? 0 : 1).check();
  if (mode === 'numeric_blank') await field.getByLabel('数字或分数答案').fill(full ? '6' : '1/');
  if (mode === 'text_blank') await field.getByLabel('文字填空答案').fill(full ? '甲' : '我先想一想');
  if (mode === 'short_answer') await field.getByLabel('文字作答').fill(full ? '甲' : '我先想一想');
  if (mode === 'formula_blank') { const math = field.locator('math-field'); await expect(math).toBeVisible(); await math.click(); await expect(math).toBeFocused(); await page.keyboard.press('Control+A'); await page.keyboard.type(full ? '1+2' : '1+'); await expect(math).toHaveJSProperty('value', full ? '1+2' : '1+'); await page.keyboard.press('Tab'); }
  if (mode === 'multi_blank') await field.getByRole('textbox').nth(full ? 1 : 0).fill(full ? '乙' : '甲');
  if (mode === 'table_fill') await field.getByRole('textbox').nth(full ? 1 : 0).fill(full ? '2' : '1');
  if (mode === 'matching' || mode === 'drag_drop') await field.getByRole('combobox').nth(full ? 1 : 0).selectOption(full ? 'y' : 'x');
  if (mode === 'sorting') { await field.getByRole('button', { name: full ? '＋ 乙' : '＋ 甲', exact: true }).click(); if (full) { await field.getByLabel('将第2项上移').click(); await field.getByLabel('将第1项下移').click(); } }
  if (mode === 'hotspot') await field.locator('.answer-hotspot-options').getByRole('button', { name: full ? '甲' : '乙', exact: true }).click();
  if (mode === 'geometry_draw') {
    if (!full) { const svg = field.locator('.answer-drawing-canvas'); await svg.scrollIntoViewIfNeeded(); const box = (await svg.boundingBox())!; await page.mouse.move(box.x + 30, box.y + 30); await page.mouse.down(); await page.mouse.move(box.x + 80, box.y + 30); await page.mouse.move(box.x + 80, box.y + 70); await page.mouse.up(); }
    await field.getByRole('textbox').fill(full ? '长4格宽3格，共12个单位正方形' : '我先画出一行');
  }
  if (mode === 'stepwise') { if (full) await field.getByRole('button', { name: '＋ 再写一步' }).click(); await field.getByRole('textbox').nth(full ? 1 : 0).fill(full ? '再核对结果' : '先列条件'); }
  if (mode === 'image_upload' || mode === 'audio_record') {
    await field.getByRole('textbox').fill(full ? '完整的作答说明' : '先保留尚未上传的说明');
    if (full) { const image = mode === 'image_upload', buffer = image ? await sharp({ create: { width: 240, height: 180, channels: 3, background: '#dce8dc' } }).png().toBuffer() : wav();
      await field.locator('input[type=file]').setInputFiles({ name: image ? 'answer.png' : 'answer.wav', mimeType: image ? 'image/png' : 'audio/wav', buffer });
      await expect(field.locator('.saved-media-evidence[data-student-media-state=ready]')).toHaveCount(1, { timeout: 30000 });
    }
  }
}
async function values(page: Page) {
  return page.locator('.studio-question fieldset').first().evaluate(field => ({
    inputs: [...field.querySelectorAll('input:not([type=file]),textarea,select')].map(el => ({ value: (el as HTMLInputElement).value, checked: ['radio','checkbox'].includes((el as HTMLInputElement).type) ? (el as HTMLInputElement).checked : null })),
    math: [...field.querySelectorAll('math-field')].map(el => (el as HTMLElement & { value: string }).value),
    strokes: [...field.querySelectorAll('.answer-drawing-canvas polyline')].map(el => el.getAttribute('points')),
    hotspots: [...field.querySelectorAll('.answer-hotspot-options button')].map(el => el.getAttribute('aria-pressed')),
    sorting: [...field.querySelectorAll('.answer-sorting ol li > span')].map(el => el.textContent),
  }));
}
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });
for (const kind of ['diagnostic', 'practice']) for (const [index, mode] of modes.entries()) {
  test(`${kind} ${mode}: incomplete input, reload, continued editing, first submit and historical read`, async ({ page }) => {
    test.setTimeout(90000); await page.setViewportSize({ width: [390,768,1440][index % 3], height: 1000 }); const f = await setup(page, kind, mode);
    await fill(page, mode, false); await expect.poll(async () => (await call(f.actor, f.itemPath)).draftState.revision).toBeGreaterThan(0); await expect(page.locator('.studio-question-top')).toContainText('草稿已保存');
    const before = await values(page), read = await call(f.actor, f.itemPath), draft = kind === 'diagnostic' ? read.draft : read.draft.answer;
    expect(read.draftState.revision).toBeGreaterThan(0); await page.reload(); await expect(page.locator('.studio-question fieldset').first()).toBeVisible(); await expect.poll(() => values(page)).toEqual(before);
    await fill(page, mode, true); await expect.poll(async () => (await call(f.actor, f.itemPath)).draftState.revision).toBeGreaterThan(read.draftState.revision); await expect(page.locator('.studio-question-top')).toContainText('草稿已保存');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const final = await call(f.actor, f.itemPath), expected = kind === 'diagnostic' ? final.draft : final.draft.answer; expect(expected).not.toEqual(draft);
    const submitButton = page.getByRole('button', { name: kind === 'diagnostic' ? '提交，下一步 →' : '完成这一题 →', exact: true }); await submitButton.scrollIntoViewIfNeeded();
    expect(await submitButton.evaluate(button => { const box = button.getBoundingClientRect(); return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)); })).toBe(true);
    if (['geometry_draw','table_fill','image_upload'].includes(mode)) { mkdirSync('data/qa/answer-draft-screens', { recursive: true }); await page.screenshot({ path: `data/qa/answer-draft-screens/${kind}-${mode}-${[390,768,1440][index % 3]}.png`, fullPage: true }); }
    if (['image_upload','audio_record'].includes(mode)) { const media = await call(f.actor, '/learning/media/' + expected.response.mediaIds[0]); const response = await fetch(api.replace(/\/api$/, '') + media.url, { headers: { Authorization: 'Bearer ' + f.actor.token } }); expect(response.ok).toBe(true); const bytes = Buffer.from(await response.arrayBuffer()); expect(bytes.length).toBeGreaterThan(100); expect(createHash('sha256').update(bytes).digest('hex')).toBe(media.sha256); }
    const sent = page.waitForResponse(response => response.url().endsWith(f.responsesPath) && response.request().method() === 'POST');
    await page.getByRole('button', { name: kind === 'diagnostic' ? '提交，下一步 →' : '完成这一题 →', exact: true }).click(); const response = await sent; expect(response.status(), await response.text()).toBe(201); const receipt = (await response.json()).data;
    if (kind === 'diagnostic') {
      for (let n = 0; n < 3; n++) { await expect(page.getByRole('button', { name: '题目显示不清或有问题，先跳过', exact: true })).toBeEnabled(); await page.getByRole('button', { name: '题目显示不清或有问题，先跳过', exact: true }).click(); }
      await expect(page.getByRole('heading', { name: '从知识点看清下一步。' })).toBeVisible();
      const history = await call(f.actor, '/diagnostics/students/' + f.studentId + '/evidence/' + encodeURIComponent(receipt.responseId)); expect(history.originalResponse.answer).toEqual(expected); expect(history.response).not.toHaveProperty('requestHash');
      if (['geometry_draw','stepwise','image_upload','short_answer','audio_record'].includes(mode)) expect(history.originalResponse.status).toBe('pending_review');
    } else {
      await expect(page.locator('.daily-feedback')).toBeVisible(); await page.locator('.daily-question-index button').nth(1).click(); await expect(page.locator('.studio-question fieldset').first()).toBeVisible(); await page.locator('.daily-question-index button').nth(0).click(); await expect(page.locator('.daily-feedback')).toBeVisible();
      const history = await call(f.actor, f.itemPath); expect(history.feedback.attempt.answer).toEqual(expected); expect(history.feedback.attempt.attempt).toBe(1); expect(history.feedback.attempt).not.toHaveProperty('requestHash');
      if (['geometry_draw','stepwise','image_upload','short_answer','audio_record'].includes(mode)) expect(history.feedback.attempt.status).toBe('pending_review');
    }
  });
}
