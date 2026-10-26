import { expect, test, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { browserEvidence } from './evidence';

const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4168') + '/api';
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });
async function board(page: Page) {
  const key = createHash('sha256').update(test.info().testId).digest(), address = '198.19.' + key[0] + '.' + key[1], principal = 'font-fixture-' + randomUUID(), credential = 'Synthetic-fonts-only-20261027';
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address });
  async function call(path: string, body: object, token?: string, method = 'POST') {
    const response = await fetch(api + path, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
    expect(response.ok, path + ' ' + response.status).toBe(true); return (await response.json()).data;
  }
  const actor = await call('/auth/register', { principal, credential }), child = (await call('/students', { nickname: '匿名字体白板', grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }, actor.token)).profile.id;
  await call('/students/' + child + '/learning-scope', { subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null, textbookVersion: '合成已学范围', learnedAtomIds: ['core:math:fractionadd'], currentAtomId: 'core:math:fractionadd', minutesPerSession: 15 }, actor.token, 'PUT');
  const command = { studentId: child, subject: 'math', prompt: '异分母分数加法：先理解单位，再通分。', atomId: 'core:math:fractionadd' }, preview = await call('/learning/studio/whiteboards/preview', command, actor.token);
  const saved = await call('/learning/studio/whiteboards', { ...command, fingerprint: preview.fingerprint, requestKey: randomUUID() }, actor.token);
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential); await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  return '/studio?student=' + child + '&subject=math&whiteboard=' + saved.id;
}

