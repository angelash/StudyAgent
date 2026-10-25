import { test,expect,type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { browserEvidence } from './evidence';
const api='http://localhost:'+(process.env.E2E_API_PORT??'4107')+'/api',evidence=browserEvidence('project-teaching'),manifest=JSON.parse(readFileSync('apps/web/public/classroom-voice-samples/manifest.json','utf8'));let address=0;
async function enter(page:Page){
  page.on('dialog',dialog=>void dialog.accept());const suffix=crypto.randomUUID(),principal='guided-project-'+suffix+'@local.test',credential='Guided-QA-'+suffix;
  const response=await fetch(api+'/auth/register',{method:'POST',headers:{'content-type':'application/json','X-Forwarded-For':'198.18.15.'+(++address)},body:JSON.stringify({principal,credential})});expect(response.status).toBe(201);const actor=(await response.json()).data;
  await page.goto('/parent/login');await page.getByLabel('登录账号').fill(principal);await page.getByLabel('密码').fill(credential);await page.getByRole('button',{name:'登录，查看学习记录 →'}).click();await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.goto('/studio/projects?unitId=soc-u1');await page.getByRole('button',{name:'开始这个项目 →',exact:true}).click();await expect(page.getByRole('region',{name:'当前项目步骤'})).toContainText('STEP 1 OF 5');
  const id=new URL(page.url()).searchParams.get('project')!;
  async function current(){const r=await fetch(api+'/learning/projects/'+id,{headers:{authorization:'Bearer '+actor.token}});expect(r.status).toBe(200);return(await r.json()).data;}
  return{actor,id,current};
}
test.afterEach(async({page})=>{if(!page.isClosed())await page.unrouteAll({behavior:'wait'});});

test('guided original fields save before moving, keep the full work and submit one frozen stage',async({page})=>{
  const f=await enter(page);await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await expect(page.getByRole('textbox',{name:'匿名情境与已知观察',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'下一步 ›',exact:true}).click();const confirm=page.getByRole('dialog',{name:'当前步骤尚未完成'});await expect(confirm).toBeVisible();await confirm.getByRole('button',{name:'留在这一步'}).click();await expect(page.getByRole('textbox',{name:'匿名情境与已知观察',exact:true})).toBeFocused();
  await page.getByRole('textbox',{name:'匿名情境与已知观察',exact:true}).fill('匿名图书馆观察：两次排队的规则不同，事实和解释分开。');await page.getByRole('button',{name:'下一步 ›',exact:true}).click();
  await page.getByRole('textbox',{name:'可以研究的问题',exact:true}).fill('比较两个时间段的排队规则，核查资源与进入条件。');await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await expect(page.getByRole('region',{name:'当前项目步骤'})).toContainText('整理证据与附件');
  await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await expect(page.getByRole('region',{name:'当前项目步骤'})).toContainText('自评与提交');
  const criteria=page.locator('.pj-reflection .pj-ratings fieldset');for(let i=0;i<await criteria.count();i++){await criteria.nth(i).locator('.pj-levels label').nth(1).click();await criteria.nth(i).locator('textarea').fill('依据是当前匿名观察，仍需在新条件下验证。');}
  await page.getByRole('button',{name:'提交这个阶段 →',exact:true}).click();await expect(page.getByRole('button',{name:/已提交 1\/3/})).toContainText('人工复核 0/3');
  const saved=await f.current();expect(saved.submissions).toHaveLength(1);expect(saved.reviews).toHaveLength(0);await page.getByRole('button',{name:'完整作品',exact:true}).click();await expect(page.getByRole('textbox',{name:'匿名情境与已知观察',exact:true})).toHaveValue(/图书馆/);await expect(page.getByRole('textbox',{name:'可以研究的问题',exact:true})).toHaveValue(/两个时间段/);
  await page.getByRole('button',{name:'逐步学习这个项目 →',exact:true}).click();await page.reload();await expect(page.getByRole('region',{name:'当前项目步骤'})).toContainText('STEP 5 OF 5');expect((await f.current()).submissions).toHaveLength(1);
});

test('an unsaved local field survives reload and a different tab requires an explicit comparison before saving',async({page,context})=>{
  const f=await enter(page);await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await page.getByRole('textbox',{name:'匿名情境与已知观察',exact:true}).fill('本机尚未保存的完整观察');await page.reload();await expect(page.getByRole('textbox',{name:'匿名情境与已知观察',exact:true})).toHaveValue('本机尚未保存的完整观察');
  const other=await context.newPage();other.on('dialog',dialog=>void dialog.accept());await other.goto(page.url());await other.getByRole('textbox',{name:'匿名情境与已知观察',exact:true}).fill('另一个页面明确保存的新观察');await other.getByRole('button',{name:'保存阶段草稿',exact:true}).click();await expect(other.getByText('草稿和自评准备已保存。',{exact:true})).toBeVisible();
  // Each document preserves its own buffer even after another tab saves remotely.
  await page.getByRole('textbox',{name:'匿名情境与已知观察',exact:true}).fill('本机保留的完整观察与新补充');await page.reload();const comparison=page.getByRole('region',{name:'项目草稿版本对照'});await expect(comparison).toBeVisible();await expect(comparison.getByRole('region',{name:'本机项目稿'})).toContainText('本机保留的完整观察与新补充');await expect(comparison.getByRole('region',{name:'服务器项目稿'})).toContainText('另一个页面明确保存的新观察');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载副本并继续本机稿',exact:true}).click();expect((await download).suggestedFilename()).toContain('草稿');await page.getByRole('button',{name:'保存阶段草稿',exact:true}).click();await expect(page.getByText('草稿和自评准备已保存。',{exact:true})).toBeVisible();expect((await f.current()).drafts.question.values.scene).toBe('本机保留的完整观察与新补充');await other.close();
});

test('independent unsaved tab copies survive reload even when a duplicated tab inherits sessionStorage',async({page,context})=>{
  await enter(page);await page.getByRole('button',{name:'下一步 ›',exact:true}).click();const input=page.getByRole('textbox',{name:'匿名情境与已知观察',exact:true});await input.fill('第一标签独立未保存稿');
  const inherited=await page.evaluate(()=>sessionStorage.getItem('studyagent.project.document-slot')!);const other=await context.newPage();other.on('dialog',dialog=>void dialog.accept());await other.addInitScript(value=>{if(!sessionStorage.getItem('duplicate-initialized')){sessionStorage.setItem('studyagent.project.document-slot',value);sessionStorage.setItem('duplicate-initialized','1');}},inherited);await other.goto(page.url());
  const second=other.getByRole('textbox',{name:'匿名情境与已知观察',exact:true});await expect(second).toHaveValue('第一标签独立未保存稿');await second.fill('复制标签独立未保存稿');await input.fill('第一标签后续补充');
  await page.reload();await other.reload();await expect(input).toHaveValue('第一标签后续补充');await expect(second).toHaveValue('复制标签独立未保存稿');await other.close();
});

test('hard closing without beforeunload preserves the input effect and reopening offers an explicit copy preview',async({page,context})=>{
  await enter(page);await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await page.getByRole('textbox',{name:'匿名情境与已知观察',exact:true}).fill('硬关闭页面仍保留的独立观察');const url=page.url();
  await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('studyagent.project.draft.v1.')&&localStorage.getItem(key)?.includes('硬关闭页面仍保留的独立观察')))).toBe(true);
  await page.close({runBeforeUnload:false});const reopened=await context.newPage();await reopened.goto(url);const input=reopened.getByRole('textbox',{name:'匿名情境与已知观察',exact:true});await expect(input).toHaveValue('');const copies=reopened.getByLabel('其他本机项目副本',{exact:true});await copies.locator('summary').click();await copies.getByRole('button',{name:'查看本机副本',exact:true}).click();const preview=reopened.getByRole('dialog',{name:'本机副本预览'});await expect(preview).toContainText('硬关闭页面仍保留的独立观察');
  const download=reopened.waitForEvent('download');await preview.getByRole('button',{name:'下载副本并恢复这份草稿'}).click();await download;await expect(input).toHaveValue('硬关闭页面仍保留的独立观察');await reopened.close();
});

