import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { syntheticFamilyHeaders } from './synthetic-family';
import { browserEvidence } from './evidence';
const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107') + '/api', evidence = browserEvidence('assistant-notes');
async function call(actor: any, path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(api + path, { method, headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + actor.token }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json(); expect(response.ok, JSON.stringify(value.error)).toBe(true); return value.data;
}
async function fixture(page: Page) {
  const principal = 'note-ui-' + crypto.randomUUID() + '@local.test', credential = 'Synthetic-note-ui-' + crypto.randomUUID();
  const response = await fetch(api + '/auth/register', { method: 'POST', headers: await syntheticFamilyHeaders(page), body: JSON.stringify({ principal, credential }) }); expect(response.status).toBe(201); const actor = (await response.json()).data;
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential); await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  const d = await call(actor, '/ai/assistant/lecture-context?courseId=sociology-foundations&lectureId=soc-u1-l1');
  const session = await call(actor, '/ai/assistant/sessions', { userRole: 'parent', studentId: null, subject: null, pageContext: 'classroom', contextRefType: 'classroom_lecture', contextRefId: d.referenceId, contextItemId: d.lectureId });
  const context = await call(actor, '/ai/assistant/sessions/' + session.id + '/context');
  const turn = await call(actor, '/ai/assistant/sessions/' + session.id + '/turns', { requestKey: crypto.randomUUID(), message: '[cite-course] 请保留具体条件和反例。', modelId: 'deepseek-v4-flash', contextVersion: context.contextVersion });
  await expect.poll(async () => (await call(actor, '/ai/assistant/sessions/' + session.id + '/turns/' + turn.id)).status, { timeout: 45000 }).toBe('completed');
  const history = await call(actor, '/ai/assistant/sessions/' + session.id + '/messages/page'), message = history.messages.find((m: any) => m.sender === 'assistant');
  const href = '/studio?view=home&mode=instant&lectureCourse=sociology-foundations&lecture=soc-u1-l1&lectureVersion=' + d.fingerprint;
  await page.goto(href); await expect(page.getByLabel('想一起看看什么', { exact: true })).toBeEnabled();
  const base = '/ai/assistant/sessions/' + session.id + '/artifacts/notes'; return { actor, session, message, question: history.messages.find((m: any) => m.sender === 'user'), href, base };
}
const panel = (page: Page) => page.getByRole('dialog', { name: '私人学习笔记', exact: true });
async function enter(page: Page, message: any) { await page.locator('[data-message-id="' + message.id + '"]').getByRole('button', { name: '整理为笔记', exact: true }).click(); await expect(panel(page)).toBeVisible(); }
async function create(page: Page) {
  const dialog = panel(page); await dialog.getByRole('button', { name: '核对完整来源', exact: true }).click(); await expect(dialog.getByText(/完整来源 \d+ \/ 18000 字符/)).toBeVisible();
  await dialog.getByRole('button', { name: '保存逐字候选', exact: true }).click(); await expect(dialog.getByLabel('笔记编辑稿')).toBeEnabled();
}
for (const width of [390, 768, 880, 1440]) test('assistant notes: original source, explicit editing/adoption/export and original-message return at' + width, async ({ page }) => {
  test.setTimeout(120000); await page.setViewportSize({ width, height: 960 }); const f = await fixture(page), composer = page.getByLabel('想一起看看什么', { exact: true }); await composer.fill('原助教的完整未发送草稿。');
  const posts: string[] = []; page.on('request', r => { if (r.method() === 'POST' && /\/ai\/assistant\/sessions(?:$|\/[^/]+\/turns$)/.test(new URL(r.url()).pathname)) posts.push(r.url()); });
  await enter(page, f.message); const dialog = panel(page); await dialog.getByLabel('同时包含回答关联的原问题').check(); await dialog.getByLabel('笔记标题').fill('条件、证据与反例'); await create(page);
  await expect(dialog.locator('.assistant-notes-original')).toContainText(f.message.content); await expect(dialog.locator('.assistant-notes-original article')).toHaveCount(2);
  const edited = '  完整编辑稿\n|条件|证据|\n|---|---|\n|匿名观察|保持完整|\n公式 $a+b$\n```js\nconsole.log("不执行");\n```\n<script>window.noteInjected=true</script>\n  ';
  await dialog.getByLabel('笔记编辑稿').fill(edited); await expect(dialog.getByRole('button', { name: '采用这份笔记', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: '保存编辑稿', exact: true }).click(); await expect(dialog.getByLabel('我已核对原文和编辑稿')).toBeEnabled(); await dialog.getByLabel('我已核对原文和编辑稿').check();
  await dialog.getByRole('button', { name: '采用这份笔记', exact: true }).click(); await expect(dialog.getByLabel('笔记编辑稿')).toHaveAttribute('readonly', ''); await expect(dialog.getByLabel('笔记编辑稿')).toHaveValue(edited);
  const reading = dialog.getByRole('region', { name: '笔记阅读稿', exact: true }); await expect(reading.getByRole('columnheader')).toHaveCount(2); await expect(reading.getByRole('cell', { name: '匿名观察', exact: true })).toBeVisible(); await expect(reading.locator('math')).toHaveCount(1); await expect(reading.getByLabel('笔记代码原文')).toContainText('console.log("不执行");');
  const saved = await call(f.actor, f.base); expect(saved.items).toHaveLength(1); expect(saved.items[0].status).toBe('confirmed');
  const original = await call(f.actor, f.base + '/' + saved.items[0].id); expect(original.origin.messages.some((m: any) => m.content === f.message.content)).toBe(true);
  const jsonDownload = page.waitForEvent('download'); await dialog.getByRole('button', { name: '下载完整JSON', exact: true }).click(); const jsonFile = await jsonDownload, json = JSON.parse(await readFile((await jsonFile.path())!, 'utf8')); expect(json.markdown).toBe(edited); expect(json.origin).toEqual(original.origin); expect(JSON.stringify(json)).not.toMatch(/requestKey|commands|tokenHash/);
  const mdDownload = page.waitForEvent('download'); await dialog.getByRole('button', { name: '下载完整Markdown', exact: true }).click(); const mdFile = await mdDownload; expect(await readFile((await mdFile.path())!, 'utf8')).toContain(edited);
  expect(await page.evaluate(() => (window as any).noteInjected)).toBeUndefined(); expect(await dialog.evaluate(node => node.getBoundingClientRect().right <= innerWidth && node.getBoundingClientRect().left >= 0)).toBe(true);
  await page.screenshot({ path: evidence + '/confirmed-' + width + '.png' }); await dialog.getByRole('button', { name: '返回原消息', exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(composer).toHaveValue('原助教的完整未发送草稿。'); await expect(page.locator('[data-message-id="' + f.message.id + '"]')).toBeFocused(); expect(posts).toEqual([]);
});

test('assistant notes: a committed create with a lost HTTP reply survives refresh and recovers without another create', async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page); let count = 0;
  await page.route('**/api/ai/assistant/sessions/*/artifacts/notes', async route => { if (route.request().method() !== 'POST') return route.continue(); count++; const response = await route.fetch(); expect(response.status()).toBe(201); await route.abort('failed'); });
  await enter(page, f.message); const dialog = panel(page); await dialog.getByRole('button', { name: '核对完整来源', exact: true }).click(); await expect(dialog.getByRole('button', { name: '保存逐字候选', exact: true })).toBeEnabled(); await dialog.getByRole('button', { name: '保存逐字候选', exact: true }).click();
  await expect(dialog.getByRole('complementary', { name: '笔记原操作' })).toBeVisible(); await expect(dialog.getByRole('alert')).toContainText('原操作仍保留');
  await page.reload(); await expect(page.getByLabel('想一起看看什么', { exact: true })).toBeEnabled(); await enter(page, f.message); await expect(dialog.getByRole('complementary', { name: '笔记原操作' })).toBeVisible();
  await dialog.getByRole('button', { name: '核对原操作', exact: true }).click(); await expect(dialog.getByLabel('笔记编辑稿')).toBeEnabled(); await expect(dialog.getByRole('complementary', { name: '笔记原操作' })).toHaveCount(0);
  expect(count).toBe(1); expect((await call(f.actor, f.base)).items).toHaveLength(1); await page.screenshot({ path: evidence + '/original-request-recovered.png' });
});

test('assistant notes: offline local editing, independent draft and Escape focus survive leaving and reopening', async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page); await enter(page, f.message); await create(page); const dialog = panel(page), text = '本机尚未提交的完整笔记\n一行一行保留。';
  await dialog.getByLabel('笔记编辑稿').fill(text); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(page.locator('[data-message-id="' + f.message.id + '"]').getByRole('button', { name: '整理为笔记', exact: true })).toBeFocused();
  await page.context().setOffline(true); await enter(page, f.message); await expect(dialog.getByLabel('笔记编辑稿')).toHaveValue(text); await expect(dialog.getByRole('alert')).toContainText('无法连接'); await expect(dialog.getByRole('button', { name: '保存编辑稿', exact: true })).toBeDisabled();
  await page.context().setOffline(false); await page.keyboard.press('Escape'); await enter(page, f.message); await expect(dialog.getByLabel('笔记编辑稿')).toHaveValue(text); await expect(dialog.getByRole('button', { name: '保存编辑稿', exact: true })).toBeEnabled(); await dialog.getByRole('button', { name: '保存编辑稿', exact: true }).click();
  const row = (await call(f.actor, f.base)).items[0]; expect((await call(f.actor, f.base + '/' + row.id)).markdown).toBe(text);
});

