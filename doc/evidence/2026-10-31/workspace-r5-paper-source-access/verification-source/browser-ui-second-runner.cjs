const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'browser-runtime-fourth.private.json'), 'utf8')), batch = process.argv[2];
if (!/^[a-z0-9-]+$/.test(batch ?? '')) throw Error('New browser batch required');
const requireCandidate = require('node:module').createRequire(path.join(config.candidate, 'package.json')), { chromium } = requireCandidate('playwright');
const out = path.join(__dirname, batch); if (fs.existsSync(out)) throw Error('Unused browser evidence directory required'); fs.mkdirSync(out);
const api = 'http://localhost:' + config.port + '/api', web = 'http://localhost:' + config.webPort, credential = 'Synthetic-source-browser-only-20261031', cases = [];
const key = () => crypto.randomUUID(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, message, timeout = 20000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await fn()) return; await sleep(100); } throw Error(message); }
async function call(actor, method, url, input, expected = method === 'POST' ? 201 : 200) {
  const response = await fetch(api + url, { method, headers: { 'content-type': 'application/json', ...(actor ? { authorization: 'Bearer ' + actor.token } : {}) }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  const payload = await response.json(); assert.equal(response.status, expected, 'Actual API status for ' + url); return payload.data;
}
async function control(input) { const response = await fetch('http://localhost:' + config.port + '/__qa/control', { method: 'POST', headers: { 'content-type': 'application/json', 'x-study-qa': config.nonce }, body: JSON.stringify(input) }); const value = await response.json(); assert.equal(response.status, 200); assert.equal(value.nonce, config.nonce); return value; }
async function fixture(slot, child = false) {
  const principal = 'browser-source-' + key(), actor = await call(null, 'POST', '/auth/register', { principal, credential });
  let learner = null, profile = null, code = null;
  if (child) {
    profile = (await call(actor, 'POST', '/students', { nickname: '匿名浏览器工程档案', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: 'synthetic', chinese: '', english: '' } })).profile;
    await call(actor, 'POST', '/students/' + profile.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: key(), reason: '仅隔离浏览器工程的本人读取授权。' });
    code = (await call(actor, 'POST', '/students/' + profile.id + '/learning-access/codes', { expectedVersion: 1, requestKey: key() })).code;
  }
  const papers = Object.fromEntries(['complete', 'partial', 'pdf'].map(kind => [kind, 'qa:paper:' + slot + ':' + kind]));
  for (const paperId of Object.values(papers)) await call({ token: config.adminToken }, 'POST', '/library/papers/' + paperId + '/publication', { status: 'published', licenseEvidence: '仅工程合成的当前原卷及媒体', contentReviewed: true, mediaReviewed: true, reason: '生产工作台隔离浏览器验证' });
  const href = (kind = 'complete') => web + '/studio?' + new URLSearchParams({ view: 'materials', tab: 'papers', ...(profile ? { student: profile.id, subject: 'math' } : { courseScope: 'adult' }), paper: papers[kind] });
  return { principal, actor, profile, code, papers, href };
}
async function login(context, f, child = false) {
  const response = await context.request.post(api + (child ? '/auth/learning-code' : '/auth/login'), { data: child ? { code: f.code } : { principal: f.principal, credential } });
  const value = await response.json(); assert.equal(response.status(), 201, 'Real browser-context login'); assert(value.data?.user?.id); return value.data;
}
async function show(page, f, kind = 'complete') { await page.goto(f.href(kind)); await page.locator('.library-paper').waitFor({ state: 'visible', timeout: 25000 }); }
async function counts(actorId) { return (await control({ action: 'facts', actorId })).values; }
async function screenshot(page, name) { await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true }); }
async function setupPrint(page) { await page.evaluate(() => { window.__qaPrints = 0; window.print = () => { window.__qaPrints++; }; }); }
async function run(browser, name, action, mobile = false) {
  const selected = process.argv[3]?.split(','); if (selected && !selected.includes(name)) return;
  const started = Date.now(), context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, acceptDownloads: true }); const page = await context.newPage();
  await context.tracing.start({ screenshots: true, snapshots: true });
  try { await action({ context, page }); cases.push({ name, passed: true, durationMs: Date.now() - started }); }
  catch (error) { await screenshot(page, name + '-failure').catch(() => {}); cases.push({ name, passed: false, durationMs: Date.now() - started, error: String(error.stack ?? error) }); }
  finally { await context.tracing.stop({ path: path.join(out, name + '-trace.private.zip') }); await context.close(); }
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await run(browser, 'adult-original-workspace', async ({ context, page }) => {
      const f = await fixture(10); const actor = await login(context, f); await show(page, f); await setupPrint(page);
      assert.equal(await page.getByLabel('学习工作台导航', { exact: true }).count(), 1); assert.equal(await page.locator('main').count(), 1);
      await page.getByRole('button', { name: '打印 / 存为 PDF', exact: true }).click(); await until(() => page.evaluate(() => window.__qaPrints === 1), 'Adult original print was not reached');
      assert.equal((await counts(actor.user.id)).length, 0); await screenshot(page, 'adult-workspace');
    });
    await run(browser, 'student-explicit-read-and-reference', async ({ context, page }) => {
      const f = await fixture(11, true), actor = await login(context, f, true), reads = [];
      page.on('request', request => { if (new URL(request.url()).pathname === '/api/library/source-reads' && request.method() === 'POST') reads.push({ body: request.postDataJSON(), actor: request.headers()['x-study-actor'] }); });
      await show(page, f); await until(async () => (await counts(actor.user.id)).length === 1, 'Student explicit read not persisted');
      assert.equal(reads[0].actor, actor.user.id); assert.equal(reads[0].body.answers, false);
      await page.getByRole('button', { name: '查看参考答案', exact: true }).click(); await page.getByText('合成原参考：5', { exact: true }).waitFor({ state: 'visible' });
      assert((await counts(actor.user.id)).some(row => row.input.answers === true)); await screenshot(page, 'student-reference');
    });
    await run(browser, 'lost-read-receipt-recovers-original', async ({ context, page }) => {
      const f = await fixture(12, true), actor = await login(context, f, true); let lost = false; const keys = [], recovered = [];
      await page.route('**/api/library/source-reads', async route => { keys.push(route.request().postDataJSON().requestKey); if (!lost) { lost = true; assert.equal((await route.fetch()).status(), 201); await route.abort('failed'); } else await route.continue(); });
      page.on('request', request => { if (/\/api\/library\/source-reads\/[^/]+$/.test(new URL(request.url()).pathname)) recovered.push(decodeURIComponent(new URL(request.url()).pathname.split('/').pop())); });
      await show(page, f); assert.equal(keys.length, 1); assert(recovered.includes(keys[0])); assert.equal((await counts(actor.user.id)).length, 1);
    });
    await run(browser, 'diagnostic-blocks-html-print-and-reference', async ({ context, page }) => {
      const f = await fixture(13, true), actor = await login(context, f, true); await show(page, f); await setupPrint(page);
      const before = (await counts(actor.user.id)).length; await control({ action: 'diagnostic', studentId: f.profile.id });
      await page.getByRole('button', { name: '打印 / 存为 PDF', exact: true }).click(); await until(async () => /诊断/.test(await page.locator('.paper-library').getByRole('alert').innerText()), 'Diagnostic print error was not shown');
      assert.equal(await page.evaluate(() => window.__qaPrints), 0); assert.equal((await counts(actor.user.id)).length, before);
      await page.getByRole('button', { name: '查看参考答案', exact: true }).click(); await until(async () => /诊断/.test(await page.locator('.paper-library').getByRole('alert').innerText()), 'Diagnostic reference error was not shown');
      assert.equal(await page.getByText('合成原参考：5', { exact: true }).count(), 0); await screenshot(page, 'diagnostic-blocked');
    });
    await run(browser, 'identity-switch-fences-old-read', async ({ context, page }) => {
      const f = await fixture(14, true), old = await login(context, f, true); await show(page, f);
      let observed, release; const seen = new Promise(resolve => { observed = resolve; }), gate = new Promise(resolve => { release = resolve; });
      await page.route('**/api/library/papers/*/metadata', async route => { const response = await route.fetch(); observed(); await gate; await route.fulfill({ response }).catch(() => {}); });
      await page.getByRole('button', { name: '查看参考答案', exact: true }).click(); await seen;
      const other = await fixture(18, true), current = await login(context, other, true); release();
      await until(async () => /身份已切换|当前对象|重新打开/.test(await page.locator('.paper-library').getByRole('alert').innerText()), 'Identity change did not stop old request');
      assert.equal((await counts(current.user.id)).length, 0); assert.equal((await counts(old.user.id)).length, 1);
    });
    await run(browser, 'leaving-cancels-late-print', async ({ context, page }) => {
      const f = await fixture(15, true); await login(context, f, true); await show(page, f); await setupPrint(page);
      let observe, release, printing = false; const seen = new Promise(resolve => { observe = resolve; }), gate = new Promise(resolve => { release = resolve; });
      await page.route('**/api/library/papers/*?answers=*', async route => { if (!printing) return route.continue(); const response = await route.fetch(); observe(); await gate; await route.fulfill({ response }).catch(() => {}); });
      printing = true; await page.getByRole('button', { name: '打印 / 存为 PDF', exact: true }).click(); await seen;
      await page.getByRole('button', { name: '← 返回题卷库', exact: true }).click(); release(); await sleep(300);
      assert.equal(await page.evaluate(() => window.__qaPrints), 0); assert.equal(await page.locator('.library-paper').count(), 0);
    });
    await run(browser, 'mobile-pdf-and-current-diagnostic-print', async ({ context, page }) => {
      const f = await fixture(16, true); const actor = await login(context, f, true); await show(page, f);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); await screenshot(page, 'mobile-original');
      await show(page, f, 'pdf'); assert((await counts(actor.user.id)).some(row => row.input.positions === 'document' && row.input.answers));
      await control({ action: 'diagnostic', studentId: f.profile.id }); await page.getByRole('button', { name: '打印原PDF', exact: true }).click();
      await until(async () => await page.locator('.paper-library').getByRole('alert').count() && /诊断/.test(await page.locator('.paper-library').getByRole('alert').innerText()), 'Diagnostic PDF printing did not report in the original workspace');
      await until(async () => context.pages().length === 1, 'Denied PDF window remained open'); await screenshot(page, 'mobile-pdf-blocked');
    }, true);
  } finally { await browser.close(); }
  const result = { at: new Date().toISOString(), batch, passed: cases.filter(row => row.passed).length, failed: cases.filter(row => !row.passed).length, cases,
    actualProductionBuild: JSON.parse(fs.readFileSync(path.join(__dirname, 'browser-web-first.json'), 'utf8')).buildId, privateTracesNeverPublished: true, realTeacherOrPhysicalPrinterEvidence: false };
  fs.writeFileSync(path.join(__dirname, batch + '.json'), JSON.stringify(result, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ batch, passed: result.passed, failed: result.failed, cases: cases.map(({ name, passed }) => ({ name, passed })) }));
  if (result.failed) process.exitCode = 1;
})().catch(error => { fs.writeFileSync(path.join(__dirname, batch + '-bootstrap-failure.json'), JSON.stringify({ at: new Date().toISOString(), error: String(error.stack ?? error) }, null, 2), { flag: 'wx' }); console.error('Production browser verification failed; exact local report retained.'); process.exitCode = 1; });