test('two pending original commands use separate slots and confirming one preserves the other',async({page,context})=>{
  const f=await enter(page);await page.getByRole('button',{name:'下一步 ›',exact:true}).click();const other=await context.newPage();other.on('dialog',dialog=>void dialog.accept());await other.goto(page.url());await expect(other.getByRole('textbox',{name:'匿名情境与已知观察',exact:true})).toBeVisible();
  for(const tab of [page,other]){await tab.route('**/api/learning/projects/'+f.id,async route=>{if(route.request().method()!=='PATCH')return route.continue();await route.fetch();await route.abort('failed');});await tab.route('**/api/learning/projects/'+f.id+'/requests/*',route=>route.abort('failed'));}
  await page.getByRole('textbox',{name:'匿名情境与已知观察',exact:true}).fill('第一原操作内容');await page.getByRole('button',{name:'保存阶段草稿',exact:true}).click();await expect(page.getByRole('region',{name:'项目原操作恢复'})).toBeVisible();
  await other.getByRole('textbox',{name:'匿名情境与已知观察',exact:true}).fill('第二原操作内容');await other.getByRole('button',{name:'保存阶段草稿',exact:true}).click();await expect(other.getByRole('region',{name:'项目原操作恢复'})).toBeVisible();
  const commands=()=>page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('studyagent.project.command.v1.')).map(key=>JSON.parse(localStorage.getItem(key)!)));expect(await commands()).toHaveLength(2);expect(new Set((await commands()).map(command=>command.body.requestKey)).size).toBe(2);
  await page.unroute('**/api/learning/projects/'+f.id+'/requests/*');await page.getByRole('button',{name:'读取并恢复原操作'}).click();await expect(page.getByRole('region',{name:'项目原操作恢复'})).toHaveCount(0);const remaining=await commands();expect(remaining).toHaveLength(1);expect(remaining[0].body.artifact.values.scene).toBe('第二原操作内容');await other.reload();await expect(other.getByRole('region',{name:'项目原操作恢复'})).toBeVisible();await expect(other.getByRole('textbox',{name:'匿名情境与已知观察',exact:true})).toHaveValue('第二原操作内容');await other.close();
});

