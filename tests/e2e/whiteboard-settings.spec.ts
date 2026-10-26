import { expect, test, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { browserEvidence } from './evidence';
import sharp from 'sharp';
const manifest = JSON.parse(readFileSync(join(process.cwd(),'apps/web/public/classroom-voice-samples/manifest.json'),'utf8'));
const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4170') + '/api';
test.afterEach(async ({ page }) => page.unrouteAll({ behavior: 'wait' }));
async function fixture(page: Page) {
  const digest=createHash('sha256').update(test.info().testId).digest(),address='198.19.'+digest[0]+'.'+digest[1],principal='whiteboard-'+randomUUID()+'@local.test',credential='Synthetic-controls-only-20261027';
  await page.setExtraHTTPHeaders({'X-Forwarded-For':address});
  async function call(path:string,body:unknown,token?:string,method='POST') { const response=await fetch(api+path,{method,headers:{'Content-Type':'application/json','X-Forwarded-For':address,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});expect(response.ok,path+' '+response.status).toBe(true);return(await response.json()).data; }
  const actor=await call('/auth/register',{principal,credential}),child=(await call('/students',{nickname:'匿名设置验证',grade:5,preferredSessionMinutes:15,defaultVersionMap:{math:'common',chinese:'common',english:'common'}},actor.token)).profile.id;
  await call('/students/'+child+'/learning-scope',{subject:'math',grade:5,term:'upper',textbookVolumeId:null,textbookVersion:'合成范围',learnedAtomIds:['core:math:fractionadd'],currentAtomId:'core:math:fractionadd',minutesPerSession:15,progressMode:'knowledge',selectedLessonIds:[]},actor.token,'PUT');
  const input={studentId:child,subject:'math',prompt:'解释异分母分数加法',atomId:'core:math:fractionadd'},preview=await call('/learning/studio/whiteboards/preview',input,actor.token),saved=await call('/learning/studio/whiteboards',{...input,fingerprint:preview.fingerprint,requestKey:randomUUID()},actor.token),board=await call('/qa/whiteboard-media',{boardId:saved.id},actor.token);
  await page.route('**/api/learning/studio/overview?*',async route=>{const response=await route.fetch(),payload=await response.json();payload.data.narrationAvailable=true;payload.data.speech={available:true,provider:'minimax',defaultVoice:manifest.voices[0].voiceId,voices:manifest.voices.map((voice:any)=>({id:voice.voiceId,label:voice.providerName,language:voice.language,classroomPreset:voice.preset}))};await route.fulfill({response,json:payload});});
  await page.addInitScript(()=>{const NativeAudio=window.Audio;(window as any).settingsAudio=[];(window as any).Audio=function(src?:string){const audio=new NativeAudio(src);(window as any).settingsAudio.push(audio);return audio;};});
  await page.goto('/parent/login');await page.getByLabel('登录账号').fill(principal);await page.getByLabel('密码').fill(credential);await page.getByRole('button',{name:'登录，查看学习记录 →'}).click();await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  const href='/studio?student='+child+'&subject=math&whiteboard='+board.id;await page.goto(href);const player=page.getByRole('dialog',{name:'白板视频',exact:true});await expect(player).toHaveAttribute('data-original-font-status','ready');
  const current=player.locator('.wb-current-sentence');await expect(current).toContainText('先统一单位');return {player,current,href,board};
}

test('original settings: six actual neutral MP3s decode, previews preserve selection and closing releases audio',async({page})=>{
  await page.setViewportSize({width:1280,height:800});const f=await fixture(page),unit=await f.current.getAttribute('data-unit-id'),writes:string[]=[];page.on('request',request=>{if(request.method()==='POST')writes.push(request.url());});
  await f.player.getByRole('button',{name:'白板设置',exact:true}).click();const settings=page.getByRole('dialog',{name:'白板设置',exact:true});await expect(settings.getByRole('radio')).toHaveCount(6);
  await settings.evaluate(async element=>{await Promise.all(element.getAnimations().map(animation=>animation.finished));});
  expect((await settings.boundingBox())!.width).toBe(460);const selected=await f.player.getByRole('combobox',{name:'旁白音色',exact:true}).inputValue();
  const decoded=[];
  for(const voice of manifest.voices){await settings.getByRole('button',{name:'试听音色：'+voice.providerName,exact:true}).click();await expect.poll(()=>page.evaluate(()=>{const audio=(window as any).settingsAudio.at(-1) as HTMLAudioElement;return audio&&!audio.paused&&audio.currentTime>0;})).toBe(true);
    const result=await page.evaluate(()=>{const audio=(window as any).settingsAudio.at(-1) as HTMLAudioElement;return {duration:audio.duration,rate:audio.playbackRate};});expect(Math.abs(result.duration-voice.durationSeconds)).toBeLessThan(.25);decoded.push({voice:voice.preset,...result});
    await expect(f.player.getByRole('combobox',{name:'旁白音色',exact:true})).toHaveValue(selected);await expect(f.current).toHaveAttribute('data-unit-id',unit!);
  }
  await settings.getByRole('radio',{name:'Calm',exact:true}).click();await expect(f.player.getByRole('combobox',{name:'旁白音色',exact:true})).toHaveValue(manifest.voices.find((voice:any)=>voice.preset==='calm').voiceId);
  await settings.getByRole('button',{name:'停止试听：'+manifest.voices.find((voice:any)=>voice.preset==='calm').providerName,exact:true}).click();
  await settings.evaluate(async element=>{await Promise.allSettled(element.getAnimations({subtree:true}).filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished));});
  await page.screenshot({path:join(browserEvidence('whiteboard-settings'),'original-settings-1280.png')});
  await page.keyboard.press('Escape');await expect(settings).toHaveCount(0);await expect(f.player).toBeVisible();expect(await page.evaluate(()=>(window as any).settingsAudio.every((audio:HTMLAudioElement)=>audio.paused))).toBe(true);expect(writes).toEqual([]);
  await expect(f.player.getByRole('button',{name:'播放',exact:true})).toBeEnabled();writeFileSync(join(browserEvidence('whiteboard-settings'),'actual-neutral-clip-decode.json'),JSON.stringify({decoded,writes,unit},null,2)+'\n');
});

test('original settings: corrupt samples fail visibly, explicit retry works and a late closed sample never plays',async({page})=>{
  const f=await fixture(page),voice=manifest.voices[0],url='**/classroom-voice-samples/'+voice.file;await page.route(url,route=>route.fulfill({status:200,contentType:'audio/mpeg',body:Buffer.from('Changed sample')}));
  await f.player.getByRole('button',{name:'白板设置',exact:true}).click();const settings=page.getByRole('dialog',{name:'白板设置',exact:true});await settings.getByRole('button',{name:'试听音色：'+voice.providerName,exact:true}).click();await expect(settings.getByRole('status')).toContainText('与原样本不一致');expect(await page.evaluate(()=>(window as any).settingsAudio.length)).toBe(0);
  await page.unroute(url);await settings.getByRole('button',{name:'试听音色：'+voice.providerName,exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).settingsAudio.some((audio:HTMLAudioElement)=>!audio.paused))).toBe(true);
  await settings.getByRole('button',{name:'关闭白板设置',exact:true}).click();await f.player.getByRole('button',{name:'白板设置',exact:true}).click();let reached=false;
  await page.route(url,async route=>{reached=true;const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,800));try{await route.fulfill({response});}catch{}});
  await settings.getByRole('button',{name:'试听音色：'+voice.providerName,exact:true}).click();await expect.poll(()=>reached).toBe(true);await settings.getByRole('button',{name:'关闭白板设置',exact:true}).click();await page.waitForTimeout(1000);expect(await page.evaluate(()=>(window as any).settingsAudio.every((audio:HTMLAudioElement)=>audio.paused))).toBe(true);await expect(f.current).toContainText('先统一单位');
});

