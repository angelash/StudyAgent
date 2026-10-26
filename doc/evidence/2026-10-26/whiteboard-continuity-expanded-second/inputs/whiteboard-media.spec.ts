import { expect, test, type Page } from '@playwright/test';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { browserEvidence } from './evidence';
import { join } from 'node:path';
import { installNarrationTiming } from './whiteboard-timing';

const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107');
const credential = 'Synthetic-whiteboard-only-20261026';
async function fixture(page: Page, endedBoundary = false) {
  const principal = 'whiteboard-' + crypto.randomUUID() + '@local.test';
  const bucket = createHash('sha256').update(test.info().testId).digest(), address = '198.19.' + bucket[0] + '.' + bucket[1];
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address });
  async function call(path: string, body?: unknown, actor?: string, method = 'POST') {
    const response = await fetch(api + '/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address, ...(actor ? { Authorization: 'Bearer ' + actor } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    expect(response.ok, path + ': ' + response.status).toBe(true); return (await response.json()).data;
  }
  const actor = await call('/auth/register', { principal, credential });
  const child = await call('/students', { nickname: '匿名白板验证', grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }, actor.token);
  const studentId = child.profile.id;
  await call('/students/' + studentId + '/learning-scope', { subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null, textbookVersion: '合成已学范围', learnedAtomIds: ['core:math:fractionadd'], currentAtomId: 'core:math:fractionadd', minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [] }, actor.token, 'PUT');
  const draft = { studentId, subject: 'math', prompt: '解释异分母分数加法', atomId: 'core:math:fractionadd' };
  const preview = await call('/learning/studio/whiteboards/preview', draft, actor.token);
  const saved = await call('/learning/studio/whiteboards', { ...draft, fingerprint: preview.fingerprint, requestKey: crypto.randomUUID() }, actor.token);
  const board = await call('/qa/whiteboard-media', { boardId: saved.id }, actor.token);
  await page.route('**/api/learning/studio/overview?*', async route => {
    const response = await route.fetch(); if (!response.ok()) { await route.fulfill({ response }); return; }
    const payload = await response.json(); payload.data.narrationAvailable = true;
    payload.data.speech = { available: true, provider: 'minimax', defaultVoice: 'fixture-a', voices: [
      { id: 'fixture-a', label: '合成音轨 A' }, { id: 'fixture-delay', label: '受控延迟音轨' }, { id: 'fixture-fail', label: '受控失败音轨' },
    ] }; await route.fulfill({ response, json: payload });
  });
  await page.addInitScript(({ endedBoundary }) => {
    const NativeAudio = window.Audio; (window as any).__whiteboardAudio = [];
    const pending = new Map<number, FrameRequestCallback>();
    (window as any).__whiteboardStarts = []; (window as any).__whiteboardBoundaryTicks = 0;
    if (endedBoundary) {
      const raf = requestAnimationFrame.bind(window), cancel = cancelAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => { const id = raf(time => { pending.delete(id); callback(time); }); pending.set(id, callback); return id; };
      window.cancelAnimationFrame = id => { pending.delete(id); cancel(id); };
    }
    (window as any).Audio = function (src?: string) {
      const audio = new NativeAudio(src), index = (window as any).__whiteboardAudio.length; (window as any).__whiteboardAudio.push(audio);
      if (endedBoundary) {
        let onEnded: ((this: HTMLAudioElement, event: Event) => unknown) | null = null;
        Object.defineProperty(audio, 'onended', { configurable: true, get: () => onEnded, set: value => { onEnded = value; } });
        audio.addEventListener('playing', () => (window as any).__whiteboardStarts.push({ index, currentTime: audio.currentTime, duration: audio.duration }));
        audio.addEventListener('ended', event => {
          const queued = [...pending.values()], handler = onEnded; handler?.call(audio, event);
          // Force an already-queued old progress frame at the ended/React cleanup boundary.
          if (index === 0 && handler) { (window as any).__whiteboardBoundaryTicks += queued.length; queued.forEach(callback => callback(performance.now())); }
        });
      }
      return audio;
    };
  }, { endedBoundary });
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  const href = '/studio?' + new URLSearchParams({ student: studentId, subject: 'math', whiteboard: board.id });
  await page.goto(href); await expect(page.locator('.wb-current-sentence')).toContainText('先统一单位');
  return { actor, board, studentId, href, call, current: page.locator('.wb-current-sentence') };
}