test('assistant notes: corrupt or different-account cached content stays hidden and its original bytes are preserved', async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page), key = 'studyagent.assistant.notes.v1.' + encodeURIComponent(f.actor.user.id) + '.' + encodeURIComponent(f.session.id), raw = JSON.stringify({ version: 1, ownerId: 'another-account', sessionId: f.session.id, active: 'new', drafts: { new: { title: 'PRIVATE_FORGED_CONTENT' } } });
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw }); await enter(page, f.message); const dialog = panel(page); await expect(dialog).not.toContainText('PRIVATE_FORGED_CONTENT'); await expect(dialog.getByRole('status').filter({ hasText: '原笔记缓存尚未核对' })).toBeVisible();
  await dialog.getByLabel('笔记标题').fill('本次页面里仍能编辑'); expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(raw);
  const download = page.waitForEvent('download'); await dialog.getByRole('button', { name: '下载本机稿', exact: true }).last().click(); const file = await download; expect(JSON.parse(await readFile((await file.path())!, 'utf8')).title).toBe('本次页面里仍能编辑');
});

test('assistant notes: a source outside70 later messages returns by a read-only anchor without opening another conversation', async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page); await enter(page, f.message); await create(page); await page.keyboard.press('Escape');
  await call(f.actor, '/qa/assistant/seed-history', { sessionId: f.session.id, count: 70, makeSourceOld: true }); await page.reload(); await expect(page.getByLabel('想一起看看什么', { exact: true })).toBeEnabled(); await expect(page.locator('[data-message-id="' + f.message.id + '"]')).toHaveCount(0);
  const posts: string[] = []; page.on('request', r => { if (r.method() === 'POST' && /\/ai\/assistant\/sessions(?:$|\/[^/]+\/turns$)/.test(new URL(r.url()).pathname)) posts.push(r.url()); });
  await page.getByRole('button', { name: '我的笔记', exact: true }).click(); const dialog = panel(page); await dialog.getByRole('region', { name: '服务端已保存笔记' }).getByRole('button', { name: /我的学习笔记/ }).click();
  await expect(dialog.getByRole('button', { name: '返回原消息', exact: true })).toBeVisible(); await dialog.getByRole('button', { name: '返回原消息', exact: true }).click(); await expect(page.locator('[data-message-id="' + f.message.id + '"]')).toBeFocused(); expect(posts).toEqual([]);
});

