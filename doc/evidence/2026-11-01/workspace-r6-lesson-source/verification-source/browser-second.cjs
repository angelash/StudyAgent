const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'browser-runtime-first.private.json'))), build = JSON.parse(fs.readFileSync(path.join(__dirname, 'web-build-first.json')));
const { chromium, expect } = require(require.resolve('@playwright/test', { paths: [config.candidate] })), out = path.join(__dirname, 'browser-second'), api = 'http://localhost:16183', web = 'http://localhost:13183', cases = [], book = config.syntheticBook;
if (fs.existsSync(out) || !build.authoredUnchanged) throw Error('Unused browser output and exact production build required'); fs.mkdirSync(out);
const work = page => page.locator('.admin-workbench'), panel = page => page.getByRole('region', { name: '课时正文来源', exact: true }), sourceText = page => panel(page).locator('.curriculum-source-text');
async function control(input) { const response = await fetch(api + '/__qa/source-control', { method: 'POST', headers: { 'content-type': 'application/json', 'x-study-qa': config.nonce }, body: JSON.stringify(input) }); assert.equal(response.status, 200); const data = await response.json(); assert.equal(data.nonce, config.nonce); return data; }
async function json(context, route) { const response = await context.request.get(api + '/api' + route); assert.equal(response.status(), 200); return (await response.json()).data; }
async function enter(page) { await page.goto(web + '/admin/curriculum'); await expect(work(page).getByRole('heading', { name: '教材课时与知识映射', exact: true })).toBeVisible(); }
async function scope(page, subject, grade = 3) {
  const toolbar = work(page).locator('.admin-toolbar').first(); await toolbar.getByRole('combobox', { name: '学科', exact: true }).selectOption(subject);
  const button = work(page).locator('.admin-grade-map').getByRole('button', { name: new RegExp('^' + grade + '年级') }); await expect(button).toBeVisible(); await button.click();
  await toolbar.getByRole('combobox', { name: '学期', exact: true }).selectOption('upper');
}
async function choose(page, entry = book, lessonName = '第一原始课时') {
  await scope(page, entry.subject, entry.grade); const select = work(page).getByRole('combobox', { name: '选择目录', exact: true });
  await expect(select.locator('option').filter({ hasText: entry.title })).toHaveCount(1); await select.selectOption(entry.id);
  const button = work(page).locator('.admin-lesson-list button').filter({ hasText: lessonName }); await expect(button).toHaveCount(1); await button.click(); await expect(panel(page).getByRole('heading', { name: lessonName, exact: true })).toBeVisible();
}
async function read(page) { await panel(page).getByRole('button', { name: '核对本课来源', exact: true }).click(); await expect(panel(page).getByText('定位候选 · 待逐页核对', { exact: true })).toBeVisible(); }
async function picture(page, name) { await panel(page).scrollIntoViewIfNeeded(); await panel(page).screenshot({ path: path.join(out, name + '-panel.png') }); await page.screenshot({ path: path.join(out, name + '-viewport.png') }); }
async function run(browser, name, fn, readonly = true) {
  if (process.argv[2] && name !== process.argv[2]) return;
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message)); const login = await context.request.post(api + '/api/auth/login', { data: { principal: config.principal, credential: config.credential } }); assert.equal(login.status(), 201);
  await context.tracing.start({ screenshots: true, snapshots: true }); const before = await control({ action: 'snapshot' }), started = Date.now();
  try { await fn({ context, page }); assert.deepEqual(errors, []); const after = await control({ action: 'snapshot' }); if (readonly) { assert.equal(after.hash, before.hash); assert.equal(after.revision, before.revision); assert.deepEqual(after.tasks, before.tasks); } cases.push({ name, passed: true, durationMs: Date.now() - started, nativeRowsAndQueueUnchanged: readonly }); }
  catch (error) { await page.screenshot({ path: path.join(out, name + '-failure.png'), fullPage: true }).catch(() => {}); cases.push({ name, passed: false, error: String(error.stack ?? error), pageErrors: errors }); }
  finally { await context.tracing.stop({ path: path.join(out, name + '-trace.private.zip') }); await context.close(); }
}
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  try {
    await run(browser, 'actual-textbook-source-exact-text', async ({ context, page }) => {
      const registry = JSON.parse(fs.readFileSync(path.join(config.candidate, 'resources/curriculum/textbooks-v1.json'))), entry = registry.books.find(book => book.subject === 'chinese' && book.grade === 3 && book.term === 'upper' && book.chapterEvidence), detail = await json(context, '/admin/curriculum/textbooks/' + encodeURIComponent(entry.id));
      const lesson = detail.chapters.flatMap(chapter => chapter.lessons).find(lesson => lesson.kind !== 'reference' && lesson.sourcePageRange), manifest = JSON.parse(fs.readFileSync(path.join(config.directory, 'manifest.json'))), source = manifest.books.find(source => source.grade === 3 && source.term === 'upper'), extracted = JSON.parse(fs.readFileSync(path.join(config.directory, 'assets', source.extractedPath.slice('data/assets/'.length))));
      await enter(page); await choose(page, entry, lesson.name); assert.equal(await sourceText(page).count(), 0); await read(page);
      assert.equal(await sourceText(page).locator('p').textContent(), extracted.pages[lesson.sourcePageRange.start - 1].text); await expect(panel(page)).toContainText('尚未形成教学审核结论');
      await panel(page).getByText('来源版本与校验依据', { exact: true }).click(); await expect(panel(page)).toContainText(source.sha256); await picture(page, 'actual-textbook-source');
    });
    await run(browser, 'physical-pages-empty-text-and-unmatched-title', async ({ page }) => {
      await enter(page); await choose(page); await read(page); assert.equal(await sourceText(page).locator('p').textContent(), config.syntheticTexts[0]);
      await panel(page).getByRole('button', { name: '下一原页', exact: true }).click(); await expect(panel(page)).toContainText('本物理页没有可读提取文字'); await expect(work(page).locator('.admin-textbook-source iframe')).toHaveAttribute('src', /#page=2&/); assert.equal(await sourceText(page).count(), 0);
      await panel(page).getByRole('combobox', { name: 'PDF 物理页', exact: true }).selectOption('3'); await expect(sourceText(page)).toBeVisible(); assert.equal(await sourceText(page).locator('p').textContent(), config.syntheticTexts[2]);
      await work(page).locator('.admin-lesson-list button').filter({ hasText: '图示原始课时' }).click(); await read(page); await expect(panel(page)).toContainText('算法未匹配到课时标题'); await expect(panel(page)).toContainText('本物理页没有可读提取文字'); await picture(page, 'empty-extraction-candidate');
    });
    await run(browser, 'changed-extraction-clears-old-text-and-recovers', async ({ page }) => {
      await enter(page); await choose(page); await read(page); await control({ action: 'extraction', mode: 'changed' });
      try { await panel(page).getByRole('button', { name: '重新核对来源', exact: true }).click(); await expect(panel(page).getByRole('alert')).toContainText('完整字节或来源身份无法核对'); assert.equal(await sourceText(page).count(), 0); }
      finally { assert.equal((await control({ action: 'extraction', mode: 'restore' })).restored, true); }
      await panel(page).getByRole('button', { name: '重试来源核对', exact: true }).click(); await expect(sourceText(page)).toBeVisible(); assert.equal(await sourceText(page).locator('p').textContent(), config.syntheticTexts[0]); await picture(page, 'restored-exact-extraction');
    });
    await run(browser, 'late-old-lesson-response-keeps-current-scope', async ({ page }) => {
      await enter(page); await choose(page); let release, capture; const gate = new Promise(resolve => { release = resolve; }), entered = new Promise(resolve => { capture = resolve; }); let held = false;
      await page.route('**/api/admin/curriculum/textbooks/**/lessons/**/source?**', async route => { if (!held && decodeURIComponent(new URL(route.request().url()).pathname).includes('/lessons/qa-source:first/')) { held = true; const response = await route.fetch(); capture(); await gate; await route.fulfill({ response }).catch(() => {}); } else await route.continue(); });
      try {
        await panel(page).getByRole('button', { name: '核对本课来源', exact: true }).click(); await entered; await work(page).locator('.admin-lesson-list button').filter({ hasText: '图示原始课时' }).click(); await expect(panel(page).getByRole('heading', { name: '图示原始课时', exact: true })).toBeVisible();
        release(); await read(page); await expect(panel(page)).toContainText('本物理页没有可读提取文字'); assert.equal(await sourceText(page).count(), 0); await expect(panel(page)).not.toContainText(config.syntheticTexts[0]);
      } finally { release(); }
    });
    await run(browser, 'unlocated-reference-and-scope-switch', async ({ page }) => {
      await enter(page); await choose(page); await read(page); await work(page).locator('.admin-lesson-list button').filter({ hasText: '无定位课时' }).click(); await expect(panel(page)).toContainText('尚无绑定当前教材版本的页码候选'); assert.equal(await panel(page).getByRole('button', { name: '核对本课来源', exact: true }).count(), 0); assert.equal(await sourceText(page).count(), 0);
      await expect(work(page).locator('.admin-lesson-list button').filter({ hasText: '原始附录' })).toBeDisabled(); await scope(page, 'math', 3); await expect(panel(page)).toHaveCount(0); await expect(work(page).locator('.admin-textbook-source iframe')).toHaveCount(0);
    });
    await run(browser, 'transport-failure-retry-and-wrong-identity', async ({ page }) => {
      await enter(page); await choose(page); let count = 0;
      await page.route('**/api/admin/curriculum/textbooks/**/lessons/**/source?**', async route => {
        if (count++ === 0) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ data: null, error: { code: 'qa_unavailable', message: '隔离来源暂不可读' } }) });
        const response = await route.fetch(); if (count === 2) { const body = await response.json(); body.data.bookVersion = 'different-version'; return route.fulfill({ response, json: body }); } return route.fulfill({ response });
      });
      await panel(page).getByRole('button', { name: '核对本课来源', exact: true }).click(); await expect(panel(page).getByRole('alert')).toContainText('隔离来源暂不可读');
      await panel(page).getByRole('button', { name: '重试来源核对', exact: true }).click(); await expect(panel(page).getByRole('alert')).toContainText('来源身份与当前课时不一致'); assert.equal(await sourceText(page).count(), 0);
      await panel(page).getByRole('button', { name: '重试来源核对', exact: true }).click(); await expect(sourceText(page)).toBeVisible(); assert.equal(await sourceText(page).locator('p').textContent(), config.syntheticTexts[0]);
    });
    await run(browser, 'three-widths-keyboard-and-literal-source-text', async ({ page }) => {
      await enter(page); await choose(page); await read(page); assert.equal(await sourceText(page).locator('not').count(), 0);
      for (const [width, height] of [[390, 740], [768, 900], [1440, 950]]) { await page.setViewportSize({ width, height }); await panel(page).scrollIntoViewIfNeeded(); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await picture(page, 'source-' + width); }
      const text = sourceText(page); await text.focus(); await expect(text).toBeFocused(); await page.keyboard.press('Tab'); await expect(panel(page).getByText('来源版本与校验依据', { exact: true })).toBeFocused(); await page.keyboard.press('Enter'); await expect(panel(page)).toContainText('当前页内容指纹');
    });
    await run(browser, 'cancelled-source-read-closes-descriptor-and-api-survives', async ({ context, page }) => {
      await enter(page); await choose(page); await page.waitForLoadState('networkidle'); await control({ action: 'pause' });
      try { await panel(page).getByRole('button', { name: '核对本课来源', exact: true }).click(); await expect.poll(async () => (await control({ action: 'pause-state' })).entered).toBe(true); await work(page).locator('.admin-lesson-list button').filter({ hasText: '无定位课时' }).click(); await expect(panel(page)).toContainText('尚无绑定当前教材版本的页码候选'); }
      finally { await control({ action: 'release' }); }
      await expect.poll(async () => (await control({ action: 'pause-state' })).descriptor).toBe(-1); const me = await json(context, '/auth/me'); assert.equal(me.id, config.actorId); assert.equal(await sourceText(page).count(), 0);
    });
    await run(browser, 'current-role-revocation-clears-private-source', async ({ page }) => {
      await enter(page); await choose(page); await read(page); await control({ action: 'role', role: 'parent' });
      try { await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await expect(panel(page)).toHaveCount(0); await expect(work(page).locator('.admin-textbook-source iframe')).toHaveCount(0); await expect(page.getByRole('heading', { name: '当前身份无法访问此管理功能', exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: '返回学习工作台', exact: true })).toBeVisible(); await expect(page.locator('.curriculum-source-text')).toHaveCount(0); await expect(page.locator('.admin-textbook-source iframe')).toHaveCount(0); }
      finally { await control({ action: 'role', role: 'admin' }); }
    }, false);
  } finally { await browser.close(); }
  const report = { at: new Date().toISOString(), buildId: build.buildId, apiPort: 16183, webPort: 13183, passed: cases.filter(row => row.passed).length, failed: cases.filter(row => !row.passed).length, cases, actualTextbookSourcesReadOnly: true, syntheticEngineeringFixtureSeparate: true, physicalDevicesOrTeacherApproval: false };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ passed: report.passed, failed: report.failed, buildId: report.buildId, failures: cases.filter(row => !row.passed).map(row => ({ name: row.name, error: row.error })) })); if (report.failed) process.exitCode = 1;
})().catch(error => { fs.writeFileSync(path.join(out, 'driver-failure.log'), String(error.stack ?? error), { flag: 'wx' }); console.error('Browser driver failed; original output retained'); process.exitCode = 1; });