test('complete sentence, complete notes, paused text reading and explicit sentence navigation', async ({ page }) => {
  const f = await fixture(page); await page.getByLabel('阅读方式').selectOption('text');
  await expect(f.current).not.toContainText('最后验证'); await expect(page.locator('.wb-reading-notes ol li')).toHaveCount(4);
  await expect(page.getByLabel('完整讲稿与要点')).toContainText('完整正文末行');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(() => page.getByRole('slider').inputValue()).not.toBe('0');
  await page.getByRole('button', { name: '暂停', exact: true }).click(); const at = await page.getByRole('slider').inputValue();
  await page.waitForTimeout(250); expect(await page.getByRole('slider').inputValue()).toBe(at);
  await page.getByRole('button', { name: '下一句' }).click(); await expect(f.current).toContainText('再合并份数');
  await expect(page.locator('.wb-reading-notes [aria-current=step]')).toHaveText('[whiteboard-fixture] 再合并份数。');
  await page.getByRole('button', { name: '上一句' }).click(); await expect(f.current).toContainText('先统一单位');
  await page.getByRole('button', { name: '关闭白板' }).click(); await expect(page.getByRole('dialog', { name: '白板视频' })).toHaveCount(0);
});

test('real WAV ended drives cloud playback, pause retains audio time and late ended cannot move a new sentence', async ({ page }) => {
  const f = await fixture(page); await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0]?.currentTime ?? 0)).toBeGreaterThan(.15);
  await expect(f.current).toContainText('先统一单位'); // Original nominal scene duration is only 10ms.
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const before = await page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime);
  await page.waitForTimeout(250); expect(await page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime)).toBeCloseTo(before, 1);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime)).toBeGreaterThan(before);
  await expect(f.current).toContainText('再合并份数', { timeout: 5000 });
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.evaluate(() => (window as any).__whiteboardAudio[0].dispatchEvent(new Event('ended')));
  await expect(f.current).toContainText('再合并份数');
  await page.getByRole('button', { name: '关闭白板' }).click();
  expect(await page.evaluate(() => (window as any).__whiteboardAudio.every((audio: HTMLAudioElement) => audio.paused && !audio.getAttribute('src')))).toBe(true);
});

test('ended boundary: a queued previous audio frame cannot seek the next actual WAV to its end', async ({ page }) => {
  const f = await fixture(page, true); await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__whiteboardStarts.some((row: any) => row.index === 1))).toBe(true);
  const starts = await page.evaluate(() => (window as any).__whiteboardStarts as Array<{ index: number; currentTime: number; duration: number }>);
  expect(starts.find(row => row.index === 1)!.currentTime).toBeLessThan(.15);
  expect(await page.evaluate(() => (window as any).__whiteboardBoundaryTicks)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '暂停', exact: true }).click(); await expect(f.current).toContainText('再合并份数');
  await page.evaluate(() => (window as any).__whiteboardAudio[0].dispatchEvent(new Event('ended'))); await expect(f.current).toContainText('再合并份数');
});

test('continuity: adjacent actual WAV prepares during the current sentence and transfers once at its beginning', async ({ page }) => {
  const timing = await installNarrationTiming(page), f = await fixture(page);
  try {
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect.poll(async () => (await timing.read()).audio.some(row => row.index === 1 && row.event === 'playing'), { timeout: 10000 }).toBe(true);
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    const result = await timing.save('adjacent-transfer'), firstEnd = result.audio.find(row => row.index === 0 && row.event === 'ended')!;
    const prepared = result.audio.find(row => row.index === 1 && row.event === 'loadedmetadata')!, next = result.audio.find(row => row.index === 1 && row.event === 'playing')!;
    expect(result.requests[1].startedAt).toBeLessThan(firstEnd.at - 100);
    expect(prepared.at).toBeLessThan(firstEnd.at);
    expect(next.at - firstEnd.at).toBeLessThan(result.delayMs * .75);
    expect(next.currentTime).toBeLessThan(.15);
    expect(result.requests.filter(row => row.unitId === result.requests[1].unitId)).toHaveLength(1);
    expect(result.audio.filter(row => row.index === 1 && row.event === 'playing')).toHaveLength(1);
    await expect(f.current).toContainText('再合并份数');
  } finally { await page.unrouteAll({ behavior: 'wait' }); }
});

