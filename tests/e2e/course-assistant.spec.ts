import { test, expect, type Page } from '@playwright/test';
import { browserEvidence } from './evidence';
const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107') + '/api';
const evidence = browserEvidence('course-assistant');
async function sourceFonts(page: Page) { await expect(page.getByRole('region', { name: '当时的教学出处', exact: true })).toHaveAttribute('data-original-font-status', 'ready'); }
async function courseFonts(page:Page){await expect(page.locator('.sa-course-assistant')).toHaveAttribute('data-original-font-status','ready');}
let address = 0;
async function login(page: Page) {
  const principal = 'course-ui-' + crypto.randomUUID() + '@local.test', credential = 'Course-ui-20261028-only';
  const response = await fetch(api + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.18.17.' + (++address) }, body: JSON.stringify({ principal, credential }) });
  expect(response.status).toBe(201); const actor = (await response.json()).data;
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/); return actor;
}
async function call(actor: any, path: string, body?: unknown,method=body === undefined ? 'GET' : 'POST') {
  const response = await fetch(api + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + actor.token },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json(); expect(response.ok, JSON.stringify(value.error)).toBe(true); return value.data;
}
async function cited(actor: any) {
  const d = await call(actor, '/ai/assistant/lecture-context?courseId=sociology-foundations&lectureId=soc-u1-l1');
  const session = await call(actor, '/ai/assistant/sessions', { userRole: 'parent', studentId: null, subject: null, pageContext: 'classroom', contextRefType: 'classroom_lecture', contextRefId: d.referenceId, contextItemId: d.lectureId });
  const context = await call(actor, '/ai/assistant/sessions/' + session.id + '/context');
  const turn = await call(actor, '/ai/assistant/sessions/' + session.id + '/turns', { requestKey: crypto.randomUUID(), message: '[cite-course] 请解释本讲所选概念。', modelId: 'deepseek-v4-flash', contextVersion: context.contextVersion });
  await expect.poll(async () => (await call(actor, '/ai/assistant/sessions/' + session.id + '/turns/' + turn.id)).status, { timeout: 45000 }).toBe('completed');
  const page = await call(actor, '/ai/assistant/sessions/' + session.id + '/messages/page'), message = page.messages.find((m: any) => m.sender === 'assistant');
  expect(message.sourceReferences).toHaveLength(1); return { d, session, message, ref: message.sourceReferences[0] };
}
test('course assistant: opens the actual frozen source directly without creating a conversation or sending a question', async ({ page }) => {
  test.setTimeout(100000); await page.setViewportSize({ width: 880, height: 887 }); const actor = await login(page), data = await cited(actor), posts: string[] = [];
  page.on('request', r => { if (r.method() === 'POST' && /\/ai\/assistant\/sessions(?:\/|$)/.test(r.url())) posts.push(r.url()); });
  await page.goto(data.ref.href); await expect(page.getByRole('heading', { name: '当时的教学出处', exact: true })).toBeVisible(); await sourceFonts(page);
  await expect(page.getByRole('region', { name: '冻结教学内容' })).toContainText('社会学'); expect(posts).toEqual([]);
  await page.reload(); await expect(page.getByRole('heading', { name: '当时的教学出处', exact: true })).toBeVisible(); await sourceFonts(page); expect(posts).toEqual([]);
  if (!process.env.CI) await page.screenshot({ path: evidence + '/source-direct.png', fullPage: true });
});
test('course assistant: a cited answer exposes its source and returns to its complete draft and original message', async ({ page }) => {
  test.setTimeout(100000); const actor = await login(page), data = await cited(actor);
  await page.goto('/studio?view=home&mode=instant&lectureCourse=sociology-foundations&lecture=soc-u1-l1&lectureVersion=' + data.d.fingerprint);
  const input = page.getByLabel('想一起看看什么', { exact: true }); await expect(input).toBeEnabled();
  await input.fill('完整保留的原讲座匿名草稿。');
  const source = page.getByRole('navigation', { name: '本次回答的教学出处' }).getByRole('link').first(); await expect(source).toBeVisible(); await source.click();
  await expect(page.getByRole('heading', { name: '当时的教学出处', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '返回原对话', exact: true }).click(); await expect(input).toHaveValue('完整保留的原讲座匿名草稿。');
  await expect(page.locator('[data-message-id="' + data.message.id + '"]')).toBeFocused();
});

test('course assistant: narrow source views retain every table cell and original teaching code without running it', async ({ page }) => {
  test.setTimeout(100000); await page.setViewportSize({ width: 390, height: 844 }); const actor = await login(page), data = await cited(actor);
  const table = await call(actor, '/ai/assistant/sessions/' + data.session.id + '/sources/lecture-1-6');
  await page.goto(table.reference.href); await expect(page.getByRole('table')).toBeVisible(); await sourceFonts(page);
  const expected = table.sections.flatMap((s: any) => s.blocks).find((b: any) => b.table).table;
  for (const header of expected.headers) await expect(page.getByRole('columnheader', { name: header, exact: true })).toBeVisible();
  for (const row of expected.rows) for (const cell of row) await expect(page.getByRole('cell', { name: cell, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if (!process.env.CI) await page.screenshot({ path: evidence + '/source-table-390.png', fullPage: true });
  const source = await call(actor, '/ai/assistant/sessions/' + data.session.id + '/sources/lecture-1-3'), originalCode = source.sections.flatMap((s: any) => s.blocks).find((b: any) => b.code !== undefined).code;
  const runs: string[] = []; page.on('request', r => { if (r.method() === 'POST' && /(?:code|run|execute)/.test(r.url())) runs.push(r.url()); });
  await page.goto(source.reference.href); await expect(page.getByLabel('原教学代码')).toBeVisible(); await sourceFonts(page); expect(await page.getByLabel('原教学代码').textContent()).toBe(originalCode);
  await expect(page.getByRole('list', { name: '图形完整标注' })).toContainText('行业岗位变化'); expect(runs).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if (!process.env.CI) await page.screenshot({ path: evidence + '/source-code-390.png', fullPage: true });
});

test('course assistant: a different account cannot retain source content or cause a conversation post', async ({ page }) => {
  test.setTimeout(100000); const actor = await login(page), data = await cited(actor); await page.goto(data.ref.href);
  await expect(page.getByRole('region', { name: '冻结教学内容' })).toBeVisible();
  await page.context().clearCookies(); await login(page); const posts: string[] = [];
  page.on('request', r => { if (r.method() === 'POST' && /\/ai\/assistant\/sessions(?:\/|$)/.test(r.url())) posts.push(r.url()); });
  const denied = page.waitForResponse(r => r.url().includes('/ai/assistant/sessions/' + data.session.id + '/sources/'));
  await page.goto(data.ref.href); expect((await denied).status()).toBe(404); await expect(page.getByRole('alert', { name: '出处读取失败' })).toContainText('无法读取'); await sourceFonts(page);
  await expect(page.getByRole('region', { name: '冻结教学内容' })).toHaveCount(0); await expect(page.getByRole('link', { name: '返回原对话', exact: true })).toHaveCount(0); expect(posts).toEqual([]);
});

test('course assistant: source return locates an original answer outside the newest25 messages', async ({ page }) => {
  test.setTimeout(100000); const actor = await login(page), data = await cited(actor);
  await call(actor, '/qa/assistant/seed-history', { sessionId: data.session.id, count: 70, makeSourceOld: true });
  const recent = await call(actor, '/ai/assistant/sessions/' + data.session.id + '/messages/page?pageSize=25');
  expect(recent.messages.some((m: any) => m.id === data.message.id)).toBe(false);
  const href = new URL(data.ref.href, 'https://local.invalid'); href.searchParams.set('assistantSourceMessage', data.message.id);
  await page.goto(href.pathname + href.search); await sourceFonts(page); await page.getByRole('link', { name: '返回原对话', exact: true }).click();
  await expect(page.locator('[data-message-id="' + data.message.id + '"]')).toBeFocused();
  await expect(page.getByRole('navigation', { name: '本次回答的教学出处' })).toBeVisible();
  await page.getByRole('button', { name: '恢复最近消息', exact: true }).click(); await expect(page.locator('[data-message-id="' + data.message.id + '"]')).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe(''); await page.reload(); await expect(page.getByLabel('想一起看看什么', { exact: true })).toBeEnabled();
  await expect(page.locator('[data-message-id="' + data.message.id + '"]')).toHaveCount(0);
});

async function courseFixture(actor: any, kind: 'primary_unit' | 'material_lesson', options: { studentId?: string; long?: boolean; draft?: boolean } = {}) {
  return call(actor, '/qa/assistant/course', { kind, ...options });
}
async function child(actor: any) { return (await call(actor, '/students', { nickname: '匿名课程学习者', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile; }

for(const width of [390,768,880,1440]) test('course assistant: primary unit entry opens its authorized teaching context without a classroom session at'+width, async ({ page }) => {
  test.setTimeout(100000); await page.setViewportSize({width,height:887}); const actor = await login(page), student = await child(actor), row = await courseFixture(actor, 'primary_unit', { studentId: student.id });
  await page.goto('/studio?' + new URLSearchParams({ view: 'courses', student: student.id, subject: 'math', course: row.courseId }));
  await expect(page.getByRole('heading', { name: '匿名数量比较课程', exact: true })).toBeVisible();
  const posts: string[] = []; page.on('request', r => { if (r.method() === 'POST' && /\/learning\/classroom\/sessions(?:\?|$)/.test(r.url())) posts.push(r.url()); });
  await page.getByRole('link', { name: '获取单元帮助', exact: true }).click();
  await expect(page.getByRole('region', { name: '当前课程上下文' })).toContainText('同一整体与相同单位');
  await expect(page.getByLabel('想一起看看什么', { exact: true })).toBeEnabled(); expect(posts).toEqual([]);
  await courseFonts(page);
  await page.getByLabel('想一起看看什么',{exact:true}).fill('[cite-course] 请解释原单元的比较条件。');await page.getByRole('button',{name:'发送学习问题',exact:true}).click();
  await expect(page.getByRole('region',{name:'提问任务',exact:true}).getByRole('status')).toHaveText('回答已保存',{timeout:45000});
  await expect(page.getByRole('navigation',{name:'本次回答的教学出处'})).toContainText('统一单位');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if(!process.env.CI)await page.screenshot({path:evidence+'/primary-entry-'+width+'.png',fullPage:true});
});

for(const width of [390,768,880,1440])test('course assistant: material lesson entry opens actual safe teaching and its published scope at'+width, async ({ page }) => {
  test.setTimeout(100000);await page.setViewportSize({width,height:887}); const actor = await login(page), row = await courseFixture(actor, 'material_lesson');
  await page.goto('/studio/source-courses?' + new URLSearchParams({ course: row.courseId }));
  await expect(page.getByRole('heading', { name: '匿名资料比较课程', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '获取课时帮助', exact: true }).click();
  await expect(page.getByRole('region', { name: '当前课程上下文' })).toContainText('资料中的比较条件');
  await expect(page.getByLabel('想一起看看什么', { exact: true })).toBeEnabled();
  await courseFonts(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if(!process.env.CI)await page.screenshot({path:evidence+'/material-entry-'+width+'.png',fullPage:true});
});

test('course assistant: oversized full teaching preserves the complete question and copies it only into explicitly selected detail',async({page})=>{
  test.setTimeout(120000);const actor=await login(page),student=await child(actor),row=await courseFixture(actor,'primary_unit',{studentId:student.id,long:true});const posts:string[]=[];
  page.on('request',r=>{if(r.method()==='POST'&&/\/ai\/assistant\/sessions$/.test(r.url()))posts.push(r.postData()??'');});
  await page.goto(row.href);const input=page.getByLabel('想一起看看什么',{exact:true});await expect(input).toBeEnabled();await expect(page.getByText('所选教学原文超过当前模型输入范围。原问题仍可编辑、下载并在选择范围后继续。')).toBeVisible();
  const question='请保留完整比较条件。'.repeat(120);await input.fill(question);await expect(page.getByRole('button',{name:'发送学习问题',exact:true})).toBeDisabled();expect(posts).toEqual([]);
  await page.getByRole('button',{name:'选择教学范围',exact:true}).click();const dialog=page.getByRole('dialog',{name:'选择教学范围',exact:true});
  await dialog.getByRole('radio',{name:'自选教学条目',exact:true}).check();await expect(dialog.getByRole('checkbox')).toHaveCount(113);
  await dialog.getByRole('checkbox',{name:'概念 · 比较条件 16',exact:true}).check();await dialog.getByRole('button',{name:'核对所选范围',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'应用所选范围',exact:true})).toBeEnabled();await dialog.getByRole('button',{name:'应用所选范围',exact:true}).click();
  await expect(input).toHaveValue(question);await expect(page.getByRole('region',{name:'当前课程上下文'})).toContainText('同一整体与相同单位');
  await expect(page.getByText('自选教学条目 · 1/16 知识目标 · 1/112 教学条目')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('assistantCarry')).toMatch(/^[a-f0-9-]{36}$/);expect(page.url()).not.toContain(encodeURIComponent(question));
  await expect(page.getByRole('button',{name:'发送学习问题',exact:true})).toBeEnabled();await page.goBack();await expect(input).toHaveValue(question);
  await expect(page.getByRole('button',{name:'发送学习问题',exact:true})).toBeDisabled();await page.goForward();await expect(input).toHaveValue(question);await page.reload();await expect(input).toHaveValue(question);
});

test('course assistant: an existing range draft is preserved until the original question copy is explicitly adopted',async({page})=>{
 test.setTimeout(120000);const actor=await login(page),student=await child(actor),row=await courseFixture(actor,'primary_unit',{studentId:student.id});await page.goto(row.href);
 const input=page.getByLabel('想一起看看什么',{exact:true});await expect(input).toBeEnabled();await input.fill('原完整范围的匿名问题。');
 async function overview(copy:boolean){await page.getByRole('button',{name:'选择教学范围',exact:true}).click();const d=page.getByRole('dialog',{name:'选择教学范围',exact:true});await d.getByRole('radio',{name:/课程目标概览/}).check();await d.getByRole('checkbox',{name:'保留当前问题并复制到新范围'}).setChecked(copy);await d.getByRole('button',{name:'核对所选范围',exact:true}).click();await expect(d.getByRole('button',{name:'应用所选范围',exact:true})).toBeEnabled();await d.getByRole('button',{name:'应用所选范围',exact:true}).click();}
 await overview(false);await expect(input).toHaveValue('');await input.fill('概览范围原有的另一份草稿。');await page.goBack();await expect(input).toHaveValue('原完整范围的匿名问题。');await overview(true);
 await expect(input).toHaveValue('概览范围原有的另一份草稿。');await expect(page.getByText('新范围已有草稿。待采用的原问题副本：')).toBeVisible();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载当前问题并采用副本',exact:true}).click();expect((await download).suggestedFilename()).toBe('学习提问副本.json');
 await expect(input).toHaveValue('原完整范围的匿名问题。');await page.reload();await expect(input).toHaveValue('原完整范围的匿名问题。');await expect(page.getByText('新范围已有草稿。待采用的原问题副本：')).toHaveCount(0);
});

test('course assistant: learner switching and source scope mismatch hide the original content until returning to its actual profile',async({page})=>{
 test.setTimeout(120000);const actor=await login(page),one=await child(actor),two=await child(actor),row=await courseFixture(actor,'primary_unit',{studentId:one.id});await page.goto(row.href);
 const input=page.getByLabel('想一起看看什么',{exact:true});await expect(input).toBeEnabled();await input.fill('只属于第一个课程档案的草稿。');
 await page.getByLabel('学习档案',{exact:true}).selectOption(two.id);await expect(page.getByText('当前学习档案或学科与课程不一致。')).toBeVisible();await expect(input).toHaveCount(0);
 expect(new URL(page.url()).searchParams.get('courseId')).toBe(row.courseId);await page.getByRole('button',{name:'切回课程档案',exact:true}).click();await expect(input).toHaveValue('只属于第一个课程档案的草稿。');
 await input.fill('[cite-course] 请说明单位条件。');await page.getByRole('button',{name:'发送学习问题',exact:true}).click();await expect(page.getByRole('navigation',{name:'本次回答的教学出处'})).toBeVisible();
 const href=await page.getByRole('navigation',{name:'本次回答的教学出处'}).getByRole('link').first().getAttribute('href');const q=new URL(href!,'https://local.invalid');q.searchParams.set('student',two.id);q.searchParams.set('subject','math');
 await page.goto(q.pathname+q.search);await expect(page.getByRole('alert',{name:'出处读取失败'})).toContainText('不一致');await expect(page.getByRole('region',{name:'冻结教学内容'})).toHaveCount(0);
 await page.getByRole('link',{name:'切回课程档案',exact:true}).click();await expect(page.getByRole('region',{name:'冻结教学内容'})).toContainText('比较两个量');
});

test('course assistant: current author draft becomes an original read-only scope on publication and keeps its question',async({page})=>{
 test.setTimeout(120000);const actor=await login(page),row=await courseFixture(actor,'material_lesson',{draft:true});await page.goto(row.href);const input=page.getByLabel('想一起看看什么',{exact:true});await expect(input).toBeEnabled();
 await expect(page.getByRole('region',{name:'当前课程上下文'})).toContainText('待核对教案');await input.fill('作者教案中尚未发送的原问题。');await page.getByRole('button',{name:'发送学习问题',exact:true}).click();await expect(page.getByRole('region',{name:'提问任务',exact:true}).getByRole('status')).toHaveText('回答已保存',{timeout:45000});await input.fill('发布前保留的另一份草稿。');
 const original=page.url();await call(actor,'/qa/assistant/course-state',{courseId:row.courseId,action:'publish'});let posts=0;page.on('request',r=>{if(r.method()==='POST'&&/\/ai\/assistant\/sessions$/.test(r.url()))posts++;});await page.reload();await expect(input).toHaveValue('发布前保留的另一份草稿。');
 await expect(page.getByRole('button',{name:'发送学习问题',exact:true})).toBeDisabled();expect(posts).toBe(0);await page.getByRole('button',{name:'打开当前课程版本',exact:true}).click();await expect(page.getByRole('region',{name:'当前课程上下文'})).toContainText('已确认课程');await expect(input).toHaveValue('');await page.goBack();await expect(page).toHaveURL(original);await expect(input).toHaveValue('发布前保留的另一份草稿。');
});

async function learningCode(page:Page,actor:any,studentId:string){const access=await call(actor,'/students/'+studentId+'/learning-access',{enabled:true,expectedVersion:0,requestKey:crypto.randomUUID(),reason:'匿名课程页面权限验收'});const code=await call(actor,'/students/'+studentId+'/learning-access/codes',{expectedVersion:access.version,requestKey:crypto.randomUUID()});
 await page.goto('/student/login');await page.getByLabel('一次性学习码').fill(code.code);const login=page.waitForResponse(r=>r.url().endsWith('/api/auth/learning-code')&&r.request().method()==='POST');await page.getByRole('button',{name:'进入我的学习 →',exact:true}).click();const user=(await(await login).json()).data;await expect(page).toHaveURL(/\/learn(?:\?|$)/);return user;
}

test('course assistant: actual learning-code student opens published courses and exits to own learning with its draft intact',async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width:390,height:887});const actor=await login(page),student=await child(actor),primary=await courseFixture(actor,'primary_unit',{studentId:student.id}),material=await courseFixture(actor,'material_lesson',{studentId:student.id}),privateDraft=await courseFixture(actor,'material_lesson',{studentId:student.id,draft:true});await learningCode(page,actor,student.id);await page.goto(primary.href);
 const input=page.getByLabel('想一起看看什么',{exact:true});await expect(input).toBeEnabled();await input.fill('学生单元里未发送的完整问题。');await page.getByRole('button',{name:'移除课程上下文',exact:true}).click();await expect(page).toHaveURL(/\/studio\?[^#]*view=courses/);expect(page.url()).not.toContain('audience=independent');await page.goBack();await expect(input).toHaveValue('学生单元里未发送的完整问题。');
 await page.goto(material.href);await expect(input).toBeEnabled();await input.fill('[cite-course] 请解释资料中整体与单位的关系。');await page.getByRole('button',{name:'发送学习问题',exact:true}).click();await expect(page.getByRole('navigation',{name:'本次回答的教学出处'})).toContainText('匿名比较资料');
 await page.getByRole('navigation',{name:'本次回答的教学出处'}).getByRole('link').click();await expect(page.getByRole('region',{name:'冻结教学内容'})).toContainText('比较数量之前');
 const posts:string[]=[];page.on('request',r=>{if(r.method()==='POST'&&/\/ai\/assistant\/sessions$/.test(r.url()))posts.push(r.url());});await page.goto(privateDraft.href);await expect(page.locator('.sa-context-error')).toContainText(/无法访问|只能由/);await expect(input).toHaveCount(0);expect(posts).toEqual([]);
});

test('course assistant: real assessment beginning after entry blocks a new model command and preserves the original student question',async({page})=>{
 test.setTimeout(150000);const actor=await login(page),student=await child(actor),row=await courseFixture(actor,'primary_unit',{studentId:student.id});
 await call(actor,'/students/'+student.id+'/learning-scope',{subject:'math',grade:4,term:'upper',textbookVolumeId:null,textbookVersion:'匿名已学范围',learnedAtomIds:['atomic:math:averagecount'],currentAtomId:'atomic:math:averagecount',minutesPerSession:10},'PUT');
 await learningCode(page,actor,student.id);await page.goto(row.href);const input=page.getByLabel('想一起看看什么',{exact:true});await expect(input).toBeEnabled();await input.fill('先保留这段课程问题，正式评测之后再问。');
 const formal=await call(actor,'/diagnostics/sessions',{studentId:student.id,subject:'math',intent:'baseline',targetAtomIds:['atomic:math:averagecount'],includePrerequisites:false,maxItems:4});const posts:string[]=[];
 page.on('request',r=>{if(r.method()==='POST'&&/\/ai\/assistant\/sessions\/[^/?]+\/turns$/.test(r.url()))posts.push(r.postData()??'');});await page.getByRole('button',{name:'发送学习问题',exact:true}).click();await expect(page.getByRole('link',{name:'进入原评测',exact:true})).toHaveAttribute('href','/student/assessment?session='+formal.id);
 await expect(input).toHaveValue('先保留这段课程问题，正式评测之后再问。');expect(posts).toEqual([]);await expect(page.getByRole('button',{name:'发送学习问题',exact:true})).toBeDisabled();
 await page.reload();await expect(input).toHaveValue('先保留这段课程问题，正式评测之后再问。');await expect(page.getByRole('button',{name:'发送学习问题',exact:true})).toBeDisabled();
 await page.getByRole('link',{name:'进入原评测',exact:true}).click();await expect(page).toHaveURL(new RegExp('session='+formal.id));await expect(page.locator('.studio-question-top')).toBeVisible();await page.goBack();
 const view=await call(actor,'/diagnostics/sessions/'+formal.id);await call(actor,'/diagnostics/sessions/'+formal.id+'/state',{action:'abort',expectedRevision:view.revision,requestKey:crypto.randomUUID(),reason:'结束隔离课程边界验收，不形成评测结果'});
 await page.getByRole('button',{name:'重新核对课程',exact:true}).click();await expect(input).toHaveValue('先保留这段课程问题，正式评测之后再问。');await expect(page.getByRole('button',{name:'发送学习问题',exact:true})).toBeEnabled();expect(posts).toEqual([]);
});

test('course assistant: no-fingerprint student entry during an existing assessment offers its exact return without opening a chat',async({page})=>{
 test.setTimeout(120000);const actor=await login(page),student=await child(actor),row=await courseFixture(actor,'primary_unit',{studentId:student.id});await call(actor,'/students/'+student.id+'/learning-scope',{subject:'math',grade:4,term:'upper',textbookVolumeId:null,textbookVersion:'匿名已学范围',learnedAtomIds:['atomic:math:averagecount'],currentAtomId:'atomic:math:averagecount',minutesPerSession:10},'PUT');const formal=await call(actor,'/diagnostics/sessions',{studentId:student.id,subject:'math',intent:'baseline',targetAtomIds:['atomic:math:averagecount'],includePrerequisites:false,maxItems:4});await learningCode(page,actor,student.id);const posts:string[]=[];page.on('request',r=>{if(r.method()==='POST'&&/\/ai\/assistant\/sessions$/.test(r.url()))posts.push(r.url());});await page.goto(row.href);await expect(page.getByRole('link',{name:'进入原评测',exact:true})).toHaveAttribute('href','/student/assessment?session='+formal.id);await expect(page.getByLabel('想一起看看什么',{exact:true})).toHaveCount(0);expect(posts).toEqual([]);
});

test('course assistant: material tools preserve the authoritative scope and draft through refresh and planner return',async({page})=>{
 test.setTimeout(120000);const actor=await login(page),student=await child(actor),row=await courseFixture(actor,'material_lesson',{studentId:student.id});await page.goto(row.href);const input=page.getByLabel('想一起看看什么',{exact:true});await expect(input).toBeEnabled();await input.fill('资料课程中尚未发送的匿名草稿。');const original=new URL(page.url());
 await page.getByRole('button',{name:'打开学习资料',exact:true}).click();await expect(page).toHaveURL(/view=materials/);expect(new URL(page.url()).searchParams.get('courseVersion')).toBe(original.searchParams.get('courseVersion'));await page.reload();
 await page.locator('.ws-navigation').getByRole('button',{name:'Home',exact:true}).click();await expect(input).toHaveValue('资料课程中尚未发送的匿名草稿。');await page.getByRole('button',{name:'学习计划',exact:true}).click();await expect(page).toHaveURL(/view=calendar/);await page.reload();await page.locator('.ws-navigation').getByRole('button',{name:'Home',exact:true}).click();await expect(input).toHaveValue('资料课程中尚未发送的匿名草稿。');
});

test('course assistant: closing a pending range preflight ignores its late response and restores keyboard focus',async({page})=>{
 test.setTimeout(120000);const actor=await login(page),student=await child(actor),row=await courseFixture(actor,'primary_unit',{studentId:student.id});await page.goto(row.href);const input=page.getByLabel('想一起看看什么',{exact:true});await expect(input).toBeEnabled();await input.fill('范围预检取消后仍保留的原问题。');const original=page.url();let release!:()=>void,seen=false;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route(/\/ai\/assistant\/course-context\?.*selection=/,async route=>{const response=await route.fetch();seen=true;await gate;await route.fulfill({response});});try{await page.getByRole('button',{name:'选择教学范围',exact:true}).click();const d=page.getByRole('dialog',{name:'选择教学范围',exact:true});await d.getByRole('radio',{name:/课程目标概览/}).check();await d.getByRole('button',{name:'核对所选范围',exact:true}).click();await expect.poll(()=>seen).toBe(true);await page.keyboard.press('Escape');await expect(d).toHaveCount(0);release();await page.unrouteAll({behavior:'wait'});await expect(page).toHaveURL(original);await expect(input).toHaveValue('范围预检取消后仍保留的原问题。');await expect(page.getByRole('button',{name:'选择教学范围',exact:true})).toBeFocused();}finally{release();await page.unrouteAll({behavior:'wait'});}
});
