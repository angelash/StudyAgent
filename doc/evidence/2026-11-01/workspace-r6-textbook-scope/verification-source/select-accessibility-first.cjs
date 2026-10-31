const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'browser-runtime-first.private.json'))), { chromium } = require(require.resolve('@playwright/test', { paths: [config.candidate] }));
(async () => { const browser = await chromium.launch({ headless: true, channel: 'chromium' }); try {
  const context = await browser.newContext(), response = await context.request.post('http://localhost:16181/api/auth/login', { data: { principal: config.principal, credential: config.credential } }); assert.equal(response.status(), 201);
  const page = await context.newPage(); await page.goto('http://localhost:13181/admin/curriculum'); await page.locator('.mapping-book-gaps').waitFor();
  const selects = page.locator('.admin-workbench select'), rows = [];
  for (let index = 0; index < Math.min(3, await selects.count()); index++) { const select = selects.nth(index); rows.push({ index, labelText: await select.evaluate(node => node.labels?.[0]?.textContent?.slice(0, 180) ?? ''), ariaFirstLine: (await select.ariaSnapshot()).split('\n')[0].slice(0, 200) }); }
  fs.writeFileSync(path.join(__dirname, 'select-accessibility-first.json'), JSON.stringify({ rows, originalSelectorFailure: 'Exact getByLabel included nested select options in the label text', noNativeContentChange: true }, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(rows)); await context.close();
} finally { await browser.close(); } })().catch(error => { console.error(String(error)); process.exitCode = 1; });
