import { expect, test, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { browserEvidence } from './evidence';
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