test('continuity: three complete actual WAVs remain ordered through a live speed change without duplicate preparation', async ({ page }) => {
  const timing = await installNarrationTiming(page, 300), f = await fixture(page);
  try {
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect.poll(async () => (await timing.read()).audio.some(row => row.index === 1 && row.event === 'loadedmetadata')).toBe(true);
    const at = await page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime);
    await page.getByLabel('播放速度').selectOption('1.25');
    await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0].playbackRate)).toBe(1.25);
    expect(await page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime)).toBeGreaterThanOrEqual(at);
    await expect.poll(async () => (await timing.read()).audio.some(row => row.index === 2 && row.event === 'ended'), { timeout: 12000 }).toBe(true);
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    const result = await timing.save('three-complete-with-speed');
    const completed = result.audio.filter(row => row.event === 'ended');
    expect(completed.map(row => row.index)).toEqual([0, 1, 2]);
    for (const row of completed) expect(row.currentTime).toBe(row.duration);
    for (const index of [1, 2]) {
      const start = result.audio.find(row => row.index === index && row.event === 'playing')!;
      expect(start.at).toBeGreaterThanOrEqual(completed[index - 1].at); expect(start.currentTime).toBeLessThan(.15);
      expect(result.audio.filter(row => row.index === index && row.event === 'playing')).toHaveLength(1);
    }
    expect(new Set(result.requests.map(row => row.unitId)).size).toBe(result.requests.length);
    await expect(f.current).toContainText('保留新的独立观察');
  } finally { await page.unrouteAll({ behavior: 'wait' }); }
});

test('continuity: an already prepared WAV cannot survive actual login-session revocation', async ({ page }) => {
  const timing = await installNarrationTiming(page, 150), f = await fixture(page);
  try {
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect.poll(async () => (await timing.read()).audio.some(row => row.index === 1 && row.event === 'loadedmetadata')).toBe(true);
    await f.call('/auth/logout', {}, f.actor.token);
    await expect(page.getByRole('dialog', { name: '白板视频' })).toHaveCount(0);
    const result = await timing.save('revoked-session');
    expect(result.audio.filter(row => row.index === 1 && row.event === 'playing')).toEqual([]);
    expect(await page.evaluate(() => (window as any).__whiteboardAudio.every((audio: HTMLAudioElement) => audio.paused && !audio.getAttribute('src')))).toBe(true);
  } finally { await page.unrouteAll({ behavior: 'wait' }); }
});

test('continuity: a failed adjacent preparation preserves current playback and needs an explicit retry at its original sentence', async ({ page }) => {
  const f = await fixture(page); let first = '', second = '', secondCalls = 0;
  await page.route('**/api/learning/studio/whiteboards/*/narration/*', async route => {
    const unitId = route.request().postDataJSON().unitId;
    if (!first) first = unitId;
    if (unitId !== first && !second) second = unitId;
    if (unitId === second && ++secondCalls === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"message":"Synthetic preparation failure"}}' });
    return route.continue();
  });
  try {
    await page.getByRole('button', { name: '播放', exact: true }).click(); await expect.poll(() => secondCalls).toBe(1);
    await expect(f.current).toContainText('先统一单位'); await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '暂停', exact: true }).click(); await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect(f.current).toContainText('再合并份数'); await expect(page.locator('.sa-whiteboard-notice')).toContainText('重试或选择文字');
    expect(secondCalls).toBe(1); await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[1]?.currentTime ?? 0)).toBeGreaterThan(.1);
    expect(secondCalls).toBe(2); await expect(f.current).toContainText('再合并份数');
  } finally { await page.unrouteAll({ behavior: 'wait' }); }
});