test('assistant notes: a request that never reached the server retries only its preserved original command', async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page), commands: unknown[] = [];
  await page.route('**/api/ai/assistant/sessions/*/artifacts/notes', async route => {
    if (route.request().method() !== 'POST') return route.continue(); commands.push(route.request().postDataJSON());
    if (commands.length === 1) return route.abort('failed'); await route.continue();
  });
  await enter(page, f.message); const dialog = panel(page); await dialog.getByRole('button', { name: '核对完整来源', exact: true }).click(); await expect(dialog.getByRole('button', { name: '保存逐字候选', exact: true })).toBeEnabled(); await dialog.getByRole('button', { name: '保存逐字候选', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('原操作仍保留'); expect((await call(f.actor, f.base)).items).toEqual([]); await dialog.getByRole('button', { name: '核对原操作', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '用原请求重试', exact: true })).toBeVisible(); await dialog.getByRole('button', { name: '用原请求重试', exact: true }).click(); await expect(dialog.getByLabel('笔记编辑稿')).toBeEnabled();
  expect(commands).toHaveLength(2); expect(commands[1]).toEqual(commands[0]); expect((await call(f.actor, f.base)).items).toHaveLength(1);
});

test('assistant notes: lost edit and adoption replies recover their original results without publishing another command', async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page); await enter(page, f.message); await create(page); const dialog = panel(page), text = '已提交但回执暂时丢失的完整编辑稿。'; let edits = 0, confirmations = 0;
  await page.route('**/api/ai/assistant/sessions/*/artifacts/notes/*/content', async route => { edits++; const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('failed'); });
  await dialog.getByLabel('笔记编辑稿').fill(text); await dialog.getByRole('button', { name: '保存编辑稿', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('原操作仍保留');
  await page.reload(); await expect(page.getByLabel('想一起看看什么', { exact: true })).toBeEnabled(); await enter(page, f.message); await expect(dialog.getByLabel('笔记编辑稿')).toHaveValue(text); await dialog.getByRole('button', { name: '核对原操作', exact: true }).click(); await expect(dialog.getByLabel('我已核对原文和编辑稿')).toBeEnabled();
  await page.route('**/api/ai/assistant/sessions/*/artifacts/notes/*/confirm', async route => { confirmations++; const response = await route.fetch(); expect(response.status()).toBe(201); await route.abort('failed'); });
  await dialog.getByLabel('我已核对原文和编辑稿').check(); await dialog.getByRole('button', { name: '采用这份笔记', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('原操作仍保留');
  await page.reload(); await expect(page.getByLabel('想一起看看什么', { exact: true })).toBeEnabled(); await enter(page, f.message); await dialog.getByRole('button', { name: '核对原操作', exact: true }).click(); await expect(dialog.getByRole('complementary', { name: '笔记原操作' })).toHaveCount(0);
  await expect(dialog.getByLabel('笔记编辑稿')).toHaveValue(text); expect(edits).toBe(1); expect(confirmations).toBe(1); expect((await call(f.actor, f.base)).items[0].status).toBe('confirmed');
});

test('assistant notes: another selected message keeps the first unsubmitted editing draft intact', async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page); await enter(page, f.message); await create(page); const dialog = panel(page), text = '第一份笔记尚未提交的独立草稿。'; await dialog.getByLabel('笔记编辑稿').fill(text); await page.keyboard.press('Escape');
  await enter(page, f.question); await expect(dialog.getByLabel('笔记复习目标')).toBeVisible(); await create(page); await page.keyboard.press('Escape');
  expect((await call(f.actor, f.base)).items).toHaveLength(2); await enter(page, f.message); await expect(dialog.getByLabel('笔记编辑稿')).toHaveValue(text); await expect(dialog.getByRole('button', { name: '保存编辑稿', exact: true })).toBeEnabled();
});

