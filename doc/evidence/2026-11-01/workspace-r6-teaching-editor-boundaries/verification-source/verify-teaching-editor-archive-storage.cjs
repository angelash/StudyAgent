const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require('@playwright/test'), esbuild = require('esbuild');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p184'), label = process.argv[2];
if (!/^[a-z0-9-]+$/.test(label || '')) throw Error('Exact new storage run label required');
const folder = path.join(__dirname, label); if (fs.existsSync(folder)) throw Error('Fresh run required'); fs.mkdirSync(folder);
const { teachingFixture } = require(path.join(candidate, 'apps/api/dist/apps/api/src/modules/diagnostics/textbook-teaching-fixture.js')),
  { teachingHash } = require(path.join(candidate, 'apps/api/dist/apps/api/src/modules/diagnostics/textbook-teaching-package.js'));
const f = teachingFixture(2), owner = { actorId: 'qa-generated-local-owner', bookId: f.source.bookId, bookVersion: f.source.bookVersion, lessonId: f.source.lessonId }, slot = 'qa-local-slot',
  body = { protocol: 'textbook-teaching-editor-copy-v1', owner, slot, packageId: f.input.packageId, range: { start: '2', end: '3' }, source: f.source, sourceHistory: [],
    sourceReview: f.input.sourceReview, targetRefs: f.input.targetRefs, content: f.input.content, visualHistory: [], rawInputs: {}, baseline: null,
    editor: { section: 'source', activeSourcePage: 2, publishReason: '', withdrawReason: '', reviewed: false, originalTeaching: false }, journal: [], requiresOriginalResultLookup: true };
