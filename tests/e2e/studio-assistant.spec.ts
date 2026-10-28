import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { browserEvidence } from './evidence';

const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107') + '/api';
const evidence = browserEvidence('studio-assistant');
let address = 0;
async function login(page: Page) {
  const id = crypto.randomUUID(), principal = 'lecture-browser-' + id + '@local.test', credential = 'Lecture-browser-only-' + id;
  const response = await fetch(api + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.18.15.' + (++address) }, body: JSON.stringify({ principal, credential }) });
  expect(response.status).toBe(201); const actor = (await response.json()).data;
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  return actor;
}
async function call(actor: any, path: string, body?: unknown) {
  const response = await fetch(api + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + actor.token }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json(); expect(response.ok, JSON.stringify(value.error)).toBe(true); return value.data;
}
const input = (page: Page) => page.getByLabel('想一起看看什么', { exact: true });
const task = (page: Page) => page.getByRole('region', { name: '提问任务', exact: true });
async function lecture(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 887 }); await page.emulateMedia({ reducedMotion: 'reduce' }); const actor = await login(page);
  await page.goto('/studio/classroom'); await page.getByRole('button', { name: '获取帮助', exact: true }).first().click();
  await expect(page).toHaveURL(/\/studio\?[^#]*mode=instant/); await expect(input(page)).toBeEnabled(); return actor;
}
async function shot(page: Page, name: string) { if (!process.env.CI) { mkdirSync(evidence, { recursive: true }); await page.evaluate(async () => { await document.fonts.ready; }); await page.screenshot({ path: evidence + '/' + name + '.png', fullPage: true }); } }
test.afterEach(async({page})=>{await page.unrouteAll({behavior:'wait'});});

test('lecture-assistant: directory opens a whole lecture in the independent assistant without starting a micro lesson', async ({ page }) => {
  test.setTimeout(90000); await page.setViewportSize({ width: 1280, height: 887 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await login(page);
  const classroomPosts: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST' && /\/learning\/classroom\/sessions(?:\?|$)/.test(request.url())) classroomPosts.push(request.url()); });
  try {
    await page.goto('/studio/classroom'); await expect(page.getByRole('heading', { name: '社会学概论', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '获取帮助', exact: true }).first().click();
    await expect(page).toHaveURL(/\/studio\?[^#]*mode=instant/);
    await expect(page.getByRole('region', { name: '当前讲座上下文' })).toContainText('社会学思考');
    await expect(page.getByRole('region', { name: '当前讲座上下文' })).toContainText('U1·L1');
    await expect(page.getByLabel('想一起看看什么')).toBeEnabled();
    expect(classroomPosts).toEqual([]); expect(errors).toEqual([]);
    await page.reload(); await expect(page.getByRole('region', { name: '当前讲座上下文' })).toContainText('社会学思考'); await expect(input(page)).toBeEnabled();
  } finally {
    if (!process.env.CI) { mkdirSync(evidence, { recursive: true }); writeFileSync(evidence + '/directory-state.json', JSON.stringify({ url: page.url(), classroomPosts, errors }, null, 2)); await page.screenshot({ path: evidence + '/directory-state.png', fullPage: true }); }
  }
});

for (const width of [390, 768, 880, 1440]) test(`lecture-assistant: usable course entry, composer and complete model selection at${width}`, async ({ page }) => {
  test.setTimeout(90000); await lecture(page, width);
  await expect(page.getByRole('region', { name: '当前讲座上下文' })).toBeVisible();
  const picker = page.getByRole('combobox', { name: '选择大模型', exact: true }); await expect(picker.locator('option')).toHaveCount(23); await expect(picker).toHaveValue('deepseek-v4-flash');
  await page.getByLabel('模型文字检查说明').click(); await expect(page.getByText('尚未进行文字检查', { exact: true })).toBeVisible();
  await page.getByLabel('模型文字检查说明').click();
  await page.getByRole('button', { name: 'Tools', exact: true }).click(); await expect(page.getByRole('menuitem', { name: /Whiteboard session/ })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('menu', { name: '' })).toHaveCount(0);
  const layout=await page.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('.input-box,.button-row,.composer-right-group,select[aria-label="选择大模型"],button[aria-label="发送学习问题"]')].map(element=>{const box=element.getBoundingClientRect(),style=getComputedStyle(element);return{selector:element.className,left:box.left,right:box.right,width:box.width,minWidth:style.minWidth,cssWidth:style.width};})}));
  if(!process.env.CI){mkdirSync(evidence,{recursive:true});writeFileSync(evidence+'/entry-'+width+'-layout.json',JSON.stringify(layout,null,2));}
  expect(layout.documentWidth).toBeLessThanOrEqual(width);for(const control of layout.controls){expect(control.left).toBeGreaterThanOrEqual(0);expect(control.right).toBeLessThanOrEqual(width);}
  await shot(page, 'entry-' + width);
});

test('lecture-assistant: lecture removal, back and reload preserve separate unsent drafts without sending', async ({ page }) => {
  test.setTimeout(90000); await lecture(page); const posts: unknown[] = [];
  page.on('request', request => { if (request.method() === 'POST' && /\/ai\/assistant\/sessions\/[^/?]+\/turns$/.test(request.url())) posts.push(request.postDataJSON()); });
  await input(page).fill('原讲座中尚未发送的匿名草稿。'); const original = page.url();
  await page.getByRole('button', { name: '移除讲座上下文' }).click(); await expect(page).toHaveURL(/audience=independent/);
  await expect(page.getByRole('region', { name: '当前讲座上下文' })).toHaveCount(0); await expect(input(page)).toBeEnabled(); await expect(input(page)).toHaveValue('');
  await input(page).fill('普通独立学习中尚未发送的匿名草稿。');
  await page.goBack(); await expect(page).toHaveURL(original); await expect(input(page)).toHaveValue('原讲座中尚未发送的匿名草稿。');
  await page.goForward(); await expect(input(page)).toHaveValue('普通独立学习中尚未发送的匿名草稿。'); await page.reload(); await expect(input(page)).toHaveValue('普通独立学习中尚未发送的匿名草稿。');
  expect(posts).toEqual([]); await shot(page, 'separate-drafts');
});

test('lecture-assistant: durable pending turn resumes after refresh with its original model', async ({ page }) => {
  test.setTimeout(120000); await lecture(page); const posts: any[] = [];
  page.on('request', request => { if (request.method() === 'POST' && /\/ai\/assistant\/sessions\/[^/?]+\/turns$/.test(request.url())) posts.push(request.postDataJSON()); });
  await input(page).fill('[assistant-pause-once] 请用匿名例子比较本讲的概念。'); await page.getByRole('button', { name: '发送学习问题' }).click(); await expect(task(page)).toBeVisible();
  await page.reload(); await expect(task(page).getByRole('status')).toHaveText('回答已保存', { timeout: 45000 });
  expect(posts).toHaveLength(1); expect(posts[0].modelId).toBe('deepseek-v4-flash');
  await expect(page.getByRole('log', { name: '当前学习对话' }).locator('.assistant-message')).toHaveCount(2);
  await page.getByRole('combobox', { name: '选择大模型', exact: true }).selectOption('gpt-6.1-sol'); await expect(task(page)).toContainText('DeepSeek V4.1 Flash');
  await shot(page, 'saved-original-model');
});

test('lecture-assistant: a lost receipt is recovered with the original request and no duplicate post', async ({ page }) => {
  test.setTimeout(120000); const actor=await lecture(page); let submitted: any = null, count = 0,sessionId='';const allPosts:any[]=[];
  page.on('request',request=>{if(request.method()==='POST'&&/\/ai\/assistant\/sessions\/[^/?]+\/turns$/.test(request.url()))allPosts.push(request.postDataJSON());});
  await page.route(/\/ai\/assistant\/sessions\/[^/?]+\/turns$/, async route => {
    if (route.request().method() === 'POST') { count++; submitted = route.request().postDataJSON();sessionId=new URL(route.request().url()).pathname.split('/').at(-2)!; await route.fetch(); await route.abort('failed'); } else await route.continue();
  });
  await input(page).fill('只发送一次的匿名讲座问题。'); await page.getByRole('button', { name: '发送学习问题' }).click();
  await expect(page.getByRole('complementary', { name: '待确认提问' })).toBeVisible();
  expect(submitted.requestKey).toBeTruthy(); await page.unrouteAll({ behavior: 'wait' });
  await expect.poll(async()=> (await call(actor,'/ai/assistant/sessions/'+sessionId+'/turns?requestKey='+submitted.requestKey)).turns[0]?.status).toBe('completed');
  let stalePages=0;await page.route(/\/ai\/assistant\/sessions\/[^/?]+\/messages\/page\?/,async route=>{const response=await route.fetch();if(stalePages++===0){const body=await response.json();body.data.messages=[];await route.fulfill({response,json:body});}else await route.fulfill({response});});
  await page.reload();
  await expect(task(page).getByRole('status')).toHaveText('回答已保存', { timeout: 45000 }); expect(count).toBe(1);expect(allPosts).toHaveLength(1);expect(allPosts[0].requestKey).toBe(submitted.requestKey);
  await expect(page.getByRole('log', { name: '当前学习对话' }).locator('.assistant-message')).toHaveCount(2);expect(stalePages).toBeGreaterThanOrEqual(2); await shot(page, 'recovered-original-request');
});

for(const protocol of ['classroom-lecture-v1','classroom-lecture-v2'])test('lecture-assistant: a retained original version opens from the server without creating or resending a session · '+protocol, async ({ page }) => {
  test.setTimeout(120000); await page.setViewportSize({ width: 880, height: 887 }); await page.emulateMedia({ reducedMotion: 'reduce' }); const actor = await login(page);
  const original = await call(actor, '/qa/assistant/lecture-history', {protocol}), posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && /\/ai\/assistant\/sessions(?:\/|$)/.test(request.url())) posts.push(request.url()); });
  await page.goto(original.href); await expect(page.getByRole('log', { name: '当前学习对话' })).toContainText('LECTURE_OLD_HISTORY_MARKER');
  await expect(input(page)).toBeDisabled(); await expect(page.getByRole('button', { name: '发送学习问题' })).toBeDisabled(); expect(posts).toEqual([]);
  await shot(page, 'retained-original-readonly');
  await page.getByRole('button', { name: '打开当前讲座版本', exact: true }).click(); await expect(input(page)).toBeEnabled();
  await expect(page.locator('.assistant-message').filter({hasText:'LECTURE_OLD_HISTORY_MARKER'})).toHaveCount(0);
  expect(posts.some(url => /\/sessions$/.test(url))).toBe(true); expect(posts.some(url => /\/turns$/.test(url))).toBe(false);
  expect((await call(actor, '/ai/assistant/sessions/' + original.sessionId + '/messages/page')).messages).toHaveLength(2);
});

