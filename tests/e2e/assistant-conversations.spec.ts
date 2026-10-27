import { test,expect,type Page } from '@playwright/test';
import { mkdirSync,readFileSync } from 'node:fs';
import { browserEvidence } from './evidence';
const api='http://localhost:'+(process.env.E2E_API_PORT??'4107')+'/api',evidence=browserEvidence('assistant-conversations');let address=0;
async function call(actor:any,path:string,body?:unknown){const response=await fetch(api+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+actor.token},...(body===undefined?{}:{body:JSON.stringify(body)})});const x=await response.json();expect(response.ok,JSON.stringify(x.error)).toBe(true);return x.data;}
async function setup(page:Page,kind:'practice'|'diagnostic'='practice'){
  const id=crypto.randomUUID(),principal='answer-assistant-browser-'+id+'@local.test',credential='Assistant-only-'+id;
  const registered=await fetch(api+'/auth/register',{method:'POST',headers:{'content-type':'application/json','X-Forwarded-For':'198.18.9.'+(++address)},body:JSON.stringify({principal,credential})});expect(registered.status).toBe(201);const actor=(await registered.json()).data;
  const child=(await call(actor,'/students',{nickname:'匿名助教验收',grade:3,preferredSessionMinutes:15,defaultVersionMap:{math:'',chinese:'',english:''}})).profile;
  const fixture=await call(actor,'/qa/answer-journeys',{studentId:child.id,mode:'numeric_blank',kind});
  await page.goto('/parent/login');await page.getByLabel('登录账号').fill(principal);await page.getByLabel('密码').fill(credential);await page.getByRole('button',{name:'登录，查看学习记录 →'}).click();await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.goto(fixture.href);await expect(page.getByLabel('数字或分数答案')).toBeVisible();await open(page);
  const assistantId=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('studyagent.assistant.v1.')).map(k=>JSON.parse(localStorage.getItem(k)!)).find(v=>v.sessionId)?.sessionId);
  expect(assistantId).toBeTruthy();return {actor,child,...fixture,assistantId};
}
async function open(page:Page){await page.getByRole('button',{name:/^打开学习(?:小助教|观察助教)$/}).click();await expect(page.getByLabel('想一起看看什么')).toBeEnabled();}
const panel=(page:Page)=>page.locator('.learning-assistant'),task=(page:Page)=>page.getByRole('region',{name:'提问任务'});
async function send(page:Page,message:string){await page.getByLabel('想一起看看什么').fill(message);await panel(page).getByRole('button',{name:'一起想一想 →',exact:true}).click();}
async function shot(page:Page,name:string){if(!process.env.CI){mkdirSync(evidence,{recursive:true});await page.screenshot({path:evidence+'/'+name+'.png'});}}
test.afterEach(async({page})=>{await page.unrouteAll({behavior:'wait'});});

test('Auto names the actual platform default and a later composer choice preserves the original saved model',async({page})=>{
  const f=await setup(page),select=page.getByRole('combobox',{name:'选择大模型',exact:true}),posts:any[]=[];
  page.on('request',r=>{if(r.method()==='POST'&&/\/ai\/assistant\/sessions\/[^/?]+\/turns$/.test(r.url()))posts.push(r.postDataJSON());});
  await select.selectOption('auto');await expect(select.locator('option:checked')).toContainText('DeepSeek V4.1 Flash');
  for(const width of [390,768,1280]){
    await page.setViewportSize({width,height:width===390?844:1000});
    await expect(select).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    const box=await select.boundingBox();expect(box).toBeTruthy();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);
    await shot(page,'actual-default-model-'+width);
  }
  await send(page,'请根据已有条件提示下一步，不给最终答案。');await expect(task(page)).toHaveAttribute('data-status','completed',{timeout:20000});
  expect(posts).toHaveLength(1);expect(posts[0].modelId).toBe('auto');
  const before=await call(f.actor,'/ai/assistant/sessions/'+f.assistantId+'/turns');expect(before.turns).toHaveLength(1);expect(before.turns[0].modelId).toBe('deepseek-v4-flash');
  await select.selectOption('glm-5.3-flash');await page.reload();await open(page);await expect(select).toHaveValue('glm-5.3-flash');
  const after=await call(f.actor,'/ai/assistant/sessions/'+f.assistantId+'/turns');expect(after.turns).toHaveLength(1);
  expect(after.turns[0].id).toBe(before.turns[0].id);expect(after.turns[0].modelId).toBe('deepseek-v4-flash');expect(posts).toHaveLength(1);
});