test('continuity: closing during adjacent preparation aborts it and no late audio can play', async ({ page }) => {
  const timing = await installNarrationTiming(page), f = await fixture(page);
  try {
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect.poll(async () => (await timing.read()).requests.length).toBe(2);
    await page.getByRole('button', { name: '关闭白板', exact: true }).click(); await page.waitForTimeout(1000);
    const result = await timing.save('close-pending'); expect(result.requests[1].failure).toBeTruthy();
    expect(result.audio.filter(row => row.index > 0 && row.event === 'playing')).toEqual([]);
    expect(await page.evaluate(() => (window as any).__whiteboardAudio.every((audio: HTMLAudioElement) => audio.paused && !audio.getAttribute('src')))).toBe(true);
    await expect(page.getByRole('dialog', { name: '白板视频' })).toHaveCount(0);
  } finally { await page.unrouteAll({ behavior: 'wait' }); }
});

test('continuity: an exact manual next keeps the prepared WAV paused and transfers it without another request', async ({ page }) => {
  const timing = await installNarrationTiming(page), f = await fixture(page);
  try {
    await page.getByRole('button', { name: '播放', exact: true }).click(); await expect.poll(async () => (await timing.read()).requests.length).toBe(2);
    const target = (await timing.read()).requests[1].unitId;
    await page.getByRole('button', { name: '下一句', exact: true }).click(); await expect(f.current).toContainText('再合并份数');
    await expect.poll(async () => (await timing.read()).audio.some(row => row.index === 1 && row.event === 'loadedmetadata')).toBe(true);
    expect((await timing.read()).audio.filter(row => row.index === 1 && row.event === 'playing')).toEqual([]);
    await page.getByRole('button', { name: '播放', exact: true }).click(); await expect.poll(async () => (await timing.read()).audio.some(row => row.index === 1 && row.event === 'playing')).toBe(true);
    await page.getByRole('button', { name: '暂停', exact: true }).click(); const result = await timing.save('manual-next');
    expect(result.requests.filter(row => row.unitId === target)).toHaveLength(1);
    expect(result.audio.find(row => row.index === 1 && row.event === 'playing')!.currentTime).toBeLessThan(.15);
  } finally { await page.unrouteAll({ behavior: 'wait' }); }
});

test('continuity: a prepared WAV cannot play after actual guardian revocation before handover', async ({ page }) => {
  const timing = await installNarrationTiming(page, 150), f = await fixture(page);
  try {
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect.poll(async () => (await timing.read()).audio.some(row => row.index === 1 && row.event === 'loadedmetadata')).toBe(true);
    await f.call('/qa/whiteboard-media', { boardId: f.board.id, revoke: true }, f.actor.token);
    await expect(page.getByRole('dialog', { name: '白板视频' })).toHaveCount(0);
    const result = await timing.save('revoked-prepared'); expect(result.audio.filter(row => row.index === 1 && row.event === 'playing')).toEqual([]);
    expect(await page.evaluate(() => (window as any).__whiteboardAudio.every((audio: HTMLAudioElement) => audio.paused && !audio.getAttribute('src')))).toBe(true);
  } finally { await page.unrouteAll({ behavior: 'wait' }); }
});

test('continuity: changing voice fences the old adjacent request and preserves an explicit fresh play', async ({ page }) => {
  const timing = await installNarrationTiming(page), f = await fixture(page);
  try {
    await page.getByRole('button', { name: '播放', exact: true }).click(); await expect.poll(async () => (await timing.read()).requests.length).toBe(2);
    const old = (await timing.read()).requests[1].unitId;
    await page.getByLabel('旁白音色').selectOption('fixture-delay'); await page.waitForTimeout(1000);
    let result = await timing.read(); expect(result.requests[1].failure).toBeTruthy();
    expect(result.audio.filter(row => row.index > 0 && row.event === 'playing')).toEqual([]); await expect(f.current).toContainText('先统一单位');
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect.poll(async () => (await timing.read()).audio.some(row => row.index === 1 && row.event === 'playing'), { timeout: 10000 }).toBe(true);
    result = await timing.save('voice-change'); expect(result.requests.filter(row => row.unitId === old && row.voice === 'fixture-a')).toHaveLength(1);
    expect(result.requests.some(row => row.voice === 'fixture-delay')).toBe(true);
  } finally { await page.unrouteAll({ behavior: 'wait' }); }
});