test('original fonts: real captured Latin and Chinese faces decode before a board is measured, played or exported', async ({ page }) => {
  const url = await board(page), requests: string[] = [];
  page.on('request', request => { if (request.resourceType() === 'font') requests.push(request.url()); });
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.fillText;
    (window as unknown as { originalBoardFonts: string[] }).originalBoardFonts = [];
    CanvasRenderingContext2D.prototype.fillText = function (...args: Parameters<CanvasRenderingContext2D['fillText']>) {
      (window as unknown as { originalBoardFonts: string[] }).originalBoardFonts.push(this.font); return original.apply(this, args);
    };
  });
  await page.goto(url); const dialog = page.getByRole('dialog', { name: '白板视频', exact: true });
  await expect(dialog).toHaveAttribute('data-original-font-status', 'ready'); await expect(dialog.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
  const loaded = await page.evaluate(() => [...new Set(Array.from(document.fonts).filter(face => face.status === 'loaded').map(face => face.family.replace(/^['"]|['"]$/g, '')))]);
  for (const family of ['Virgil', 'Xiaolai', 'Satoshi-Regular', 'Satoshi-Medium', 'Satoshi-Bold', 'MiSans']) expect(loaded).toContain(family);
  await expect.poll(() => page.evaluate(() => (window as unknown as { originalBoardFonts: string[] }).originalBoardFonts.some(font => /Virgil/.test(font) && /Xiaolai/.test(font)))).toBe(true);
  expect(requests.length).toBeGreaterThan(4); for (const request of requests) expect(new URL(request).pathname).toMatch(/^\/reference\/hyperknow\//);
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'apps/web/public/reference/hyperknow/asset-manifest.json'), 'utf8'));
  for (const request of [...new Set(requests)].slice(0, 8)) {
    const entry = manifest.files.find((entry: { publicPath: string }) => entry.publicPath === new URL(request).pathname); expect(entry).toBeTruthy();
    const response = await page.request.get(request), bytes = await response.body(); expect(response.status()).toBe(200); expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
  }
  writeFileSync(join(browserEvidence('original-teaching-fonts'), 'actual-loaded-fonts.json'), JSON.stringify({ loaded, requests, originalFontManifest: manifest.captureFingerprint }, null, 2) + '\n');
  await page.screenshot({ path: join(browserEvidence('original-teaching-fonts'), 'actual-board-fonts.png'), fullPage: true });
});

test('original fonts: a failed captured glyph never starts playback and an explicit retry recovers the same board', async ({ page }) => {
  const url = await board(page); let blocked = false;
  await page.route('**/reference/hyperknow/assets/woff2/Xiaolai-*.woff2*', async route => { if (!blocked) { blocked = true; await route.abort('failed'); } else await route.continue(); });
  await page.goto(url); const dialog = page.getByRole('dialog', { name: '白板视频', exact: true });
  await expect(dialog).toHaveAttribute('data-original-font-status', 'error'); expect(blocked).toBe(true); await expect(dialog.getByRole('button', { name: '播放', exact: true })).toBeDisabled(); await expect(dialog.getByRole('button', { name: '导出视频', exact: true })).toBeDisabled();
  await page.unrouteAll({ behavior: 'wait' }); await dialog.getByRole('button', { name: '重新准备板书字体' }).click();
  await expect(dialog).toHaveAttribute('data-original-font-status', 'ready'); await expect(dialog.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
  expect(page.url()).toContain(new URL(url, 'http://fixture').searchParams.get('whiteboard')!);
});

test('teaching frame: moving to another scene retains already taught notes, excludes future scenes and keeps one full caption', async ({ page }) => {
  const url = await board(page);
  await page.addInitScript(() => {
    const clear = CanvasRenderingContext2D.prototype.clearRect, fill = CanvasRenderingContext2D.prototype.fillText;
    const state = window as unknown as { latestTeachingFrame: string[] }; state.latestTeachingFrame = [];
    CanvasRenderingContext2D.prototype.clearRect = function (...args: Parameters<CanvasRenderingContext2D['clearRect']>) { state.latestTeachingFrame = []; return clear.apply(this, args); };
    CanvasRenderingContext2D.prototype.fillText = function (...args: Parameters<CanvasRenderingContext2D['fillText']>) { state.latestTeachingFrame.push(args[0]); return fill.apply(this, args); };
  });
  await page.goto(url); const dialog = page.getByRole('dialog', { name: '白板视频', exact: true });
  await expect(dialog).toHaveAttribute('data-original-font-status', 'ready');
  const scenes = dialog.locator('.sa-scene-strip button'), title = async (index: number) => (await scenes.nth(index).innerText()).replace(/^\d+\s*/u, '').trim();
  const first = await title(0), second = await title(1), third = await title(2);
  await scenes.nth(1).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { latestTeachingFrame: string[] }).latestTeachingFrame)).toEqual(expect.arrayContaining([first, second]));
  expect(await page.evaluate(() => (window as unknown as { latestTeachingFrame: string[] }).latestTeachingFrame)).not.toContain(third);
  const sentence = dialog.locator('.wb-current-sentence'); await expect(sentence).toHaveCount(1);
  const unit = await sentence.getAttribute('data-unit-id'); await dialog.getByRole('button', { name: '缩小白板', exact: true }).click();
  await expect(sentence).toHaveAttribute('data-unit-id', unit!); await expect(dialog.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
  await page.screenshot({ path: join(browserEvidence('original-teaching-frames'), 'cumulative-second-scene.png') });
});

for (const width of [390, 768, 1280]) test('teaching shell: actual original chrome, font switch and return fit ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 }); const url = await board(page);
  const styles = () => page.evaluate(() => { const style = getComputedStyle(document.body); return { font: style.fontFamily, color: style.color, background: style.backgroundColor }; });
  const before = await styles(); await page.goto(url); const dialog = page.getByRole('dialog', { name: '白板视频', exact: true });
  await expect(dialog).toHaveAttribute('data-original-font-status', 'ready');
  expect(await dialog.evaluate(element => { const bounds = element.getBoundingClientRect(); return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }; })).toEqual({ x: 0, y: 0, width, height: 800 });
  const sentence = dialog.locator('.wb-current-sentence'), unit = await sentence.getAttribute('data-unit-id');
  await dialog.getByRole('combobox', { name: '板书字体', exact: true }).selectOption('standard');
  await expect(dialog).toHaveAttribute('data-original-font-status', 'ready'); await expect(sentence).toHaveAttribute('data-unit-id', unit!);
  await expect(dialog.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
  const overflow = await dialog.evaluate(element => element.scrollWidth - element.clientWidth); expect(overflow).toBeLessThanOrEqual(1);
  await dialog.getByRole('combobox', { name: '板书字体', exact: true }).selectOption('handwriting'); await expect(dialog).toHaveAttribute('data-original-font-status', 'ready');
  await page.screenshot({ path: join(browserEvidence('original-teaching-frames'), 'original-shell-' + width + '.png') });
  await dialog.getByRole('button', { name: '关闭白板', exact: true }).click(); await expect(dialog).toHaveCount(0);
  await page.goto('/learn'); expect(await styles()).toEqual(before);
});