test('assistant notes: an export read failure preserves the full saved note and a retry only downloads it', async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page); await enter(page, f.message); await create(page); const dialog = panel(page); let reads = 0;
  await page.route('**/api/ai/assistant/sessions/*/artifacts/notes/*/export?format=json', route => { reads++; return reads === 1 ? route.abort('failed') : route.continue(); });
  const before = await call(f.actor, f.base); await dialog.getByRole('button', { name: '下载完整JSON', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('笔记和本机稿仍保留'); await expect(dialog.getByLabel('笔记编辑稿')).toHaveValue(new RegExp(f.message.content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const download = page.waitForEvent('download'); await dialog.getByRole('button', { name: '下载完整JSON', exact: true }).click(); const file = await download; const note = JSON.parse(await readFile((await file.path())!, 'utf8')); expect(note.origin.messages[0].content).toBe(f.message.content); expect(await call(f.actor, f.base)).toEqual(before); expect(reads).toBe(2);
});

test('assistant notes: closing a pending private read and switching accounts hides its late response', async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page); await enter(page, f.message); await create(page); const dialog = panel(page), text = 'PRIVATE_ONLY_FIRST_ACCOUNT_' + crypto.randomUUID(); await dialog.getByLabel('笔记编辑稿').fill(text); await dialog.getByRole('button', { name: '保存编辑稿', exact: true }).click(); await expect(dialog.getByLabel('我已核对原文和编辑稿')).toBeEnabled(); await page.keyboard.press('Escape');
  const id = (await call(f.actor, f.base)).items[0].id; let release!: () => void, entered!: () => void;
  const held = new Promise<void>(r => { release = r; }), ready = new Promise<void>(r => { entered = r; });
  await page.route('**/api/ai/assistant/sessions/*/artifacts/notes/' + id, async route => { const response = await route.fetch(); entered(); await held; try { await route.fulfill({ response }); } catch { /* The old identity's client request was aborted when its modal closed. */ } });
  try { await enter(page, f.message); await ready; await page.keyboard.press('Escape'); await page.context().clearCookies(); const second = await fixture(page); release(); await enter(page, second.message); await expect(panel(page)).not.toContainText(text); expect(await panel(page).getByLabel('笔记标题').inputValue()).toBe('我的学习笔记'); }
  finally { release?.(); }
});