test('original settings: half speed restores, double speed records real WAV and frozen captions at matching durations',async({page})=>{
  const f=await fixture(page);await f.player.getByRole('button',{name:'白板设置',exact:true}).click();const settings=page.getByRole('dialog',{name:'白板设置',exact:true});await settings.getByRole('slider',{name:'白板语速',exact:true}).fill('0');await settings.getByRole('button',{name:'关闭白板设置',exact:true}).click();await expect(f.player.getByRole('combobox',{name:'播放速度',exact:true})).toHaveValue('0.5');
  await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).some(key=>key.includes('.location.v1.')&&JSON.parse(localStorage.getItem(key)!).speed===.5))).toBe(true);await page.reload();await expect(f.player.getByRole('combobox',{name:'播放速度',exact:true})).toHaveValue('0.5');
  await f.player.getByRole('button',{name:'播放',exact:true}).click();await expect.poll(()=>page.evaluate(()=>{const audio=(window as any).settingsAudio.find((audio:HTMLAudioElement)=>!audio.paused);return audio?.playbackRate;})).toBe(.5);await f.player.getByRole('button',{name:'暂停',exact:true}).click();
  const half=page.waitForEvent('download');await f.player.getByRole('button',{name:'导出字幕',exact:true}).click();expect(readFileSync((await(await half).path())!,'utf8')).toContain('00:00:12,000 --> 00:00:16,000');
  await f.player.getByRole('combobox',{name:'播放速度',exact:true}).selectOption('2');const video=page.waitForEvent('download');await f.player.getByRole('button',{name:'导出视频',exact:true}).click();const file=(await(await video).path())!,probe=JSON.parse(execFileSync(process.env.STUDY_FFPROBE??'ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{encoding:'utf8',windowsHide:true}));expect(probe.streams.some((stream:any)=>stream.codec_type==='audio')).toBe(true);expect(Math.abs(Number(probe.format.duration)-4)).toBeLessThan(.6);
  const subtitles=page.waitForEvent('download');await f.player.getByRole('button',{name:'导出字幕',exact:true}).click();const srt=readFileSync((await(await subtitles).path())!,'utf8');expect(srt).toContain('00:00:03,000 --> 00:00:04,000');const directory=browserEvidence('whiteboard-settings');copyFileSync(file,join(directory,'double-rate.webm'));writeFileSync(join(directory,'double-rate-probe.json'),JSON.stringify(probe,null,2)+'\n');writeFileSync(join(directory,'double-rate.srt'),srt);
});