test('continuity: slow adjacent audio cannot advance early and can be paused while waiting', async ({ page }) => {
  const timing = await installNarrationTiming(page, 3300), f = await fixture(page);
  try {
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0]?.currentTime ?? 0), { timeout: 10000 }).toBeGreaterThan(.8);
    await expect(f.current).toContainText('先统一单位');
    await expect(f.current).toContainText('再合并份数'); await expect(page.locator('.sa-whiteboard-notice')).toContainText('正在准备当前句');
    await page.getByRole('button', { name: '暂停', exact: true }).click(); await page.waitForTimeout(1800);
    const result = await timing.save('slow-cancel'); expect(result.requests[1].failure).toBeTruthy();
    expect(result.audio.filter(row => row.index === 1 && row.event === 'playing')).toEqual([]);
    await expect(f.current).toContainText('再合并份数'); await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  } finally { await page.unrouteAll({ behavior: 'wait' }); }
});

test('voice switch fences delayed requests and an audio failure offers explicit retry or text reading', async ({ page }) => {
  const f = await fixture(page); await page.getByLabel('旁白音色').selectOption('fixture-delay');
  await page.getByRole('button', { name: '播放', exact: true }).click(); await expect(page.getByRole('status').last()).toContainText('正在准备当前句');
  await page.getByLabel('旁白音色').selectOption('fixture-fail'); await page.waitForTimeout(2100);
  expect(await page.evaluate(() => (window as any).__whiteboardAudio.length)).toBe(0);
  await page.getByRole('button', { name: '播放', exact: true }).click(); await expect(page.locator('.sa-whiteboard-notice')).toContainText('重试或选择文字');
  await expect(f.current).toContainText('先统一单位'); await page.getByLabel('阅读方式').selectOption('text');
  await page.getByRole('button', { name: '播放', exact: true }).click(); await expect.poll(() => page.getByRole('slider').inputValue()).not.toBe('0');
});

test('reopening a paused cloud sentence restores its known audio time in the verified original board', async ({ page }) => {
  const f = await fixture(page); await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0]?.currentTime ?? 0)).toBeGreaterThan(.35);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const at = await page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime);
  await page.waitForTimeout(1700); await page.reload(); await expect(f.current).toContainText('先统一单位');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0]?.currentTime ?? 0)).toBeGreaterThan(at - .05);
  expect(await page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime)).toBeLessThan(at + .6);
});

test('scoped local resume and complete accessible notes fit phone, tablet and desktop', async ({ page }) => {
  const f = await fixture(page); await page.getByRole('button', { name: '下一句' }).click();
  await expect(f.current).toContainText('再合并份数'); await page.waitForTimeout(1700); await page.reload();
  await expect(f.current).toContainText('再合并份数'); await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
  const stored = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('studyagent.whiteboard.location.v1.')));
  expect(stored).toHaveLength(1); expect(stored[0][1]).not.toContain('再合并份数');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await expect(f.current).toBeVisible();
    expect(await page.locator('.wb-sentence-player').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  }
  await page.getByRole('button', { name: '关闭白板' }).click();
  await page.evaluate(([key, value]) => localStorage.setItem(key, JSON.stringify({ ...JSON.parse(value), fingerprint: 'b'.repeat(64) })), stored[0]);
  await page.reload(); await expect(f.current).toContainText('先统一单位'); await expect(page.locator('.sa-whiteboard-notice')).toContainText('版本不符');
});