test('assistant notes: overlong pasted text stays complete through reopening and download while server writes remain disabled', async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page); await enter(page, f.message); await create(page); const dialog = panel(page);
  const text = '全文保留，不截断。\n'.repeat(3100) + '完整末尾_MARKER'; expect(text.length).toBeGreaterThan(30000);
  const before = (await call(f.actor, f.base)).items[0]; const writes: string[] = []; page.on('request', r => { if (['POST', 'PATCH'].includes(r.method()) && r.url().includes('/artifacts/notes')) writes.push(r.url()); });
  // Exercise a real paste. Chromium insertText used by fill() spends seconds per
  // thousand newlines even on a bare textarea; a paste inserts the same full text.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
  const previousClipboard = await page.evaluate(() => navigator.clipboard.readText());
  try {
    await page.evaluate(value => navigator.clipboard.writeText(value), text);
    await dialog.getByLabel('笔记编辑稿').focus(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('ControlOrMeta+V');
  } finally { await page.evaluate(value => navigator.clipboard.writeText(value), previousClipboard); }
  await expect(dialog.getByLabel('笔记编辑稿')).toHaveValue(text); await expect(dialog.getByRole('status').filter({ hasText: '超出' })).toContainText(String(text.length - 30000));
  const reading = dialog.getByRole('region', { name: '笔记阅读稿', exact: true });
  await expect(reading).toHaveAttribute('tabindex', '0'); await expect(reading).toContainText('完整末尾_MARKER');
  expect(await reading.evaluate(node => node.getBoundingClientRect().height)).toBeLessThanOrEqual(421);
  expect(await reading.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  await reading.focus(); await expect(reading).toBeFocused(); await page.keyboard.press('End');
  await expect.poll(() => reading.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: evidence + '/complete-overlong-reading-scroll.png' });
  await expect(dialog.getByRole('button', { name: '保存编辑稿', exact: true })).toBeDisabled(); await expect(dialog.getByRole('button', { name: '采用这份笔记', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape'); await enter(page, f.message); await expect(dialog.getByLabel('笔记编辑稿')).toHaveValue(text);
  const download = page.waitForEvent('download'); await dialog.getByRole('button', { name: '下载本机稿', exact: true }).last().click(); const file = await download; expect(JSON.parse(await readFile((await file.path())!, 'utf8')).markdown).toBe(text);
  expect((await call(f.actor, f.base + '/' + before.id)).revision).toBe(before.revision); expect(writes).toEqual([]);
});

test('assistant notes: an actual stale revision preserves original409 command and local text before explicit server selection', async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page); await enter(page, f.message); await create(page); const dialog = panel(page), local = '本机并发前未保存的完整稿。', remote = '另一设备实际保存的完整稿。';
  const first = (await call(f.actor, f.base)).items[0]; await dialog.getByLabel('笔记编辑稿').fill(local);
  await call(f.actor, f.base + '/' + first.id + '/content', { title: first.title, markdown: remote, expectedRevision: first.revision, requestKey: crypto.randomUUID() }, 'PATCH');
  const rejected = page.waitForResponse(r => r.url().endsWith('/' + first.id + '/content') && r.request().method() === 'PATCH'); await dialog.getByRole('button', { name: '保存编辑稿', exact: true }).click(); expect((await rejected).status()).toBe(409);
  await expect(dialog.getByRole('complementary', { name: '笔记原操作' })).toBeVisible(); await dialog.getByRole('button', { name: '读取最新服务器稿', exact: true }).click(); await expect(dialog.locator('details').filter({ hasText: '对照服务器已保存全文' })).toContainText(remote);
  await dialog.getByText('对照服务器已保存全文', { exact: true }).click(); await dialog.getByRole('button', { name: '使用服务器稿，保留本机副本', exact: true }).click(); await expect(dialog.getByLabel('笔记编辑稿')).toHaveValue(remote);
  await expect(dialog.getByRole('complementary', { name: '笔记原操作' })).toHaveCount(0); const key = 'studyagent.assistant.notes.v1.' + encodeURIComponent(f.actor.user.id) + '.' + encodeURIComponent(f.session.id);
  const cache = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key), backup: any = Object.values(cache.drafts).find((d: any) => d.markdown === local); expect(backup.pending.kind).toBe('edit'); expect(backup.pending.input.expectedRevision).toBe(0); expect(backup.pending.input.markdown).toBe(local);
  await dialog.getByLabel('笔记编辑稿').fill('以已核对服务器版本继续的新稿。'); await dialog.getByRole('button', { name: '保存编辑稿', exact: true }).click(); await expect(dialog.getByLabel('我已核对原文和编辑稿')).toBeEnabled(); expect((await call(f.actor, f.base + '/' + first.id)).revision).toBe(2);
  await dialog.getByRole('button', { name: '我的笔记', exact: true }).click(); await dialog.getByRole('region', { name: '本机保留草稿' }).getByRole('button', { name: /原操作待核对/ }).click(); await expect(dialog.getByLabel('笔记编辑稿')).toHaveValue(local); await expect(dialog.getByRole('complementary', { name: '笔记原操作' })).toBeVisible();
});