for(const width of [390,1280])test('original settings: real seven-tool tour preserves position and focus at '+width,async({page})=>{
  await page.setViewportSize({width,height:800});const f=await fixture(page),unit=await f.current.getAttribute('data-unit-id'),writes:string[]=[];page.on('request',request=>{if(request.method()==='POST')writes.push(request.url());});
  await f.player.getByRole('button',{name:'白板设置',exact:true}).click();const settings=page.getByRole('dialog',{name:'白板设置',exact:true});
  await expect(settings.getByRole('button',{name:/Replay the tour/})).toBeVisible();await settings.getByRole('button',{name:/Replay the tour/}).click();await expect(settings).toHaveCount(0);
  const tour=page.getByRole('dialog',{name:'白板工具导览',exact:true});await tour.getByRole('button',{name:'开始导览',exact:true}).click();
  for(const[index,anchor]of ['connection','zoom','settings','sound','playback','history','notes'].entries()){
    const target=tour.locator('.cl-tour-target');await expect(target).toHaveAttribute('data-anchor',anchor);await expect(tour.locator('.cl-tour-unavailable')).toHaveCount(0);
    const bounds=(await target.boundingBox())!;expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.y).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width+1);expect(bounds.y+bounds.height).toBeLessThanOrEqual(801);
    await tour.getByRole('button',{name:index===6?/^完成/:/^下一步/}).click();
  }
  await tour.getByRole('button',{name:'返回白板',exact:true}).click();await expect(tour).toHaveCount(0);await expect(f.current).toHaveAttribute('data-unit-id',unit!);await expect(f.player.getByRole('button',{name:'白板设置',exact:true})).toBeFocused();expect(writes).toEqual([]);
});

test('reading panel: original380 width, pointer and keyboard bounds, viewport cap and collapsed preference restore without teaching writes',async({page})=>{
  await page.setViewportSize({width:1440,height:900});const f=await fixture(page),unit=await f.current.getAttribute('data-unit-id'),writes:string[]=[];
  page.on('request',request=>{if(request.method()==='POST')writes.push(request.url());});
  const separator=f.player.getByRole('separator',{name:'调整讲稿面板宽度',exact:true});await expect(separator).toHaveAttribute('aria-valuenow','380');
  expect((await f.player.locator('.hk-reading-panel').boundingBox())!.width).toBe(380);
  const bounds=(await separator.boundingBox())!;await page.mouse.move(bounds.x+bounds.width/2,450);await page.mouse.down();await page.mouse.move(700,450,{steps:6});await page.mouse.up();
  await expect(separator).toHaveAttribute('aria-valuenow','560');await expect(f.current).toHaveAttribute('data-unit-id',unit!);
  await page.setViewportSize({width:1200,height:900});await expect(separator).toHaveAttribute('aria-valuenow','504');expect((await f.player.locator('.hk-reading-panel').boundingBox())!.width).toBe(504);
  await page.setViewportSize({width:1440,height:900});await expect(separator).toHaveAttribute('aria-valuenow','560');
  await separator.focus();await page.keyboard.press('Home');await expect(separator).toHaveAttribute('aria-valuenow','300');await page.keyboard.press('End');await expect(separator).toHaveAttribute('aria-valuenow','560');await page.keyboard.press('ArrowRight');await expect(separator).toHaveAttribute('aria-valuenow','550');
  const toggle=f.player.locator('[data-panel-toggle]');await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(f.player.getByLabel('完整讲稿与要点')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('studyagent.whiteboard.layout.v1.')&&JSON.parse(localStorage.getItem(key)!).expanded===false))).toBe(true);
  await page.reload();await expect(f.player).toHaveAttribute('data-original-font-status','ready');await expect(toggle).toHaveAttribute('aria-expanded','false');await toggle.click();await expect(separator).toHaveAttribute('aria-valuenow','550');await expect(f.current).toHaveAttribute('data-unit-id',unit!);
  const preference=await page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key=>key.startsWith('studyagent.whiteboard.layout.v1.'))!)!));expect(Object.keys(preference).sort()).toEqual(['expanded','ownerId','version','width']);expect(writes).toEqual([]);
  await page.screenshot({path:join(browserEvidence('whiteboard-settings'),'reading-panel-1440.png')});
});

