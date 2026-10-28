import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { syntheticFamilyHeaders } from './synthetic-family';
import { browserEvidence } from './evidence';
const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107') + '/api', evidence = browserEvidence('assistant-whiteboards');
async function call(actor: any, path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(api + path, { method, headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + actor.token }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json(); expect(response.ok, JSON.stringify(value.error)).toBe(true); return value.data;
}
async function fixture(page: Page) {
  const principal = 'source-board-ui-' + crypto.randomUUID() + '@local.test', credential = 'Owned-source-ui-' + crypto.randomUUID();
  const response = await fetch(api + '/auth/register', { method: 'POST', headers: await syntheticFamilyHeaders(page), body: JSON.stringify({ principal, credential }) }); expect(response.status).toBe(201); const actor = (await response.json()).data;
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential); await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  const descriptor = await call(actor, '/ai/assistant/lecture-context?courseId=sociology-foundations&lectureId=soc-u1-l1');
  const session = await call(actor, '/ai/assistant/sessions', { userRole: 'parent', studentId: null, subject: null, pageContext: 'classroom', contextRefType: 'classroom_lecture', contextRefId: descriptor.referenceId, contextItemId: descriptor.lectureId });
  const context = await call(actor, '/ai/assistant/sessions/' + session.id + '/context');
  const turn = await call(actor, '/ai/assistant/sessions/' + session.id + '/turns', { requestKey: crypto.randomUUID(), message: '[cite-course] 请解释个人困扰与公共议题的条件，并保留反例。', modelId: 'deepseek-v4-flash', contextVersion: context.contextVersion });
  await expect.poll(async () => (await call(actor, '/ai/assistant/sessions/' + session.id + '/turns/' + turn.id)).status, { timeout: 45000 }).toBe('completed');
  const history = await call(actor, '/ai/assistant/sessions/' + session.id + '/messages/page'), message = history.messages.find((m: any) => m.sender === 'assistant');
  const href = '/studio?view=home&mode=instant&lectureCourse=sociology-foundations&lecture=soc-u1-l1&lectureVersion=' + descriptor.fingerprint;
  await page.goto(href); await expect(page.getByLabel('想一起看看什么', { exact: true })).toBeEnabled();
  return { actor, session, message, href, base: '/ai/assistant/sessions/' + session.id + '/artifacts/whiteboards', key: 'studyagent.assistant.whiteboards.v1.' + encodeURIComponent(actor.user.id) + '.' + encodeURIComponent(session.id) };
}
const panel = (page: Page) => page.getByRole('dialog', { name: '对话教学白板', exact: true });
async function enter(page: Page, message: any) {
  await page.locator('[data-message-id="' + message.id + '"]').getByRole('button', { name: '整理为白板', exact: true }).click(); await expect(panel(page)).toBeVisible();
}
async function create(page: Page) {
  const dialog = panel(page); await dialog.getByRole('button', { name: '核对完整来源', exact: true }).click(); await expect(dialog.getByRole('button', { name: '生成教学草稿', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '生成教学草稿', exact: true }).click(); await expect(dialog.getByRole('link', { name: '打开教学草稿 →', exact: true })).toBeVisible();
}
async function localCache(page: Page, base: string) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key + '.' + sessionStorage.getItem('studyagent.topic-whiteboard.document-slot'))!), base);
}
for (const width of [390, 768, 880, 1440]) test('source whiteboard: complete original selection, mapped edit, adoption and player return at ' + width, async ({ page }) => {
  test.setTimeout(150000); await page.setViewportSize({ width, height: 980 }); const f = await fixture(page);
  await enter(page, f.message); const dialog = panel(page); await dialog.getByLabel('同时包含回答关联的原问题').check();
  await dialog.getByRole('button', { name: '核对完整来源', exact: true }).click(); await expect(dialog.locator('.tw-source-original')).toContainText(f.message.content);
  await expect(dialog.locator('.tw-source-original section')).toHaveCount(2); await expect(dialog.getByText('原教学年级：未指定 · 学生档案年级：未指定', { exact: true })).toBeVisible();
  expect(await dialog.evaluate(node => { const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; })).toBe(true);
  await page.screenshot({ path: evidence + '/source-selection-' + width + '.png' });
  await dialog.getByRole('button', { name: '生成教学草稿', exact: true }).click(); await expect(dialog.getByRole('link', { name: '打开教学草稿 →', exact: true })).toBeVisible();
  const summary = await call(f.actor, f.base); expect(summary.items).toHaveLength(1); expect(JSON.stringify(summary)).not.toContain(f.message.content);
  const id = summary.items[0].id; await dialog.getByRole('link', { name: '打开教学草稿 →', exact: true }).click();
  await expect(page.locator('.tw-generation-state')).toHaveText('待你核对', { timeout: 30000 }); await expect(page.locator('.tw-candidate>header')).toContainText('来自本人原对话');
  const original = await call(f.actor, '/learning/studio/topic-whiteboards/drafts/' + id), first = page.locator('.tw-scene-editor').first();
  await first.getByLabel('内容性质').selectOption('supplementary'); await first.getByLabel('来源或新增解释的说明').fill('这一幕新增条件对比，需结合完整原文核查。');
  await page.getByRole('button', { name: '保存完整改稿', exact: true }).click();
  await expect.poll(async () => (await call(f.actor, '/learning/studio/topic-whiteboards/drafts/' + id)).content.scenes[0].sourceMap.status).toBe('supplementary');
  const edited = await call(f.actor, '/learning/studio/topic-whiteboards/drafts/' + id); expect(edited.content.scenes[0].sourceMap.referenceKeys).toEqual([]); expect(edited.originalContent).toEqual(original.originalContent);
  await page.getByRole('checkbox', { name: '我已阅读未确定问题或手工改稿，知晓仍需内容核对' }).check();
  await page.getByRole('button', { name: '确认并保存这份白板', exact: true }).click(); await page.getByRole('button', { name: '打开已保存白板', exact: true }).click();
  const player = page.getByRole('dialog', { name: '白板视频' }); await expect(player).toBeVisible(); await expect(player.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  const adopted = await call(f.actor, '/learning/studio/topic-whiteboards/drafts/' + id), board = await call(f.actor, '/learning/studio/topic-whiteboards/' + adopted.whiteboardId);
  expect(JSON.stringify(board)).not.toContain('sourceMap'); expect(JSON.stringify(board)).not.toContain(f.message.id);
  await page.screenshot({ path: evidence + '/adopted-player-' + width + '.png' }); await player.getByRole('button', { name: '关闭白板', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('draft=' + id)); await expect(page.getByLabel('白板标题')).toBeVisible();
});
test('source whiteboard: a lost committed creation reply is recovered with the exact original key after refresh', async ({ page }) => {
  test.setTimeout(150000); const f = await fixture(page); let posts = 0;
  await page.route('**/api/ai/assistant/sessions/*/artifacts/whiteboards', async route => { if (route.request().method() !== 'POST') return route.continue(); posts++; const response = await route.fetch(); expect(response.status()).toBe(201); await route.abort('failed'); });
  await enter(page, f.message); const dialog = panel(page); await dialog.getByRole('button', { name: '核对完整来源', exact: true }).click(); await expect(dialog.getByRole('button', { name: '生成教学草稿', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '生成教学草稿', exact: true }).click(); await expect(dialog.getByRole('complementary', { name: '白板原创建操作' })).toBeVisible(); await expect(dialog.getByRole('alert')).toBeVisible();
  const before = await localCache(page, f.key); expect(before.pending.requestKey).toBeTruthy();
  await page.reload(); await expect(page.getByLabel('想一起看看什么', { exact: true })).toBeEnabled(); await enter(page, f.message);
  await dialog.getByRole('button', { name: '核对原请求', exact: true }).click(); await expect(dialog.getByRole('link', { name: '打开教学草稿 →', exact: true })).toBeVisible();
  await expect(dialog.getByRole('complementary', { name: '白板原创建操作' })).toHaveCount(0); expect(posts).toBe(1); expect((await call(f.actor, f.base)).items).toHaveLength(1);
  await page.screenshot({ path: evidence + '/original-create-recovered.png' });
});
test('source whiteboard: incomplete selection survives closing, restores focus and returns to the precise original message without changing the assistant draft', async ({ page }) => {
  test.setTimeout(150000); const f = await fixture(page), composer = page.getByLabel('想一起看看什么', { exact: true }); await composer.fill('原助教尚未发送的完整问题。');
  await enter(page, f.message); const dialog = panel(page); await dialog.getByLabel('白板教学目标').fill(''); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-message-id="' + f.message.id + '"]').getByRole('button', { name: '整理为白板', exact: true })).toBeFocused(); await enter(page, f.message);
  await expect(dialog.getByLabel('白板教学目标')).toHaveValue(''); await dialog.getByLabel('白板教学目标').fill('完整保留条件和反例，再回到原消息。');
  await dialog.getByRole('button', { name: '核对完整来源', exact: true }).click(); await dialog.locator('.tw-source-original>summary').click();
  await dialog.getByRole('button', { name: '返回这条原消息', exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(composer).toHaveValue('原助教尚未发送的完整问题。');
  await expect(page.locator('[data-message-id="' + f.message.id + '"]')).toBeFocused();
});
test('source whiteboard: another owner cache remains byte-for-byte intact and is never rendered as the current selection', async ({ page }) => {
  test.setTimeout(150000); const f = await fixture(page), sentinel = 'FOREIGN_PRIVATE_SOURCE_' + crypto.randomUUID();
  const raw = JSON.stringify({ version: 1, ownerId: 'other-owned-fixture', sessionId: f.session.id, form: { objective: sentinel }, pending: null, archived: [], draftId: null });
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: f.key, raw }); await enter(page, f.message); const dialog = panel(page);
  await expect(dialog.getByText('原白板缓存与当前身份或格式不一致，已保留原字节。当前选择可下载。')).toBeVisible(); await expect(dialog).not.toContainText(sentinel);
  await dialog.getByLabel('白板教学目标').fill('本人新的原文检查目标。'); expect(await page.evaluate(key => localStorage.getItem(key), f.key)).toBe(raw);
});
test('source whiteboard: an interrupted review resumes the original draft and fixed model through the actual workbench', async ({ page }) => {
  test.setTimeout(150000); const f = await fixture(page); await enter(page, f.message); await panel(page).getByLabel('白板教学目标').fill('[source-review-fail-once] 核查原问题中的全部比较条件');
  await create(page); await panel(page).getByRole('link', { name: '打开教学草稿 →', exact: true }).click(); await expect(page.getByRole('button', { name: '用原模型重试', exact: true })).toBeVisible();
  const id = new URL(page.url()).searchParams.get('draft'), first = await call(f.actor, '/learning/studio/topic-whiteboards/drafts/' + id); expect(first.originalContent).toBeTruthy();
  await page.getByRole('button', { name: '用原模型重试', exact: true }).click(); await expect(page.locator('.tw-generation-state')).toHaveText('待你核对', { timeout: 30000 });
  const resumed = await call(f.actor, '/learning/studio/topic-whiteboards/drafts/' + id); expect(resumed.originalContent).toEqual(first.originalContent); expect(resumed.modelId).toBe(first.modelId);
  await page.screenshot({ path: evidence + '/original-review-resumed.png' });
});
test('source whiteboard: normalized mapped edits settle cleanly and an actual409 retains the complete original command across reload', async ({ page }) => {
  test.setTimeout(150000); const f = await fixture(page); await enter(page, f.message); await create(page); await panel(page).getByRole('link', { name: '打开教学草稿 →', exact: true }).click();
  await expect(page.locator('.tw-generation-state')).toHaveText('待你核对'); const id = new URL(page.url()).searchParams.get('draft'), path = '/learning/studio/topic-whiteboards/drafts/' + id;
  const explanation = page.locator('.tw-scene-editor').first().getByLabel('来源或新增解释的说明'); await explanation.fill('  保留完整原文，明确核查这一幕的条件。  '); await page.getByRole('button', { name: '保存完整改稿', exact: true }).click();
  await expect(explanation).toHaveValue('保留完整原文，明确核查这一幕的条件。'); await expect(page.getByRole('button', { name: '保存完整改稿', exact: true })).toBeDisabled();
  const saved = await call(f.actor, path), serverContent = structuredClone(saved.content); serverContent.description = '另一设备的完整来源说明。';
  await call(f.actor, path + '/content', { expectedRevision: saved.revision, contentFingerprint: saved.contentFingerprint, content: serverContent, requestKey: crypto.randomUUID() }, 'PATCH');
  const local = '本机仍保留的完整说明_' + crypto.randomUUID(); await page.getByLabel('讲解概要').fill(local); await page.getByRole('button', { name: '保存完整改稿', exact: true }).click();
  await expect(page.locator('.tw-conflict')).toContainText('服务器稿已变化'); await expect(page.getByLabel('讲解概要')).toHaveValue(local);
  await page.locator('.tw-rejected-edits>summary').click(); const download = page.waitForEvent('download'); await page.getByRole('button', { name: '下载完整原修改请求', exact: true }).click();
  const file = await download, copy = JSON.parse(await readFile((await file.path())!, 'utf8')); expect(copy.command.expectedRevision).toBe(saved.revision); expect(copy.command.content.description).toBe(local); expect(copy.command.content.scenes[0].sourceMap).toEqual(saved.content.scenes[0].sourceMap);
  await page.reload(); await expect(page.getByLabel('讲解概要')).toHaveValue(local); await expect(page.locator('.tw-rejected-edits>summary')).toHaveText('已保留的失败原修改请求（1）');
  await page.screenshot({ path: evidence + '/source409-original-command.png' });
});
test('source whiteboard: a real learner preserves local mapped edits during paused assessment and explicitly rechecks before saving again', async ({ page }) => {
  test.setTimeout(180000); const f = await fixture(page), student = (await call(f.actor, '/students', { nickname: '匿名来源白板学习者', grade: 4, preferredSessionMinutes: 10, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile;
  const course = await call(f.actor, '/qa/assistant/course', { kind: 'primary_unit', studentId: student.id });
  await call(f.actor, '/students/' + student.id + '/learning-scope', { subject: 'math', grade: 4, term: 'upper', textbookVolumeId: null, textbookVersion: '匿名已学范围', learnedAtomIds: ['atomic:math:averagecount'], currentAtomId: 'atomic:math:averagecount', minutesPerSession: 10 }, 'PUT');
  const access = await call(f.actor, '/students/' + student.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: crypto.randomUUID(), reason: '隔离来源白板评测保护' }), code = await call(f.actor, '/students/' + student.id + '/learning-access/codes', { expectedVersion: access.version, requestKey: crypto.randomUUID() });
  await page.goto('/student/login'); await page.getByLabel('一次性学习码').fill(code.code); const login = page.waitForResponse(r => r.url().endsWith('/api/auth/learning-code') && r.request().method() === 'POST'); await page.getByRole('button', { name: '进入我的学习 →', exact: true }).click(); const learner = (await (await login).json()).data; await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  const open = page.waitForResponse(r => r.url().endsWith('/api/ai/assistant/sessions') && r.request().method() === 'POST'); await page.goto(course.href); const session = (await (await open).json()).data;
  const context = await call(learner, '/ai/assistant/sessions/' + session.id + '/context'), turn = await call(learner, '/ai/assistant/sessions/' + session.id + '/turns', { requestKey: crypto.randomUUID(), message: '[cite-course] 保留比较条件和检查依据。', modelId: 'deepseek-v4-flash', contextVersion: context.contextVersion });
  await expect.poll(async () => (await call(learner, '/ai/assistant/sessions/' + session.id + '/turns/' + turn.id)).status, { timeout: 45000 }).toBe('completed'); const message = (await call(learner, '/ai/assistant/sessions/' + session.id + '/messages/page')).messages.find((m: any) => m.sender === 'assistant');
  await page.reload(); await enter(page, message); await create(page); await panel(page).getByRole('link', { name: '打开教学草稿 →', exact: true }).click(); await expect(page.locator('.tw-generation-state')).toHaveText('待你核对');
  const id = new URL(page.url()).searchParams.get('draft'), path = '/learning/studio/topic-whiteboards/drafts/' + id, before = await call(learner, path), local = '暂停评测前保留的完整本机说明。'; await page.getByLabel('讲解概要').fill(local);
  const formal = await call(f.actor, '/diagnostics/sessions', { studentId: student.id, subject: 'math', intent: 'baseline', targetAtomIds: ['atomic:math:averagecount'], includePrerequisites: false, maxItems: 4 });
  const active = await call(f.actor, '/diagnostics/sessions/' + formal.id); await call(f.actor, '/diagnostics/sessions/' + formal.id + '/state', { action: 'pause', expectedRevision: active.revision, requestKey: crypto.randomUUID(), reason: '暂停匿名来源白板保护检查，不产生测量结论' });
  await page.getByRole('button', { name: '保存完整改稿', exact: true }).click(); const block = page.getByRole('complementary', { name: '当前评测保护' }); await expect(block.getByRole('link', { name: '进入原评测', exact: true })).toHaveAttribute('href', '/student/assessment?session=' + formal.id);
  await expect(page.getByRole('button', { name: '保存完整改稿', exact: true })).toBeDisabled(); await expect(page.getByLabel('讲解概要')).toHaveValue(local); expect((await call(learner, path)).revision).toBe(before.revision);
  const paused = await call(f.actor, '/diagnostics/sessions/' + formal.id); await call(f.actor, '/diagnostics/sessions/' + formal.id + '/state', { action: 'abort', expectedRevision: paused.revision, requestKey: crypto.randomUUID(), reason: '结束隔离保护检查，不形成测量结果' });
  await expect(page.getByRole('button', { name: '保存完整改稿', exact: true })).toBeDisabled(); await block.getByRole('button', { name: '重新核对白板权限', exact: true }).click(); await expect(block).toHaveCount(0);
  expect((await call(learner, path)).revision).toBe(before.revision); await page.getByRole('button', { name: '保存完整改稿', exact: true }).click();
  await expect.poll(async () => (await call(learner, path)).content.description).toBe(local); await page.screenshot({ path: evidence + '/paused-source-guard-resumed.png' });
});
test('source whiteboard: actual private PNG generation, original editing, adoption and sentence narration use the existing classroom', async ({ page }) => {
  test.setTimeout(180000); const f = await fixture(page);
  await page.route('**/api/learning/studio/overview?*', async route => {
    const response = await route.fetch(); if (!response.ok()) return route.fulfill({ response });
    const payload = await response.json(); payload.data.narrationAvailable = true; payload.data.speech = { available: true, provider: 'minimax', defaultVoice: 'fixture-a', voices: [{ id: 'fixture-a', label: '受控匿名音轨' }] };
    await route.fulfill({ response, json: payload });
  });
  await enter(page, f.message); await create(page); await panel(page).getByRole('link', { name: '打开教学草稿 →', exact: true }).click(); await expect(page.locator('.tw-generation-state')).toHaveText('待你核对');
  const pane = page.getByRole('region', { name: '白板配图工作区' }); await pane.getByLabel('希望图片说明什么').fill('用两个有交集的圆说明整体与单位的比较关系。');
  await pane.getByRole('button', { name: '预检配图范围', exact: true }).click(); await expect(pane).toContainText('本人原对话 · 原教学年级：未指定'); await pane.getByRole('button', { name: '生成参考图', exact: true }).click();
  const reader = pane.getByRole('button', { name: '放大参考图：明确整体', exact: true }); await expect(reader).toBeVisible({ timeout: 30000 }); await reader.click(); await expect(page.locator('.cl-figure-reader-sheet img')).toBeVisible(); await page.keyboard.press('Escape');
  await pane.getByRole('button', { name: '以原图继续修订', exact: true }).click(); await pane.getByLabel('具体修改').fill('保留两个圆，去掉顶部标题并保留完整标签。'); await pane.getByRole('button', { name: '预检配图范围', exact: true }).click(); await pane.getByRole('button', { name: '生成修订图片', exact: true }).click();
  await expect(reader).toBeVisible({ timeout: 30000 }); await pane.getByRole('checkbox', { name: '我已阅读图片，并核对本次要使用的标签和关系。' }).check(); await pane.getByRole('button', { name: '选入当前完整稿', exact: true }).click(); await page.getByRole('button', { name: '保存完整改稿', exact: true }).click();
  await page.getByRole('checkbox', { name: '我已阅读未确定问题或手工改稿，知晓仍需内容核对' }).check(); await page.getByRole('button', { name: '确认并保存这份白板', exact: true }).click(); await page.getByRole('button', { name: '打开已保存白板', exact: true }).click();
  const player = page.getByRole('dialog', { name: '白板视频' }); await expect(player.getByRole('button', { name: '放大参考图：明确整体', exact: true }).first()).toBeVisible();
  const speech = page.waitForResponse(r => /\/topic-whiteboards\/[^/]+\/narration\//.test(r.url())); await player.getByRole('button', { name: '播放', exact: true }).click(); const audio = await speech; expect(audio.status()).toBe(201); expect(audio.headers()['content-type']).toMatch(/^audio\//); await player.getByRole('button', { name: '暂停', exact: true }).click();
  await page.screenshot({ path: evidence + '/private-source-image-and-narration.png' });
});
test('source whiteboard: a creation that never reached the server retries only the complete original command', async ({ page }) => {
  test.setTimeout(150000); const f = await fixture(page); let first: any, second: any;
  await page.route('**/api/ai/assistant/sessions/*/artifacts/whiteboards', async route => { if (route.request().method() !== 'POST') return route.continue(); first = route.request().postDataJSON(); await route.abort('failed'); });
  await enter(page, f.message); await panel(page).getByRole('button', { name: '核对完整来源', exact: true }).click(); await expect(panel(page).getByRole('button', { name: '生成教学草稿', exact: true })).toBeEnabled(); await panel(page).getByRole('button', { name: '生成教学草稿', exact: true }).click(); await expect(panel(page).getByRole('alert')).toBeVisible();
  expect((await call(f.actor, f.base)).items).toHaveLength(0); await page.unroute('**/api/ai/assistant/sessions/*/artifacts/whiteboards');
  page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/artifacts/whiteboards')) second = r.postDataJSON(); });
  await panel(page).getByRole('button', { name: '核对原请求', exact: true }).click(); await expect(panel(page).getByRole('button', { name: '用原请求重试', exact: true })).toBeEnabled();
  await panel(page).getByRole('button', { name: '用原请求重试', exact: true }).click(); await expect(panel(page).getByRole('link', { name: '打开教学草稿 →', exact: true })).toBeVisible(); expect(second).toEqual(first); expect((await call(f.actor, f.base)).items).toHaveLength(1);
});


test('source whiteboard: two duplicated documents retain independent full selections across reload', async ({ page }) => {
  test.setTimeout(180000); const f = await fixture(page); await enter(page, f.message);
  await panel(page).getByLabel('白板教学目标').fill('甲页保留全部条件与反例。');
  const firstSlot = await page.evaluate(() => sessionStorage.getItem('studyagent.topic-whiteboard.document-slot'));
  const inherited = await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage))), other = await page.context().newPage();
  await other.addInitScript(values => { if (!sessionStorage.getItem('source-copy-test-initialized')) { for (const [key, value] of Object.entries(values)) sessionStorage.setItem(key, value); sessionStorage.setItem('source-copy-test-initialized', 'yes'); } }, inherited);
  try {
    await other.goto(f.href); await expect(other.getByLabel('想一起看看什么', { exact: true })).toBeEnabled(); await enter(other, f.message);
    await expect(panel(other).getByLabel('白板教学目标')).toHaveValue('甲页保留全部条件与反例。');
    const otherSlot = await other.evaluate(() => sessionStorage.getItem('studyagent.topic-whiteboard.document-slot')); expect(otherSlot).not.toBe(firstSlot);
    await panel(other).getByLabel('白板教学目标').fill('乙页独立核查，原甲页不覆盖。');
    await panel(page).getByLabel('白板教学目标').fill('甲页更新后的完整原稿。');
    expect((await localCache(other, f.key)).form.objective).toBe('乙页独立核查，原甲页不覆盖。');
    await page.reload(); await enter(page, f.message); await expect(panel(page).getByLabel('白板教学目标')).toHaveValue('甲页更新后的完整原稿。');
    await other.reload(); await enter(other, f.message); await expect(panel(other).getByLabel('白板教学目标')).toHaveValue('乙页独立核查，原甲页不覆盖。');
    await panel(page).locator('.assistant-whiteboard-local-copies>summary').click(); await panel(page).getByRole('button', { name: '读取最新本机草稿', exact: true }).click();
    await expect(panel(page).locator('.assistant-whiteboard-local-copies')).toContainText('乙页独立核查，原甲页不覆盖。');
    await page.screenshot({ path: evidence + '/independent-document-copies.png' }); expect((await call(f.actor, f.base)).items).toHaveLength(0);
  } finally { await other.close(); }
});

test('source whiteboard: multiple unfinished drafts keep an original pending creation when switching explicitly', async ({ page }) => {
  test.setTimeout(150000); const f = await fixture(page); await enter(page, f.message); const dialog = panel(page);
  await dialog.getByLabel('白板教学目标').fill('原请求的完整教学目标。');
  await page.route('**/api/ai/assistant/sessions/*/artifacts/whiteboards', async route => route.request().method() === 'POST' ? route.abort('failed') : route.continue());
  await dialog.getByRole('button', { name: '核对完整来源', exact: true }).click(); await expect(dialog.getByRole('button', { name: '生成教学草稿', exact: true })).toBeEnabled(); await dialog.getByRole('button', { name: '生成教学草稿', exact: true }).click(); await expect(dialog.getByRole('alert')).toBeVisible();
  const original = await localCache(page, f.key); expect(original.pending).toBeTruthy();
  await dialog.locator('.assistant-whiteboard-local-copies>summary').click(); await dialog.getByRole('button', { name: '另起一份白板草稿', exact: true }).click();
  await dialog.getByLabel('白板教学目标').fill('第二份尚未完成的目标。');
  const copies = dialog.locator('.assistant-whiteboard-local-copies'); await copies.getByRole('button', { name: /原请求的完整教学目标/ }).click();
  await expect(dialog.getByLabel('白板教学目标')).toHaveValue('原请求的完整教学目标。'); expect((await localCache(page, f.key)).pending).toEqual(original.pending);
  await expect(dialog.getByRole('button', { name: '用原请求重试', exact: true })).toHaveCount(0); expect((await call(f.actor, f.base)).items).toHaveLength(0);
  await page.unroute('**/api/ai/assistant/sessions/*/artifacts/whiteboards'); await dialog.getByRole('button', { name: '核对原请求', exact: true }).click(); await dialog.getByRole('button', { name: '用原请求重试', exact: true }).click();
  await expect(dialog.getByRole('link', { name: '打开教学草稿 →', exact: true })).toBeVisible();
  await copies.getByRole('button', { name: /第二份尚未完成的目标/ }).click(); await expect(dialog.getByLabel('白板教学目标')).toHaveValue('第二份尚未完成的目标。'); expect((await call(f.actor, f.base)).items).toHaveLength(1);
});

test('source whiteboard: a valid legacy source cache is restored without changing its original bytes', async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  const legacy = { version: 1, ownerId: f.actor.user.id, sessionId: f.session.id, form: { selection: { messageIds: [f.message.id], includeLinkedQuestions: true }, objective: '旧版完整目标与确认分别保留。', modelId: 'deepseek-v4-flash', acknowledgeHistoricalSource: true }, pending: null, archived: [], draftId: null }, raw = JSON.stringify(legacy);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: f.key, raw }); await enter(page, f.message);
  await expect(panel(page).getByLabel('白板教学目标')).toHaveValue(legacy.form.objective); await expect(panel(page).getByLabel('我已核对原教学版本，允许使用旧来源')).toBeChecked();
  await panel(page).getByLabel('白板教学目标').fill('只修改本页独立副本。'); expect(await page.evaluate(key => localStorage.getItem(key), f.key)).toBe(raw);
  await page.reload(); await enter(page, f.message); await expect(panel(page).getByLabel('白板教学目标')).toHaveValue('只修改本页独立副本。'); expect(await page.evaluate(key => localStorage.getItem(key), f.key)).toBe(raw);
});

