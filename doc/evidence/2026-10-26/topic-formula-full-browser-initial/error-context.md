# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: whiteboard-media.spec.ts >> real WAV ended drives cloud playback, pause retains audio time and late ended cannot move a new sentence
- Location: tests\e2e\whiteboard-media.spec.ts:58:5

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.wb-current-sentence')
Expected substring: "再合并份数"
Received string:    "[whiteboard-fixture] 保留新的独立观察。"
Timeout: 5000ms

Call log:
  - Expect "toContainText" locator('.wb-current-sentence') with timeout 5000ms
  - waiting for locator('.wb-current-sentence')
    7 × locator resolved to <p aria-live="polite" aria-atomic="true" class="wb-current-sentence" data-unit-id="wb1:9705e08232efded424605c7cb0e8fa2a30cb8ab1d9d4851a5e725dbd3db28124:scene%3A1:0:27">[whiteboard-fixture] 先统一单位。</p>
      - unexpected value "[whiteboard-fixture] 先统一单位。"
    4 × locator resolved to <p aria-live="polite" aria-atomic="true" class="wb-current-sentence" data-unit-id="wb1:9705e08232efded424605c7cb0e8fa2a30cb8ab1d9d4851a5e725dbd3db28124:scene%3A1:56:82">[whiteboard-fixture] 最后验证。</p>
      - unexpected value "[whiteboard-fixture] 最后验证。"
    3 × locator resolved to <p aria-live="polite" aria-atomic="true" class="wb-current-sentence" data-unit-id="wb1:9705e08232efded424605c7cb0e8fa2a30cb8ab1d9d4851a5e725dbd3db28124:scene%3A2:0:30">[whiteboard-fixture] 保留新的独立观察。</p>
      - unexpected value "[whiteboard-fixture] 保留新的独立观察。"