test('unavailable project storage keeps the live input and offers a full download',async({page})=>{
  await page.addInitScript(()=>{const native=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('studyagent.project.draft.')||key.startsWith('studyagent.project.command.'))throw new DOMException('QA quota','QuotaExceededError');return native.call(this,key,value);};});
  await enter(page);await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await page.getByRole('textbox',{name:'匿名情境与已知观察',exact:true}).fill('存储不可用时仍保留的作品');await expect(page.getByText('本机暂存不可用，当前输入仍在页面中；离开前请下载完整副本。',{exact:true})).toBeVisible();const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载项目与本机稿副本'}).click();const result=JSON.parse(readFileSync((await(await download).path())!,'utf8'));expect(result.localDraft.artifact.values.scene).toBe('存储不可用时仍保留的作品');
});

test('a mismatched owner draft is preserved but never restored or offered as another copy',async({page})=>{
  await enter(page);await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await page.getByRole('textbox',{name:'匿名情境与已知观察',exact:true}).fill('原本机稿');
  const poisoned=await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('studyagent.project.draft.v1.'))!,record=JSON.parse(localStorage.getItem(key)!);record.ownerId='another-actor';record.editor.artifact.values.scene='禁止展示的异账号正文';const raw=JSON.stringify(record);localStorage.setItem(key,raw);return{key,raw};});await page.reload();await expect(page.getByRole('textbox',{name:'匿名情境与已知观察',exact:true})).toHaveValue('');await expect(page.getByText(/本机草稿与当前账号、项目或版本不匹配/)).toBeVisible();await expect(page.getByText('禁止展示的异账号正文',{exact:true})).toHaveCount(0);await expect(page.getByLabel('其他本机项目副本',{exact:true})).toHaveCount(0);expect(await page.evaluate(key=>localStorage.getItem(key),poisoned.key)).toBe(poisoned.raw);
});

for(const endpoint of ['teaching','narration'])test('observed denied '+endpoint+' clears old project content and narration',async({page})=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  if(endpoint==='teaching')await page.route('**/api/learning/projects/*/teaching',async route=>{await gate;await route.fulfill({status:403,json:{error:{code:'forbidden',message:'QA revoked'}}});});
  else{await page.route('**/api/learning/projects/*/teaching',async route=>{const response=await route.fetch(),body=await response.json();body.data.speech={available:true,provider:'minimax',defaultVoice:manifest.voices[0].voiceId,voices:[{id:manifest.voices[0].voiceId,label:'测试音色'}]};await route.fulfill({response,json:body});});await page.route('**/api/learning/projects/*/narration',route=>route.fulfill({status:401,json:{error:{code:'unauthorized',message:'QA expired'}}}));}
  try{await enter(page);}finally{release();}if(endpoint==='narration')await page.getByRole('button',{name:'▷ 朗读本步骤',exact:true}).click();await expect(page.getByText('项目访问权限已变化，请返回课程或重新登录。',{exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'当前项目步骤'})).toHaveCount(0);await expect(page.locator('.pj-artifact')).toHaveCount(0);
});

test('a lost save reply survives reload, reads the same actor receipt and preserves later local edits',async({page})=>{
  const f=await enter(page);await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await page.getByRole('textbox',{name:'匿名情境与已知观察',exact:true}).fill('第一次保存的原观察');
  await page.route('**/api/learning/projects/'+f.id,async route=>{if(route.request().method()!=='PATCH')return route.continue();await route.fetch();await route.abort('failed');});await page.route('**/api/learning/projects/'+f.id+'/requests/*',route=>route.abort('failed'));
  await page.getByRole('button',{name:'保存阶段草稿',exact:true}).click();await expect(page.getByRole('region',{name:'项目原操作恢复'})).toContainText('原操作仍待核对');await page.getByRole('textbox',{name:'匿名情境与已知观察',exact:true}).fill('保存之后仍在本机继续编辑的内容');await page.reload();await expect(page.getByRole('region',{name:'项目原操作恢复'})).toBeVisible();
  await page.unroute('**/api/learning/projects/'+f.id);await page.unroute('**/api/learning/projects/'+f.id+'/requests/*');let writes=0;page.on('request',request=>{if(request.method()==='PATCH'&&request.url()===api+'/learning/projects/'+f.id)writes++;});
  await page.getByRole('button',{name:'读取并恢复原操作',exact:true}).click();await expect(page.getByRole('region',{name:'项目原操作恢复'})).toHaveCount(0);await expect(page.getByRole('textbox',{name:'匿名情境与已知观察',exact:true})).toHaveValue('保存之后仍在本机继续编辑的内容');expect(writes).toBe(0);expect((await f.current()).revision).toBe(1);
});

