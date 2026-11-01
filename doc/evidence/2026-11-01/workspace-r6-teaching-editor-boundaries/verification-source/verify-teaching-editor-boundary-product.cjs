const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), net = require('node:net'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process'), { chromium } = require('@playwright/test'), { PDFDocument, StandardFonts } = require('pdf-lib');
const candidate = path.resolve(__dirname, '../p184'), label = process.argv[2], buildLabel = process.argv[3];
if (![label, buildLabel].every(value => /^[a-z0-9-]+$/.test(value || ''))) throw Error('Fresh exact run and build labels required');
const folder = path.join(__dirname, label), build = JSON.parse(fs.readFileSync(path.join(__dirname, buildLabel + '.json')));
if (build.status !== 0 || fs.existsSync(folder)) throw Error('Successful exact build and unused evidence directory required'); fs.mkdirSync(folder); fs.copyFileSync(__filename, path.join(folder, 'runner.cjs'));
const data = path.join(folder, 'data'), assets = path.join(folder, 'assets'); fs.mkdirSync(data); fs.mkdirSync(assets);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex'), apiOrigin = 'http://127.0.0.1:4284', origin = 'http://127.0.0.1:3284';
const load = name => require(path.join(candidate, 'apps/api/dist/apps/api/src', name + '.js'));
let app, web, browser, store, actor, other; const checks = [], screenshots = [], errors = [], requests = []; let failure;
async function free(port) { await new Promise((yes, no) => { const probe = net.createServer(); probe.once('error', no); probe.listen(port, '127.0.0.1', () => probe.close(yes)); }); }
async function api(method, route, body, auth = actor, expected = method === 'POST' ? 201 : 200) {
  const response = await fetch(apiOrigin + '/api' + route, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth.token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json(); assert.equal(response.status, expected, value.error?.message); return value.data;
}
async function waitReady(url) { for (let attempt = 0; attempt < 60; attempt++) { try { const response = await fetch(url); if (response.ok) return; } catch {} await new Promise(yes => setTimeout(yes, 500)); } throw Error('Owned QA service did not become ready'); }
async function check(name, action) { const at = new Date().toISOString(); try { await action(); checks.push({ name, passed: true, at }); console.log(JSON.stringify({ name, passed: true })); }
  catch (caught) { checks.push({ name, passed: false, at, error: caught.message }); throw caught; } }
async function main() {
  await free(4284); await free(3284);
  Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: data, STUDY_ASSET_ROOT: assets, STUDY_SEED_FOUNDATION: 'false', STUDY_WORKER_ENABLED: 'false',
    API_PORT: '4284', API_HOST: '127.0.0.1', CORS_ORIGINS: origin, TEXTBOOK_BASE_PATH: '', STUDY_TEXTBOOK_REGISTRY: path.join(folder, 'registry.json'),
    STUDY_TEXTBOOK_SOURCE_MANIFEST: path.join(folder, 'no-chinese.json'), STUDY_PRIMARY_TEXTBOOK_SOURCE_MANIFEST: path.join(folder, 'manifest.json'), STUDY_TEXTBOOK_MAPPING_CANDIDATES: path.join(folder, 'no-candidates.json'),
    XIAOJIU_CHAT_ENABLED: 'false', OPENAI_API_KEY: '', MINIMAX_API_KEY: '' }); delete process.env.DATABASE_URL;
  const f = load('modules/diagnostics/textbook-teaching-fixture').teachingFixture(2), { teachingHash } = load('modules/diagnostics/textbook-teaching-package');
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let page = 1; page <= 5; page++) pdf.addPage([600, 800]).drawText('Generated engineering original only - page ' + page, { x: 40, y: 740, size: 16, font });
  const original = Buffer.from(await pdf.save()), extracted = Buffer.from(JSON.stringify({ format: 'chinatextbook-extraction-v1', id: f.source.sourceBookId, sourceSha256: sha(original),
    pages: [1, 2, 3, 4, 5].map(page => ({ page, text: [2, 3].includes(page) ? f.privateText : '' })) }));
  fs.writeFileSync(path.join(assets, 'book.pdf'), original); fs.writeFileSync(path.join(assets, 'extracted.json'), extracted);
  const book = { id: f.source.bookId, version: f.source.bookVersion, subject: 'math', grade: 3, term: 'upper', title: f.source.bookTitle, edition: f.source.edition, source: 'public_catalog',
    sourceRef: 'Explicit synthetic UI QA', sourceSha256: sha(original), chapterState: 'available', chapters: [{ id: 'qa-unit', name: '合成单元', lessons: [
      { id: f.source.lessonId, name: f.source.lessonName, printedPage: 2 }, { id: 'qa-teaching-other-lesson', name: '另一个合成课时', printedPage: 4 }, { id: 'qa-reference', name: '合成附录', kind: 'reference' }] }] };
  fs.writeFileSync(path.join(folder, 'registry.json'), JSON.stringify({ books: [book] }));
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify({ books: [{ id: f.source.sourceBookId, subject: 'math', grade: 3, term: 'upper', title: book.title, edition: book.edition,
    assetPath: 'data/assets/book.pdf', sha256: sha(original), bytes: original.length, pages: 5, extractedPath: 'data/assets/extracted.json', extractedSha256: sha(extracted) }] }));
  require('reflect-metadata'); const { NestFactory } = require('@nestjs/core');
  app = await NestFactory.create(load('app.module').AppModule, { logger: false }); load('common/http-body').configureJsonBody(app); app.setGlobalPrefix('api'); await app.listen(4284, '127.0.0.1');
  store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
  const credential = 'qa-only-' + crypto.randomUUID(), principal = 'qa-teaching-ui-' + crypto.randomUUID();
  actor = await api('POST', '/auth/register', { principal, credential }, null); other = await api('POST', '/auth/register', { principal: principal + '-other', credential }, null);
  await store.transaction(() => { store.find('users', { id: actor.user.id }).role = 'teacher'; for (const name of ['knowledgeAtoms', 'questions', 'questionSources', 'questionAnswerSchemas', 'measurementItems']) for (const row of f.store.inspect(name)) store.append(name, structuredClone(row)); });
  const source = await api('POST', '/admin/curriculum/teaching-packages/source-preview', { bookId: book.id, bookVersion: book.version, lessonId: f.source.lessonId, pageStart: 2, pageEnd: 3 });
  const body = { protocol: 'textbook-teaching-editor-copy-v1', owner: { actorId: actor.user.id, bookId: book.id, bookVersion: book.version, lessonId: f.source.lessonId },
    slot: 'generated-import-original', packageId: 'qa-ui-package-' + crypto.randomUUID(), range: { start: '2', end: '3' }, source, sourceHistory: [], sourceReview: f.input.sourceReview,
    targetRefs: f.input.targetRefs, content: structuredClone(f.input.content), visualHistory: [], rawInputs: {}, baseline: null,
    editor: { section: 'source', activeSourcePage: 2, publishReason: '', withdrawReason: '', reviewed: false, originalTeaching: false }, journal: [], requiresOriginalResultLookup: true };
  body.content.concept.explanation = ' \n' + body.content.concept.explanation + '\n UI原稿尾行 🧪 ';
  const complete = { ...body, fingerprint: teachingHash(body) }, importFile = path.join(folder, 'generated-teaching-copy.json'); fs.writeFileSync(importFile, JSON.stringify(complete));
  const webLog = fs.openSync(path.join(folder, 'web.private.log'), 'wx'); web = spawn(process.execPath, ['../../node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3284'], {
    cwd: path.join(candidate, 'apps/web'), windowsHide: true, stdio: ['ignore', webLog, webLog], env: { ...process.env, NODE_ENV: 'production', STUDY_WEB_DIST_DIR: build.distDir, API_PORT: '4284', NEXT_PUBLIC_API_BASE_URL: '', NEXT_TELEMETRY_DISABLED: '1' },
  }); fs.closeSync(webLog); fs.writeFileSync(path.join(folder, 'runtime.private.json'), JSON.stringify({ apiPid: process.pid, webPid: web.pid, data, apiPort: 4284, webPort: 3284, source: candidate, buildId: build.buildId }));
  await waitReady(origin + '/parent/login'); browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
  context.on('page', item => item.on('pageerror', error => errors.push(error.message))); page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/teaching-packages/commands') && request.method() === 'POST') requests.push(JSON.parse(request.postData())); });
  const link = '/admin/curriculum?' + new URLSearchParams({ subject: 'math', grade: '3', term: 'upper', textbook: book.id, textbookVersion: book.version, textbookLesson: f.source.lessonId });
  const desk = p => p.getByRole('region', { name: '教材课时完整教学稿', exact: true });
  const ready = async p => { await desk(p).getByRole('button', { name: '来源与引用', exact: true }).waitFor(); await desk(p).getByText(/本机稿|本机完整稿/).first().waitFor(); };
  const section = async (p, name) => { await desk(p).getByRole('button', { name, exact: true }).click(); };
  const journal = () => api('GET', '/admin/curriculum/teaching-packages/' + encodeURIComponent(body.packageId));
  await check('production-original-admin-entry-exact-textbook-deeplink-and-complete-import', async () => {
    await page.goto(origin + '/parent/login?' + new URLSearchParams({ returnTo: link })); await page.getByLabel('登录账号', { exact: true }).fill(principal); await page.getByLabel('密码', { exact: true }).fill(credential); await page.getByRole('button', { name: '登录，查看学习记录 →', exact: true }).click(); await ready(page);
    await desk(page).getByLabel('导入完整教学稿', { exact: true }).setInputFiles(importFile); await desk(page).getByText('工程合成第一版 · 合成教学协议材料').waitFor();
    assert.notEqual(new URL(page.url()).searchParams.get('teachingDraft'), body.slot); await section(page, '讲解与例题'); assert.equal(await desk(page).getByLabel('完整概念讲解', { exact: true }).inputValue(), body.content.concept.explanation);
    await section(page, '目标与先修'); assert.equal(await desk(page).getByRole('checkbox', { checked: true }).count(), 2);
  });
  await check('real-ui-saves-original-complete-two-target-body-and-confirms-original-command', async () => {
    await desk(page).getByRole('button', { name: '保存完整教学稿', exact: true }).click(); await desk(page).getByText('完整原命令与原回执已核对，当前编辑内容保持。', { exact: true }).waitFor();
    const detail = await journal(); assert.equal(detail.header.contentVersion, 1); assert.equal(detail.version.body.targets.length, 2); assert.equal(detail.version.body.content.concept.explanation, body.content.concept.explanation);
    assert.equal(requests.filter(value => value.action === 'save').length, 1); assert.equal(detail.savedBy.input.requestKey, requests[0].requestKey);
  });
  await check('explicit-publish-is-separate-from-save-and-preserves-full-original-receipt', async () => {
    await section(page, '版本与发布'); await desk(page).getByLabel('已逐段核对讲解、图示、材料及逐页来源依据', { exact: true }).check(); await desk(page).getByLabel('确认学生版本采用原创教学，并遵守来源与必要短引边界', { exact: true }).check();
    await desk(page).getByLabel('本次发布依据', { exact: true }).fill('合成工程稿的逐段核对与材料配置检查；不代表真实教材、教师审核或真人学习证据。'); await desk(page).getByRole('button', { name: '发布已核对的内容v1', exact: true }).click();
    await desk(page).getByText('当前发布内容v1；已创建课程保留原来采用的教学。', { exact: true }).waitFor(); const detail = await journal(); assert.equal(detail.header.status, 'published'); assert.equal(detail.header.revision, 2);
  });
  await check('lost-save-post-response-recovers-same-original-key-and-keeps-v1-published', async () => {
    await section(page, '讲解与例题'); await desk(page).getByLabel('完整概念讲解', { exact: true }).fill(body.content.concept.explanation + '\n第二版合成修订');
    let cut = false; await page.route('**/api/admin/curriculum/teaching-packages/commands', async route => { if (!cut && route.request().method() === 'POST') { cut = true; await route.fetch(); await route.abort('failed'); } else await route.continue(); });
    await desk(page).getByRole('button', { name: '保存完整教学稿', exact: true }).click(); await desk(page).getByText('完整原命令与原回执已核对，当前编辑内容保持。', { exact: true }).waitFor(); await page.unroute('**/api/admin/curriculum/teaching-packages/commands');
    const detail = await journal(); assert.equal(detail.header.contentVersion, 2); assert.equal(detail.header.published.contentVersion, 1); assert.equal(requests.filter(value => value.action === 'save').length, 2);
    assert.equal(await store.requestContext(() => store.select('textbookTeachingCommands', { actorId: actor.user.id, 'input.packageId': body.packageId }).length), 3);
  });
  await check('refresh-retains-unsaved-fields-and-requires-authoritative-baseline-and-each-original-receipt', async () => {
    await section(page, '讲解与例题'); const changed = body.content.concept.explanation + '\n第二版合成修订\n刷新前未保存服务器的新行'; await desk(page).getByLabel('完整概念讲解', { exact: true }).fill(changed);
    await desk(page).getByText('完整本机稿已保存，并已读回核对。', { exact: true }).waitFor(); await page.reload(); await ready(page); assert.equal(await desk(page).getByLabel('完整概念讲解', { exact: true }).inputValue(), changed);
    const count = requests.length; await desk(page).getByRole('button', { name: '保存完整教学稿', exact: true }).click(); await desk(page).getByRole('alert').filter({ hasText: '核对原稿基准' }).waitFor(); assert.equal(requests.length, count);
    await section(page, '版本与发布'); await desk(page).getByRole('button', { name: '核对原内容版本与当前修订', exact: true }).click();
    for (const button of await desk(page).getByRole('button', { name: '查询完整原回执', exact: true }).all()) { await button.click(); await desk(page).getByText('完整原命令与原回执已核对，当前编辑内容保持。', { exact: true }).waitFor(); }
    await section(page, '讲解与例题'); assert.equal(await desk(page).getByLabel('完整概念讲解', { exact: true }).inputValue(), changed);
  });
  await check('rechecking-an-older-original-receipt-does-not-replace-the-newer-editing-base', async () => {
    await section(page, '版本与发布'); await desk(page).getByRole('button', { name: '查询完整原回执', exact: true }).first().click();
    await desk(page).getByText('完整原命令与原回执已核对，当前编辑内容保持。', { exact: true }).waitFor();
    assert.match(await desk(page).getByText(/从内容v\d+复制，核对的包头修订号为/).innerText(), /^从内容v2复制/);
  });
  await check('actual-two-tab-cas-keeps-both-original-bodies-and-refuses-stale-autosave', async () => {
    await section(page, '讲解与例题'); await desk(page).getByText('完整本机稿已保存，并已读回核对。', { exact: true }).waitFor();
    const second = await context.newPage(); await second.goto(page.url()); await ready(second); await desk(second).getByLabel('完整概念讲解', { exact: true }).waitFor();
    const firstText = body.content.concept.explanation + '\n第一标签独有原行', secondText = body.content.concept.explanation + '\n第二标签独有原行';
    await desk(page).getByLabel('完整概念讲解', { exact: true }).fill(firstText); await desk(page).getByText('完整本机稿已保存，并已读回核对。', { exact: true }).waitFor();
    await desk(second).getByLabel('完整概念讲解', { exact: true }).fill(secondText); await desk(second).getByRole('alert').filter({ hasText: '另一标签或本机记录已变化' }).waitFor();
    assert.equal(await desk(second).getByLabel('完整概念讲解', { exact: true }).inputValue(), secondText); assert.equal(await desk(page).getByLabel('完整概念讲解', { exact: true }).inputValue(), firstText);
    const downloadPromise = second.waitForEvent('download'); await desk(second).getByRole('button', { name: '下载当前完整稿', exact: true }).click(); const downloaded = await downloadPromise, file = path.join(folder, 'actual-conflicting-tab-copy.json'); await downloaded.saveAs(file); assert.equal(JSON.parse(fs.readFileSync(file)).content.concept.explanation, secondText); await second.close();
  });
  await check('unsaved-body-cannot-publish-and-explicit-withdraw-targets-the-original-published-version', async () => {
    await section(page, '版本与发布'); const before = requests.length;
    await desk(page).getByLabel('已逐段核对讲解、图示、材料及逐页来源依据', { exact: true }).check(); await desk(page).getByLabel('确认学生版本采用原创教学，并遵守来源与必要短引边界', { exact: true }).check();
    await desk(page).getByRole('button', { name: '发布已核对的内容v2', exact: true }).click(); await desk(page).getByRole('alert').filter({ hasText: '请先保存当前正文' }).waitFor(); assert.equal(requests.length, before);
    await desk(page).getByLabel('撤回当前发布版本的原因', { exact: true }).fill('合成工程稿撤回验证，停止新采用并保留原教学版本和当前未保存的新行。');
    await desk(page).getByRole('button', { name: '撤回当前发布，保留已采用课程', exact: true }).click(); await desk(page).getByText('当前没有供新课程采用的发布版本；已创建课程保留原来采用的教学。', { exact: true }).waitFor();
    const detail = await journal(); assert.equal(detail.header.status, 'withdrawn'); assert.equal(detail.header.published, null); assert.equal(detail.header.contentVersion, 2);
    assert.equal(requests.at(-1).action, 'withdraw'); assert.equal(requests.at(-1).contentVersion, 1);
  });
  await check('blocked-indexeddb-guards-original-term-selector-and-requires-actual-file-readback', async () => {
    const blocked = await context.newPage(); await blocked.addInitScript(() => Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw Error('Explicit generated unavailable-storage fixture'); } })); await blocked.goto(origin + link); await ready(blocked);
    await desk(blocked).getByLabel('PDF物理起始页', { exact: true }).fill('2'); await desk(blocked).getByLabel('PDF物理结束页', { exact: true }).fill('3');
    await blocked.getByLabel('学期', { exact: true }).selectOption('lower'); const dialog = blocked.getByRole('dialog', { name: '先保留完整教学稿', exact: true }); await dialog.waitFor();
    assert.equal(new URL(blocked.url()).searchParams.get('term'), 'upper'); assert.equal(await dialog.getByRole('button', { name: '已保留，继续切换', exact: true }).isEnabled(), false);
    const promise = blocked.waitForEvent('download'); await dialog.getByRole('button', { name: '下载完整稿', exact: true }).click(); const downloaded = await promise, file = path.join(folder, 'actual-blocked-storage-copy.json'); await downloaded.saveAs(file);
    assert.equal(await dialog.getByRole('button', { name: '已保留，继续切换', exact: true }).isEnabled(), false); await dialog.getByLabel('读回下载副本', { exact: true }).setInputFiles(file);
    await desk(blocked).getByText(/已读回下载副本，并核对最新完整输入|最新完整下载副本已读回核对/).waitFor();
    fs.writeFileSync(path.join(folder, 'exit-before-continue.json'), JSON.stringify({ url: blocked.url(), state: await dialog.innerText() }));
    await dialog.getByRole('button', { name: '已保留，继续切换', exact: true }).click(); await blocked.waitForFunction(() => new URLSearchParams(location.search).get('term') === 'lower'); await blocked.close();
  });
  await check('source-range-change-keeps-old-complete-draft-and-opens-a-separate-new-source-slot', async () => {
    await section(page, '来源与引用'); const beforeSlot = new URL(page.url()).searchParams.get('teachingDraft'); await desk(page).getByLabel('PDF物理结束页', { exact: true }).fill('4');
    await desk(page).getByText('完整本机稿已保存，并已读回核对。', { exact: true }).waitFor();
    await desk(page).getByRole('button', { name: '核对这个完整范围', exact: true }).click(); await desk(page).getByRole('button', { name: '采用新来源另开本机稿', exact: true }).click();
    await page.waitForFunction(beforeSlot => new URLSearchParams(location.search).get('teachingDraft') !== beforeSlot, beforeSlot); await ready(page);
    assert.equal(await desk(page).getByLabel('PDF物理结束页', { exact: true }).inputValue(), '4'); assert.equal(await desk(page).getByRole('checkbox', { name: '已对照原卷核对本课完整起止范围', exact: true }).isChecked(), false);
    assert.equal(await desk(page).getByText(/保留的完整来源历史/).count(), 1);
  });
  await check('original-workspace-responsive-layout-short-height-and-keyboard-focus', async () => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 900 }, { width: 1440, height: 1000 }, { width: 1440, height: 500 }]) {
      await page.setViewportSize(viewport); await section(page, '讲解与例题'); const field = desk(page).getByLabel('完整概念讲解', { exact: true }); await field.focus(); await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.tagName === 'BODY'), false);
      const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, width: innerWidth })); assert.ok(dimensions.content <= dimensions.width + 1, JSON.stringify(dimensions));
      const name = 'workspace-' + viewport.width + 'x' + viewport.height + '.png'; await desk(page).screenshot({ path: path.join(folder, name) }); screenshots.push(name);
    }
  });
  await check('above8mib-original-ui-import-refuses-local-save-and-exits-only-after-complete-file-readback',async()=>{
    const large=structuredClone(body);large.slot='qa-large-ui-original';large.packageId='qa-large-ui-package';large.content.title='大稿件完整原文';
    const visual={kind:'table',title:'完整历史表',headers:Array(8).fill('列'),rows:Array.from({length:40},()=>Array(8).fill('原'.repeat(1000))),explanation:''};large.visualHistory=Array.from({length:10},()=>({index:0,visual:structuredClone(visual)}));
    const input={action:'save',packageId:large.packageId,requestKey:crypto.randomUUID(),expectedRevision:0,basedOn:null,source:load('modules/diagnostics/textbook-teaching-package').teachingSourceDescriptor(large.source),sourceFingerprint:large.source.fingerprint,targetRefs:large.targetRefs,sourceReview:large.sourceReview,content:large.content};
    large.journal=[{input,requestFingerprint:teachingHash({owner:large.owner,input}),phase:'unknown',result:null,message:'未确认原命令保持，不得另键发送。'}];const full={...large,fingerprint:teachingHash(large)},imported=path.join(folder,'large-ui-import.private.json');fs.writeFileSync(imported,JSON.stringify(full));assert.ok(fs.statSync(imported).size>8*1024*1024);
    const extra=await context.newPage();extra.on('pageerror',error=>errors.push(error.message));await extra.goto(origin+link);await ready(extra);const count=requests.length;
    await desk(extra).getByLabel('导入完整教学稿',{exact:true}).setInputFiles(imported);await desk(extra).getByText('完整教学稿超过8MiB本机存储预算，请下载并读回完整副本后继续，全部输入和原命令仍保留。',{exact:true}).first().waitFor();assert.equal(requests.length,count);
    await desk(extra).getByRole('button',{name:'保存完整教学稿',exact:true}).click();await desk(extra).getByRole('alert').filter({hasText:'请先向服务器核对原稿基准、完整原命令与原回执'}).waitFor();assert.equal(requests.length,count);
    await extra.getByLabel('学期',{exact:true}).selectOption('lower');const guard=extra.getByRole('dialog',{name:'先保留完整教学稿',exact:true});await guard.waitFor();assert.equal(await guard.getByRole('button',{name:'已保留，继续切换',exact:true}).isDisabled(),true);
    for(const viewport of [{width:390,height:844},{width:768,height:900},{width:1440,height:1000},{width:1440,height:500}]){await extra.setViewportSize(viewport);const buttons=guard.getByRole('button');await buttons.first().focus();await extra.keyboard.press('Shift+Tab');assert.equal(await guard.evaluate(element=>element.contains(document.activeElement)),true);const size=await extra.evaluate(()=>({width:innerWidth,content:document.documentElement.scrollWidth}));assert.ok(size.content<=size.width+1);const name='editor-exit-'+viewport.width+'x'+viewport.height+'.png';await guard.screenshot({path:path.join(folder,name)});screenshots.push(name);}
    const pending=extra.waitForEvent('download');await guard.getByRole('button',{name:'下载完整稿',exact:true}).click();const file=path.join(folder,'actual-large-ui-copy.private.json');await(await pending).saveAs(file);const bytes=fs.readFileSync(file),actual=JSON.parse(bytes);assert.ok(bytes.length>8*1024*1024);assert.deepEqual(actual.visualHistory,large.visualHistory);assert.deepEqual(actual.journal,large.journal);assert.deepEqual(actual.source,large.source);
    assert.equal(await guard.getByRole('button',{name:'已保留，继续切换',exact:true}).isDisabled(),true);await guard.getByLabel('读回下载副本',{exact:true}).setInputFiles(file);await desk(extra).getByText('已读回下载副本，并核对最新完整输入。',{exact:true}).waitFor();await guard.getByRole('button',{name:'已保留，继续切换',exact:true}).click();await extra.waitForFunction(()=>new URLSearchParams(location.search).get('term')==='lower');assert.equal(requests.length,count);await extra.close();
    fs.writeFileSync(path.join(folder,'large-ui-summary.json'),JSON.stringify({bytes:bytes.length,sha256:sha(bytes),history:actual.visualHistory.length,pending:actual.journal.length,noNewPost:true,downloadedAndReadBack:true}));
  });
  await check('original-clear-confirmation-four-sizes-real-tombstone-and-stale-tab-original-preservation',async()=>{
    await page.setViewportSize({width:1440,height:1000});await desk(page).getByText('完整本机稿已保存，并已读回核对。',{exact:true}).waitFor();const before=page.url(),oldSlot=new URL(before).searchParams.get('teachingDraft'),count=requests.length;
    const stale=await context.newPage();stale.on('pageerror',error=>errors.push(error.message));await stale.goto(before);await ready(stale);await desk(stale).getByLabel('完整概念讲解',{exact:true}).waitFor();
    await desk(page).getByRole('button',{name:'清空这一份本机稿',exact:true}).click();const confirm=page.getByRole('dialog',{name:'确认清空准确本机稿',exact:true});await confirm.waitFor();
    for(const viewport of [{width:390,height:844},{width:768,height:900},{width:1440,height:1000},{width:1440,height:500}]){await page.setViewportSize(viewport);await confirm.getByRole('button').first().focus();await page.keyboard.press('Shift+Tab');assert.equal(await confirm.evaluate(element=>element.contains(document.activeElement)),true);const size=await page.evaluate(()=>({width:innerWidth,content:document.documentElement.scrollWidth}));assert.ok(size.content<=size.width+1);const bounds=await confirm.boundingBox();for(const button of await confirm.getByRole('button').all()){const box=await button.boundingBox();assert.ok(box&&bounds&&box.y>=bounds.y&&box.y+box.height<=bounds.y+bounds.height+1);}const name='editor-clear-'+viewport.width+'x'+viewport.height+'.png';await confirm.screenshot({path:path.join(folder,name)});screenshots.push(name);}
    await confirm.getByRole('button',{name:'确认清空这一份',exact:true}).click();await page.waitForFunction(slot=>new URLSearchParams(location.search).get('teachingDraft')!==slot,oldSlot);await ready(page);
    const key=JSON.stringify(['teaching-editor-local-v1',body.owner.actorId,body.owner.bookId,body.owner.bookVersion,body.owner.lessonId,oldSlot]);const tombstone=await page.evaluate(key=>new Promise((resolve,reject)=>{const open=indexedDB.open('studyagent-teaching-editor-v1',1);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('drafts','readonly'),request=tx.objectStore('drafts').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);tx.oncomplete=()=>db.close();};}),key);assert.equal(tombstone.body,null);assert.equal(tombstone.fingerprint,null);assert.ok(tombstone.revision>1);
    const original='旧标签自己的完整原文，不能复活已清空的本机记录。';await desk(stale).getByLabel('完整概念讲解',{exact:true}).fill(original);await desk(stale).getByRole('alert').filter({hasText:'另一标签或本机记录已变化'}).waitFor();assert.equal(await desk(stale).getByLabel('完整概念讲解',{exact:true}).inputValue(),original);
    const pending=stale.waitForEvent('download');await desk(stale).getByRole('button',{name:'下载当前完整稿',exact:true}).click();const file=path.join(folder,'actual-cleared-stale-tab-copy.private.json');await(await pending).saveAs(file);assert.equal(JSON.parse(fs.readFileSync(file)).content.concept.explanation,original);assert.equal(requests.length,count);await stale.close();await page.setViewportSize({width:1440,height:1000});fs.writeFileSync(path.join(folder,'tombstone-summary.json'),JSON.stringify({revision:tombstone.revision,body:null,fingerprint:null,staleTabRefused:true,staleOriginalDownloaded:true,serverCommandsUnchanged:true}));
  });
  await check('current-role-loss-hides-private-draft-source-and-grading-data', async () => {
    await store.transaction(() => { store.find('users', { id: actor.user.id }).role = 'parent'; }); await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByText('当前身份无法访问此管理功能', { exact: true }).waitFor(); assert.equal(await page.getByLabel('完整概念讲解', { exact: true }).count(), 0); assert.equal(await page.locator('iframe[title*=PDF]').count(), 0);
    assert.equal((await page.locator('body').innerText()).includes(f.privateText), false);
  });
  const native = await store.requestContext(() => ({ packageCount: store.inspect('textbookTeachingPackages').length, contentVersions: store.inspect('textbookTeachingVersions').length,
    commands: store.inspect('textbookTeachingCommands').length, learningRows: Object.fromEntries(['diagnosticSessions', 'diagnosticResponses', 'reviewTasks', 'classroomSessions', 'assistantTeachingSessions'].map(name => [name, store.inspect(name).length])) }));
  assert.equal(native.packageCount, 1); for (const [name, count] of Object.entries(native.learningRows)) assert.equal(count, 0, name);
  fs.writeFileSync(path.join(folder, 'native-summary.json'), JSON.stringify({ ...native, generatedSourcesOnly: true }));
}
main().catch(caught => { failure = caught; console.error(caught.message); }).finally(async () => {
  if (failure && browser) for (const [index, page] of browser.contexts().flatMap(context => context.pages()).entries()) { try { await page.screenshot({ path: path.join(folder, 'failure-' + index + '.png'), fullPage: true }); fs.writeFileSync(path.join(folder, 'failure-' + index + '.txt'), await page.locator('body').innerText());
    fs.writeFileSync(path.join(folder, 'failure-' + index + '-state.json'), JSON.stringify({ url: page.url(), inputs: await page.locator('input,select,textarea').evaluateAll(items => items.filter(item => item.type !== 'password' && item.type !== 'file').map(item => ({ name: item.getAttribute('aria-label'), value: item.value }))) }));
  } catch {} }
  await browser?.close(); await app?.close();
  if (web && web.exitCode === null) { web.kill(); await Promise.race([new Promise(yes => web.once('exit', yes)), new Promise(yes => setTimeout(yes, 5000))]); }
  const report = { at: new Date().toISOString(), source: 'data/qa/p184', buildId: build.buildId, distDir: build.distDir, generatedEngineeringDataOnly: true, productUI: true,
    passed: checks.filter(check => check.passed).length, failed: checks.filter(check => !check.passed).length, completed: !failure, error: failure?.message ?? null, checks, screenshots, pageErrors: errors, privateRuntime: 'runtime.private.json' };
  fs.writeFileSync(path.join(folder, 'receipt.json'), JSON.stringify(report, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ passed: report.passed, failed: report.failed, completed: report.completed, pageErrors: errors.length })); process.exitCode = failure ? 1 : 0;
});