test('a saved question survives collapse and refresh without duplicate creation or retroactive first-answer evidence',async({page})=>{
  const f=await setup(page),posts:any[]=[];page.on('request',r=>{if(r.method()==='POST'&&/\/ai\/assistant\/sessions\/[^/?]+\/turns$/.test(r.url()))posts.push(r.postDataJSON());});
  const message='[assistant-pause-once] '+crypto.randomUUID()+' 请围绕条件给下一步提示。';await send(page,message);await expect(task(page)).toContainText(message);await expect(task(page)).toHaveAttribute('data-status',/queued|running/);
  await page.getByRole('button',{name:'收起学习小助教',exact:true}).click();await page.reload();await page.getByRole('button',{name:'打开学习小助教',exact:true}).click();await expect(task(page)).toContainText(message);
  await expect(task(page)).toHaveAttribute('data-status','completed',{timeout:25000});expect(posts).toHaveLength(1);expect(await call(f.actor,'/ai/assistant/sessions/'+f.assistantId+'/messages')).toHaveLength(2);
  await expect(panel(page).locator('.assistant-message').first()).toHaveClass(/from-user/);await expect(panel(page).locator('.assistant-message').last()).toHaveClass(/from-assistant/);
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:width===390?844:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await shot(page,'saved-conversation-'+width);}
  await page.getByRole('button',{name:'收起学习小助教',exact:true}).click();await page.getByLabel('数字或分数答案').fill('6');await page.getByRole('button',{name:'完成这一题 →',exact:true}).click();await expect(page.locator('.daily-feedback')).toContainText('使用了 1 级提示');
});
test('a lost creation receipt restores the same original command from server state without sending it again',async({page})=>{
  const f=await setup(page),commands:any[]=[];let release!:()=>void;const gate=new Promise<void>(r=>release=r);
  await page.route('**/api/ai/assistant/sessions/*/turns',async route=>{if(route.request().method()!=='POST')return route.continue();commands.push(route.request().postDataJSON());const response=await route.fetch();await gate;try{await route.fulfill({response});}catch{/* Page reloaded with its unacknowledged command retained. */}});
  try{const text='[assistant-pause-once] '+crypto.randomUUID()+' 我的问题需要保留完整原文。';await send(page,text);await expect(page.getByLabel('待确认提问')).toContainText(text);await expect.poll(()=>commands.length).toBe(1);
    await page.reload();await page.getByRole('button',{name:'打开学习小助教',exact:true}).click();await expect(task(page)).toContainText(text);release();
    await expect(task(page)).toHaveAttribute('data-status','completed',{timeout:25000});expect(commands).toHaveLength(1);
    const turns=await call(f.actor,'/ai/assistant/sessions/'+f.assistantId+'/turns');expect(turns.turns).toHaveLength(1);expect(turns.turns[0].requestKey).toBe(commands[0].requestKey);
    await expect(page.getByLabel('想一起看看什么')).toHaveValue('');
  }finally{release();}
});
test('running cancellation settles after refresh and retry retains the original model despite a new composer selection',async({page})=>{
  const f=await setup(page);await send(page,'[assistant-pause-once] '+crypto.randomUUID()+' 暂停后再核对这个条件。');
  await expect(task(page)).toHaveAttribute('data-status','running');await task(page).getByRole('button',{name:'取消生成',exact:true}).click();await expect(task(page)).toHaveAttribute('data-status','cancelled',{timeout:10000});
  expect(await call(f.actor,'/ai/assistant/sessions/'+f.assistantId+'/messages')).toHaveLength(0);await page.reload();await open(page);
  await page.getByRole('combobox',{name:'选择大模型',exact:true}).selectOption('glm-5.3-flash');await task(page).getByRole('button',{name:'重试原任务',exact:true}).click();await expect(task(page)).toHaveAttribute('data-status','completed',{timeout:20000});
  const turns=(await call(f.actor,'/ai/assistant/sessions/'+f.assistantId+'/turns')).turns;expect(turns).toHaveLength(1);expect(turns[0].task.generation).toBe(2);expect(turns[0].modelId).toBe('deepseek-v4-flash');
  await expect(page.getByRole('combobox',{name:'选择大模型',exact:true})).toHaveValue('glm-5.3-flash');await shot(page,'retry-original-model');
});
test('invalid model evidence remains a visible failure and an explicit retry publishes one validated answer',async({page})=>{
  const f=await setup(page);await send(page,'[assistant-invalid-once] '+crypto.randomUUID()+' 请按证据解释。');await expect(task(page)).toHaveAttribute('data-status','failed',{timeout:15000});
  expect(await call(f.actor,'/ai/assistant/sessions/'+f.assistantId+'/messages')).toHaveLength(0);await expect(panel(page)).not.toContainText('synthetic-unsupported-evidence');
  await task(page).getByRole('button',{name:'重试原任务',exact:true}).click();await expect(task(page)).toHaveAttribute('data-status','completed',{timeout:15000});expect(await call(f.actor,'/ai/assistant/sessions/'+f.assistantId+'/messages')).toHaveLength(2);
});
test('history reads beyond fifty messages, locates an old search match and returns to its actual practice question',async({page})=>{
  const f=await setup(page),marker='HISTORY_'+crypto.randomUUID(),seed=await call(f.actor,'/qa/assistant/seed-history',{sessionId:f.assistantId,count:75,marker});
  await page.reload();await open(page);await expect(panel(page).locator('.assistant-message')).toHaveCount(25);
  await panel(page).getByRole('button',{name:'更早的消息',exact:true}).click();await expect(panel(page).locator('.assistant-message')).toHaveCount(50);
  await panel(page).getByRole('button',{name:'更早的消息',exact:true}).click();await expect(panel(page).locator('.assistant-message')).toHaveCount(75);
  await panel(page).getByRole('button',{name:'查找历史',exact:true}).click();await page.getByLabel('检索历史关键词').fill(marker+' · 匿名历史第0条');await panel(page).getByRole('button',{name:'搜索历史',exact:true}).click();
  await expect(page.getByLabel('助教历史检索')).toContainText('找到 1 段对话');await page.getByLabel('助教历史检索').getByRole('list').getByRole('button').click();
  await expect(page.locator('[data-message-id="'+seed.ids[0]+'"]')).toBeInViewport();await expect(page.getByRole('button',{name:'返回当前学习对话',exact:true})).toBeVisible();
  await page.setViewportSize({width:768,height:1000});await shot(page,'history-old-message-768');
  await page.getByRole('button',{name:'回到相关学习位置',exact:true}).click();await expect(page).toHaveURL(new RegExp('question='+encodeURIComponent(f.itemId)));await expect(page.getByLabel('数字或分数答案')).toBeVisible();
});
test('unavailable local storage keeps the full question editable, exportable and recoverable once the server accepts it',async({page})=>{
  const f=await setup(page);await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('QA storage unavailable','QuotaExceededError');};});
  const text='[assistant-pause-once] '+crypto.randomUUID()+' '+('完整问题需要保留。'.repeat(20));await page.getByLabel('想一起看看什么').fill(text);await expect(panel(page)).toContainText('本机未能暂存提问');
  await page.getByRole('button',{name:'收起学习小助教',exact:true}).click();await open(page);await expect(page.getByLabel('想一起看看什么')).toHaveValue(text);
  const copy=page.waitForEvent('download');await panel(page).getByRole('button',{name:'下载提问副本',exact:true}).click();const json=JSON.parse(readFileSync((await (await copy).path())!,'utf8'));expect(json.input).toBe(text);expect(JSON.stringify(json)).not.toMatch(/token|gradingConfig|standardAnswer/);
  await panel(page).getByRole('button',{name:'一起想一想 →',exact:true}).click();await expect(task(page)).toContainText(text);await page.reload();await page.getByRole('button',{name:'打开学习小助教',exact:true}).click();await expect(task(page)).toContainText(text);
  await expect(task(page)).toHaveAttribute('data-status','completed',{timeout:25000});expect((await call(f.actor,'/ai/assistant/sessions/'+f.assistantId+'/turns')).turns).toHaveLength(1);
});
test('a forged cache owned by another account is ignored without exposing or sending its text',async({page})=>{
  await setup(page);await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('studyagent.assistant.v1.'))!,value=JSON.parse(localStorage.getItem(key)!);value.ownerId='another-owner';value.input='FOREIGN_PRIVATE_DRAFT';value.pending={requestKey:crypto.randomUUID(),message:'FOREIGN_PRIVATE_PENDING',modelId:'deepseek-v4-flash',contextVersion:'a'.repeat(64)};localStorage.setItem(key,JSON.stringify(value));});
  let posts=0;page.on('request',r=>{if(r.method()==='POST'&&/\/ai\/assistant\/sessions\/[^/?]+\/turns$/.test(r.url()))posts++;});await page.reload();await open(page);
  await expect(panel(page)).not.toContainText('FOREIGN_PRIVATE');await expect(page.getByLabel('想一起看看什么')).toHaveValue('');expect(posts).toBe(0);
});