test('a lost submission reply reloads its original receipt without creating a second frozen submission',async({page})=>{
  const f=await enter(page);await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await page.getByRole('textbox',{name:'匿名情境与已知观察',exact:true}).fill('匿名观察与已知条件');await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await page.getByRole('textbox',{name:'可以研究的问题',exact:true}).fill('比较条件并寻找反例');await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await page.getByRole('button',{name:'下一步 ›',exact:true}).click();
  for(const field of await page.locator('.pj-reflection .pj-ratings fieldset').all()){await field.getByRole('radio').nth(1).check();await field.locator('textarea').fill('当前记录支持初步判断，仍需独立验证。');}
  let posts=0;await page.route('**/api/learning/projects/'+f.id+'/submissions',async route=>{posts++;const response=await route.fetch();expect(response.status()).toBe(201);await route.abort('failed');});await page.route('**/api/learning/projects/'+f.id+'/requests/*',route=>route.abort('failed'));await page.getByRole('button',{name:'提交这个阶段 →',exact:true}).click();await expect(page.getByRole('region',{name:'项目原操作恢复'})).toBeVisible();await page.reload();await page.unroute('**/api/learning/projects/'+f.id+'/requests/*');await page.getByRole('button',{name:'读取并恢复原操作'}).click();await expect(page.getByRole('region',{name:'项目原操作恢复'})).toHaveCount(0);expect(posts).toBe(1);expect((await f.current()).submissions).toHaveLength(1);await expect(page.locator('.pj-history-row')).toHaveCount(1);
});

test('an unavailable step link returns to the frozen stage introduction without writing progress',async({page})=>{
  const f=await enter(page),before=await f.current(),url=new URL(page.url());url.searchParams.set('step','field:unrelated');await page.goto(url.toString());await expect(page.getByRole('region',{name:'当前项目步骤'})).toContainText('STEP 1 OF 5');await expect(page.getByText('链接中的教学步骤已不可用，已返回本阶段导向。',{exact:true})).toBeVisible();expect(new URL(page.url()).searchParams.get('step')).toBe('intro');expect(await f.current()).toEqual(before);
});

for(const width of [390,768,1440])test('project teaching, original fields and controls fit at '+width,async({page})=>{
  await page.setViewportSize({width,height:1000});await enter(page);await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await expect(page.getByRole('textbox',{name:'匿名情境与已知观察',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await expect(page.getByRole('button',{name:'下一步 ›',exact:true})).toBeInViewport();if(!process.env.CI)await page.screenshot({path:evidence+'/field-'+width+'.png',fullPage:true});
});

test('project audio decodes original samples, does not save progress and stops when the selected step changes',async({page})=>{
  await page.addInitScript(()=>{const NativeAudio=window.Audio;(window as any).__projectAudio=[];window.Audio=class extends NativeAudio{constructor(src?:string){super(src);(window as any).__projectAudio.push(this);}};});
  await page.route('**/api/learning/projects/*/teaching',async route=>{const response=await route.fetch(),body=await response.json();body.data.speech={available:true,provider:'minimax',defaultVoice:manifest.voices[0].voiceId,voices:manifest.voices.map((voice:any)=>({id:voice.voiceId,label:voice.providerName}))};await route.fulfill({response,json:body});});
  let command:any;await page.route('**/api/learning/projects/*/narration',async route=>{command=route.request().postDataJSON();await route.fulfill({contentType:'audio/mpeg',path:resolve('apps/web/public/classroom-voice-samples',manifest.voices[0].file)});});
  const f=await enter(page),before=await f.current();await page.getByRole('button',{name:'▷ 朗读本步骤',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__projectAudio.some((audio:HTMLAudioElement)=>!audio.paused))).toBe(true);expect(command).not.toHaveProperty('text');expect(command).toMatchObject({stageId:'question',stepId:'intro',sentenceIndex:0,version:'project-teaching-v1'});
  await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await expect(page.getByRole('textbox',{name:'匿名情境与已知观察',exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>(window as any).__projectAudio.every((audio:HTMLAudioElement)=>audio.paused))).toBe(true);expect(await f.current()).toEqual(before);
});