body.content.title += ' \n 原始空白 🧪 ';
const bundle = path.join(folder, 'app.js'); esbuild.buildSync({ entryPoints: [path.join(__dirname, 'teaching-editor-storage-harness.ts')], bundle: true, platform: 'browser', format: 'iife', outfile: bundle, logLevel: 'silent' });
const server = http.createServer((request, response) => { if (request.url === '/app.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(fs.readFileSync(bundle)); }
  else { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end('<!doctype html><meta charset="utf-8"><title>Generated teaching storage QA</title><h1>Generated storage protocol QA</h1><script src="/app.js"></script>'); } });
let browser; const checks = [];
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port, origin = 'http://127.0.0.1:' + port;
  browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ acceptDownloads: true }), first = await context.newPage(), second = await context.newPage();
  for (const page of [first, second]) { await page.goto(origin); await page.waitForFunction(() => Boolean(window.teachingEditorQA)); }
  async function check(name, run) { await run(); checks.push({ name, passed: true }); }
  const version = value => ({ revision: value.revision, fingerprint: value.fingerprint });
  let initial, saved, copy;
  await check('complete-source-draft-real-indexeddb-save-and-readback', async () => {
    initial = await first.evaluate(({ owner, slot }) => window.teachingEditorQA.load(owner, slot), { owner, slot }); assert.equal(initial.revision, null);
    copy = await first.evaluate(body => window.teachingEditorQA.complete(body), body);
    saved = await first.evaluate(({ copy, owner, slot, initial }) => window.teachingEditorQA.save(copy, owner, slot, initial), { copy, owner, slot, initial: version(initial) });
    const read = await second.evaluate(({ owner, slot }) => window.teachingEditorQA.load(owner, slot), { owner, slot }); assert.equal(read.revision, 1); assert.equal(teachingHash(read.copy), teachingHash(copy)); assert.equal(read.copy.content.title, body.content.title);
  });
  const stale = version(saved);
  await check('two-browser-pages-compare-actual-version-and-reject-stale-complete-body', async () => {
    const changed = structuredClone(body); changed.content.title += '第一标签的新稿';
    const next = await first.evaluate(async ({ body, owner, slot, expected }) => window.teachingEditorQA.save(await window.teachingEditorQA.complete(body), owner, slot, expected), { body: changed, owner, slot, expected: stale });
    const rejected = await second.evaluate(async ({ copy, owner, slot, expected }) => { try { await window.teachingEditorQA.save(copy, owner, slot, expected); return 'wrongly-accepted'; } catch (error) { return error.name; } }, { copy, owner, slot, expected: stale });
    assert.equal(rejected, 'TeachingEditorLocalConflict'); saved = next;
    assert.equal((await first.evaluate(({ owner, slot }) => window.teachingEditorQA.load(owner, slot), { owner, slot })).copy.content.title, changed.content.title);
  });
  await check('identical-fingerprint-write-still-advances-real-revision-and-refuses-aba', async () => {
    const read = await first.evaluate(({ owner, slot }) => window.teachingEditorQA.load(owner, slot), { owner, slot }), expected = version(read);
    saved = await first.evaluate(({ copy, owner, slot, expected }) => window.teachingEditorQA.save(copy, owner, slot, expected), { copy: read.copy, owner, slot, expected });
    assert.equal(saved.fingerprint, expected.fingerprint); assert.equal(saved.revision, expected.revision + 1);
    const rejected = await second.evaluate(async ({ copy, owner, slot, expected }) => { try { await window.teachingEditorQA.save(copy, owner, slot, expected); return false; } catch (error) { return error.name === 'TeachingEditorLocalConflict'; } }, { copy: read.copy, owner, slot, expected }); assert(rejected);
  });
  await check('clear-tombstone-blocks-old-and-null-versions-and-allows-only-explicit-reread', async () => {
    const cleared = await first.evaluate(({ owner, slot, expected }) => window.teachingEditorQA.clear(owner, slot, expected), { owner, slot, expected: version(saved) });
    for (const expected of [stale, { revision: null, fingerprint: null }]) {
      const name = await second.evaluate(async ({ copy, owner, slot, expected }) => { try { await window.teachingEditorQA.save(copy, owner, slot, expected); return 'accepted'; } catch (error) { return error.name; } }, { copy, owner, slot, expected }); assert.equal(name, 'TeachingEditorLocalConflict');
    }
    const actual = await second.evaluate(({ owner, slot }) => window.teachingEditorQA.load(owner, slot), { owner, slot }); assert.equal(actual.copy, null); assert.equal(actual.revision, cleared.revision);
    saved = await first.evaluate(({ copy, owner, slot, expected }) => window.teachingEditorQA.save(copy, owner, slot, expected), { copy, owner, slot, expected: version(actual) }); assert.equal(saved.revision, cleared.revision + 1);
  });
  await check('abort-inside-real-indexeddb-write-transaction-preserves-the-original-record', async () => {
    const before = await first.evaluate(({ owner, slot }) => window.teachingEditorQA.load(owner, slot), { owner, slot });
    const name = await first.evaluate(async ({ body, owner, slot, expected }) => {
      const controller = new AbortController(), original = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function(...args) { const tx = original.apply(this, args); if (args[1] === 'readwrite') queueMicrotask(() => controller.abort()); return tx; };
      try { body.content.title += '不可落盘的中断稿'; await window.teachingEditorQA.save(await window.teachingEditorQA.complete(body), owner, slot, expected, controller.signal); return 'accepted'; }
      catch (error) { return error.name; } finally { IDBDatabase.prototype.transaction = original; }
    }, { body, owner, slot, expected: version(before) }); assert.equal(name, 'AbortError');
    const after = await second.evaluate(({ owner, slot }) => window.teachingEditorQA.load(owner, slot), { owner, slot }); assert.equal(teachingHash(after), teachingHash(before));
  });
  await check('private-owner-isolation-rejects-foreign-copy-before-writing', async () => {
    const foreign = { ...owner, actorId: 'qa-another-owner' }, name = await first.evaluate(async ({ copy, owner, slot }) => { try { await window.teachingEditorQA.save(copy, owner, slot, { revision: null, fingerprint: null }); return 'accepted'; } catch (error) { return error.message; } }, { copy, owner: foreign, slot }); assert.match(name, /账号、教材课时/);
    assert.equal((await second.evaluate(({ owner, slot }) => window.teachingEditorQA.load(owner, slot), { owner: foreign, slot })).copy, null);
  });
  await check('blocked-storage-keeps-the-full-memory-copy-and-actual-downloaded-file-readback', async () => {
    const page = await context.newPage(); await page.addInitScript(() => Object.defineProperty(globalThis, 'indexedDB', { configurable: true, get() { throw Error('Generated blocked-storage fixture'); } })); await page.goto(origin); await page.waitForFunction(() => Boolean(window.teachingEditorQA));
    const name = await page.evaluate(async ({ owner, slot }) => { try { await window.teachingEditorQA.load(owner, slot); return 'accepted'; } catch (error) { return error.name; } }, { owner, slot: 'qa-fresh-storage-blocked' }); assert.equal(name, 'TeachingEditorLocalUnavailable');
    const pending = page.waitForEvent('download'), fingerprint = await page.evaluate(body => window.teachingEditorQA.download(body), body), downloaded = await pending, target = path.join(folder, 'generated-complete-copy.json'); await downloaded.saveAs(target);
    const bytes = fs.readFileSync(target), actual = JSON.parse(bytes); assert.equal(actual.fingerprint, fingerprint); assert.equal(actual.content.title, body.content.title); assert.equal(teachingHash(actual.source), teachingHash(body.source));
    const checked = await page.evaluate(({ actual, owner }) => window.teachingEditorQA.read(actual, owner), { actual, owner }); assert.equal(checked.copy.fingerprint, fingerprint); assert.deepEqual(checked.verifiedOriginalRequests, []);
    await page.close();
  });
  await check('above8mib-history-and-unknown-original-command-download-and-real-file-readback',async()=>{
    const large=structuredClone(body);large.slot='qa-large-complete-history';
    const visual={kind:'table',title:'完整历史表',headers:Array(8).fill('列'),rows:Array.from({length:40},()=>Array(8).fill('原'.repeat(1000))),explanation:''};
    large.visualHistory=Array.from({length:10},()=>({index:0,visual:structuredClone(visual)}));
    large.journal=[{input:f.input,requestFingerprint:teachingHash({owner,input:f.input}),phase:'unknown',result:null,message:'原请求保持未知，不能另键重建。'}];
    const copy=await first.evaluate(body=>window.teachingEditorQA.complete(body),large);
    const refused=await first.evaluate(async({copy,owner,slot})=>{try{await window.teachingEditorQA.save(copy,owner,slot,{revision:null,fingerprint:null});return 'accepted';}catch(error){return error.name;}},{copy,owner,slot:large.slot});
    assert.equal(refused,'TeachingEditorLocalUnavailable');assert.equal((await first.evaluate(({owner,slot})=>window.teachingEditorQA.load(owner,slot),{owner,slot:large.slot})).revision,null);
    const pending=first.waitForEvent('download'),fingerprint=await first.evaluate(body=>window.teachingEditorQA.download(body),large),target=path.join(folder,'actual-above8mib-complete-copy.json');await(await pending).saveAs(target);
    const bytes=fs.readFileSync(target),actual=JSON.parse(bytes);assert.ok(bytes.length>8*1024*1024);assert.equal(actual.fingerprint,fingerprint);assert.equal(teachingHash(actual.visualHistory),teachingHash(large.visualHistory));assert.deepEqual(actual.journal,large.journal);assert.deepEqual(actual.source,large.source);
    const restored=await second.evaluate(({actual,owner})=>window.teachingEditorQA.read(actual,owner),{actual,owner});assert.equal(restored.copy.fingerprint,fingerprint);assert.deepEqual(restored.verifiedOriginalRequests,[]);
    fs.writeFileSync(path.join(folder,'large-summary.json'),JSON.stringify({bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),history:actual.visualHistory.length,pending:actual.journal.length,originalRequestUnverified:true,actualDownloadedFileReadBack:true}));
  });
  const report = { at: new Date().toISOString(), generatedOnly: true, actualChromium: true, actualIndexedDB: true, passed: checks.length, failed: 0, checks,
    bundleSha256: crypto.createHash('sha256').update(fs.readFileSync(bundle)).digest('hex'), productUIAcceptance: false, nativeBusinessHTTPAcceptance: false, realLearnerEvidence: false };
  fs.writeFileSync(path.join(folder, 'receipt.json'), JSON.stringify(report, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ label, passed: report.passed, failed: 0, productUIAcceptance: false }));
}
main().catch(error => { fs.writeFileSync(path.join(folder, 'failure-first.json'), JSON.stringify({ name: error.name, message: error.message, stack: error.stack, generatedOnly: true }, null, 2), { flag: 'wx' }); console.error(error.stack); process.exitCode = 1; })
  .finally(async () => { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