test('stopping local waiting leaves the real server task running until explicit cancellation',async({page})=>{
  const f=await setup(page);let cancels=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/cancel'))cancels++;});
  await send(page,'[assistant-hold] '+crypto.randomUUID()+' 先保留原任务。');await expect(task(page)).toHaveAttribute('data-status','running');
  await panel(page).getByRole('button',{name:'停止等待',exact:true}).click();await expect(panel(page)).toContainText('已停止本次等待');
  const original=(await call(f.actor,'/ai/assistant/sessions/'+f.assistantId+'/turns')).turns[0];expect(original.status).toBe('running');expect(cancels).toBe(0);
  await panel(page).getByRole('button',{name:'读取最新状态',exact:true}).click();await task(page).getByRole('button',{name:'取消生成',exact:true}).click();await expect(task(page)).toHaveAttribute('data-status','cancelled');expect(cancels).toBe(1);
});

test('conversation search pages beyond the first results and recovers from an empty result',async({page})=>{
  const f=await setup(page);await call(f.actor,'/qa/assistant/seed-history',{sessionId:f.assistantId,count:75});await page.reload();await open(page);
  await page.getByLabel('检索当前对话', {exact:true}).fill('合成历史');await panel(page).getByRole('button',{name:'查找这段对话',exact:true}).click();await expect(panel(page).locator('.assistant-message')).toHaveCount(25);
  await panel(page).getByRole('button',{name:'更早的消息',exact:true}).click();await expect(panel(page).locator('.assistant-message')).toHaveCount(50);
  await page.getByLabel('检索当前对话', {exact:true}).fill('NO_MATCH_'+crypto.randomUUID());await panel(page).getByRole('button',{name:'查找这段对话',exact:true}).click();await expect(panel(page).locator('.assistant-message')).toHaveCount(0);
  await panel(page).getByRole('button',{name:'恢复最近消息',exact:true}).click();await expect(panel(page).locator('.assistant-message')).toHaveCount(25);
});