test('lecture-assistant: failed initialization after a child change cannot retain the previous active session', async ({ page }) => {
  test.setTimeout(120000); const actor = await login(page), children:Array<{id:string}> = [];
  for (const nickname of ['匿名档案甲', '匿名档案乙']) children.push((await call(actor, '/students', { nickname, grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile);
  await page.goto('/studio'); await expect(page.getByRole('combobox', { name: '学习档案', exact: true }).locator('option')).toHaveCount(2);await page.getByRole('combobox',{name:'学习档案',exact:true}).selectOption(children[0].id);await expect(page.getByRole('combobox', { name: '学习档案', exact: true })).toHaveValue(children[0].id); await page.getByRole('button', { name: 'Instant Assistance', exact: true }).click();
  await expect(input(page)).toBeEnabled(); await input(page).fill('只属于匿名档案甲的未发送草稿。'); const posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && /\/ai\/assistant\/sessions\/[^/?]+\/turns$/.test(request.url())) posts.push(request.url()); });
  await page.route(/\/ai\/assistant\/sessions$/, async route => {
    if (route.request().method() === 'POST' && route.request().postDataJSON().studentId === children[1].id) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ data: null, error: { code: 'synthetic_unavailable', message: '匿名上下文初始化暂不可用' }, meta: {} }) });
    else await route.continue();
  });
  await page.getByRole('combobox', { name: '学习档案', exact: true }).selectOption(children[1].id); await expect(page.getByText('匿名上下文初始化暂不可用', { exact: true })).toBeVisible();
  await expect(input(page)).toBeDisabled(); expect(posts).toEqual([]);
  await page.getByRole('combobox', { name: '学习档案', exact: true }).selectOption(children[0].id); await expect(input(page)).toHaveValue('只属于匿名档案甲的未发送草稿。');
  await page.unrouteAll({ behavior: 'wait' });
});