test('actual WebM has a decoded audio track and the same complete SRT timeline at the selected speed', async ({ page }) => {
  const f = await fixture(page); await page.getByLabel('播放速度').selectOption('1.25');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出视频' }).click(); const video = await download;
  const directory = browserEvidence('whiteboard-media'); copyFileSync((await video.path())!, join(directory, 'decoded-fixture.webm'));
  const probe = JSON.parse(execFileSync(process.env.STUDY_FFPROBE ?? 'ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', (await video.path())!], { encoding: 'utf8', windowsHide: true }));
  expect(probe.streams.some((stream: any) => stream.codec_type === 'audio')).toBe(true);
  expect(probe.streams.some((stream: any) => stream.codec_type === 'video')).toBe(true);
  expect(Math.abs(Number(probe.format.duration) - 6.4)).toBeLessThan(.6);
  const ffmpeg = process.env.STUDY_FFMPEG ?? 'ffmpeg', path = (await video.path())!;
  const decoded = spawnSync(ffmpeg, ['-v', 'error', '-xerror', '-i', path, '-f', 'null', '-'], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  expect(decoded.status).toBe(0); expect(decoded.stdout.length).toBe(0);
  const eofParserMessage = /^\[opus @ [^\]]+\] Error parsing Opus packet header\.\s*$/u;
  let controlReceipt: { exit: number | null; stderr: string } | null = null;
  if (decoded.stderr.length) {
    // FFmpeg 8.0.1 also logs this parser EOF error for its own valid Opus file.
    // A different message, a codec error, or an absent independent control fails.
    expect(decoded.stderr.toString()).toMatch(eofParserMessage);
    const controlPath = join(directory, 'independent-opus-control.webm');
    execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1', '-c:a', 'libopus', '-y', controlPath], { windowsHide: true });
    const control = spawnSync(ffmpeg, ['-v', 'error', '-xerror', '-i', controlPath, '-f', 'null', '-'], { windowsHide: true });
    expect(control.status).toBe(0); expect(control.stderr.toString()).toMatch(eofParserMessage);
    controlReceipt = { exit: control.status, stderr: control.stderr.toString() };
  }
  const pcm = spawnSync(ffmpeg, ['-v', 'error', '-xerror', '-fflags', '+noparse+nofillin', '-i', path, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'],
    { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  expect(pcm.status).toBe(0); expect(pcm.stderr.toString()).toBe('');
  const samples = pcm.stdout.length / 4; expect(samples / 48000).toBeGreaterThanOrEqual(6.4);
  function marker(frequency: number, from: number, to: number) {
    let peak = 0;
    for (let offset = from; offset + 768 <= to; offset += 192) {
      let real = 0, imaginary = 0;
      for (let i = 0; i < 768; i++) { const value = pcm.stdout.readFloatLE((offset + i) * 4), angle = 2 * Math.PI * frequency * i / 48000; real += value * Math.cos(angle); imaginary += value * Math.sin(angle); }
      peak = Math.max(peak, Math.hypot(real, imaginary) / 768);
    }
    return peak;
  }
  const firstMarker = marker(1100 * 1.25, 0, Math.min(samples, 14400)), lastMarker = marker(1900 * 1.25, Math.max(0, samples - 14400), samples);
  expect(firstMarker).toBeGreaterThan(.003); expect(lastMarker).toBeGreaterThan(.003);
  writeFileSync(join(directory, 'decoder.json'), JSON.stringify({ defaultExit: decoded.status, defaultStderr: decoded.stderr.toString(), control: controlReceipt,
    pcmExit: pcm.status, pcmStderr: pcm.stderr.toString(), samples, durationSeconds: samples / 48000, firstMarker, lastMarker }, null, 2) + '\n');
  const subtitles = page.waitForEvent('download'); await page.getByRole('button', { name: '导出字幕' }).click(); const srt = readFileSync((await (await subtitles).path())!, 'utf8');
  copyFileSync((await (await subtitles).path())!, join(directory, 'decoded-fixture.srt'));
  expect(srt).toContain('00:00:00,000 --> 00:00:01,600'); expect(srt).toContain('00:00:04,800 --> 00:00:06,400');
  expect(srt).toContain('先统一单位'); expect(srt).toContain('保留新的独立观察');
  await expect(f.current).toContainText('先统一单位');
  await page.getByRole('slider').fill('1000'); await expect(f.current).toContainText('保留新的独立观察');
  // A later cancelled recording must not replace the saved video's caption table.
  await page.route('**/api/learning/studio/whiteboards/**/narration/**', async route => {
    const response = await route.fetch(); expect(response.status()).toBe(201);
    const original = await response.body(), longer = Buffer.concat([original, original.subarray(44, 16044)]);
    longer.writeUInt32LE(longer.length - 8, 4); longer.writeUInt32LE(longer.length - 44, 40);
    await route.fulfill({ response, body: longer, headers: { ...response.headers(), 'content-length': String(longer.length) } });
  });
  await page.getByRole('button', { name: '导出视频' }).click(); await expect(page.locator('.sa-whiteboard-notice')).toContainText('实时录制');
  await page.getByRole('button', { name: '取消导出' }).click();
  const retained = page.waitForEvent('download'); await page.getByRole('button', { name: '导出字幕' }).click();
  expect(readFileSync((await (await retained).path())!, 'utf8')).toContain('00:00:04,800 --> 00:00:06,400');
});

test('cancelling a recording releases it and never downloads a partial video', async ({ page }) => {
  await fixture(page); const downloads: string[] = []; page.on('download', download => downloads.push(download.suggestedFilename()));
  await page.getByRole('button', { name: '导出视频' }).click(); await expect(page.locator('.sa-whiteboard-notice')).toContainText('实时录制');
  await page.getByRole('button', { name: '取消导出' }).click(); await page.waitForTimeout(400); expect(downloads).toEqual([]);
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '关闭白板' }).click(); expect(downloads).toEqual([]);
});

