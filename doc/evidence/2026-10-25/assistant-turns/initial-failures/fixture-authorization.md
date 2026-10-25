# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: assistant-conversations.spec.ts >> a forged cache owned by another account is ignored without exposing or sending its text
- Location: tests\e2e\assistant-conversations.spec.ts:72:5

# Error details

```
Error: {"message":"Answer QA fixture could not be prepared: Fixture authorization required"}

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Test source

```ts
  1  | import { test,expect,type Page } from '@playwright/test';
  2  | import { mkdirSync,readFileSync } from 'node:fs';
  3  | import { browserEvidence } from './evidence';
  4  | const api='http://localhost:'+(process.env.E2E_API_PORT??'4107')+'/api',evidence=browserEvidence('assistant-conversations');let address=0;
> 5  | async function call(actor:any,path:string,body?:unknown){const response=await fetch(api+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+actor.token},...(body===undefined?{}:{body:JSON.stringify(body)})});const x=await response.json();expect(response.ok,JSON.stringify(x.error)).toBe(true);return x.data;}
     |                                                                                                                                                                                                                                                                                                                                                     ^ Error: {"message":"Answer QA fixture could not be prepared: Fixture authorization required"}
  6  | async function setup(page:Page){
  7  |   const id=crypto.randomUUID(),principal='assistant-browser-'+id+'@local.test',credential='Assistant-only-'+id;
  8  |   const registered=await fetch(api+'/auth/register',{method:'POST',headers:{'content-type':'application/json','X-Forwarded-For':'198.18.9.'+(++address)},body:JSON.stringify({principal,credential})});expect(registered.status).toBe(201);const actor=(await registered.json()).data;
  9  |   const child=(await call(actor,'/students',{nickname:'匿名助教验收',grade:3,preferredSessionMinutes:15,defaultVersionMap:{math:'',chinese:'',english:''}})).profile;
  10 |   const fixture=await call(actor,'/qa/answer-journeys',{studentId:child.id,mode:'numeric_blank',kind:'practice'});
  11 |   await page.goto('/parent/login');await page.getByLabel('登录账号').fill(principal);await page.getByLabel('密码').fill(credential);await page.getByRole('button',{name:'登录，查看学习记录 →'}).click();await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  12 |   await page.goto(fixture.href);await expect(page.getByLabel('数字或分数答案')).toBeVisible();await open(page);
  13 |   const assistantId=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('studyagent.assistant.v1.')).map(k=>JSON.parse(localStorage.getItem(k)!)).find(v=>v.sessionId)?.sessionId);
  14 |   expect(assistantId).toBeTruthy();return {actor,child,...fixture,assistantId};
  15 | }
  16 | async function open(page:Page){await page.getByRole('button',{name:'打开学习小助教',exact:true}).click();await expect(page.getByLabel('想一起看看什么')).toBeEnabled();}
  17 | const panel=(page:Page)=>page.locator('.learning-assistant'),task=(page:Page)=>page.getByRole('region',{name:'提问任务'});
  18 | async function send(page:Page,message:string){await page.getByLabel('想一起看看什么').fill(message);await panel(page).getByRole('button',{name:'一起想一想 →',exact:true}).click();}
  19 | async function shot(page:Page,name:string){if(!process.env.CI){mkdirSync(evidence,{recursive:true});await page.screenshot({path:evidence+'/'+name+'.png'});}}
  20 | test.afterEach(async({page})=>{await page.unrouteAll({behavior:'wait'});});
  21 |
  22 | test('a saved question survives collapse and refresh without duplicate creation or retroactive first-answer evidence',async({page})=>{
  23 |   const f=await setup(page),posts:any[]=[];page.on('request',r=>{if(r.method()==='POST'&&/\/ai\/assistant\/sessions\/[^/?]+\/turns$/.test(r.url()))posts.push(r.postDataJSON());});
  24 |   const message='[assistant-pause-once] '+crypto.randomUUID()+' 请围绕条件给下一步提示。';await send(page,message);await expect(task(page)).toContainText(message);await expect(task(page)).toHaveAttribute('data-status',/queued|running/);
  25 |   await page.getByRole('button',{name:'收起学习小助教',exact:true}).click();await page.reload();await page.getByRole('button',{name:'打开学习小助教',exact:true}).click();await expect(task(page)).toContainText(message);
  26 |   await expect(task(page)).toHaveAttribute('data-status','completed',{timeout:25000});expect(posts).toHaveLength(1);expect(await call(f.actor,'/ai/assistant/sessions/'+f.assistantId+'/messages')).toHaveLength(2);
  27 |   for(const width of [1440,768,390]){await page.setViewportSize({width,height:width===390?844:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await shot(page,'saved-conversation-'+width);}
  28 |   await page.getByRole('button',{name:'收起学习小助教',exact:true}).click();await page.getByLabel('数字或分数答案').fill('6');await page.getByRole('button',{name:'完成这一题 →',exact:true}).click();await expect(page.locator('.daily-feedback')).toContainText('使用了 1 级提示');
  29 | });
  30 | test('a lost creation receipt restores the same original command from server state without sending it again',async({page})=>{
  31 |   const f=await setup(page),commands:any[]=[];let release!:()=>void;const gate=new Promise<void>(r=>release=r);
  32 |   await page.route('**/api/ai/assistant/sessions/*/turns',async route=>{if(route.request().method()!=='POST')return route.continue();commands.push(route.request().postDataJSON());const response=await route.fetch();await gate;try{await route.fulfill({response});}catch{/* Page reloaded with its unacknowledged command retained. */}});
  33 |   try{const text='[assistant-pause-once] '+crypto.randomUUID()+' 我的问题需要保留完整原文。';await send(page,text);await expect(page.getByLabel('待确认提问')).toContainText(text);await expect.poll(()=>commands.length).toBe(1);
  34 |     await page.reload();await page.getByRole('button',{name:'打开学习小助教',exact:true}).click();await expect(task(page)).toContainText(text);release();
  35 |     await expect(task(page)).toHaveAttribute('data-status','completed',{timeout:25000});expect(commands).toHaveLength(1);
  36 |     const turns=await call(f.actor,'/ai/assistant/sessions/'+f.assistantId+'/turns');expect(turns.turns).toHaveLength(1);expect(turns.turns[0].requestKey).toBe(commands[0].requestKey);
  37 |     await expect(page.getByLabel('想一起看看什么')).toHaveValue('');
  38 |   }finally{release();}
  39 | });
  40 | test('running cancellation settles after refresh and retry retains the original model despite a new composer selection',async({page})=>{
  41 |   const f=await setup(page);await send(page,'[assistant-pause-once] '+crypto.randomUUID()+' 暂停后再核对这个条件。');
  42 |   await expect(task(page)).toHaveAttribute('data-status','running');await task(page).getByRole('button',{name:'取消生成',exact:true}).click();await expect(task(page)).toHaveAttribute('data-status','cancelled',{timeout:10000});
  43 |   expect(await call(f.actor,'/ai/assistant/sessions/'+f.assistantId+'/messages')).toHaveLength(0);await page.reload();await open(page);
  44 |   await page.getByRole('combobox',{name:'选择大模型',exact:true}).selectOption('glm-5.3-flash');await task(page).getByRole('button',{name:'重试原任务',exact:true}).click();await expect(task(page)).toHaveAttribute('data-status','completed',{timeout:20000});
  45 |   const turns=(await call(f.actor,'/ai/assistant/sessions/'+f.assistantId+'/turns')).turns;expect(turns).toHaveLength(1);expect(turns[0].task.generation).toBe(2);expect(turns[0].modelId).toBe('deepseek-v4-flash');
  46 |   await expect(page.getByRole('combobox',{name:'选择大模型',exact:true})).toHaveValue('glm-5.3-flash');await shot(page,'retry-original-model');
  47 | });
  48 | test('invalid model evidence remains a visible failure and an explicit retry publishes one validated answer',async({page})=>{
  49 |   const f=await setup(page);await send(page,'[assistant-invalid-once] '+crypto.randomUUID()+' 请按证据解释。');await expect(task(page)).toHaveAttribute('data-status','failed',{timeout:15000});
  50 |   expect(await call(f.actor,'/ai/assistant/sessions/'+f.assistantId+'/messages')).toHaveLength(0);await expect(panel(page)).not.toContainText('synthetic-unsupported-evidence');
  51 |   await task(page).getByRole('button',{name:'重试原任务',exact:true}).click();await expect(task(page)).toHaveAttribute('data-status','completed',{timeout:15000});expect(await call(f.actor,'/ai/assistant/sessions/'+f.assistantId+'/messages')).toHaveLength(2);
  52 | });
  53 | test('history reads beyond fifty messages, locates an old search match and returns to its actual practice question',async({page})=>{
  54 |   const f=await setup(page),marker='HISTORY_'+crypto.randomUUID(),seed=await call(f.actor,'/qa/assistant/seed-history',{sessionId:f.assistantId,count:75,marker});
  55 |   await page.reload();await open(page);await expect(panel(page).locator('.assistant-message')).toHaveCount(25);
  56 |   await panel(page).getByRole('button',{name:'更早的消息',exact:true}).click();await expect(panel(page).locator('.assistant-message')).toHaveCount(50);
  57 |   await panel(page).getByRole('button',{name:'更早的消息',exact:true}).click();await expect(panel(page).locator('.assistant-message')).toHaveCount(75);
  58 |   await panel(page).getByRole('button',{name:'查找历史',exact:true}).click();await page.getByLabel('检索历史关键词').fill(marker+' · 匿名历史第0条');await panel(page).getByRole('button',{name:'搜索历史',exact:true}).click();
  59 |   await expect(page.getByLabel('助教历史检索')).toContainText('找到 1 段对话');await page.getByLabel('助教历史检索').getByRole('list').getByRole('button').click();
  60 |   await expect(page.locator('[data-message-id="'+seed.ids[0]+'"]')).toBeInViewport();await expect(page.getByRole('button',{name:'返回当前学习对话',exact:true})).toBeVisible();
  61 |   await page.setViewportSize({width:768,height:1000});await shot(page,'history-old-message-768');
  62 |   await page.getByRole('button',{name:'回到相关学习位置',exact:true}).click();await expect(page).toHaveURL(new RegExp('question='+encodeURIComponent(f.itemId)));await expect(page.getByLabel('数字或分数答案')).toBeVisible();
  63 | });
  64 | test('unavailable local storage keeps the full question editable, exportable and recoverable once the server accepts it',async({page})=>{
  65 |   const f=await setup(page);await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('QA storage unavailable','QuotaExceededError');};});
  66 |   const text='[assistant-pause-once] '+crypto.randomUUID()+' '+('完整问题需要保留。'.repeat(20));await page.getByLabel('想一起看看什么').fill(text);await expect(panel(page)).toContainText('本机未能暂存提问');
  67 |   await page.getByRole('button',{name:'收起学习小助教',exact:true}).click();await open(page);await expect(page.getByLabel('想一起看看什么')).toHaveValue(text);
  68 |   const copy=page.waitForEvent('download');await panel(page).getByRole('button',{name:'下载提问副本',exact:true}).click();const json=JSON.parse(readFileSync((await (await copy).path())!,'utf8'));expect(json.input).toBe(text);expect(JSON.stringify(json)).not.toMatch(/token|gradingConfig|standardAnswer/);
  69 |   await panel(page).getByRole('button',{name:'一起想一想 →',exact:true}).click();await expect(task(page)).toContainText(text);await page.reload();await page.getByRole('button',{name:'打开学习小助教',exact:true}).click();await expect(task(page)).toContainText(text);
  70 |   await expect(task(page)).toHaveAttribute('data-status','completed',{timeout:25000});expect((await call(f.actor,'/ai/assistant/sessions/'+f.assistantId+'/turns')).turns).toHaveLength(1);
  71 | });
  72 | test('a forged cache owned by another account is ignored without exposing or sending its text',async({page})=>{
  73 |   await setup(page);await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('studyagent.assistant.v1.'))!,value=JSON.parse(localStorage.getItem(key)!);value.ownerId='another-owner';value.input='FOREIGN_PRIVATE_DRAFT';value.pending={requestKey:crypto.randomUUID(),message:'FOREIGN_PRIVATE_PENDING',modelId:'deepseek-v4-flash',contextVersion:'a'.repeat(64)};localStorage.setItem(key,JSON.stringify(value));});
  74 |   let posts=0;page.on('request',r=>{if(r.method()==='POST'&&/\/ai\/assistant\/sessions\/[^/?]+\/turns$/.test(r.url()))posts++;});await page.reload();await open(page);
  75 |   await expect(panel(page)).not.toContainText('FOREIGN_PRIVATE');await expect(page.getByLabel('想一起看看什么')).toHaveValue('');expect(posts).toBe(0);
  76 | });
  77 |
```