test('assistant notes: another device adopting the server note does not mark a different local draft adopted', async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page); await enter(page, f.message); await create(page); const dialog = panel(page), local = '仅保留在本机，未被采用的版本。';
  const id = (await call(f.actor, f.base)).items[0].id, server = await call(f.actor, f.base + '/' + id); await dialog.getByLabel('笔记编辑稿').fill(local);
  await call(f.actor, f.base + '/' + id + '/confirm', { expectedRevision: server.revision, contentFingerprint: server.contentFingerprint, acknowledgeReview: true, requestKey: crypto.randomUUID() });
  await dialog.getByRole('button', { name: '读取最新服务器稿', exact: true }).click(); await expect(dialog.getByText('服务器稿已采用；下方是本机未保存稿，尚未采用。', { exact: true })).toBeVisible(); await expect(dialog.getByLabel('笔记编辑稿')).toHaveValue(local);
  const download = page.waitForEvent('download'); await dialog.getByRole('button', { name: '下载完整JSON', exact: true }).click(); const file = await download; const content = JSON.parse(await readFile((await file.path())!, 'utf8')); expect(content.status).toBe('confirmed'); expect(content.markdown).toBe(server.markdown); expect(content.markdown).not.toBe(local);
  await page.screenshot({ path: evidence + '/local-draft-and-adopted-server.png' });
});

