/* Validate only the source-backed handbook and its offline viewer. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { chromium } = require('@playwright/test');
const root = path.resolve(__dirname, '../..');
const design = path.join(root, 'doc/design');
const json = file => JSON.parse(fs.readFileSync(path.join(design, file), 'utf8'));
const inventory = json('generated/source-inventory.json'), catalog = json('feature-catalog.json');
const coverage = json('generated/coverage.json'), snapshot = json('generated/content-snapshot.json');
const receiptPath = path.join(design, 'generated/design-validation.json');
fs.writeFileSync(receiptPath, JSON.stringify({ schemaVersion: 1, at: new Date().toISOString(), sourceRevision: inventory.sourceRevision, passed: false, status: 'validation-incomplete' }, null, 2) + '\n');
const checks = [], problems = [], features = catalog.areas.flatMap(area => area.features);
const sourceHashes = new Map();
function reference(file, line) {
  const absolute = path.resolve(root, file);
  if (!absolute.startsWith(root + path.sep) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) { problems.push({ file, line, reason: 'missing-or-outside-root' }); return; }
  const source = fs.readFileSync(absolute);
  sourceHashes.set(file, createHash('sha256').update(source).digest('hex'));
  if (line && (!Number.isInteger(line) || line < 1 || line > source.toString('utf8').split(/\r?\n/).length)) problems.push({ file, line, reason: 'invalid-source-line' });
}
for (const area of catalog.areas) {
  [...area.files, ...area.contracts, ...area.tests].forEach(file => reference(file));
  for (const feature of area.features) {
    [...feature.endpoints, ...feature.implementations].forEach(row => reference(row.file, row.line));
    feature.sourceFiles.forEach(file => reference(file));
    for (const field of ['id', 'title', 'inputs', 'implementation', 'outputs', 'limits']) assert(feature[field]?.trim(), feature.id + ': Missing ' + field);
  }
}
assert.deepEqual(problems, [], 'Feature source references');
assert.equal(coverage.uncoveredApiRoutes.length, 0);
assert.equal(coverage.sourceReferenceProblems.length, 0);
assert.equal(coverage.coveredApiRoutes, inventory.counts.activeBusinessHttpRoutes);
assert.equal(features.length, catalog.counts.features);
assert.equal(new Set(features.map(feature => feature.id)).size, features.length);
for (const document of [coverage, catalog, snapshot]) assert.equal(document.sourceRevision, inventory.sourceRevision, 'Baseline mismatch');
const docs = JSON.parse(execFileSync(process.execPath, ['scripts/qa/verify-doc-links.cjs'], { cwd: root, encoding: 'utf8' }));
assert.deepEqual(docs.missing, []);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const browserErrors = [], networkRequests = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('request', request => { if (/^https?:/i.test(request.url())) networkRequests.push(request.url()); });
  const check = async (name, fn) => { await fn(); checks.push({ name, passed: true }); };
  try {
    const url = pathToFileURL(path.join(design, 'index.html')).href;
    await page.goto(url);
    await check('all records and domains rendered', async () => {
      assert.equal(await page.locator('#areas-count').textContent(), String(catalog.counts.areas));
      assert.equal(await page.locator('#features-count').textContent(), String(features.length));
      assert.equal(await page.locator('#routes-count').textContent(), String(coverage.coveredApiRoutes));
      assert.equal(await page.locator('.domain').count(), catalog.areas.length + 1);
      assert.equal(await page.locator('.feature').count(), features.length);
    });
    await check('domain filter and detail remain consistent', async () => {
      const area = catalog.areas.find(area => area.id === 'measurement');
      await page.locator('[data-domain="measurement"]').click();
      assert.equal(await page.locator('.feature').count(), area.features.length);
      const first = area.features[0];
      assert.equal(await page.locator('#feature-detail').getAttribute('data-feature'), first.id);
      for (const heading of ['输入与触发', '处理与实现', '输出与结果', '状态与持久化', '权限、失败与边界', '关联接口', '关联验证入口']) assert(await page.locator('#feature-detail').getByRole('heading', { name: heading, exact: true }).count());
    });
    for (const term of ['MEA-02', 'ICS', 'expectedRevision']) await check('keyword search: ' + term, async () => {
      await page.locator('#clear').click();
      await page.locator('#search').fill(term);
      const expected = features.filter(feature => JSON.stringify({ ...feature, areaTitle: catalog.areas.find(area => area.id === feature.area).title }).toLocaleLowerCase().includes(term.toLocaleLowerCase()));
      assert(expected.length > 0, 'Missing useful search fixture: ' + term);
      assert.equal(await page.locator('.feature').count(), expected.length);
      await page.locator('.feature').first().click();
      assert.equal(await page.locator('#feature-detail').getAttribute('data-feature'), expected[0].id);
    });
    await check('empty search and reset recover', async () => {
      await page.locator('#search').fill('definitely-no-feature-4a877ad');
      assert.equal(await page.locator('.feature').count(), 0);
      assert.equal(await page.locator('#feature-detail h2').textContent(), '未找到功能');
      await page.locator('#clear').click();
      assert.equal(await page.locator('.feature').count(), features.length);
    });
    await check('all rendered local links resolve', async () => {
      const links = await page.evaluate(() => {
        const links = new Set();
        for (const feature of all) {
          renderDetail(feature);
          for (const anchor of document.querySelectorAll('a[href]')) links.add(anchor.href);
        }
        renderDetail(byId.get(selected));
        return [...links];
      });
      const { fileURLToPath } = require('node:url');
      for (const link of links) {
        const parsed = new URL(link); if (parsed.protocol !== 'file:') continue;
        assert(fs.existsSync(fileURLToPath(parsed)), 'Missing HTML link: ' + link);
      }
    });
    await check('deep link opens selected feature', async () => {
      await page.goto(url + '#MEA-02');
      assert.equal(await page.locator('#feature-detail').getAttribute('data-feature'), 'MEA-02');
    });
    await check('desktop and mobile have no horizontal page overflow', async () => {
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Overflow at ' + width);
      }
      await page.locator('#clear').click();
      await page.locator('#search').fill('ICS');
      await page.locator('.feature').first().click();
      assert(await page.locator('#feature-detail').getByRole('heading', { name: '处理与实现', exact: true }).count());
    });
    await check('keyboard search shortcut and escape', async () => {
      await page.locator('#feature-detail').focus();
      await page.keyboard.press('/');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'search');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.feature').count(), features.length);
    });
    assert.deepEqual(browserErrors, [], 'Offline viewer browser errors');
    assert.deepEqual(networkRequests, [], 'Viewer must remain offline');
    const artifactDirectory = path.join(root, 'data/qa/project-design-viewer');
    fs.mkdirSync(artifactDirectory, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: path.join(artifactDirectory, 'desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.screenshot({ path: path.join(artifactDirectory, 'mobile.png'), fullPage: true });
    const receipt = {
      schemaVersion: 1, at: new Date().toISOString(), sourceRevision: inventory.sourceRevision, passed: true,
      scope: 'Documentation, static content/source references, API coverage and offline handbook UI only. No running application changes, family data reads or new full application test run.',
      inventory: inventory.counts, features: catalog.counts,
      sourceReferences: { uniqueFiles: sourceHashes.size, problems, sha256: Object.fromEntries([...sourceHashes].sort(([a], [b]) => a.localeCompare(b))) },
      coverage: { activeNormalApiRoutes: coverage.activeNormalApiRoutes, coveredApiRoutes: coverage.coveredApiRoutes, uncovered: coverage.uncoveredApiRoutes },
      markdownLinks: docs,
      staticContent: { receipt: 'content-snapshot.json', authoredAuditAt: snapshot.authored.auditAt, totals: snapshot.authored.totals },
      offlineViewer: { checks, browserErrors, externalNetworkRequests: networkRequests, viewports: [1440, 768, 390], screenshots: ['data/qa/project-design-viewer/desktop.png', 'data/qa/project-design-viewer/mobile.png'] },
      applicationBaselineEvidence: { newlyRunByThisScript: false,
        receipt: '../evidence/2026-10-23/learning-home-acceptance.json',
        revision: JSON.parse(fs.readFileSync(path.join(root, 'doc/evidence/2026-10-23/learning-home-acceptance.json'), 'utf8')).sourceRevision,
        note: 'Recorded application acceptance is a separate run. This documentation validation does not rerun or replace it, and does not assert a newer remote CI result.' }
    };
    fs.writeFileSync(path.join(design, 'generated/design-validation.json'), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify({ passed: receipt.passed, features: receipt.features, sourceFiles: sourceHashes.size, markdownLinks: docs.checked, viewerChecks: checks.length, browserErrors, externalNetworkRequests: networkRequests }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