test('identity recovery: one failed identity request retries without asking the signed-in learner to log in again',async({page})=>{
  await setup(page);await page.goto('/student/today');await expect(page.getByRole('link',{name:'资料管理',exact:true})).toBeVisible();let reads=0;await page.route('**/api/auth/me',async route=>{if(route.request().method()!=='GET'){await route.continue();return;}reads++;if(reads===1)await route.abort('failed');else await route.continue();});
  await page.reload();await open(page);expect(reads).toBe(2);await expect(panel(page)).not.toContainText('请先进入学习或登录家长账号');await expect(page.getByRole('alert',{name:'身份确认未完成',exact:true})).toHaveCount(0);
});

test('identity recovery: a persistent connection failure offers a bounded manual retry and reuses the existing saved conversation',async({page})=>{
  const f=await setup(page);await page.goto('/student/today');await expect(page.getByRole('link',{name:'资料管理',exact:true})).toBeVisible();let reads=0,signIns=0;page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/auth/login')signIns++;});await page.route('**/api/auth/me',async route=>{if(route.request().method()!=='GET'){await route.continue();return;}reads++;if(reads<=2)await route.abort('failed');else await route.continue();});
  await page.reload();const warning=page.getByRole('alert',{name:'身份确认未完成',exact:true});await expect(warning).toBeVisible();expect(reads).toBe(2);await page.getByRole('button',{name:/^打开学习(?:小助教|观察助教)$/}).click();await expect(page.getByRole('status').filter({hasText:'正在确认学习身份…'})).toBeVisible();await expect(page.getByLabel('想一起看看什么')).toHaveCount(0);await warning.getByRole('button',{name:'重新确认登录',exact:true}).click();await expect(page.getByLabel('想一起看看什么')).toBeEnabled();await expect(warning).toHaveCount(0);expect(reads).toBe(3);expect(signIns).toBe(0);
  await page.unroute('**/api/auth/me');await page.goto(f.href);await open(page);const cached=await page.evaluate((id)=>Object.keys(localStorage).filter(key=>key.startsWith('studyagent.assistant.v1.')).map(key=>JSON.parse(localStorage.getItem(key)!)).find(value=>value.sessionId===id)?.sessionId,f.assistantId);expect(cached).toBe(f.assistantId);
});