test('lecture-assistant: read-only recovery preserves a cached pending command and identifies separately selected history', async ({ page }) => {
  test.setTimeout(120000);const actor=await login(page),old=await call(actor,'/qa/assistant/lecture-history',{}),owner=(await call(actor,'/auth/me')).id;
  const scope=JSON.stringify({userRole:'parent',studentId:null,subject:null,pageContext:'classroom',contextRefType:'classroom_lecture',contextRefId:old.referenceId,contextItemId:old.lectureId});
  const key='studyagent.assistant.v1.'+encodeURIComponent(owner)+'.'+encodeURIComponent(scope);
  const raw=JSON.stringify({version:1,ownerId:owner,scope,sessionId:old.sessionId,input:'原版本未发送草稿，不可自动发出。',pending:{requestKey:crypto.randomUUID(),message:'原版本待确认命令。',modelId:'deepseek-v4-flash',contextVersion:'a'.repeat(64)},lastTurnId:null});
  await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw});
  const generic=await call(actor,'/ai/assistant/sessions',{userRole:'parent',studentId:null,subject:null,pageContext:'studio'});
  await call(actor,'/qa/assistant/seed-history',{sessionId:generic.id,count:4,marker:'OWN_INDEPENDENT_HISTORY'});
  const posts:string[]=[];page.on('request',request=>{if(request.method()==='POST'&&/\/ai\/assistant\/sessions(?:\/|$)/.test(request.url()))posts.push(request.url());});
  await page.goto(old.href);await expect(input(page)).toHaveValue('原版本未发送草稿，不可自动发出。');await expect(input(page)).toBeDisabled();await expect(page.getByRole('button',{name:'核对原请求',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'查找历史',exact:true}).click();await page.getByLabel('检索历史关键词').fill('OWN_INDEPENDENT_HISTORY');await page.getByRole('button',{name:'搜索历史',exact:true}).click();await page.getByLabel('助教历史检索').getByRole('list').getByRole('button').click();
  await expect(page.getByRole('log',{name:'当前学习对话'})).toContainText('OWN_INDEPENDENT_HISTORY');await expect(page.getByRole('region',{name:'当前讲座上下文'})).toHaveCount(0);await expect(page.getByText('正在只读原讲座版本。原问题与草稿保留，请打开当前版本后再提问。',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'返回当前学习对话',exact:true}).click();await expect(input(page)).toHaveValue('原版本未发送草稿，不可自动发出。');await expect(input(page)).toBeDisabled();expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(raw);expect(posts).toEqual([]);await shot(page,'readonly-pending-and-history');
});

