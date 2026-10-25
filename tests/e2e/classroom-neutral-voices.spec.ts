import { test,expect,type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { browserEvidence } from './evidence';
const manifest=JSON.parse(readFileSync('apps/web/public/classroom-voice-samples/manifest.json','utf8'));
const evidence=browserEvidence('neutral-voices');let address=0;
const api='http://localhost:'+(process.env.E2E_API_PORT??'4107')+'/api';
async function enter(page:Page){
  const suffix=crypto.randomUUID(),principal='neutral-browser-'+suffix+'@local.test',credential='Neutral-QA-'+suffix;
  const registered=await fetch(api+'/auth/register',{method:'POST',headers:{'content-type':'application/json','X-Forwarded-For':'198.18.12.'+(++address)},body:JSON.stringify({principal,credential})});expect(registered.status).toBe(201);
  const actor=(await registered.json()).data;
  await page.addInitScript(()=>{
    localStorage.setItem('studyagent.classroom.tour','done');const NativeAudio=window.Audio;(window as any).__neutralAudio=[];
    window.Audio=class extends NativeAudio{constructor(src?:string){super(src);(window as any).__neutralAudio.push(this);}};
  });
  await page.route(/\/api\/learning\/classroom\/sessions(?:\/[^/?]+)?$/,async route=>{
    const response=await route.fetch(),body=await response.json();if(body.data?.lesson)body.data.speech={available:true,provider:'minimax',defaultVoice:manifest.voices[3].voiceId,
      preview:{version:manifest.version,text:manifest.text,model:manifest.model},voices:[...manifest.voices.map((voice:any)=>({id:voice.voiceId,label:voice.providerName,classroomPreset:voice.preset,description:voice.providerName,language:'普通话'})),
        {id:'Chinese (Mandarin)_Soft_Girl',label:'柔和少女'},{id:'wumei_yujie',label:'妩媚御姐'}]};
    await route.fulfill({response,json:body});
  });
  await page.goto('/parent/login');await page.getByLabel('登录账号').fill(principal);await page.getByLabel('密码').fill(credential);await page.getByRole('button',{name:'登录，查看学习记录 →'}).click();await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.goto('/studio/classroom?lesson=soc-1-1-1');await expect(page.locator('.cl-room')).toBeVisible();await page.getByRole('button',{name:'课堂设置',exact:true}).click();
  return {actor,settings:page.getByRole('dialog',{name:'课堂设置'})};
}
async function audio(page:Page){return page.evaluate(()=>(window as any).__neutralAudio.some((item:HTMLAudioElement)=>!item.paused));}
test.afterEach(async({page})=>{await page.unrouteAll({behavior:'wait'});});

test('a neutral sample decodes before the first lecture, changes no selection and sends only its fixed version',async({page})=>{
  let command:any,progress=0;await page.route('**/api/learning/classroom/sessions/*/voice-preview',async route=>{command=route.request().postDataJSON();const voice=manifest.voices.find((item:any)=>item.voiceId===command.voice);expect(voice).toBeTruthy();await route.fulfill({contentType:'audio/mpeg',path:resolve('apps/web/public/classroom-voice-samples',voice.file)});});
  const {settings}=await enter(page);page.on('request',request=>{if(request.method()==='PATCH'&&/\/classroom\/sessions\/[^/?]+$/.test(request.url()))progress++;});
  await expect(settings.getByRole('button',{name:'当前句',exact:true})).toBeDisabled();await expect(settings.getByRole('radio',{name:/Gentle/})).toHaveAttribute('aria-checked','true');
  await settings.getByRole('button',{name:'试听音色：温暖少女',exact:true}).click();await expect.poll(()=>audio(page)).toBe(true);
  expect(command).toEqual({voice:manifest.voices[0].voiceId,sampleVersion:manifest.version});expect(progress).toBe(0);await expect(settings.getByRole('radio',{name:/Gentle/})).toHaveAttribute('aria-checked','true');
  await settings.getByRole('button',{name:'1.5×',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__neutralAudio.find((item:HTMLAudioElement)=>!item.paused)?.playbackRate)).toBe(1.5);
  await settings.getByRole('button',{name:'停止试听：温暖少女',exact:true}).click();await expect.poll(()=>audio(page)).toBe(false);
});

test('closing the settings aborts an unfinished sample and its late audio cannot start',async({page})=>{
  let release!:()=>void,arrive!:()=>void;const hold=new Promise<void>(resolve=>release=resolve),arrival=new Promise<void>(resolve=>arrive=resolve);
  await page.route('**/api/learning/classroom/sessions/*/voice-preview',async route=>{arrive();await hold;try{await route.fulfill({contentType:'audio/mpeg',path:resolve('apps/web/public/classroom-voice-samples',manifest.voices[1].file)});}catch{/* The exact reader has aborted. */}});
  try{const {settings}=await enter(page);await settings.getByRole('button',{name:'试听音色：温润男声',exact:true}).click();await arrival;await settings.getByRole('button',{name:'关闭课堂设置',exact:true}).click();release();await expect(settings).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>(window as any).__neutralAudio.length)).toBe(0);}finally{release?.();}
});

