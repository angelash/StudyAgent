import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { browserEvidence } from './evidence';
const api = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}/api`, evidence = browserEvidence('teaching-tools');
const composer = (page: Page) => page.locator('.tt-composer'), detail = (page: Page) => page.getByRole('region', { name: '教研建议原记录', exact: true });
async function enter(page: Page, width = 1280, admin = true) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const suffix = crypto.randomUUID(), principal = 'teaching-ui-' + suffix + '@local.test', credential = 'Teaching-UI-QA-' + suffix;
  const hash = createHash('sha256').update(test.info().testId + suffix).digest(), address = `198.21.${hash[0]}.${hash[1]}`;
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address });
  const registered = await fetch(api + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Forwarded-For': address }, body: JSON.stringify({ principal, credential }) });
  expect(registered.status).toBe(201); const actor = (await registered.json()).data;
  async function call(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(api + path, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + actor.token, 'X-Forwarded-For': address }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json(); expect(response.ok, JSON.stringify(data.error)).toBe(true); return data.data;
  }
  const seeded = admin ? await call('/qa/teaching-tools/setup', {}) : null;
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →', exact: true }).click(); await expect(page).toHaveURL(admin ? /\/admin\/analytics/ : /\/learn/);
  if (admin) await page.getByRole('link', { name: 'AI教研', exact: true }).click(); else await page.goto('/admin/ai-tools');
  if (admin) await expect(page.getByRole('heading', { name: '把一次作答，看得更清楚。', exact: true })).toBeVisible();
  return { actor, call, questionId: seeded?.questionId as string, principal, credential };
}
async function fill(page: Page, title = '匿名平均对象的完整原稿') {
  await composer(page).getByLabel('草稿名称', { exact: true }).fill(title);
  await composer(page).getByLabel('完整题干', { exact: true }).fill('三人与两人的总分分别18与14，求五人平均分。原题尾行条件保持。');
  await composer(page).getByLabel('参考答案', { exact: true }).fill('6.4');
  await composer(page).getByLabel('参考解析（可选）', { exact: true }).fill('先合计总分32，再以总人数5作为分母。');
  if (await composer(page).getByLabel('待核对作答', { exact: true }).count()) await composer(page).getByLabel('待核对作答', { exact: true }).fill('18+14=32；32/2=16。保留首次原文尾行。');
  await expect(composer(page).getByLabel('选择大模型', { exact: true })).toBeEnabled();
}
async function preview(page: Page) { await composer(page).getByRole('button', { name: '预检完整输入', exact: true }).click(); await expect(composer(page).getByRole('region', { name: '完整输入预检', exact: true })).toBeVisible(); }
async function generate(page: Page) { await composer(page).getByRole('button', { name: '确认输入并生成草稿', exact: true }).click(); await expect(detail(page)).toBeVisible(); return new URL(page.url()).searchParams.get('run')!; }
async function done(page: Page) { await expect(detail(page).getByText('草稿已生成', { exact: true })).toBeVisible({ timeout: 25000 }); }

for (const width of [390, 768, 1280]) test(`teaching tools: complete analysis, original input and unreviewed result at ${width}`, async ({ page }) => {
  const f = await enter(page, width); await fill(page); await expect(composer(page).getByLabel('选择大模型')).toHaveValue('auto');
  expect((await f.call('/qa/teaching-tools/observations')).calls).toHaveLength(0); await preview(page);
  await expect(composer(page).getByRole('region', { name: '完整输入预检' })).toContainText('原题尾行条件保持。');
  expect((await f.call('/qa/teaching-tools/observations')).calls).toHaveLength(0);
  const runId = await generate(page); await done(page); await expect(detail(page)).toContainText('尚未人工核对'); await expect(detail(page)).toContainText('单次回答尚不足以确定稳定的能力原因。');
  const run = await f.call('/ai/teaching-tools/runs/' + runId); expect(run).toMatchObject({ status: 'completed', modelId: 'deepseek-v4-flash', advisoryOnly: true, reviewRequired: true });
  expect(run.snapshot.answer).toContain('保留首次原文尾行'); expect((await f.call('/qa/teaching-tools/observations')).calls).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: evidence + '/analysis-' + width + '.png', fullPage: true }); await page.reload(); await done(page);
  expect(new URL(page.url()).searchParams.get('run')).toBe(runId); await expect(composer(page).getByLabel('草稿名称')).toHaveValue('匿名平均对象的完整原稿');
});

test('teaching tools: bank preflight shows actual table and formula, freezing the server original version and structured answer', async ({ page }) => {
  const f = await enter(page); await composer(page).getByRole('button', { name: '选择题库原题', exact: true }).click();
  await composer(page).getByLabel('查找题目').fill(f.questionId); await composer(page).locator('.tt-question-list>button').filter({ hasText: f.questionId }).click();
  await composer(page).getByLabel('待核对作答格式', { exact: true }).selectOption('json'); await composer(page).getByLabel('待核对作答', { exact: true }).fill(JSON.stringify({ steps: ['18+14=32', '32/2=16'], result: 16 }));
  await preview(page); const panel = composer(page).getByRole('region', { name: '完整输入预检' });
  await expect(panel.getByRole('table')).toBeVisible(); await expect(panel.locator('.katex')).toBeVisible(); await expect(panel).toContainText('原文版本 3');
  const id = await generate(page); await done(page); const run = await f.call('/ai/teaching-tools/runs/' + id);
  expect(run.snapshot.source).toMatchObject({ kind: 'question_bank', questionId: f.questionId }); expect(run.snapshot.question.originalDocument.version).toBe(3);
  expect(run.snapshot.question.originalDocument.blocks.map((block: any) => block.type)).toEqual(['text', 'table', 'math_display']); expect(run.snapshot.answer.steps[1]).toBe('32/2=16');
});

test('teaching tools: hint failure stays explicit and a retry uses the frozen original model after changing the composer', async ({ page }) => {
  const f = await enter(page); await page.getByRole('tab', { name: '提示草稿', exact: true }).click(); await fill(page, '分母提示草稿');
  await composer(page).getByLabel('帮助层级').selectOption('2'); await composer(page).getByLabel('选择大模型').selectOption('claude-sonnet-5');
  await f.call('/qa/teaching-tools/behavior', { mode: 'fail_once' }); await preview(page); const id = await generate(page);
  await expect(detail(page).getByText('本次未完成', { exact: true })).toBeVisible(); await expect(detail(page).getByText('先把全部人数逐个列出来，再解释要平均的是谁。', { exact: true })).toHaveCount(0);
  await composer(page).getByLabel('选择大模型').selectOption('gpt-6.1-sol'); await detail(page).getByRole('button', { name: '使用原模型重试 · Claude Sonnet 5', exact: true }).click(); await done(page);
  const run = await f.call('/ai/teaching-tools/runs/' + id); expect(run.modelId).toBe('claude-sonnet-5'); expect(run.result.hint.suggestedLevel).toBe(2);
  expect((await f.call('/qa/teaching-tools/observations')).calls.map((item: any) => item.modelId)).toEqual(['claude-sonnet-5', 'claude-sonnet-5']);
});

test('teaching tools: lost creation acknowledgement restores the same original command after reload without duplicate generation', async ({ page }) => {
  const f = await enter(page); await fill(page, '原命令必须只生成一次'); await preview(page);
  let posts = 0; await page.route('**/api/ai/teaching-tools/runs', async route => { if (route.request().method() !== 'POST') return route.continue(); posts++; await route.fetch(); await route.abort('failed'); });
  await composer(page).getByRole('button', { name: '确认输入并生成草稿', exact: true }).click(); await expect(composer(page).getByRole('button', { name: '恢复原请求', exact: true })).toBeVisible();
  await expect(composer(page).getByLabel('选择大模型')).toBeEnabled(); await composer(page).getByLabel('选择大模型').selectOption('claude-sonnet-5');
  await page.unroute('**/api/ai/teaching-tools/runs'); await page.reload(); await composer(page).getByRole('button', { name: '恢复原请求', exact: true }).click(); await done(page);
  expect(posts).toBe(1); const list = await f.call('/ai/teaching-tools/runs'); expect(list.runs).toHaveLength(1); expect(list.runs[0].modelId).toBe('deepseek-v4-flash');
  await expect(composer(page).getByLabel('选择大模型')).toHaveValue('claude-sonnet-5'); expect((await f.call('/qa/teaching-tools/observations')).calls).toHaveLength(1);
});

test('teaching tools: two tabs retain their own complete drafts and copying another preserves the current version', async ({ page, context }) => {
  await enter(page); await fill(page, 'FIRST_DOCUMENT_COMPLETE_TAIL'); const second = await context.newPage(); await second.goto('/admin/ai-tools'); await fill(second, 'SECOND_DOCUMENT_COMPLETE_TAIL');
  await page.reload(); await expect(composer(page).getByLabel('草稿名称')).toHaveValue('FIRST_DOCUMENT_COMPLETE_TAIL');
  await second.reload(); await expect(composer(second).getByLabel('草稿名称')).toHaveValue('SECOND_DOCUMENT_COMPLETE_TAIL');
  await composer(second).getByText('本机其他标签页的原稿', { exact: true }).click();
  await composer(second).locator('.tt-copies article').filter({ hasText: 'FIRST_DOCUMENT_COMPLETE_TAIL' }).first().getByRole('button', { name: '载入这个副本', exact: true }).click();
  await expect(composer(second).getByLabel('草稿名称')).toHaveValue('FIRST_DOCUMENT_COMPLETE_TAIL');
  const titles = await second.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('studyagent.teaching-tool.form.v1.')).map(key => JSON.parse(localStorage.getItem(key)!).form.title));
  expect(titles).toContain('FIRST_DOCUMENT_COMPLETE_TAIL'); expect(titles).toContain('SECOND_DOCUMENT_COMPLETE_TAIL'); await second.close();
});

test('teaching tools: failed local storage blocks navigation and logout until the complete original input is downloaded', async ({ page }) => {
  await page.addInitScript(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key.startsWith('studyagent.teaching-tool.')) throw new DOMException('Synthetic quota', 'QuotaExceededError'); return original.call(this, key, value); }; });
  const f = await enter(page); await fill(page, 'STORAGE_FAILURE_FULL_ORIGINAL'); await expect(composer(page)).toContainText('本机存储暂不可用');
  await page.getByRole('link', { name: '教研后台', exact: true }).click(); await expect(page).toHaveURL(/\/admin\/ai-tools/); await page.getByRole('button', { name: '退出', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/ai-tools/); expect((await f.call('/auth/me')).role).toBe('admin');
  const downloadPromise = page.waitForEvent('download'); await composer(page).getByRole('button', { name: '下载完整原稿 ↗', exact: true }).click(); const download = await downloadPromise;
  const saved = JSON.parse(readFileSync((await download.path())!, 'utf8')); expect(saved.form.title).toBe('STORAGE_FAILURE_FULL_ORIGINAL'); expect(saved.form.answer).toContain('保留首次原文尾行');
  await page.getByRole('button', { name: '退出', exact: true }).click(); await expect(page).toHaveURL(/\/parent\/login/);
});

test('teaching tools: a provider finishing after cancellation cannot publish its late result', async ({ page }) => {
  const f = await enter(page); await f.call('/qa/teaching-tools/behavior', { mode: 'late' }); await fill(page); await preview(page); const id = await generate(page);
  await expect(detail(page).getByText('正在生成', { exact: true })).toBeVisible(); await detail(page).getByRole('button', { name: '取消本次生成', exact: true }).click();
  await expect(detail(page).getByText('已取消', { exact: true })).toBeVisible({ timeout: 20000 }); const run = await f.call('/ai/teaching-tools/runs/' + id); expect(run.result).toBeNull(); expect((await f.call('/qa/teaching-tools/observations')).calls).toHaveLength(1);
});

test('teaching tools: cancellation acknowledgement loss recovers its original control key after reload', async ({ page }) => {
  const f = await enter(page); await f.call('/qa/teaching-tools/behavior', { mode: 'hold' }); await fill(page); await preview(page); const id = await generate(page); await expect(detail(page).getByText('正在生成', { exact: true })).toBeVisible();
  await expect.poll(async () => (await f.call('/qa/teaching-tools/observations')).calls.length).toBe(1);
  let lost!: () => void; const lostAcknowledgement = new Promise<void>(resolve => { lost = resolve; });
  await page.route('**/api/ai/teaching-tools/runs/*/cancel', async route => { await route.fetch(); await route.abort('failed'); lost(); });
  await detail(page).getByRole('button', { name: '取消本次生成', exact: true }).click(); await expect(detail(page).getByRole('button', { name: '恢复原操作', exact: true })).toBeVisible();
  await lostAcknowledgement; await page.unroute('**/api/ai/teaching-tools/runs/*/cancel'); await page.reload(); await detail(page).getByRole('button', { name: '恢复原操作', exact: true }).click();
  await expect(detail(page).getByText('已取消', { exact: true })).toBeVisible(); expect((await f.call('/ai/teaching-tools/runs/' + id)).result).toBeNull(); expect((await f.call('/qa/teaching-tools/observations')).calls).toHaveLength(1);
});

test('teaching tools: a role revocation unloads private work and fences the late provider reply', async ({ page }) => {
  const f = await enter(page); await f.call('/qa/teaching-tools/behavior', { mode: 'late' }); await fill(page, 'PRIVATE_TEACHING_OWNER_ONLY'); await preview(page); const id = await generate(page);
  await expect(detail(page).getByText('正在生成', { exact: true })).toBeVisible(); await f.call('/qa/teaching-tools/revoke', {});
  await expect(page.getByRole('heading', { name: '这是一处内部教研工作区', exact: true })).toBeVisible(); await expect(page.getByText('PRIVATE_TEACHING_OWNER_ONLY', { exact: true })).toHaveCount(0);
  await page.waitForTimeout(1800); await f.call('/qa/teaching-tools/setup', {});
  await expect.poll(async () => (await f.call('/ai/teaching-tools/runs/' + id)).status, { timeout: 20000 }).toBe('failed'); expect((await f.call('/ai/teaching-tools/runs/' + id)).result).toBeNull();
});

test('teaching tools: parent identity cannot read the admin workspace or load model generation controls', async ({ page }) => {
  await enter(page, 1280, false); await expect(page.getByRole('heading', { name: '这是一处内部教研工作区', exact: true })).toBeVisible(); await expect(composer(page)).toHaveCount(0);
});

test('teaching tools: oversized original text is rejected without losing or truncating the form or making a provider call', async ({ page }) => {
  const f = await enter(page); await fill(page); const text = '题'.repeat(6001) + 'OVERSIZE_ORIGINAL_TAIL'; await composer(page).getByLabel('完整题干', { exact: true }).fill(text);
  await composer(page).getByRole('button', { name: '预检完整输入', exact: true }).click(); await expect(composer(page).locator('.tt-notice')).toContainText('完整教研输入不可用');
  await expect(composer(page).getByLabel('完整题干')).toHaveValue(text); expect((await f.call('/qa/teaching-tools/observations')).calls).toHaveLength(0); expect((await f.call('/ai/teaching-tools/runs')).runs).toHaveLength(0);
});

test('teaching tools: malformed structured work survives a reload and never gets silently converted into a score', async ({ page }) => {
  const f = await enter(page); await fill(page); await composer(page).getByLabel('待核对作答格式', { exact: true }).selectOption('json'); const raw = '{"steps":["第一步原文","COMPLETE_INVALID_JSON_TAIL"'; await composer(page).getByLabel('待核对作答', { exact: true }).fill(raw);
  await composer(page).getByRole('button', { name: '预检完整输入', exact: true }).click(); await expect(composer(page).locator('.tt-notice')).toContainText('不是完整JSON'); await page.reload(); await expect(composer(page).getByLabel('待核对作答', { exact: true })).toHaveValue(raw);
  expect((await f.call('/qa/teaching-tools/observations')).calls).toHaveLength(0);
});

test('teaching tools: a stale cancellation preserves its command, reads the latest state explicitly and requires a new user action', async ({ page }) => {
  const f = await enter(page); await f.call('/qa/teaching-tools/behavior', { mode: 'hold' }); await fill(page); await preview(page); const id = await generate(page);
  await expect.poll(async () => (await f.call('/qa/teaching-tools/observations')).calls.length).toBe(1);
  const pattern = '**/api/ai/teaching-tools/runs/' + id;
  await page.route(pattern, async route => { const response = await route.fetch(), json = await response.json(); json.data.task.version--; await route.fulfill({ response, json }); });
  await page.reload(); await expect(detail(page).getByText('正在生成', { exact: true })).toBeVisible();
  const posts: Array<Record<string, unknown>> = []; page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/' + id + '/cancel')) posts.push(request.postDataJSON()); });
  const failed = page.waitForResponse(response => response.url().endsWith('/' + id + '/cancel') && response.status() === 409);
  await detail(page).getByRole('button', { name: '取消本次生成', exact: true }).click(); await failed;
  await expect(detail(page).getByRole('button', { name: '保留原操作副本，核对最新状态', exact: true })).toBeVisible(); expect(posts).toHaveLength(1);
  await page.unroute(pattern); await detail(page).getByRole('button', { name: '保留原操作副本，核对最新状态', exact: true }).click();
  await expect(detail(page).getByRole('button', { name: '恢复原操作', exact: true })).toHaveCount(0); expect(posts).toHaveLength(1);
  await detail(page).getByText('本机原操作副本', { exact: true }).click(); const downloaded = page.waitForEvent('download');
  await detail(page).getByRole('button', { name: '下载原操作副本', exact: true }).first().click(); const archived = JSON.parse(readFileSync((await (await downloaded).path())!, 'utf8'));
  expect(archived.pending.command.requestKey).toBe(posts[0].requestKey); expect(posts).toHaveLength(1);
  await detail(page).getByRole('button', { name: '取消本次生成', exact: true }).click(); await expect(detail(page).getByText('已取消', { exact: true })).toBeVisible(); expect(posts).toHaveLength(2); expect(posts[1].requestKey).not.toBe(posts[0].requestKey);
  expect((await f.call('/qa/teaching-tools/observations')).calls).toHaveLength(1);
});

test('teaching tools: an unreadable original remains discoverable after two reloads and downloads byte for byte', async ({ page }) => {
  const f = await enter(page); await fill(page); const original = '{"version":999,"unparsed":"COMPLETE_FUTURE_ORIGINAL_TAIL"\n';
  await page.evaluate(raw => { const key = Object.keys(localStorage).find(key => key.startsWith('studyagent.teaching-tool.form.v1.'))!; localStorage.setItem(key, raw); }, original);
  await page.reload(); await expect(composer(page).getByRole('region', { name: '未识别的本机原稿', exact: true })).toBeVisible(); await page.reload();
  await expect(composer(page).getByRole('region', { name: '未识别的本机原稿', exact: true })).toBeVisible(); const pending = page.waitForEvent('download');
  await composer(page).getByRole('button', { name: '下载暂不能读取的原件 1', exact: true }).click(); expect(readFileSync((await (await pending).path())!, 'utf8')).toBe(original);
  expect((await f.call('/qa/teaching-tools/observations')).calls).toHaveLength(0);
});

test('teaching tools: an unknown control original remains discoverable across reloads and cannot execute as a command', async ({ page }) => {
  const f = await enter(page); await fill(page); await preview(page); await generate(page); await done(page); const original = '{"version":999,"operation":"UNKNOWN_CONTROL_COMPLETE_TAIL"\n';
  await page.evaluate(raw => { const key = Object.keys(localStorage).find(key => key.startsWith('studyagent.teaching-tool.control.v1.'))!; localStorage.setItem(key, raw); }, original);
  await page.reload(); await expect(detail(page).getByRole('region', { name: '未识别的本机操作', exact: true })).toBeVisible(); await page.reload();
  await expect(detail(page).getByRole('region', { name: '未识别的本机操作', exact: true })).toBeVisible(); const pending = page.waitForEvent('download');
  await detail(page).getByRole('button', { name: '下载暂不能读取的原操作 1', exact: true }).click(); expect(readFileSync((await (await pending).path())!, 'utf8')).toBe(original);
  await expect(detail(page).getByRole('button', { name: '恢复原操作', exact: true })).toHaveCount(0); expect((await f.call('/qa/teaching-tools/observations')).calls).toHaveLength(1);
});
