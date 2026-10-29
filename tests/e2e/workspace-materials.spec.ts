import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { syntheticFamilyHeaders } from './synthetic-family';
const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107') + '/api';
const body = '匿名阅览室观察：两个周末排队，两个工作日有空位。尚未观察晚间，也不知道是否有活动。只记录人数和开放时段，不收集个人姓名。需要比较不同条件和反例，不能凭一次印象确定唯一原因。';
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });
async function fixture(page: Page, children = 0) {
  const fixtureHeaders = await syntheticFamilyHeaders(page), nonce = crypto.randomUUID(), principal = 'materials-' + nonce, credential = 'Materials-QA-' + nonce;
  let token = '';
  async function call(path: string, command?: unknown, actor = token, status = command === undefined ? 200 : 201) {
    const response = await fetch(api + path, { method: command === undefined ? 'GET' : 'POST', headers: { ...fixtureHeaders, ...(actor ? { authorization: 'Bearer ' + actor } : {}) }, ...(command === undefined ? {} : { body: JSON.stringify(command) }) });
    const value = await response.json(); expect(response.status, path + ': ' + JSON.stringify(value.error)).toBe(status); return value.data;
  }
  const actor = await call('/auth/register', { principal, credential }); token = actor.token;
  const profiles: Array<{ id: string; nickname: string }> = [];
  for (let index = 0; index < children; index++) profiles.push((await call('/students', { nickname: '资料档案' + (index + 1), grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } })).profile);
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential); await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/studio(?:\?|$)/);
  await page.addInitScript(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  const href = (tab = 'personal', child?: string, extra: Record<string, string> = {}) => '/studio?' + new URLSearchParams({ view: 'materials', tab, ...(child ? { student: child, subject: 'math' } : { courseScope: 'adult' }), ...extra });
  const add = (title: string, studentId?: string, subject = 'math') => call('/learning/source-courses/materials/text', { title, sections: [body], ...(studentId ? { studentId, subject } : {}), requestKey: crypto.randomUUID() });
  return { actor, profiles, call, href, add };
}
async function openText(page: Page) {
  await page.getByRole('button', { name: /^(添加文字资料|继续文字资料草稿)$/ }).click();
  const dialog = page.getByRole('dialog', { name: '添加文字资料', exact: true }); await expect(dialog).toBeVisible(); return dialog;
}
async function publish(page: Page, call: Awaited<ReturnType<typeof fixture>>['call'], slot: number) {
  const admin = await call('/auth/login', { principal: process.env.E2E_ADMIN_PRINCIPAL ?? 'browser-admin', credential: process.env.E2E_ADMIN_PASSWORD ?? 'Browser-admin-only-20261021' }, '');
  for (const state of ['complete', 'partial', 'pdf']) await call('/library/papers/' + encodeURIComponent('qa:paper:' + slot + ':' + state) + '/publication', { status: 'published', reason: '原创合成题卷逐项检查', licenseEvidence: '测试构造的题目与原件供隔离验证', contentReviewed: true, mediaReviewed: true }, admin.token);
}
function pdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [4 0 R 6 0 R] /Count 2 >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for (let page = 1; page <= 2; page++) { const stream = `BT /F1 13 Tf 40 740 Td (Page ${page}. Preserve original conditions and compare counterexamples.) Tj ET`; objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + (page - 1) * 2} 0 R >>`, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`); }
  let content = '%PDF-1.4\n'; const offsets: number[] = [];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(content)); content += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(content); return Buffer.from(content + `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
}

test('workspace materials: adult documents and actor-bound text drafts work without a child', async ({ page }) => {
  const f = await fixture(page); await f.add('成人私人原文'); await page.goto(f.href());
  await expect(page.getByRole('heading', { name: '我的资料', exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: '成人私人原文', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'PDF页与结构', exact: true })).toHaveCount(0); await expect(page.getByRole('tab', { name: '个性化学案', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '核对原文与原页', exact: true }).click(); const preview = page.getByRole('dialog', { name: '核对学习资料', exact: true }); await expect(preview.locator('pre')).toHaveText(body); await page.reload(); await expect(preview.locator('pre')).toHaveText(body); await preview.getByRole('button', { name: '关闭资料核对', exact: true }).click();
  const dialog = await openText(page); await dialog.getByLabel('资料名称', { exact: true }).fill('尚未提交的草稿'); await dialog.getByLabel('完整文字', { exact: true }).fill(body);
  await dialog.getByRole('button', { name: '关闭文字编辑', exact: true }).click(); await dialog.getByRole('button', { name: '保留草稿并关闭', exact: true }).click(); await page.reload();
  await openText(page); await expect(dialog.getByLabel('完整文字', { exact: true })).toHaveValue(body); expect((await f.call('/learning/source-courses/materials?view=catalog')).length).toBe(1);
  await dialog.getByRole('button', { name: '保存文字资料', exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(page.getByRole('dialog', { name: '核对学习资料', exact: true }).locator('pre')).toHaveText(body); expect((await f.call('/learning/source-courses/materials?view=catalog')).length).toBe(2);
});

test('workspace materials: explicit object and subject never mix lawful parent-private documents', async ({ page }) => {
  const f = await fixture(page, 2), [a, b] = f.profiles;
  await f.add('成人私有不混入'); await f.add('第一档案数学', a.id); await f.add('第二档案数学', b.id); await f.add('第一档案英语', a.id, 'english');
  await page.goto(f.href('personal', a.id)); await expect(page.locator('.workspace-page-row h3')).toHaveText(['第一档案数学']);
  await page.getByLabel('学习对象', { exact: true }).selectOption(b.id); await expect(page.locator('.workspace-page-row h3')).toHaveText(['第二档案数学']);
  await page.getByLabel('学习对象', { exact: true }).selectOption(a.id); await page.getByLabel('学科', { exact: true }).selectOption('english'); await expect(page.locator('.workspace-page-row h3')).toHaveText(['第一档案英语']);
  await page.goto(f.href()); await expect(page.locator('.workspace-page-row h3')).toHaveText(['成人私有不混入']);
  await page.goto(f.href('files')); await expect(page.getByRole('heading', { name: '这类学案与知识点白板需要已确认的学习范围', exact: true })).toBeVisible(); await expect(page.locator('.sa-pdf-lab')).toHaveCount(0);
  await page.goto(f.href('personal', a.id, { material: 'foreign-source', page: '1' })); const dialog = page.getByRole('dialog', { name: '核对学习资料', exact: true }); await expect(dialog.getByRole('alert')).toContainText('不属于当前对象'); await expect(dialog.locator('pre')).toHaveCount(0);
});

test('workspace materials: a lost text receipt and reload reuse the complete original command once', async ({ page }) => {
  const f = await fixture(page); await page.goto(f.href()); const keys: string[] = []; let lost = false;
  await page.route('**/api/learning/source-courses/materials/text', async route => { keys.push(route.request().postDataJSON().requestKey); if (!lost) { lost = true; expect((await route.fetch()).status()).toBe(201); await route.abort('failed'); } else await route.continue(); });
  const dialog = await openText(page); await dialog.getByLabel('资料名称', { exact: true }).fill('丢失回执的完整文字'); await dialog.getByLabel('完整文字', { exact: true }).fill(body + '\n---\n' + body);
  await dialog.getByRole('button', { name: '保存文字资料', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('暂时无法连接'); await dialog.getByRole('button', { name: '关闭文字编辑', exact: true }).click(); await dialog.getByRole('button', { name: '保留草稿并关闭', exact: true }).click(); await page.reload();
  await openText(page); await expect(dialog.getByLabel('完整文字', { exact: true })).toHaveValue(body + '\n---\n' + body); await dialog.getByRole('button', { name: '保存文字资料', exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]); const rows = await f.call('/learning/source-courses/materials'); expect(rows).toHaveLength(1); expect(rows[0].material.pages.map((value: { text: string }) => value.text)).toEqual([body, body]);
});

test('workspace materials: unavailable storage protects full text across browser back and restores focus', async ({ page }) => {
  const f = await fixture(page); await page.goto(f.href()); await page.getByRole('tab', { name: '题卷资源', exact: true }).click(); await page.getByRole('tab', { name: '学习资料', exact: true }).click();
  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('Synthetic disabled storage', 'QuotaExceededError'); }; });
  const dialog = await openText(page), full = '完整保留的输入。'.repeat(21000); await dialog.getByLabel('资料名称', { exact: true }).fill('不能静默丢弃的正文'); await dialog.getByLabel('完整文字', { exact: true }).fill(full);
  await expect(dialog.getByLabel('完整文字', { exact: true })).toHaveValue(full); await page.evaluate(() => window.history.back()); await expect(dialog.getByRole('button', { name: '已保留副本，关闭编辑', exact: true })).toBeDisabled(); expect(new URL(page.url()).searchParams.get('tab')).toBe('personal');
  await dialog.getByRole('button', { name: '继续编辑', exact: true }).click(); await expect(dialog.getByLabel('完整文字', { exact: true })).toHaveValue(full); await dialog.getByRole('button', { name: '关闭文字编辑', exact: true }).click();
  const downloading = page.waitForEvent('download'); await dialog.getByRole('button', { name: '下载完整文字稿', exact: true }).click(); const downloaded = await downloading; const bytes = await readFile((await downloaded.path())!, 'utf8'); expect(JSON.parse(bytes).text).toBe(full);
  await dialog.getByRole('button', { name: '已保留副本，关闭编辑', exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(page.getByRole('button', { name: '继续文字资料草稿', exact: true })).toBeFocused(); expect((await f.call('/learning/source-courses/materials?view=catalog')).length).toBe(0);
});

test('workspace materials: real PDF pages, source course, classroom and project preserve the source return', async ({ page }) => {
  test.setTimeout(150000); const f = await fixture(page, 1), child = f.profiles[0]; await page.goto(f.href('files', child.id));
  await page.getByLabel('上传资料 PDF', { exact: true }).setInputFiles({ name: 'two-original-pages.pdf', mimeType: 'application/pdf', buffer: pdf() });
  await expect(page.locator('.sa-pdf-pages button')).toHaveCount(2, { timeout: 45000 }); await page.locator('.sa-pdf-pages button').nth(1).click(); await page.getByRole('button', { name: '文字层', exact: true }).click(); await expect(page.locator('.sa-pdf-paper')).toContainText('Page 2.');
  const source = page.url(); await page.reload(); await expect(page.locator('.sa-pdf-paper')).toContainText('Page 2.'); await expect(page.locator('.sa-pdf-view-toggle button[data-active=true]')).toHaveText('文字层'); await expect(page.locator('main')).toHaveCount(1);
  for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); await page.screenshot({ path: test.info().outputPath('pdf-page-2-' + width + '.png'), fullPage: true }); } await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('link', { name: '从这一页创建完整资料课程 →', exact: true }).click(); await expect(page).toHaveURL(/\/studio\/source-courses\?.*materialsReturn=/); const back = new URL(page.url()).searchParams.get('materialsReturn'); expect([...new URL(back!, 'https://study.invalid').searchParams].sort()).toEqual([...new URL(source).searchParams].sort());
  await expect(page.getByRole('checkbox', { name: /第2页/ })).toBeChecked(); await page.getByLabel('课程名称', { exact: true }).fill('原PDF返回验证'); await page.getByLabel('学习目标', { exact: true }).fill('保留原文条件并比较观察与解释。'); await page.getByRole('button', { name: '生成课程蓝图 →', exact: true }).click(); await page.getByRole('button', { name: '确认范围并生成', exact: true }).click();
  await expect(page.getByRole('heading', { name: '先看一遍这条学习路线。', exact: true })).toBeVisible({ timeout: 45000 }); await page.getByRole('button', { name: '确认课程，开始学习 →', exact: true }).click(); await page.getByRole('link', { name: '开始讲解 →', exact: true }).first().click(); await expect(page.locator('.cl-session-navigation')).toBeVisible(); expect(new URL(page.url()).searchParams.get('materialsReturn')).toBe(back);
  await page.getByRole('button', { name: '离开课堂', exact: true }).click(); if (await page.getByRole('button', { name: '保存并离开', exact: true }).count()) await page.getByRole('button', { name: '保存并离开', exact: true }).click(); await expect(page.getByRole('link', { name: '‹ 返回来源资料', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '打开资料应用项目 →', exact: true }).click(); await expect(page.getByRole('link', { name: '‹ 返回课程', exact: true })).toBeVisible(); expect(new URL(page.url()).searchParams.get('materialsReturn')).toBe(back); await page.getByRole('link', { name: '‹ 返回课程', exact: true }).click(); await page.getByRole('link', { name: '‹ 返回来源资料', exact: true }).click(); await expect(page.locator('.sa-pdf-paper')).toContainText('Page 2.'); expect(new URL(page.url()).searchParams.get('materialView')).toBe('text');
});

test('workspace materials: paper legacy links and URL filters survive details answers back forward and refresh', async ({ page }) => {
  const f = await fixture(page); await publish(page, f.call, 30); await page.goto('/library?q=' + encodeURIComponent('匿名原卷 30') + '&subject=' + encodeURIComponent('数学'));
  await expect(page).toHaveURL(/\/studio\?.*tab=papers/); await expect(page.getByLabel('搜索试卷', { exact: true })).toHaveValue('匿名原卷 30'); await expect(page.locator('.library-results > article')).toHaveCount(3);
  await page.locator('.library-results > article').filter({ hasText: '完整' }).locator('.library-open').click(); await expect(page.locator('.library-paper')).toContainText('匿名原卷 30'); await page.getByRole('button', { name: '查看参考答案', exact: true }).click(); await expect(page.locator('.library-answer').first()).toContainText('合成原参考：5'); await page.reload(); await expect(page.locator('.library-answer').first()).toContainText('合成原参考：5');
  await page.getByRole('button', { name: '← 返回题卷库', exact: true }).click(); await expect(page.getByLabel('搜索试卷', { exact: true })).toHaveValue('匿名原卷 30'); await expect(page.locator('.library-results > article')).toHaveCount(3); await page.goBack(); await expect(page.locator('.library-paper')).toContainText('匿名原卷 30'); await page.goForward(); await expect(page.getByLabel('搜索试卷', { exact: true })).toHaveValue('匿名原卷 30');
  await page.locator('.library-results > article').filter({ hasText: 'PDF' }).locator('.library-open').click(); const opening = page.context().waitForEvent('request', request => new URL(request.url()).pathname === '/api/library/media'), popupPromise = page.waitForEvent('popup'); await page.getByRole('button', { name: '打印原PDF', exact: true }).click(); const popup = await popupPromise, originalRequest = await opening; const response = await page.request.get(originalRequest.url()); expect(response.headers()['content-type']).toContain('application/pdf'); expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-'); await popup.close();
  await expect(page.getByLabel('学习工作台导航', { exact: true })).toHaveCount(1); await expect(page.locator('main')).toHaveCount(1);
});

test('workspace materials: original-paper first answers keep identity and exact source return through review', async ({ page }) => {
  const f = await fixture(page, 1); await publish(page, f.call, 31); await page.goto(f.href('papers', f.profiles[0].id, { paper: 'qa:paper:31:partial', paperQuery: '匿名原卷 31', paperPage: '1' }));
  await expect(page.getByRole('region', { name: '题卷练习入口', exact: true })).toContainText('当前登录账号'); await page.getByRole('link', { name: '整卷练习 ↗', exact: true }).click(); const back = new URL(page.url()).searchParams.get('materialsReturn'); expect(back).toContain('paperQuery=');
  await page.getByRole('button', { name: '预览这次练习', exact: true }).click(); await page.getByRole('button', { name: '确认范围，开始练习 ↗', exact: true }).click(); await page.getByLabel('先写下自己的回答', { exact: true }).fill('保留我的首次思考。'); await page.getByRole('button', { name: '提交本题回答', exact: true }).click(); await expect(page.getByRole('region', { name: '不可覆盖的首次回答', exact: true })).toContainText('保留我的首次思考。');
  const session = new URL(page.url()).searchParams.get('session')!; const record = await f.call('/library/practice/sessions/' + session); expect(record.ownerUserId).toBe(f.actor.user.id); expect(record.studentId).toBeNull();
  await page.reload(); await expect(page.getByRole('region', { name: '不可覆盖的首次回答', exact: true })).toContainText('保留我的首次思考。'); const returnLink = page.getByRole('link', { name: '← 返回来源资料', exact: true }); await expect(returnLink).toHaveAttribute('href', back!); await returnLink.click(); await expect(page.locator('.library-paper')).toContainText('匿名原卷 31');
  await page.getByRole('link', { name: '待复习与反思 ↗', exact: true }).click(); await expect(page.getByRole('link', { name: '原卷库 ↗', exact: true })).toHaveAttribute('href', back!); await page.getByRole('link', { name: '原卷库 ↗', exact: true }).click(); await expect(page.locator('.library-paper')).toContainText('匿名原卷 31');
});

test('workspace materials: student learning code reads only their own materials and no adult projection', async ({ page }) => {
  const f = await fixture(page, 2), a = f.profiles[0], b = f.profiles[1]; await f.add('学生自己的原文', a.id); await f.add('其他档案原文', b.id); await f.add('家长私人原文');
  const access = await f.call('/students/' + a.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: crypto.randomUUID(), reason: '隔离资料学习码验证' }); const code = await f.call('/students/' + a.id + '/learning-access/codes', { expectedVersion: access.version, requestKey: crypto.randomUUID() });
  await page.goto('/student/login'); await page.getByLabel('一次性学习码', { exact: true }).fill(code.code); await page.getByRole('button', { name: '进入我的学习 →', exact: true }).click(); await expect(page).toHaveURL(/\/studio(?:\?|$)/); await expect(page.getByLabel('学习对象', { exact: true })).toBeDisabled(); await page.goto(f.href('personal', a.id)); await expect(page.locator('.workspace-page-row h3')).toHaveText(['学生自己的原文']);
  await expect(page.getByRole('link', { name: '从资料创建课程', exact: true })).toHaveCount(0); await page.goto(f.href('personal', b.id)); await expect(page.locator('.workspace-page-row')).toHaveCount(0); await page.goto(f.href()); await expect(page.locator('.workspace-page-row')).toHaveCount(0); await expect(page.locator('[role=alert]').first()).toBeVisible();
});

test('workspace materials: existing-style tabs support keyboard navigation and narrow screens', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); const f = await fixture(page, 1); await f.add('手机核对资料', f.profiles[0].id); await page.goto(f.href('personal', f.profiles[0].id));
  const tabs = page.getByRole('tablist', { name: '资料分类', exact: true }); await tabs.getByRole('tab', { name: '学习资料', exact: true }).focus(); await page.keyboard.press('End'); await expect(tabs.getByRole('tab', { name: '题卷资源', exact: true })).toBeFocused(); await expect(tabs.getByRole('tab', { name: '题卷资源', exact: true })).toHaveAttribute('aria-selected', 'true'); await page.keyboard.press('Home'); await expect(tabs.getByRole('tab', { name: '学习资料', exact: true })).toBeFocused();
  for (const width of [1440, 768, 390, 320]) { await page.setViewportSize({ width, height: 800 }); await expect(page.getByRole('heading', { name: '手机核对资料', exact: true })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); await page.screenshot({ path: test.info().outputPath('materials-' + width + '.png'), fullPage: true }); }
  await page.getByRole('button', { name: '核对原文与原页', exact: true }).click(); const dialog = page.getByRole('dialog', { name: '核对学习资料', exact: true }); await expect(dialog.locator('pre')).toHaveText(body); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); expect(errors).toEqual([]);
});

test('workspace materials: a late catalog cannot replace a new object and list pagination restores from URL', async ({ page }) => {
  const f = await fixture(page, 2), [a, b] = f.profiles;
  await f.add('迟到的旧档案资料', a.id); for (let index = 0; index < 21; index++) await f.add('当前档案资料 ' + String(index).padStart(2, '0'), b.id);
  await page.goto(f.href('personal', b.id)); await expect(page.locator('.workspace-page-row')).toHaveCount(20);
  let release!: () => void, observed!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }), waiting = new Promise<void>(resolve => { observed = resolve; });
  await page.route('**/api/learning/source-courses/materials?*', async route => { if (new URL(route.request().url()).searchParams.get('studentId') === a.id) { const response = await route.fetch(); observed(); await gate; await route.fulfill({ response }); } else await route.continue(); });
  try { await page.getByLabel('学习对象', { exact: true }).selectOption(a.id); await waiting; await page.getByLabel('学习对象', { exact: true }).selectOption(b.id); await expect(page.locator('.workspace-page-row')).toHaveCount(20); } finally { release(); }
  await expect(page.getByRole('heading', { name: '迟到的旧档案资料', exact: true })).toHaveCount(0);
  await page.getByRole('navigation', { name: '学习资料分页', exact: true }).getByRole('button', { name: '下一页', exact: true }).click(); await expect(page.locator('.workspace-page-row')).toHaveCount(1); expect(new URL(page.url()).searchParams.get('materialListPage')).toBe('2'); await page.reload(); await expect(page.locator('.workspace-page-row')).toHaveCount(1); await page.goBack(); await expect(page.locator('.workspace-page-row')).toHaveCount(20);
  for (const tab of ['PDF页与结构', '个性化学案', '题卷资源', '学习资料']) { await page.setViewportSize({ width: 1440, height: 800 }); await page.getByRole('tab', { name: tab, exact: true }).click(); await expect(page.locator('main')).toHaveCount(1); await expect(page.getByLabel('学习工作台导航', { exact: true })).toHaveCount(1); for (const width of [1440, 768, 390, 320]) { await page.setViewportSize({ width, height: 800 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), tab + ' width=' + width).toBe(true); await page.screenshot({ path: test.info().outputPath('materials-tab-' + tab + '-' + width + '.png'), fullPage: true }); } }
});