for(const width of [390,768])test('reading panel: explicit mobile entry contains focus, returns to the same sentence and closes only its own layer at '+width,async({page})=>{
  await page.setViewportSize({width,height:800});const f=await fixture(page),unit=await f.current.getAttribute('data-unit-id'),writes:string[]=[];page.on('request',request=>{if(request.method()==='POST')writes.push(request.url());});
  const toggle=f.player.getByRole('button',{name:'讲稿与笔记',exact:true});await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(f.player.getByLabel('完整讲稿与要点')).toBeHidden();
  await toggle.click();const reader=page.getByRole('dialog',{name:'讲稿与笔记',exact:true});await expect(reader).toBeVisible();await expect(reader.getByRole('button',{name:'返回白板画面',exact:true})).toBeFocused();
  expect(await reader.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);await page.keyboard.press('Shift+Tab');expect(await reader.evaluate(element=>element.contains(document.activeElement))).toBe(true);
  await page.screenshot({path:join(browserEvidence('whiteboard-settings'),'reading-panel-'+width+'.png')});await page.keyboard.press('Escape');await expect(reader).toHaveCount(0);await expect(f.player).toBeVisible();await expect(toggle).toBeFocused();await expect(f.current).toHaveAttribute('data-unit-id',unit!);
  await toggle.click();await reader.getByRole('button',{name:'返回白板画面',exact:true}).click();await expect(toggle).toBeFocused();expect(writes).toEqual([]);
});

test('reading panel: malformed or wrong-owner device preferences are rejected and blocked storage leaves resizing usable',async({page})=>{
  await page.setViewportSize({width:1280,height:800});const f=await fixture(page);
  await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('studyagent.whiteboard.layout.v1.'))!;localStorage.setItem(key,JSON.stringify({version:1,ownerId:'another-owner',width:560,expanded:false}));});
  await page.reload();const separator=f.player.getByRole('separator',{name:'调整讲稿面板宽度',exact:true});await expect(separator).toHaveAttribute('aria-valuenow','380');
  await page.addInitScript(()=>{const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Storage.prototype.getItem=function(key){if(key.startsWith('studyagent.whiteboard.layout.v1.'))throw new DOMException('Blocked','SecurityError');return get.call(this,key);};Storage.prototype.setItem=function(key,value){if(key.startsWith('studyagent.whiteboard.layout.v1.'))throw new DOMException('Blocked','QuotaExceededError');return set.call(this,key,value);};});
  await page.reload();await expect(f.player).toHaveAttribute('data-original-font-status','ready');await expect(separator).toHaveAttribute('aria-valuenow','380');await separator.focus();await page.keyboard.press('ArrowLeft');await expect(separator).toHaveAttribute('aria-valuenow','390');await expect(f.player.getByRole('button',{name:'播放',exact:true})).toBeEnabled();
});