test('failed neutral playback keeps an explicit retry and cannot advance or reveal the lesson',async({page})=>{
  let fail=true;await page.route('**/api/learning/classroom/sessions/*/voice-preview',route=>fail?route.fulfill({status:503,json:{data:null,error:{code:'unavailable',message:'Synthetic sample unavailable'}}}):route.fulfill({contentType:'audio/mpeg',path:resolve('apps/web/public/classroom-voice-samples',manifest.voices[0].file)}));
  const {settings}=await enter(page);await settings.getByRole('button',{name:'试听音色：温暖少女',exact:true}).click();await expect(settings.getByRole('status')).toContainText('试听暂不可用');fail=false;
  await settings.getByRole('button',{name:'试听音色：温暖少女',exact:true}).click();await expect.poll(()=>audio(page)).toBe(true);await expect(settings.getByRole('button',{name:'当前句',exact:true})).toBeDisabled();
});

test('a legacy voice can preview only the selected already-revealed frozen sentence',async({page})=>{
  let command:any;await page.route('**/api/learning/classroom/sessions/*/narration/*',async route=>{command=route.request().postDataJSON();await route.fulfill({contentType:'audio/mpeg',path:resolve('apps/web/public/classroom-voice-samples',manifest.voices[0].file)});});
  const {settings,actor}=await enter(page);await settings.getByRole('button',{name:'关闭课堂设置',exact:true}).click();await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await expect(page.locator('.cl-session-navigation')).toContainText('2 / 8');
  await page.getByRole('button',{name:'课堂设置',exact:true}).click();await settings.getByLabel('其他可用音色').selectOption('Chinese (Mandarin)_Soft_Girl');await expect(settings.getByRole('radio',{checked:true})).toHaveCount(0);
  await settings.getByRole('button',{name:'当前句',exact:true}).click();
  const currentResponse=await fetch(api+'/learning/classroom/sessions/'+new URL(page.url()).searchParams.get('session'),{headers:{authorization:'Bearer '+actor.token}});expect(currentResponse.status).toBe(200);
  const current=(await currentResponse.json()).data,unit=current.presentation.tracks[current.lesson.steps[current.cursor].id].units[current.sentenceCursor];
  await settings.getByRole('button',{name:'试听所选音色',exact:true}).click();await expect.poll(()=>audio(page)).toBe(true);
  expect(command).toMatchObject({voice:'Chinese (Mandarin)_Soft_Girl',sentenceIndex:current.sentenceCursor,presentationVersion:current.presentation.version,unitId:unit.id});expect(command).not.toHaveProperty('sampleVersion');
  await expect(settings.getByLabel('其他可用音色')).toHaveValue('Chinese (Mandarin)_Soft_Girl');await expect(page.locator('.cl-session-navigation')).toContainText('2 / 8');
});

for(const width of [390,768,1440])test('six real voice cards and preview controls fit at '+width,async({page})=>{
  await page.setViewportSize({width,height:1000});const {settings}=await enter(page);await expect(settings.getByRole('radio')).toHaveCount(6);await expect(settings.getByRole('button',{name:'试听音色：播报男声',exact:true})).toBeEnabled();
  const outer=page.locator('.ws-dialog-layer:has(.cl-settings)');await expect(outer).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(outer).toHaveCSS('backdrop-filter','none');
  await settings.getByRole('radio',{name:/Warm/}).focus();await page.keyboard.press('ArrowRight');await expect(settings.getByRole('radio',{name:/Calm/})).toBeFocused();expect(await page.evaluate(()=>(window as any).__neutralAudio.length)).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);if(!process.env.CI)await page.screenshot({path:evidence+'/settings-'+width+'.png'});
});
