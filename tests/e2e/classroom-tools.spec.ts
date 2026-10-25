import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { browserEvidence } from './evidence';

const api = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}/api`, evidence = browserEvidence('classroom-tools');
let address = 0;
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });
async function enter(page: Page, firstTour = false) {
  const id = crypto.randomUUID(), principal = 'tools-' + id + '@local.test', credential = 'Tools-only-' + id;
  const registered = await fetch(api + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.18.8.' + (++address) }, body: JSON.stringify({ principal, credential }) });
  expect(registered.status).toBe(201);
  if (!firstTour) await page.addInitScript(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.goto('/studio/classroom?lesson=soc-1-1-1');
  await expect(page.getByLabel('向课堂老师提问')).toBeAttached();
}
async function replay(page: Page) {
  await page.getByRole('button', { name: '课堂设置', exact: true }).click();
  await page.getByRole('button', { name: /Replay the tour/ }).click();
  await expect(page.getByRole('dialog', { name: '课堂新手引导' })).toBeVisible();
}
async function screen(page: Page, name: string) { if (!process.env.CI) { mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: evidence + '/' + name + '.png' }); } }
async function fittedCard(page: Page) {
  const box = await page.locator('.cl-tour-card').boundingBox(), viewport = page.viewportSize()!;
  expect(box).not.toBeNull(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1); expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}
async function fullReader(page: Page) {
  const viewport = page.viewportSize()!;
  const bounds = await page.locator('.cl-figure-reader').boundingBox();
  expect(bounds).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });
}

test('anchored tour visits actual controls, resizes and returns without issuing learning or voice requests', async ({ page }) => {
  await page.setViewportSize({ width: 880, height: 887 }); await enter(page, true);
  let writes = 0, narration = 0;
  page.on('request', req => { if (/\/classroom\/sessions\/[^/?]+$/.test(req.url()) && req.method() === 'PATCH') writes++; if (req.url().includes('/narration/')) narration++; });
  const tour = page.getByRole('dialog', { name: '课堂新手引导' });
  await expect(tour).toContainText('欢迎来到白板课堂'); await tour.getByRole('button', { name: '开始导览' }).click();
  const anchors = ['connection', 'notes', 'settings', 'sound', 'microphone', 'playback', 'history'];
  for (let n = 0; n < anchors.length; n++) {
    await expect(page.locator('.cl-tour-target')).toHaveAttribute('data-anchor', anchors[n]);
    await expect(tour.getByRole('status')).toHaveAttribute('aria-label', '第' + (n + 1) + '步，共7步');
    const actual = await page.locator('[data-classroom-tour="' + anchors[n] + '"]').boundingBox();
    const frame = await page.locator('.cl-tour-target').boundingBox();
    expect(actual).not.toBeNull(); expect(frame!.x).toBeLessThanOrEqual(actual!.x); expect(frame!.y).toBeLessThanOrEqual(actual!.y);
    expect(frame!.x + frame!.width).toBeGreaterThanOrEqual(actual!.x + actual!.width - 1);
    const skip = (await tour.getByRole('button', { name: '跳过', exact: true }).boundingBox())!;
    expect(skip.x + skip.width <= frame!.x || skip.x >= frame!.x + frame!.width || skip.y + skip.height <= frame!.y || skip.y >= frame!.y + frame!.height).toBe(true);
    await fittedCard(page);
    if (n === 2) { await screen(page, 'tour-settings-880'); await page.setViewportSize({ width: 1440, height: 1000 }); await fittedCard(page); }
    if (n === 3) { await page.setViewportSize({ width: 768, height: 1000 }); await fittedCard(page); await screen(page, 'tour-sound-768'); }
    if (n === 6) { await page.setViewportSize({ width: 1440, height: 1000 }); await fittedCard(page); await screen(page, 'tour-history-1440'); }
    await tour.getByRole('button', { name: n === 6 ? '完成 →' : '下一步 →', exact: true }).click();
  }
  await expect(tour).toContainText('准备好了'); await tour.getByRole('button', { name: '返回课堂' }).click();
  await expect(tour).toHaveCount(0); await expect(page.getByRole('button', { name: '继续讲解', exact: true })).toBeVisible();
  expect(writes).toBe(0); expect(narration).toBe(0);
  await replay(page); await page.keyboard.press('Escape'); await expect(tour).toHaveCount(0);
  await expect(page.getByRole('button', { name: '课堂设置', exact: true })).toBeFocused();
});

test('phone tour exposes the real chat controls then restores the original board and survives unavailable storage', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await enter(page, true);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('QA storage disabled', 'QuotaExceededError'); }; });
  const room = page.locator('.cl-room'), tour = page.getByRole('dialog', { name: '课堂新手引导' });
  await tour.getByRole('button', { name: '开始导览' }).click();
  for (let n = 0; n < 4; n++) await tour.getByRole('button', { name: '下一步 →', exact: true }).click();
  await expect(room).toHaveAttribute('data-mobile', 'chat'); await expect(page.locator('.cl-tour-target')).toHaveAttribute('data-anchor', 'microphone');
  await fittedCard(page); await screen(page, 'tour-microphone-390');
  await page.keyboard.press('Tab'); await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.cl-guided-tour'))).toBe(true);
  await page.keyboard.press('Escape'); await expect(tour).toHaveCount(0); await expect(room).toHaveAttribute('data-mobile', 'board');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('controlled figures and curriculum images retain their content, contain focus and support reading and printing', async ({ page }) => {
  await page.route(/\/api\/learning\/classroom\/sessions(?:\/[^/?]+)?$/, async route => {
    const response = await route.fetch(), body = await response.json();
    if (body.data?.lesson) body.data.speech = { available: true, provider: 'minimax', defaultVoice: 'synthetic', voices: [{ id: 'synthetic', label: '合成测试声线' }] };
    await route.fulfill({ response, json: body });
  });
  await page.route('**/api/learning/classroom/sessions/*/narration/*', route => route.fulfill({ contentType: 'audio/wav', body: wav() }));
  await page.setViewportSize({ width: 1440, height: 1000 }); await enter(page);
  await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
  await expect(page.locator('.cl-session-navigation')).toContainText('2 / 8');
  const image = page.getByRole('button', { name: '放大图片：传记与历史的交汇点 · 社会学想象力', exact: true });
  await image.click(); const reader = page.getByRole('dialog', { name: '传记与历史的交汇点 · 社会学想象力', exact: true });
  await reader.getByRole('img').click(); await expect(reader).toBeVisible(); await fullReader(page);
  await page.setViewportSize({ width: 390, height: 844 }); await fullReader(page); await screen(page, 'curriculum-image-390');
  await page.locator('.cl-figure-reader').click({ position: { x: 3, y: 3 } }); await expect(reader).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 }); await expect(image).toBeFocused();
  await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
  await expect(page.locator('.cl-session-navigation')).toContainText('3 / 8');
  await page.getByRole('button', { name: '继续讲解', exact: true }).click(); await expect(page.getByRole('button', { name: '暂停讲解', exact: true })).toBeVisible();
  const enlarge = page.getByRole('button', { name: '放大图形：相同现象，不同分析层次', exact: true });
  await enlarge.click(); const figure = page.getByRole('dialog', { name: '相同现象，不同分析层次', exact: true });
  await expect(figure.getByRole('img')).toBeVisible(); await figure.getByRole('img').click(); await expect(figure).toBeVisible(); await fullReader(page);
  await page.keyboard.press('Tab'); await expect(figure.getByRole('button', { name: '关闭图片' })).toBeFocused();
  await screen(page, 'controlled-figure-1440'); await page.keyboard.press('Escape'); await expect(figure).toHaveCount(0); await expect(enlarge).toBeFocused();
  await expect(page.getByRole('button', { name: '继续讲解', exact: true })).toBeVisible(); await expect(page.locator('.cl-session-navigation')).toContainText('3 / 8');
  await enlarge.click(); await page.emulateMedia({ media: 'print' }); await expect(page.locator('.cl-figure-reader')).toBeHidden();
  await expect(page.locator('.cl-print-notes .cl-figure-open')).toHaveCount(0);
});

test('a failed curriculum image still has a readable alternative and a keyboard exit', async ({ page }) => {
  await page.route('**/classroom/venn-d8b3f1.webp', route => route.abort('failed'));
  await enter(page); await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
  const image = page.getByRole('button', { name: '放大图片：传记与历史的交汇点 · 社会学想象力', exact: true });
  await image.click(); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('图片暂未能打开');
  await page.keyboard.press('Escape'); await expect(image).toBeFocused(); await expect(page.getByRole('dialog')).toHaveCount(0);
});

function wav() { const samples=16000*3, bytes=Buffer.alloc(44+samples*2);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVE',8);bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt32LE(32000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples*2,40);return bytes; }
test('voice samples decode actual audio, keep the selected voice and original progress, and cannot play after settings closes', async ({ page }) => {
  await page.setViewportSize({ width: 880, height: 887 });
  await page.addInitScript(() => { const NativeAudio=window.Audio;(window as any).__sampleAudio=[];window.Audio=class extends NativeAudio{constructor(src?:string){super(src);(window as any).__sampleAudio.push(this);}}; });
  await page.route(/\/api\/learning\/classroom\/sessions(?:\/[^/?]+)?$/, async route => {
    const response=await route.fetch(), body=await response.json();if(body.data?.lesson)body.data.speech={available:true,provider:'minimax',defaultVoice:'qa-Warm',voices:['Warm','Calm','Bright','Gentle','Professional','Lively'].map(label=>({id:'qa-'+label,label}))};
    await route.fulfill({response,json:body});
  });
  let release!:()=>void, delivered!:()=>void;const hold=new Promise<void>(resolve=>release=resolve), delivery=new Promise<void>(resolve=>delivered=resolve);let holdCalm=false;
  await page.route('**/api/learning/classroom/sessions/*/narration/*',async route=>{if(holdCalm&&route.request().postDataJSON().voice==='qa-Calm')await hold;try{await route.fulfill({contentType:'audio/wav',body:wav()});}catch{/* The closed reader has aborted its request. */}finally{if(holdCalm)delivered();}});
  try {
  await enter(page);await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await expect(page.locator('.cl-session-navigation')).toContainText('2 / 8');
  let writes=0;page.on('request',req=>{if(req.method()==='PATCH'&&/\/classroom\/sessions\/[^/?]+$/.test(req.url()))writes++;});
  await page.getByRole('button',{name:'课堂设置',exact:true}).click();const settings=page.getByRole('dialog',{name:'课堂设置'});
  await expect(settings.getByRole('radio')).toHaveCount(6);await expect(settings.getByRole('radio',{name:/Warm/})).toHaveAttribute('aria-checked','true');
  await settings.getByRole('button',{name:'试听音色：Calm',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__sampleAudio.some((audio:HTMLAudioElement)=>!audio.paused))).toBe(true);
  await expect(settings.getByRole('radio',{name:/Warm/})).toHaveAttribute('aria-checked','true');
  await settings.getByRole('button',{name:'1.5×',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__sampleAudio.at(-1)?.playbackRate)).toBe(1.5);
  await settings.getByRole('button',{name:'停止试听：Calm',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__sampleAudio.every((audio:HTMLAudioElement)=>audio.paused))).toBe(true);
  const slider=settings.getByRole('slider',{name:'课堂语速'});await slider.focus();await page.keyboard.press('ArrowLeft');await expect(slider).toHaveAttribute('aria-valuetext','1.25倍速');
  expect((await settings.boundingBox())!.width).toBe(460);await screen(page,'voice-settings-880');
  await page.setViewportSize({width:768,height:1000});await screen(page,'voice-settings-768');
  await page.setViewportSize({width:390,height:844});await screen(page,'voice-settings-390');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);holdCalm=true;
  await settings.getByRole('button',{name:'试听音色：Calm',exact:true}).click();await expect(settings.getByRole('button',{name:'停止试听：Calm',exact:true})).toBeVisible();
  await settings.getByRole('button',{name:'关闭课堂设置'}).click();release();await delivery;
  await expect.poll(()=>page.evaluate(()=>(window as any).__sampleAudio.length)).toBe(1);await expect(page.locator('.cl-session-navigation')).toContainText('2 / 8');expect(writes).toBe(0);
  } finally { release(); }
});