```

```yaml
- paragraph: "[whiteboard-fixture] 保留新的独立观察。"
```

# Test source

```ts
  1   | import { expect, test, type Page } from '@playwright/test';
  2   | import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
  3   | import { execFileSync, spawnSync } from 'node:child_process';
  4   | import { createHash } from 'node:crypto';
  5   | import { browserEvidence } from './evidence';
  6   | import { join } from 'node:path';
  7   | 
  8   | const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107');
  9   | const credential = 'Synthetic-whiteboard-only-20261026';
  10  | async function fixture(page: Page) {
  11  |   const principal = 'whiteboard-' + crypto.randomUUID() + '@local.test';
  12  |   const bucket = createHash('sha256').update(test.info().testId).digest(), address = '198.19.' + bucket[0] + '.' + bucket[1];
  13  |   await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address });
  14  |   async function call(path: string, body?: unknown, actor?: string, method = 'POST') {
  15  |     const response = await fetch(api + '/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address, ...(actor ? { Authorization: 'Bearer ' + actor } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  16  |     expect(response.ok, path + ': ' + response.status).toBe(true); return (await response.json()).data;
  17  |   }
  18  |   const actor = await call('/auth/register', { principal, credential });
  19  |   const child = await call('/students', { nickname: '匿名白板验证', grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }, actor.token);
  20  |   const studentId = child.profile.id;
  21  |   await call('/students/' + studentId + '/learning-scope', { subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null, textbookVersion: '合成已学范围', learnedAtomIds: ['core:math:fractionadd'], currentAtomId: 'core:math:fractionadd', minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [] }, actor.token, 'PUT');
  22  |   const draft = { studentId, subject: 'math', prompt: '解释异分母分数加法', atomId: 'core:math:fractionadd' };
  23  |   const preview = await call('/learning/studio/whiteboards/preview', draft, actor.token);
  24  |   const saved = await call('/learning/studio/whiteboards', { ...draft, fingerprint: preview.fingerprint, requestKey: crypto.randomUUID() }, actor.token);
  25  |   const board = await call('/qa/whiteboard-media', { boardId: saved.id }, actor.token);
  26  |   await page.route('**/api/learning/studio/overview?*', async route => {
  27  |     const response = await route.fetch(); if (!response.ok()) { await route.fulfill({ response }); return; }
  28  |     const payload = await response.json(); payload.data.narrationAvailable = true;
  29  |     payload.data.speech = { available: true, provider: 'minimax', defaultVoice: 'fixture-a', voices: [
  30  |       { id: 'fixture-a', label: '合成音轨 A' }, { id: 'fixture-delay', label: '受控延迟音轨' }, { id: 'fixture-fail', label: '受控失败音轨' },
  31  |     ] }; await route.fulfill({ response, json: payload });
  32  |   });
  33  |   await page.addInitScript(() => {
  34  |     const NativeAudio = window.Audio; (window as any).__whiteboardAudio = [];
  35  |     (window as any).Audio = function (src?: string) { const audio = new NativeAudio(src); (window as any).__whiteboardAudio.push(audio); return audio; };
  36  |   });
  37  |   await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  38  |   await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  39  |   const href = '/studio?' + new URLSearchParams({ student: studentId, subject: 'math', whiteboard: board.id });
  40  |   await page.goto(href); await expect(page.locator('.wb-current-sentence')).toContainText('先统一单位');
  41  |   return { actor, board, studentId, href, call, current: page.locator('.wb-current-sentence') };
  42  | }
  43  | 
  44  | test('complete sentence, complete notes, paused text reading and explicit sentence navigation', async ({ page }) => {
  45  |   const f = await fixture(page); await page.getByLabel('阅读方式').selectOption('text');
  46  |   await expect(f.current).not.toContainText('最后验证'); await expect(page.locator('.wb-reading-notes ol li')).toHaveCount(4);
  47  |   await expect(page.getByLabel('完整讲稿与要点')).toContainText('完整正文末行');
  48  |   await page.getByRole('button', { name: '播放', exact: true }).click();
  49  |   await expect.poll(() => page.getByRole('slider').inputValue()).not.toBe('0');
  50  |   await page.getByRole('button', { name: '暂停', exact: true }).click(); const at = await page.getByRole('slider').inputValue();
  51  |   await page.waitForTimeout(250); expect(await page.getByRole('slider').inputValue()).toBe(at);
  52  |   await page.getByRole('button', { name: '下一句' }).click(); await expect(f.current).toContainText('再合并份数');
  53  |   await expect(page.locator('.wb-reading-notes [aria-current=step]')).toHaveText('[whiteboard-fixture] 再合并份数。');
  54  |   await page.getByRole('button', { name: '上一句' }).click(); await expect(f.current).toContainText('先统一单位');
  55  |   await page.getByRole('button', { name: '关闭白板' }).click(); await expect(page.getByRole('dialog', { name: '白板视频' })).toHaveCount(0);
  56  | });
  57  | 
  58  | test('real WAV ended drives cloud playback, pause retains audio time and late ended cannot move a new sentence', async ({ page }) => {
  59  |   const f = await fixture(page); await page.getByRole('button', { name: '播放', exact: true }).click();
  60  |   await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0]?.currentTime ?? 0)).toBeGreaterThan(.15);
  61  |   await expect(f.current).toContainText('先统一单位'); // Original nominal scene duration is only 10ms.
  62  |   await page.getByRole('button', { name: '暂停', exact: true }).click();
  63  |   const before = await page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime);
  64  |   await page.waitForTimeout(250); expect(await page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime)).toBeCloseTo(before, 1);
  65  |   await page.getByRole('button', { name: '播放', exact: true }).click();
  66  |   await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime)).toBeGreaterThan(before);