test('share toolbar: a private link reopens the same board and a real PNG exactly decodes the visible frozen canvas',async({page,context})=>{
  await page.setViewportSize({width:1280,height:800});const f=await fixture(page),unit=await f.current.getAttribute('data-unit-id'),writes:string[]=[];page.on('request',request=>{if(request.method()==='POST')writes.push(request.url());});
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:new URL(page.url()).origin});
  const icon=JSON.parse(readFileSync(join(process.cwd(),'apps/web/public/reference/hyperknow-controls/manifest.json'),'utf8')).files[0],iconResponse=await page.request.get('/reference/hyperknow-controls/chat.svg');expect(iconResponse.status()).toBe(200);expect(createHash('sha256').update(await iconResponse.body()).digest('hex')).toBe(icon.sha256);await expect(f.player.locator('[data-panel-toggle] img')).toHaveJSProperty('naturalWidth',32);
  await expect(f.player.getByRole('button',{name:'上一页白板',exact:true})).toBeDisabled();await expect(f.player.getByRole('button',{name:'下一页白板',exact:true})).toBeDisabled();
  const trigger=f.player.getByRole('button',{name:'分享与导出',exact:true});await trigger.click();const menu=page.getByRole('dialog',{name:'分享与导出',exact:true});
  await expect(menu.locator('.whiteboard-share-menu-hint').first()).toHaveText('需要原账号的访问权限。');await menu.getByRole('button',{name:'复制白板链接',exact:true}).click();await expect(menu.getByRole('status')).toHaveText('链接已复制。');
  const copied=await page.evaluate(()=>navigator.clipboard.readText()),url=new URL(copied);expect(url.origin).toBe(new URL(page.url()).origin);expect([...url.searchParams.keys()].sort()).toEqual(['student','subject','whiteboard']);expect(url.searchParams.get('whiteboard')).toBe(f.board.id);
  await expect(menu.getByRole('button',{name:'复制白板链接',exact:true})).toBeFocused();await page.evaluate(()=>(document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);await expect(trigger).toBeFocused();await expect(f.player).toBeVisible();await expect(f.current).toHaveAttribute('data-unit-id',unit!);
  const canvas=f.player.locator('canvas').first(),before=Buffer.from((await canvas.evaluate(element=>(element as HTMLCanvasElement).toDataURL('image/png'))).split(',')[1],'base64');
  await trigger.click();const download=page.waitForEvent('download');await menu.getByRole('button',{name:'下载当前视图 PNG',exact:true}).click();const saved=(await(await download).path())!,actual=readFileSync(saved),expectedPixels=await sharp(before).raw().toBuffer(),actualPixels=await sharp(actual).raw().toBuffer();
  expect(createHash('sha256').update(actualPixels).digest('hex')).toBe(createHash('sha256').update(expectedPixels).digest('hex'));expect((await sharp(actual).metadata()).width).toBe(1280);await expect(f.current).toHaveAttribute('data-unit-id',unit!);expect(writes).toEqual([]);
  const directory=browserEvidence('whiteboard-settings');copyFileSync(saved,join(directory,'actual-current-view.png'));writeFileSync(join(directory,'current-view-pixel-check.json'),JSON.stringify({unit,pixelsSha256:createHash('sha256').update(actualPixels).digest('hex'),metadata:await sharp(actual).metadata(),writes},null,2)+'\n');
  await page.goto(copied);await expect(f.player).toHaveAttribute('data-original-font-status','ready');await expect(f.current).toHaveAttribute('data-unit-id',unit!);
});

test('share toolbar: closing during original PNG authorization fences a late reply and never downloads',async({page})=>{
  const f=await fixture(page),downloads:string[]=[];page.on('download',download=>downloads.push(download.suggestedFilename()));let reached=false;
  await page.route('**/api/learning/studio/overview?*',async route=>{reached=true;const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,700));try{await route.fulfill({response});}catch{}});
  await f.player.getByRole('button',{name:'分享与导出',exact:true}).click();await page.getByRole('dialog',{name:'分享与导出',exact:true}).getByRole('button',{name:'下载当前视图 PNG',exact:true}).click();
  await expect.poll(()=>reached).toBe(true);await f.player.getByRole('button',{name:'关闭白板',exact:true}).click();await page.waitForTimeout(1000);await expect(f.player).toHaveCount(0);expect(downloads).toEqual([]);
});

for(const width of [390,768,1280])test('share toolbar: every visible playback and toolbar control stays inside the actual viewport at '+width,async({page})=>{
  await page.setViewportSize({width,height:800});const f=await fixture(page);
  const clipped=await f.player.evaluate((element,width)=>[...element.querySelectorAll<HTMLElement>('.sa-whiteboard-controls button,.sa-whiteboard-controls select,.hk-board-tools button')].filter(node=>node.getClientRects().length>0).map(node=>({label:node.getAttribute('aria-label')||node.textContent,rect:node.getBoundingClientRect().toJSON()})).filter(row=>row.rect.x<0||row.rect.right>width+1||row.rect.y<0||row.rect.bottom>801),width);
  expect(clipped).toEqual([]);await f.player.getByRole('button',{name:'分享与导出',exact:true}).click();const menu=page.getByRole('dialog',{name:'分享与导出',exact:true}),bounds=(await menu.boundingBox())!;expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width+1);expect(bounds.y+bounds.height).toBeLessThanOrEqual(800);
  await page.screenshot({path:join(browserEvidence('whiteboard-settings'),'share-toolbar-'+width+'.png')});await page.keyboard.press('Escape');await expect(f.player).toBeVisible();
});