test('seeking cancels old audio and ignores its late completion at the new reading position', async ({ page }) => {
  const f = await fixture(page); await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0]?.currentTime ?? 0)).toBeGreaterThan(.1);
  await page.getByRole('slider').fill('900'); await expect(f.current).toContainText('保留新的独立观察');
  expect(await page.evaluate(() => (window as any).__whiteboardAudio[0].paused)).toBe(true);
  await page.evaluate(() => (window as any).__whiteboardAudio[0].dispatchEvent(new Event('ended')));
  await expect(f.current).toContainText('保留新的独立观察'); await page.getByLabel('播放速度').selectOption('0.75');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio.at(-1)?.playbackRate)).toBe(.75);
});

test('revoked student access closes the private player before another frozen sentence can be fetched', async ({ page }) => {
  const f = await fixture(page); await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0]?.currentTime ?? 0)).toBeGreaterThan(.1);
  await f.call('/qa/whiteboard-media', { boardId: f.board.id, revoke: true }, f.actor.token);
  await page.getByRole('button', { name: '下一句' }).click(); await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '白板视频' })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__whiteboardAudio.every((audio: HTMLAudioElement) => audio.paused && !audio.getAttribute('src')))).toBe(true);
});

test('closing while export audio is pending aborts it and cannot download or reopen a late result', async ({ page }) => {
  await fixture(page); const downloads: string[] = []; page.on('download', download => downloads.push(download.suggestedFilename()));
  await page.getByLabel('旁白音色').selectOption('fixture-delay'); await page.getByRole('button', { name: '导出视频' }).click();
  await expect(page.locator('.sa-whiteboard-notice')).toContainText('准备音轨'); await page.getByRole('button', { name: '关闭白板' }).click();
  await page.waitForTimeout(2100); await expect(page.getByRole('dialog', { name: '白板视频' })).toHaveCount(0); expect(downloads).toEqual([]);
});

test('a recorder error releases resources, keeps the reading position and offers a retry without a partial download', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeRecorder = window.MediaRecorder;
    (window as any).MediaRecorder = class extends NativeRecorder {
      start(timeslice?: number) { super.start(timeslice); setTimeout(() => this.dispatchEvent(new Event('error')), 100); }
    };
  });
  const f = await fixture(page); const downloads: string[] = []; page.on('download', download => downloads.push(download.suggestedFilename()));
  await page.getByRole('button', { name: '下一句' }).click(); await page.getByRole('button', { name: '导出视频' }).click();
  await expect(page.locator('.sa-whiteboard-notice')).toContainText('录制中断'); expect(downloads).toEqual([]);
  await expect(f.current).toContainText('再合并份数'); await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
});