test('source whiteboard: unavailable storage blocks unsaved switching and creation until the complete original command is downloaded', async ({ page }) => {
  test.setTimeout(150000); const f = await fixture(page); await enter(page, f.message); const dialog = panel(page);
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.startsWith('studyagent.assistant.whiteboards.v1.')) throw new DOMException('Owned QA full storage', 'QuotaExceededError'); return original.call(this, key, value); }; });
  await dialog.getByLabel('白板教学目标').fill('存储失败也必须完整保留的目标。'); await dialog.locator('.assistant-whiteboard-local-copies>summary').click(); await dialog.getByRole('button', { name: '另起一份白板草稿', exact: true }).click(); await expect(dialog.getByLabel('白板教学目标')).toHaveValue('存储失败也必须完整保留的目标。');
  let posts = 0; page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/artifacts/whiteboards')) posts++; });
  await dialog.getByRole('button', { name: '核对完整来源', exact: true }).click(); await expect(dialog.getByRole('button', { name: '生成教学草稿', exact: true })).toBeEnabled(); await dialog.getByRole('button', { name: '生成教学草稿', exact: true }).click();
  await expect(dialog).toContainText('完整原请求尚未写入本机'); expect(posts).toBe(0);
  await dialog.getByRole('button', { name: '核对原请求', exact: true }).click(); const download = page.waitForEvent('download'); await dialog.getByRole('button', { name: '下载完整本机草稿', exact: true }).click();
  const file = await download, copy = JSON.parse(await readFile((await file.path())!, 'utf8')); expect(copy.pending.requestKey).toBeTruthy(); expect(copy.form.objective).toBe('存储失败也必须完整保留的目标。');
  await dialog.getByRole('button', { name: '用原请求重试', exact: true }).click(); await expect(dialog.getByRole('link', { name: '打开教学草稿 →', exact: true })).toBeVisible(); expect(posts).toBe(1);
  const saved = (await call(f.actor, f.base)).items; expect(saved).toHaveLength(1); const receipt = await call(f.actor, f.base + '/requests/' + encodeURIComponent(copy.pending.requestKey)); expect(receipt.id).toBe(saved[0].id); expect(receipt.receipt.key).toBe(copy.pending.requestKey);
});