test('lecture-assistant: an unavailable original still allows owner-only history reads without a session post',async({page})=>{
  test.setTimeout(90000);const actor=await login(page),old=await call(actor,'/qa/assistant/lecture-history',{}),generic=await call(actor,'/ai/assistant/sessions',{userRole:'parent',studentId:null,subject:null,pageContext:'studio'});
  await call(actor,'/qa/assistant/seed-history',{sessionId:generic.id,count:4,marker:'READABLE_WITHOUT_BASE'});
  const url=new URL(old.href,'http://local.test');url.searchParams.set('lectureVersion','0'.repeat(64));const posts:string[]=[];
  page.on('request',request=>{if(request.method()==='POST'&&/\/ai\/assistant\/sessions(?:\/|$)/.test(request.url()))posts.push(request.url());});
  await page.goto(url.pathname+url.search);await expect(input(page)).toBeDisabled();await expect(page.getByRole('alert').filter({hasText:'当前账号没有保留这个讲座原版本'})).toBeVisible();
  await page.getByRole('button',{name:'查找历史',exact:true}).click();await page.getByLabel('检索历史关键词').fill('READABLE_WITHOUT_BASE');await page.getByRole('button',{name:'搜索历史',exact:true}).click();await page.getByLabel('助教历史检索').getByRole('list').getByRole('button').click();
  await expect(page.getByRole('log',{name:'当前学习对话'})).toContainText('READABLE_WITHOUT_BASE');await expect(page.getByRole('button',{name:'返回当前学习对话',exact:true})).toBeVisible();expect(posts).toEqual([]);
});