test('assistant notes: real learning-code student keeps notes readable during assessment and resumes only after an explicit permission check', async ({ page }) => {
  test.setTimeout(150000); const f = await fixture(page), student = (await call(f.actor, '/students', { nickname: '匿名笔记学习者', grade: 4, preferredSessionMinutes: 10, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile;
  const course = await call(f.actor, '/qa/assistant/course', { kind: 'primary_unit', studentId: student.id });
  await call(f.actor, '/students/' + student.id + '/learning-scope', { subject: 'math', grade: 4, term: 'upper', textbookVolumeId: null, textbookVersion: '匿名已学范围', learnedAtomIds: ['atomic:math:averagecount'], currentAtomId: 'atomic:math:averagecount', minutesPerSession: 10 }, 'PUT');
  const access = await call(f.actor, '/students/' + student.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: crypto.randomUUID(), reason: '隔离笔记评测保护验收' }), code = await call(f.actor, '/students/' + student.id + '/learning-access/codes', { expectedVersion: access.version, requestKey: crypto.randomUUID() });
  await page.goto('/student/login'); await page.getByLabel('一次性学习码').fill(code.code); const login = page.waitForResponse(r => r.url().endsWith('/api/auth/learning-code') && r.request().method() === 'POST'); await page.getByRole('button', { name: '进入我的学习 →', exact: true }).click(); const learner = (await (await login).json()).data; await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  const openSession = page.waitForResponse(r => r.url().endsWith('/api/ai/assistant/sessions') && r.request().method() === 'POST'); await page.goto(course.href); const session = (await (await openSession).json()).data; await expect(page.getByLabel('想一起看看什么', { exact: true })).toBeEnabled();
  const context = await call(learner, '/ai/assistant/sessions/' + session.id + '/context'), turn = await call(learner, '/ai/assistant/sessions/' + session.id + '/turns', { requestKey: crypto.randomUUID(), message: '[cite-course] 比较条件是什么？', modelId: 'deepseek-v4-flash', contextVersion: context.contextVersion });
  await expect.poll(async () => (await call(learner, '/ai/assistant/sessions/' + session.id + '/turns/' + turn.id)).status, { timeout: 45000 }).toBe('completed'); const message = (await call(learner, '/ai/assistant/sessions/' + session.id + '/messages/page')).messages.find((m: any) => m.sender === 'assistant');
  await page.reload(); await expect(page.locator('[data-message-id="' + message.id + '"]')).toBeVisible(); await enter(page, message); await create(page); const dialog = panel(page), base = '/ai/assistant/sessions/' + session.id + '/artifacts/notes', id = (await call(learner, base)).items[0].id, before = await call(learner, base + '/' + id), text = '评测开始前保留的本机编辑。';
  await expect(dialog.locator('.assistant-notes-original')).toContainText('原学生学习档案'); await dialog.getByLabel('笔记编辑稿').fill(text);
  const formal = await call(f.actor, '/diagnostics/sessions', { studentId: student.id, subject: 'math', intent: 'baseline', targetAtomIds: ['atomic:math:averagecount'], includePrerequisites: false, maxItems: 4 });
  await dialog.getByRole('button', { name: '保存编辑稿', exact: true }).click(); await expect(dialog.getByRole('complementary', { name: '当前评测保护' }).getByRole('link', { name: '进入原评测', exact: true })).toHaveAttribute('href', '/student/assessment?session=' + formal.id);
  expect((await call(learner, base + '/' + id)).revision).toBe(before.revision); await expect(dialog.getByRole('button', { name: '保存编辑稿', exact: true })).toBeDisabled(); await expect(dialog.getByRole('button', { name: '下载完整JSON', exact: true })).toBeEnabled(); await expect(dialog.getByLabel('笔记编辑稿')).toHaveValue(text);
  await dialog.getByRole('button', { name: '核对原操作', exact: true }).click(); await expect(dialog.getByRole('button', { name: '用原请求重试', exact: true })).toBeDisabled();
  const view = await call(f.actor, '/diagnostics/sessions/' + formal.id); await call(f.actor, '/diagnostics/sessions/' + formal.id + '/state', { action: 'abort', expectedRevision: view.revision, requestKey: crypto.randomUUID(), reason: '结束隔离笔记保护验收，不形成评测结果' });
  await dialog.getByRole('button', { name: '重新核对笔记权限', exact: true }).click(); await expect(dialog.getByRole('complementary', { name: '当前评测保护' })).toHaveCount(0); await dialog.getByRole('button', { name: '用原请求重试', exact: true }).click(); await expect(dialog.getByLabel('我已核对原文和编辑稿')).toBeEnabled(); expect((await call(learner, base + '/' + id)).markdown).toBe(text);
});
