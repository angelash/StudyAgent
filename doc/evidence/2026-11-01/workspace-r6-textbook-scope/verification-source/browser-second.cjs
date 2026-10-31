const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'browser-runtime-second.private.json'))), build = JSON.parse(fs.readFileSync(path.join(__dirname, 'web-build-second.json')));
const { chromium, expect } = require(require.resolve('@playwright/test', { paths: [config.candidate] })), out = path.join(__dirname, 'browser-second'), api = 'http://localhost:16182', web = 'http://localhost:13182', cases = [];
if (fs.existsSync(out) || !build.authoredUnchanged) throw Error('New browser output and exact completed build required'); fs.mkdirSync(out);
const control = async input => { const response = await fetch(api + '/__qa/scope-control', { method: 'POST', headers: { 'content-type': 'application/json', 'x-study-qa': config.nonce }, body: JSON.stringify(input) }); assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.nonce, config.nonce); return result; };
const work = page => page.locator('.admin-workbench'), list = page => page.locator('.mapping-worklist'), gaps = page => list(page).getByRole('region', { name: '无可核对课时的教材' });
const toolbar = page => work(page).locator('.admin-toolbar').first();
async function ready(page) { await expect(list(page).getByRole('status').filter({ hasText: '本范围' })).toBeVisible({ timeout: 30000 }); }
async function enter(page) { await page.goto(web + '/admin/curriculum'); await ready(page); }
async function json(context, query) { const response = await context.request.get(web + '/api/admin/curriculum/textbook-mapping-worklist?' + query); assert.equal(response.status(), 200); return (await response.json()).data; }
async function picture(page, name) { await list(page).screenshot({ path: path.join(out, name + '.png') }); }
async function scope(page, subject, grade, term = 'upper') { await toolbar(page).getByRole('combobox', { name: '学科', exact: true }).selectOption(subject); await expect(work(page).locator('.admin-grade-map').getByRole('button', { name: new RegExp('^' + grade + '年级') })).toBeVisible(); await work(page).locator('.admin-grade-map').getByRole('button', { name: new RegExp('^' + grade + '年级') }).click(); await toolbar(page).getByRole('combobox', { name: '学期', exact: true }).selectOption(term); await ready(page); }
async function run(browser, name, fn, readonly = true) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const login = await context.request.post(api + '/api/auth/login', { data: { principal: config.principal, credential: config.credential } }); assert.equal(login.status(), 201);
  await context.tracing.start({ screenshots: true, snapshots: true }); const before = await control({ action: 'snapshot' }), start = Date.now();
  try { await fn({ context, page }); assert.deepEqual(errors, []); const after = await control({ action: 'snapshot' }); if (readonly) { assert.equal(after.hash, before.hash); assert.equal(after.revision, before.revision); assert.deepEqual(after.tasks, before.tasks); } cases.push({ name, passed: true, durationMs: Date.now() - start, nativeRowsAndQueueUnchanged: readonly }); }
  catch (error) { await page.screenshot({ path: path.join(out, name + '-failure.png'), fullPage: true }).catch(() => {}); cases.push({ name, passed: false, error: String(error.stack ?? error), pageErrors: errors }); }
  finally { await context.tracing.stop({ path: path.join(out, name + '-trace.private.zip') }); await context.close(); }
}
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  try {
    await run(browser, 'actual-primary-scope-and-missing-book-detail', async ({ context, page }) => {
      await enter(page); const current = await json(context, 'subject=math&grade=3&term=upper&bookPageSize=10');
      await expect(list(page).getByRole('status').filter({ hasText: '本范围' })).toContainText(`本范围${current.inventory.registeredBooks}册`);
      assert(current.bookGaps.total > 0); await expect(gaps(page)).toContainText(`本范围还有${current.bookGaps.total}册`);
      const first = current.bookGaps.rows[0]; await gaps(page).getByRole('button', { name: '核对教材目录：' + first.bookTitle, exact: true }).click();
      await expect(work(page).getByRole('combobox', { name: '选择目录', exact: true })).toHaveValue(first.bookId);
      await expect(work(page).getByText(/原始目录未提供章节树/)).toBeVisible();
      assert.equal(await list(page).getByText('同版原卷可用', { exact: true }).count(), 0); await picture(page, 'actual-primary-and-book-gaps');
    });
    await run(browser, 'matched-edition-without-installed-original', async ({ page }) => {
      await enter(page); await scope(page, 'chinese', 1);
      const rows = list(page).locator('.mapping-worklist-rows').first(); await rows.getByRole('button').first().click();
      await expect(work(page).getByText('同版来源已登记，但本地原卷未安装。', { exact: true })).toBeVisible();
      assert.equal(await work(page).locator('.admin-textbook-source iframe').count(), 0);
      await expect(rows.getByRole('button').first()).toContainText('同版来源匹配'); await picture(page, 'matched-metadata-no-source-file');
    });
    await run(browser, 'independent-missing-book-pagination-and-empty-lesson-filter', async ({ page }) => {
      await enter(page); await scope(page, 'chemistry', 9);
      await expect(list(page).getByRole('status').filter({ hasText: '本范围' })).toContainText('本范围15册：1册有课时，14册尚无可核对课时；共2个课时');
      await list(page).locator('.mapping-state-filter').first().getByRole('button', { name: /^已审核/ }).click(); await ready(page);
      await expect(list(page).getByText('当前筛选下没有课时。', { exact: true })).toBeVisible(); await expect(gaps(page)).toContainText('本范围还有14册');
      await expect(gaps(page).getByRole('button', { name: /^核对教材目录/ })).toHaveCount(10);
      await gaps(page).getByRole('button', { name: '下一页教材', exact: true }).click(); await ready(page);
      await expect(gaps(page).getByRole('button', { name: /^核对教材目录/ })).toHaveCount(4);
      await expect(gaps(page)).toContainText('目录中尚无独立课时'); await expect(gaps(page)).toContainText('课时目录尚未确认');
      await picture(page, 'independent-second-book-page');
      await toolbar(page).getByRole('combobox', { name: '学期', exact: true }).selectOption('lower'); await ready(page);
      await expect(list(page).getByRole('status').filter({ hasText: '本范围' })).toContainText('本范围2册：0册有课时，2册尚无可核对课时；共0个课时');
      await expect(gaps(page).getByRole('button', { name: /^核对教材目录/ })).toHaveCount(2); await picture(page, 'wholly-missing-scope');
    });
    await run(browser, 'empty-registered-scope-is-not-complete-coverage', async ({ page }) => {
      await enter(page); await scope(page, 'english', 1);
      await expect(list(page).getByRole('status').filter({ hasText: '本范围' })).toContainText('本范围0册：0册有课时，0册尚无可核对课时；共0个课时');
      await expect(gaps(page).getByText('本范围尚未登记教材，请先核对学科、年级和学期。', { exact: true })).toBeVisible();
      await expect(gaps(page).getByRole('button', { name: /^核对教材目录/ })).toHaveCount(0); await picture(page, 'empty-registered-scope');
    });
    await run(browser, 'delayed-old-scope-cannot-replace-current-results', async ({ context, page }) => {
      await enter(page); let release, captured; const gate = new Promise(resolve => { release = resolve; }), requested = new Promise(resolve => { captured = resolve; }); let held = false;
      await page.route('**/api/admin/curriculum/textbook-mapping-worklist?**', async route => { const url = new URL(route.request().url()); if (!held && url.searchParams.get('subject') === 'math' && url.searchParams.get('term') === 'lower') { held = true; const response = await route.fetch(); captured(); await gate; await route.fulfill({ response }); } else await route.continue(); });
      try {
        await toolbar(page).getByRole('combobox', { name: '学期', exact: true }).selectOption('lower'); await requested;
        await expect(list(page).getByRole('status').filter({ hasText: '本范围' })).toHaveCount(0);
        await toolbar(page).getByRole('combobox', { name: '学科', exact: true }).selectOption('chinese'); await ready(page);
        const current = await json(context, 'subject=chinese&grade=3&term=lower');
        await expect(list(page).getByRole('status').filter({ hasText: '本范围' })).toContainText(`本范围${current.inventory.registeredBooks}册`);
        release(); await page.waitForTimeout(250);
        await expect(list(page).getByRole('status').filter({ hasText: '本范围' })).toContainText(`共${current.inventory.progressLessons}个课时`); await picture(page, 'late-scope-remains-current');
      } finally { release(); }
    });
    await run(browser, 'transient-read-error-and-explicit-retry', async ({ page }) => {
      let failed = false;
      await page.route('**/api/admin/curriculum/textbook-mapping-worklist?**', route => { if (!failed) { failed = true; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ data: null, error: { code: 'generated_unavailable', message: '合成暂时读取失败，原记录保持。' } }) }); } return route.continue(); });
      await page.goto(web + '/admin/curriculum'); await expect(list(page).getByRole('alert')).toContainText('合成暂时读取失败');
      assert.equal(await list(page).locator('.mapping-worklist-rows button').count(), 0);
      await list(page).getByRole('button', { name: '重试清单', exact: true }).click(); await ready(page); await picture(page, 'retry-current-scope');
    });
    await run(browser, 'three-widths-short-height-and-keyboard-book-open', async ({ context, page }) => {
      await enter(page); const current = await json(context, 'subject=math&grade=3&term=upper&bookPageSize=10'), first = current.bookGaps.rows[0]; assert(first);
      for (const width of [390, 768, 1440]) { await page.setViewportSize({ width, height: width === 390 ? 520 : 850 }); await list(page).scrollIntoViewIfNeeded(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true); const box = await list(page).boundingBox(); assert(box && box.x >= 0 && box.x + box.width <= width + 1); await picture(page, 'scope-list-' + width); }
      const target = gaps(page).getByRole('button', { name: '核对教材目录：' + first.bookTitle, exact: true }); await target.focus(); await expect(target).toBeFocused(); await page.keyboard.press('Enter');
      await expect(work(page).getByRole('combobox', { name: '选择目录', exact: true })).toHaveValue(first.bookId); await picture(page, 'keyboard-book-open');
    });
    await run(browser, 'actual-role-revocation-clears-previous-list', async ({ page }) => {
      await enter(page);
      try { await control({ action: 'role', role: 'parent' }); const response = page.waitForResponse(value => value.url().includes('/api/admin/curriculum/textbook-mapping-worklist?') && value.status() === 403); await list(page).getByRole('button', { name: '刷新清单', exact: true }).click(); await response; await expect(list(page).locator('.mapping-worklist-rows button')).toHaveCount(0); await page.screenshot({ path: path.join(out, 'revoked-editor-list-cleared.png'), fullPage: true }); }
      finally { await control({ action: 'role', role: 'admin' }); }
    }, false);
  } finally { await browser.close(); }
  const report = { at: new Date().toISOString(), buildId: build.buildId, cases, passed: cases.filter(row => row.passed).length, failed: cases.filter(row => !row.passed).length, actualProductUiAndSqliteHttp: true, actualPrimaryRegistry448: true, extraChemistryMetadataIsExplicitSynthetic: 17, delayedResponseAnd503AreControlledEngineeringConditions: true, readonlyCasesCompareAllNativeRowsRevisionAndQueue: true, roleChangeIsGeneratedQaAuthorizationOnly: true, teacherContentOrPhysicalDeviceAcceptance: false };
  fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ passed: report.passed, failed: report.failed, cases: cases.map(({ name, passed, error }) => ({ name, passed, ...(error ? { error: error.split('\n')[0] } : {}) })) })); if (report.failed) process.exitCode = 1;
})().catch(error => { fs.writeFileSync(path.join(out, 'setup-failure.log'), String(error.stack ?? error), { flag: 'wx' }); console.error('Actual curriculum UI setup failed; original failure retained'); process.exitCode = 1; });