> 67  |   await expect(f.current).toContainText('再合并份数', { timeout: 5000 });
      |                           ^ Error: expect(locator).toContainText(expected) failed
  68  |   await page.getByRole('button', { name: '暂停', exact: true }).click();
  69  |   await page.evaluate(() => (window as any).__whiteboardAudio[0].dispatchEvent(new Event('ended')));
  70  |   await expect(f.current).toContainText('再合并份数');
  71  |   await page.getByRole('button', { name: '关闭白板' }).click();
  72  |   expect(await page.evaluate(() => (window as any).__whiteboardAudio.every((audio: HTMLAudioElement) => audio.paused && !audio.getAttribute('src')))).toBe(true);
  73  | });
  74  | 
  75  | test('voice switch fences delayed requests and an audio failure offers explicit retry or text reading', async ({ page }) => {
  76  |   const f = await fixture(page); await page.getByLabel('旁白音色').selectOption('fixture-delay');
  77  |   await page.getByRole('button', { name: '播放', exact: true }).click(); await expect(page.getByRole('status').last()).toContainText('正在准备当前句');
  78  |   await page.getByLabel('旁白音色').selectOption('fixture-fail'); await page.waitForTimeout(2100);
  79  |   expect(await page.evaluate(() => (window as any).__whiteboardAudio.length)).toBe(0);
  80  |   await page.getByRole('button', { name: '播放', exact: true }).click(); await expect(page.locator('.sa-whiteboard-notice')).toContainText('重试或选择文字');
  81  |   await expect(f.current).toContainText('先统一单位'); await page.getByLabel('阅读方式').selectOption('text');
  82  |   await page.getByRole('button', { name: '播放', exact: true }).click(); await expect.poll(() => page.getByRole('slider').inputValue()).not.toBe('0');
  83  | });
  84  | 
  85  | test('reopening a paused cloud sentence restores its known audio time in the verified original board', async ({ page }) => {
  86  |   const f = await fixture(page); await page.getByRole('button', { name: '播放', exact: true }).click();
  87  |   await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0]?.currentTime ?? 0)).toBeGreaterThan(.35);
  88  |   await page.getByRole('button', { name: '暂停', exact: true }).click();
  89  |   const at = await page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime);
  90  |   await page.waitForTimeout(1700); await page.reload(); await expect(f.current).toContainText('先统一单位');
  91  |   await page.getByRole('button', { name: '播放', exact: true }).click();
  92  |   await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0]?.currentTime ?? 0)).toBeGreaterThan(at - .05);
  93  |   expect(await page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime)).toBeLessThan(at + .6);
  94  | });
  95  | 
  96  | test('scoped local resume and complete accessible notes fit phone, tablet and desktop', async ({ page }) => {
  97  |   const f = await fixture(page); await page.getByRole('button', { name: '下一句' }).click();
  98  |   await expect(f.current).toContainText('再合并份数'); await page.waitForTimeout(1700); await page.reload();
  99  |   await expect(f.current).toContainText('再合并份数'); await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
  100 |   const stored = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('studyagent.whiteboard.location.v1.')));
  101 |   expect(stored).toHaveLength(1); expect(stored[0][1]).not.toContain('再合并份数');
  102 |   for (const width of [390, 768, 1440]) {
  103 |     await page.setViewportSize({ width, height: 1000 }); await expect(f.current).toBeVisible();
  104 |     expect(await page.locator('.wb-sentence-player').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  105 |   }
  106 |   await page.getByRole('button', { name: '关闭白板' }).click();
  107 |   await page.evaluate(([key, value]) => localStorage.setItem(key, JSON.stringify({ ...JSON.parse(value), fingerprint: 'b'.repeat(64) })), stored[0]);
  108 |   await page.reload(); await expect(f.current).toContainText('先统一单位'); await expect(page.locator('.sa-whiteboard-notice')).toContainText('版本不符');
  109 | });
  110 | 
  111 | test('actual WebM has a decoded audio track and the same complete SRT timeline at the selected speed', async ({ page }) => {
  112 |   const f = await fixture(page); await page.getByLabel('播放速度').selectOption('1.25');
  113 |   const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出视频' }).click(); const video = await download;
  114 |   const directory = browserEvidence('whiteboard-media'); copyFileSync((await video.path())!, join(directory, 'decoded-fixture.webm'));
  115 |   const probe = JSON.parse(execFileSync(process.env.STUDY_FFPROBE ?? 'ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', (await video.path())!], { encoding: 'utf8', windowsHide: true }));
  116 |   expect(probe.streams.some((stream: any) => stream.codec_type === 'audio')).toBe(true);
  117 |   expect(probe.streams.some((stream: any) => stream.codec_type === 'video')).toBe(true);
  118 |   expect(Math.abs(Number(probe.format.duration) - 6.4)).toBeLessThan(.6);
  119 |   const ffmpeg = process.env.STUDY_FFMPEG ?? 'ffmpeg', path = (await video.path())!;
  120 |   const decoded = spawnSync(ffmpeg, ['-v', 'error', '-xerror', '-i', path, '-f', 'null', '-'], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  121 |   expect(decoded.status).toBe(0); expect(decoded.stdout.length).toBe(0);
  122 |   const eofParserMessage = /^\[opus @ [^\]]+\] Error parsing Opus packet header\.\s*$/u;
  123 |   let controlReceipt: { exit: number | null; stderr: string } | null = null;
  124 |   if (decoded.stderr.length) {
  125 |     // FFmpeg 8.0.1 also logs this parser EOF error for its own valid Opus file.
  126 |     // A different message, a codec error, or an absent independent control fails.
  127 |     expect(decoded.stderr.toString()).toMatch(eofParserMessage);
  128 |     const controlPath = join(directory, 'independent-opus-control.webm');
  129 |     execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1', '-c:a', 'libopus', '-y', controlPath], { windowsHide: true });
  130 |     const control = spawnSync(ffmpeg, ['-v', 'error', '-xerror', '-i', controlPath, '-f', 'null', '-'], { windowsHide: true });
  131 |     expect(control.status).toBe(0); expect(control.stderr.toString()).toMatch(eofParserMessage);
  132 |     controlReceipt = { exit: control.status, stderr: control.stderr.toString() };
  133 |   }
  134 |   const pcm = spawnSync(ffmpeg, ['-v', 'error', '-xerror', '-fflags', '+noparse+nofillin', '-i', path, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'],
  135 |     { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  136 |   expect(pcm.status).toBe(0); expect(pcm.stderr.toString()).toBe('');
  137 |   const samples = pcm.stdout.length / 4; expect(samples / 48000).toBeGreaterThanOrEqual(6.4);
  138 |   function marker(frequency: number, from: number, to: number) {
  139 |     let peak = 0;
  140 |     for (let offset = from; offset + 768 <= to; offset += 192) {
  141 |       let real = 0, imaginary = 0;
  142 |       for (let i = 0; i < 768; i++) { const value = pcm.stdout.readFloatLE((offset + i) * 4), angle = 2 * Math.PI * frequency * i / 48000; real += value * Math.cos(angle); imaginary += value * Math.sin(angle); }
  143 |       peak = Math.max(peak, Math.hypot(real, imaginary) / 768);
  144 |     }
  145 |     return peak;
  146 |   }
  147 |   const firstMarker = marker(1100 * 1.25, 0, Math.min(samples, 14400)), lastMarker = marker(1900 * 1.25, Math.max(0, samples - 14400), samples);
  148 |   expect(firstMarker).toBeGreaterThan(.003); expect(lastMarker).toBeGreaterThan(.003);
  149 |   writeFileSync(join(directory, 'decoder.json'), JSON.stringify({ defaultExit: decoded.status, defaultStderr: decoded.stderr.toString(), control: controlReceipt,
  150 |     pcmExit: pcm.status, pcmStderr: pcm.stderr.toString(), samples, durationSeconds: samples / 48000, firstMarker, lastMarker }, null, 2) + '\n');
  151 |   const subtitles = page.waitForEvent('download'); await page.getByRole('button', { name: '导出字幕' }).click(); const srt = readFileSync((await (await subtitles).path())!, 'utf8');
  152 |   copyFileSync((await (await subtitles).path())!, join(directory, 'decoded-fixture.srt'));
  153 |   expect(srt).toContain('00:00:00,000 --> 00:00:01,600'); expect(srt).toContain('00:00:04,800 --> 00:00:06,400');
  154 |   expect(srt).toContain('先统一单位'); expect(srt).toContain('保留新的独立观察');
  155 |   await expect(f.current).toContainText('先统一单位');
  156 |   await page.getByRole('slider').fill('1000'); await expect(f.current).toContainText('保留新的独立观察');
  157 |   // A later cancelled recording must not replace the saved video's caption table.
  158 |   await page.route('**/api/learning/studio/whiteboards/**/narration/**', async route => {
  159 |     const response = await route.fetch(); expect(response.status()).toBe(201);
  160 |     const original = await response.body(), longer = Buffer.concat([original, original.subarray(44, 16044)]);
  161 |     longer.writeUInt32LE(longer.length - 8, 4); longer.writeUInt32LE(longer.length - 44, 40);
  162 |     await route.fulfill({ response, body: longer, headers: { ...response.headers(), 'content-length': String(longer.length) } });
  163 |   });
  164 |   await page.getByRole('button', { name: '导出视频' }).click(); await expect(page.locator('.sa-whiteboard-notice')).toContainText('实时录制');
  165 |   await page.getByRole('button', { name: '取消导出' }).click();
  166 |   const retained = page.waitForEvent('download'); await page.getByRole('button', { name: '导出字幕' }).click();
  167 |   expect(readFileSync((await (await retained).path())!, 'utf8')).toContain('00:00:04,800 --> 00:00:06,400');
```