test('lecture-assistant: another account cannot open a retained version or find its private messages',async({page,browser})=>{
  test.setTimeout(90000);const actor=await login(page),old=await call(actor,'/qa/assistant/lecture-history',{}),stranger=await browser.newContext({baseURL:new URL(page.url()).origin});
  try{const other=await stranger.newPage();await login(other);const posts:string[]=[];other.on('request',request=>{if(request.method()==='POST'&&/\/ai\/assistant\/sessions(?:\/|$)/.test(request.url()))posts.push(request.url());});
    await other.goto(old.href);await expect(input(other)).toBeDisabled();await expect(other.getByRole('alert').filter({hasText:'当前账号没有保留这个讲座原版本'})).toBeVisible();await expect(other.locator('.assistant-message')).toHaveCount(0);
    await other.getByRole('button',{name:'查找历史',exact:true}).click();await other.getByLabel('检索历史关键词').fill('LECTURE_OLD_HISTORY_MARKER');await other.getByRole('button',{name:'搜索历史',exact:true}).click();await expect(other.getByLabel('助教历史检索')).toContainText('找到 0 段对话');expect(posts).toEqual([]);
  }finally{await stranger.close();}
});

test('lecture-assistant: explicit cancellation and retry preserve one lecture request and the original model',async({page})=>{
  test.setTimeout(120000);const actor=await lecture(page),posts:any[]=[];page.on('request',request=>{if(request.method()==='POST'&&/\/ai\/assistant\/sessions\/[^/?]+\/turns$/.test(request.url()))posts.push({url:request.url(),command:request.postDataJSON()});});
  await input(page).fill('[assistant-pause-once] '+crypto.randomUUID()+' 取消后按原模型重试。');await page.getByRole('button',{name:'发送学习问题',exact:true}).click();await expect(task(page)).toHaveAttribute('data-status','running');await task(page).getByRole('button',{name:'取消生成',exact:true}).click();await expect(task(page)).toHaveAttribute('data-status','cancelled');
  await page.reload();await expect(task(page)).toHaveAttribute('data-status','cancelled');await page.getByRole('combobox',{name:'选择大模型',exact:true}).selectOption('glm-5.3-flash');await task(page).getByRole('button',{name:'重试原任务',exact:true}).click();await expect(task(page)).toHaveAttribute('data-status','completed',{timeout:45000});
  expect(posts).toHaveLength(1);const id=new URL(posts[0].url).pathname.split('/').at(-2),turns=(await call(actor,'/ai/assistant/sessions/'+id+'/turns')).turns;expect(turns).toHaveLength(1);expect(turns[0]).toMatchObject({requestKey:posts[0].command.requestKey,modelId:'deepseek-v4-flash'});expect(turns[0].task.generation).toBe(2);await expect(page.locator('.assistant-message')).toHaveCount(2);await expect(page.getByRole('combobox',{name:'选择大模型',exact:true})).toHaveValue('glm-5.3-flash');await shot(page,'cancel-retry-original-lecture');
});