test('identity recovery: an explicit unauthenticated response clears private identity without retrying or calling it a connection failure',async({page})=>{
  await setup(page);await page.goto('/student/today');await expect(page.getByRole('link',{name:'资料管理',exact:true})).toBeVisible();let reads=0;await page.route('**/api/auth/me',async route=>{if(route.request().method()!=='GET'){await route.continue();return;}reads++;await route.fulfill({status:401,json:{data:null,error:{code:'unauthorized',message:'合成登录已失效'}}});});await page.reload();await page.getByRole('button',{name:/^打开学习(?:小助教|观察助教)$/}).click();await expect(page.getByRole('status').filter({hasText:'请先进入学习或登录家长账号'})).toBeVisible();await expect(page.getByRole('alert',{name:'身份确认未完成',exact:true})).toHaveCount(0);expect(reads).toBe(1);await expect(page.getByLabel('想一起看看什么')).toHaveCount(0);
});

test('reviewing an earlier task preserves selection while the new task finishes in the background',async({page})=>{
  const f=await setup(page);const original='EARLIER_'+crypto.randomUUID();await send(page,original);await expect(task(page)).toHaveAttribute('data-status','completed');
  await send(page,'[assistant-pause-once] '+crypto.randomUUID()+' 保留后台提问状态。');await expect(task(page)).toHaveAttribute('data-status','running');
  await panel(page).locator('.assistant-task-history summary').click();await panel(page).locator('.assistant-task-history').getByRole('button',{name:new RegExp(original)}).click();await expect(task(page)).toContainText(original);
  await expect(page.getByLabel('想一起看看什么')).toBeEnabled({timeout:20000});await expect(task(page)).toContainText(original);expect((await call(f.actor,'/ai/assistant/sessions/'+f.assistantId+'/turns')).turns.every((t:any)=>t.status==='completed')).toBe(true);await expect(panel(page).locator('.assistant-message')).toHaveCount(4);
});

test('diagnostic rules stay deterministic and history locates an answered frozen question without opening a future one',async({page})=>{
  const f=await setup(page,'diagnostic'),message='DIAGNOSTIC_'+crypto.randomUUID();await send(page,message);await expect(task(page)).toHaveAttribute('data-status','completed');await expect(task(page)).toContainText('规则');
  await page.getByRole('button',{name:'收起学习观察助教',exact:true}).click();await page.getByLabel('数字或分数答案').fill('6');await page.getByRole('button',{name:'提交，下一步',exact:false}).click();
  await expect.poll(async()=>(await call(f.actor,'/diagnostics/sessions/'+f.sessionId)).answeredCount).toBe(1);await expect(page.getByLabel('数字或分数答案')).toBeVisible();
  await open(page);await panel(page).getByRole('button',{name:'查找历史',exact:true}).click();await page.getByLabel('检索历史关键词').fill(message);await panel(page).getByRole('button',{name:'搜索历史',exact:true}).click();await page.getByLabel('助教历史检索').getByRole('list').getByRole('button').click();
  await page.getByRole('button',{name:'回到相关学习位置',exact:true}).click();await expect(page).toHaveURL(new RegExp('item='+encodeURIComponent(f.itemId)));await expect(page.getByRole('region',{name:'从历史对话定位的题目'})).toContainText('合成题型验收 numeric_blank');await expect(page.getByLabel('数字或分数答案')).toHaveCount(0);await shot(page,'diagnostic-history-readonly');
  await page.getByRole('button',{name:'回到当前核查进度',exact:true}).click();await expect(page.getByLabel('数字或分数答案')).toBeVisible();
  const state=await call(f.actor,'/diagnostics/sessions/'+f.sessionId),future=state.items[2].id;await page.goto(f.href+'&item='+encodeURIComponent(future));await expect(page.getByRole('region',{name:'从历史对话定位的题目'})).toHaveCount(0);await expect(page.getByText('这道题尚未开放或不属于原评测，请按当前核查顺序继续。')).toBeVisible();expect((await call(f.actor,'/diagnostics/sessions/'+f.sessionId)).answeredCount).toBe(1);
});
