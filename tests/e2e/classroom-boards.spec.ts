import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { browserEvidence } from './evidence';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const api = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}/api`, evidence = browserEvidence('classroom-boards');
let address = 0;
const board = (page: Page) => page.locator('.cl-ai-board').last();
async function enter(page: Page) {
  const id = Date.now() + '-' + Math.floor(Math.random()*100000), principal = 'boards-' + id + '@local.test', credential = 'Boards-only-' + id;
  const registration = await fetch(api + '/auth/register', {method:'POST', headers:{'Content-Type':'application/json','X-Forwarded-For':'198.18.2.'+(++address)},body:JSON.stringify({principal,credential})});
  expect(registration.status).toBe(201); const actor = (await registration.json()).data;
  await page.addInitScript(()=>localStorage.setItem('studyagent.classroom.tour','done'));
  await page.route(/\/api\/learning\/classroom\/sessions\/[^/?]+$/, async route=>{
    const response=await route.fetch(),body=await response.json();
    if(body.data?.lesson)body.data.speech={available:true,provider:'minimax',defaultVoice:'synthetic',voices:[{id:'synthetic',label:'合成测试声线'}]};
    await route.fulfill({response,json:body});
  });
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button',{name:'登录，查看学习记录 →'}).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.goto('/studio/classroom?lesson=soc-1-1-1'); await expect(page.getByLabel('向课堂老师提问')).toBeVisible();
  await page.getByRole('button',{name:'下一步 ›',exact:true}).click();
  await expect(page.locator('.cl-session-navigation')).toContainText('2 / 8'); await expect(page.locator('.cl-subtitle')).not.toContainText('准备好后');
  return actor;
}
async function ask(page:Page,message='[board-table] 请比较两种平均分法。') {
  await page.getByLabel('向课堂老师提问').fill(message); await page.getByRole('button',{name:'发送课堂问题'}).click();
  await expect(page.locator('.cl-turn-status')).toContainText('回答已保存'); await expect(board(page)).toContainText('平均分的两种分法');
}
function wav() { const samples=16000,bytes=Buffer.alloc(44+samples*2); bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVE',8);bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt32LE(32000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples*2,40);return bytes; }
async function screen(page:Page,name:string) {if(!process.env.CI){mkdirSync(evidence,{recursive:true});await page.screenshot({path:evidence+'/'+name+'.png',fullPage:true});}}

test('text reading reveals whole points, rows and formulas; stop restores the original line and complete notes',async({page})=>{
  await enter(page); const original=await page.locator('.cl-subtitle').innerText(); let audioCalls=0;
  await page.route('**/api/learning/classroom/sessions/*/narration/*',route=>{audioCalls++;return route.fulfill({contentType:'audio/wav',body:wav()});});
  await ask(page); await page.getByRole('button',{name:'按句阅读这段回答',exact:true}).click();
  await expect(page.locator('.cl-subtitle')).toHaveText('先固定总量。'); await expect(board(page).locator('.cl-board-item')).toHaveCount(1);
  await expect(board(page).locator('tbody tr')).toHaveCount(0); await expect(board(page).locator('math')).toHaveCount(0);
  await expect(page.locator('.cl-subtitle')).toHaveText('第一种分法是十二颗分成三组。');
  await expect(board(page).locator('tbody tr')).toHaveCount(1); await expect(board(page).locator('tbody tr').first()).toHaveText('1234');
  await expect(page.locator('.cl-subtitle')).toHaveText('第二种分法是十二颗分成四组。'); await expect(board(page).locator('tbody tr')).toHaveCount(2);
  await expect(board(page).locator('math')).toHaveCount(0);
  await expect(page.locator('.cl-subtitle')).toHaveText('平均每份等于总量除以份数。'); await expect(board(page).locator('math')).toHaveCount(1);
  await page.getByRole('button',{name:'■ 停止阅读',exact:true}).click(); await expect(page.locator('.cl-subtitle')).toHaveText(original);
  await page.waitForTimeout(1600); await expect(page.locator('.cl-subtitle')).toHaveText(original);expect(audioCalls).toBe(0);
  await page.reload(); await expect(board(page).locator('tbody tr')).toHaveCount(2); await expect(board(page).locator('math')).toHaveCount(1);
});

test('audio ended advances frozen units, abort settles a pending reader and a new reply rejects late audio',async({page})=>{
  await enter(page); await ask(page); const original=await page.locator('.cl-subtitle').innerText();
  await page.evaluate(()=>{const instances:any[]=[];class ControlledAudio{playbackRate=1;onended:(()=>void)|null=null;onerror:(()=>void)|null=null;paused=false;constructor(public src:string){instances.push(this);}play(){return Promise.resolve();}pause(){this.paused=true;}}Object.assign(window,{Audio:ControlledAudio,__replyAudios:instances});});
  const requests:any[]=[];await page.route('**/api/learning/classroom/sessions/*/narration/*',async route=>{requests.push(route.request().postDataJSON());await route.fulfill({contentType:'audio/wav',body:wav()});});
  await page.getByRole('button',{name:'♪ 朗读这段回答',exact:true}).click(); await expect(page.locator('.cl-subtitle')).toHaveText('先固定总量。');
  await expect(board(page).locator('tbody tr')).toHaveCount(0);
  await page.evaluate(()=>(window as any).__replyAudios.at(-1).onended());await expect(page.locator('.cl-subtitle')).toHaveText('第一种分法是十二颗分成三组。');await expect(board(page).locator('tbody tr')).toHaveCount(1);
  expect(requests[0].presentationVersion).toBe('speech-v2');expect(requests[0].unitId).not.toBe(requests[1].unitId);
  await page.getByRole('button',{name:'■ 停止朗读',exact:true}).click(); await expect(page.locator('.cl-subtitle')).toHaveText(original);
  expect(await page.evaluate(()=>(window as any).__replyAudios.every((audio:any)=>audio.onended===null&&audio.onerror===null))).toBe(true);
  await ask(page,'[board-table] 再比较一遍。');
  let release!:()=>void,arrived!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;}),arrival=new Promise<void>(resolve=>{arrived=resolve;});
  await page.unroute('**/api/learning/classroom/sessions/*/narration/*');
  await page.route('**/api/learning/classroom/sessions/*/narration/*',async route=>{arrived();await held;try{await route.fulfill({contentType:'audio/wav',body:wav()});}catch{/* Deliberate request abort. */}});
  await page.getByRole('button',{name:'♪ 朗读这段回答',exact:true}).first().click();await arrival;
  await page.getByRole('button',{name:'按句阅读这段回答',exact:true}).last().click();release();
  await expect(page.locator('.cl-subtitle')).toHaveText('先固定总量。');await expect(page.getByRole('button',{name:'■ 停止阅读',exact:true})).toHaveCount(1);
  await page.getByRole('button',{name:'■ 停止阅读',exact:true}).click();await page.waitForTimeout(1500);await expect(page.locator('.cl-subtitle')).toHaveText(original);
});

test('complete notes, cross-page reply navigation, keyboard activation and narrow layouts remain usable',async({page})=>{
  await enter(page);await ask(page);
  for(let index=0;index<3;index++)await page.getByRole('button',{name:'下一步 ›',exact:true}).click();
  await expect(page.locator('.cl-ai-board')).toHaveCount(0);
  const read=page.getByRole('button',{name:'按句阅读这段回答',exact:true});await read.focus();await page.keyboard.press('Enter');
  await expect(board(page)).toBeInViewport({ratio:0.2});await expect(board(page).locator('tbody tr')).toHaveCount(0);
  await board(page).getByRole('button',{name:'展开完整笔记'}).focus();await page.keyboard.press('Enter');await expect(board(page).locator('tbody tr')).toHaveCount(2);await expect(board(page).locator('math')).toHaveCount(1);
  await page.getByRole('button',{name:'■ 停止阅读',exact:true}).click();
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:width===390?844:1000});if(width===390)await page.getByRole('button',{name:'白板',exact:true}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await expect(board(page).locator('tbody tr')).toHaveCount(2);await board(page).evaluate(element=>element.scrollIntoView({block:'start',behavior:'instant'}));await screen(page,'comparison-'+width);}
});

test('untrusted table/formula text stays inert in the board, actual offline HTML, Markdown and print',async({page,context})=>{
  await enter(page);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await ask(page,'[board-xss] 用表格比较。');
  await expect(board(page).locator('tbody')).toContainText('<img src=x onerror=');await expect(board(page).locator('img,script,iframe,a')).toHaveCount(0);await expect(board(page).locator('math')).toHaveCount(1);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出课堂笔记',exact:true}).click();const html=await download,path=await html.path();expect(html.suggestedFilename()).toContain('含图表.html');const content=readFileSync(path!,'utf8');
  expect(content).toContain('&lt;img');expect(content).not.toContain('<img src=x');expect(content).not.toContain('<script');expect(content).toContain('<math');expect(content).not.toContain('sourceSha256');
  const localHtml=resolve(evidence,'offline-notes-'+Date.now()+'.html');await html.saveAs(localHtml);const offline=await context.newPage(),network:string[]=[];offline.on('request',request=>{if(/^https?:/.test(request.url()))network.push(request.url());});await offline.goto(pathToFileURL(localHtml).href);await expect(offline.locator('table tbody tr')).toHaveCount(2);await expect(offline.locator('math')).toHaveCount(1);expect(await offline.evaluate(()=>(window as any).__boardXss)).toBeUndefined();expect(network).toEqual([]);await offline.close();
  await page.getByRole('button',{name:'课堂设置',exact:true}).click();const mdDownload=page.waitForEvent('download');await page.getByRole('button',{name:'导出 Markdown 文字笔记',exact:true}).click();const md=await mdDownload,mdText=readFileSync((await md.path())!,'utf8');expect(md.suggestedFilename()).toMatch(/\.md$/);expect(mdText).toContain('| 总量 | 份数 | 每份 |');expect(mdText).toContain('$$');expect(mdText).toContain('&lt;img');
  await page.evaluate(()=>Object.assign(window,{__printCalls:0,print:()=>{(window as any).__printCalls++;}}));await page.getByRole('button',{name:'打印 / 保存 PDF 笔记',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__printCalls)).toBe(1);
  await page.emulateMedia({media:'print'});await expect(page.locator('.cl-print-notes tbody tr')).toHaveCount(2);await expect(page.locator('.cl-print-notes math')).toHaveCount(1);await expect(page.locator('.cl-print-notes')).toBeVisible();expect(await page.locator('.cl-print-notes .cl-board-item').first().evaluate(element=>getComputedStyle(element).animationName)).toBe('none');await screen(page,'comparison-print');
  expect(await page.evaluate(()=>(window as any).__boardXss)).toBeUndefined();expect(errors).toEqual([]);
});
