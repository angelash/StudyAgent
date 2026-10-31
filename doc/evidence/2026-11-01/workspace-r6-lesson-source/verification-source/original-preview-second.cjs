const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'browser-runtime-first.private.json'))), build = JSON.parse(fs.readFileSync(path.join(__dirname, 'web-build-second.json'))), { chromium, expect } = require(require.resolve('@playwright/test', { paths: [cfg.candidate] })), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const audit = JSON.parse(fs.readFileSync(path.join(__dirname, 'audit-first.json'))).selectedActualLesson, api = 'http://localhost:16183', web = 'http://localhost:13184';
async function snapshot() { const response = await fetch(api + '/__qa/source-control', { method: 'POST', headers: { 'content-type': 'application/json', 'x-study-qa': cfg.nonce }, body: JSON.stringify({ action: 'snapshot' }) }); assert.equal(response.status, 200); const value = await response.json(); assert.equal(value.nonce, cfg.nonce); return value; }
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' }); let context;
  try {
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const login = await context.request.post(api + '/api/auth/login', { data: { principal: cfg.principal, credential: cfg.credential } }); assert.equal(login.status(), 201); const before = await snapshot(), page = await context.newPage();
    await page.goto(web + '/admin/curriculum'); const work = page.locator('.admin-workbench'); await expect(work.getByRole('heading', { name: '教材课时与知识映射', exact: true })).toBeVisible();
    await work.locator('.admin-toolbar').first().getByRole('combobox', { name: '学科', exact: true }).selectOption('chinese'); await work.locator('.admin-grade-map').getByRole('button', { name: /^3年级/ }).click();
    const select = work.getByRole('combobox', { name: '选择目录', exact: true }); await expect(select.locator('option').filter({ hasText: audit.title })).toHaveCount(1); await select.selectOption(audit.bookId);
    await work.locator('.admin-lesson-list button').filter({ hasText: audit.lessonName }).click(); const source = page.getByRole('region', { name: '教材内审原页', exact: true }), iframe = source.locator('iframe'); await expect(iframe).toHaveAttribute('src', /#page=7&/); await source.scrollIntoViewIfNeeded(); await page.waitForLoadState('networkidle');
    const sharp = require(require.resolve('sharp', { paths: [cfg.candidate] })), renderChecks = []; let rendered = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const png = await iframe.screenshot(), raw = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true }); let light = 0;
      for (let index = 0; index < raw.data.length; index += raw.info.channels) if (raw.data[index] > 225 && raw.data[index + 1] > 225 && raw.data[index + 2] > 215) light++;
      const lightFraction = light / (raw.info.width * raw.info.height); renderChecks.push({ attempt, lightFraction });
      if (lightFraction > 0.25) { rendered = true; break; } await new Promise(resolve => setTimeout(resolve, 500));
    }
    fs.writeFileSync(path.join(__dirname, 'original-preview-render-second.json'), JSON.stringify({ rendered, renderChecks }), { flag: 'wx' }); assert.equal(rendered, true, 'PDF renderer has not displayed a source page');
    const imagePath = path.join(__dirname, 'actual-source-originals-first/browser-original-preview-second.png'); await source.screenshot({ path: imagePath });
    const response = await context.request.get(api + '/api/admin/curriculum/textbooks/' + encodeURIComponent(audit.bookId) + '/document'); assert.equal(response.status(), 200); const bytes = await response.body(); assert.equal(sha(bytes), audit.sourceSha256);
    const after = await snapshot(); assert.deepEqual(after, before); const png = fs.readFileSync(imagePath), report = { at: new Date().toISOString(), passed: true, buildId: build.buildId, sourceBookId: audit.sourceBookId, sourceSha256: sha(bytes), bytes: bytes.length, actualCompleteHttpDownloadMatchesManifest: true, actualIframeUrl: await iframe.getAttribute('src'), nativeRowsRevisionAndQueueUnchanged: true, image: { path: 'actual-source-originals-first/browser-original-preview-second.png', sha256: sha(png) }, screenshotNeedsSeparateVisualInspection: true, physicalDeviceOrTeacherReview: false };
    fs.writeFileSync(path.join(__dirname, 'original-preview-second.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(report));
  } finally { await context?.close(); await browser.close(); }
})().catch(error => { fs.writeFileSync(path.join(__dirname, 'original-preview-second-failure.log'), String(error.stack ?? error), { flag: 'wx' }); console.error('Original preview check failed; first evidence retained'); process.exitCode = 1; });