test('source whiteboard: the complete over-budget source stays visible and reducing the selection requires a new preflight', async ({ page }) => {
  test.setTimeout(150000); const f = await fixture(page), seeded = await call(f.actor, '/qa/assistant/seed-history', { sessionId: f.session.id, count: 6, marker: '完整预算末尾_MARKER', longSource: true });
  await page.reload(); await enter(page, f.message); const dialog = panel(page);
  for (const id of seeded.ids) await dialog.locator('.assistant-notes-message').filter({ has: page.locator('input') }).filter({ hasText: '匿名历史第' + seeded.ids.indexOf(id) + '条' }).getByRole('checkbox').check();
  await dialog.getByRole('button', { name: '核对完整来源', exact: true }).click(); await expect(dialog.locator('.tw-source-context')).toContainText('完整预算末尾_MARKER'); await expect(dialog.getByRole('button', { name: '生成教学草稿', exact: true })).toBeDisabled();
  const before = await localCache(page, f.key); expect(before.form.selection.messageIds).toHaveLength(7); await dialog.locator('.tw-source-original>summary').click(); await expect(dialog.locator('.tw-source-original section')).toHaveCount(7);
  for (let index = 0; index < seeded.ids.length; index++) await dialog.locator('.assistant-notes-message').filter({ hasText: '匿名历史第' + index + '条' }).getByRole('checkbox').uncheck();
  await expect(dialog.locator('.tw-source-context')).toHaveCount(0); await expect(dialog.getByRole('button', { name: '生成教学草稿', exact: true })).toBeDisabled(); await dialog.getByRole('button', { name: '核对完整来源', exact: true }).click(); await expect(dialog.getByRole('button', { name: '生成教学草稿', exact: true })).toBeEnabled(); expect((await call(f.actor, f.base)).items).toHaveLength(0);
});