test('lecture-assistant: changing the selected learner fences a late whiteboard preview and releases the new composer',async({page})=>{
  test.setTimeout(120000);const actor=await login(page),children:Array<{id:string}>=[];
  for(const nickname of ['白板匿名档案甲','白板匿名档案乙'])children.push((await call(actor,'/students',{nickname,grade:5,preferredSessionMinutes:15,defaultVersionMap:{math:'common',chinese:'common',english:'common'}})).profile);
  const scope=await fetch(api+'/students/'+children[0].id+'/learning-scope?subject=math',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+actor.token},body:JSON.stringify({subject:'math',grade:5,term:'upper',textbookVolumeId:null,textbookVersion:'按已学知识点确认',learnedAtomIds:['core:math:fractionadd','core:math:fractionsubtract'],currentAtomId:'core:math:fractionadd',minutesPerSession:15,progressMode:'knowledge',selectedLessonIds:[]})});expect(scope.status).toBe(200);
  await page.goto('/studio?mode=instant&student='+children[0].id);await expect(input(page)).toBeEnabled();await page.getByRole('button',{name:'Tools',exact:true}).click();await page.getByRole('menuitem',{name:/Whiteboard session/}).click();await input(page).fill('解释异分母分数加法');
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let captured=false,returned=false;const saves:string[]=[];
  page.on('request',request=>{if(request.method()==='POST'&&/\/learning\/studio\/whiteboards$/.test(request.url()))saves.push(request.url());});
  await page.route('**/api/learning/studio/whiteboards/preview',async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);captured=true;await gate;try{await route.fulfill({response});}catch{/* The previous learner's client was aborted. */}finally{returned=true;}});
  try{await page.getByRole('button',{name:'预览白板主题',exact:true}).click();await expect.poll(()=>captured).toBe(true);await expect(input(page)).toBeDisabled();
    await page.getByRole('combobox',{name:'学习档案',exact:true}).selectOption(children[1].id);await expect(input(page)).toBeEnabled();release();await expect.poll(()=>returned).toBe(true);
    await expect(page.locator('.sa-whiteboard-preview-modal')).toHaveCount(0);await expect(page.getByRole('combobox',{name:'学习档案',exact:true})).toHaveValue(children[1].id);await expect(input(page)).toHaveValue('');expect(saves).toEqual([]);
  }finally{release();}
});

for(const mode of ['lecture','independent'])test('lecture-navigation: '+mode+' tools retain the original scope and draft through material refresh and planner return',async({page})=>{
  test.setTimeout(90000);await lecture(page);if(mode==='independent')await page.getByRole('button',{name:'移除讲座上下文',exact:true}).click();await expect(input(page)).toBeEnabled();
  const original=new URL(page.url()),keys=mode==='lecture'?['mode','lectureCourse','lecture','lectureVersion']:['mode','audience'],draft='工具往返后仍属于原范围的匿名草稿 '+mode,posts:string[]=[];
  page.on('request',request=>{if(request.method()==='POST'&&(/\/ai\/assistant\/sessions\/[^/?]+\/turns$/.test(request.url())||/\/learning\/classroom\/sessions(?:\?|$)/.test(request.url())))posts.push(request.url());});
  const assertScope=()=>{const current=new URL(page.url());for(const key of keys)expect(current.searchParams.get(key),'preserved '+key).toBe(original.searchParams.get(key));};
  await input(page).fill(draft);await page.getByRole('button',{name:'打开学习资料',exact:true}).click();await expect(page).toHaveURL(/view=materials/);assertScope();await page.reload();await expect(page.locator('.sa-top strong')).toHaveText('资料');
  await page.locator('.ws-navigation').getByRole('button',{name:'Home',exact:true}).click();await expect(input(page)).toHaveValue(draft);assertScope();
  await page.getByRole('button',{name:'Tools',exact:true}).click();await page.getByRole('menuitem',{name:/Study Planner/}).click();await expect(page).toHaveURL(/view=calendar/);assertScope();
  await page.locator('.ws-navigation').getByRole('button',{name:'Home',exact:true}).click();await expect(input(page)).toHaveValue(draft);assertScope();await expect(page.getByRole('region',{name:'当前讲座上下文'})).toHaveCount(mode==='lecture'?1:0);expect(posts).toEqual([]);await shot(page,'navigation-retained-'+mode);
});
