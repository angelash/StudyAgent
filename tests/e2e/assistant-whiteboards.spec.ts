import { test, expect, type Page } from '@playwright/test';
import { syntheticFamilyHeaders } from './synthetic-family';
import { browserEvidence } from './evidence';
const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107') + '/api', evidence = browserEvidence('assistant-whiteboards');
async function call(actor: any, path: string, body?: unknown) {
  const response = await fetch(api + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + actor.token }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
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
  const before = JSON.parse((await page.evaluate(key => localStorage.getItem(key), f.key))!); expect(before.pending.requestKey).toBeTruthy();
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