test('source whiteboard: closing during a late original preflight cannot populate the reopened selection', async ({ page }) => {
  test.setTimeout(150000); const f = await fixture(page); let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { entered = resolve; });
  await page.route('**/api/ai/assistant/sessions/*/artifacts/whiteboards/preflight', async route => { const response = await route.fetch(); entered(); await held; try { await route.fulfill({ response }); } catch { /* Closed panel aborted its private response. */ } });
  try {
    await enter(page, f.message); await panel(page).getByRole('button', { name: '核对完整来源', exact: true }).click(); await ready; await page.keyboard.press('Escape'); await expect(panel(page)).toHaveCount(0); await enter(page, f.message); await panel(page).getByLabel('白板教学目标').fill('重新打开后自己的新目标。'); release();
    await page.unroute('**/api/ai/assistant/sessions/*/artifacts/whiteboards/preflight'); await expect(panel(page).locator('.tw-source-context')).toHaveCount(0); await expect(panel(page).getByRole('button', { name: '生成教学草稿', exact: true })).toBeDisabled();
    await panel(page).getByRole('button', { name: '核对完整来源', exact: true }).click(); await expect(panel(page).getByRole('button', { name: '生成教学草稿', exact: true })).toBeEnabled(); expect((await call(f.actor, f.base)).items).toHaveLength(0);
  } finally { release?.(); }
});
