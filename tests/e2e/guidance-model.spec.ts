import { expect,test,type Page } from '@playwright/test';
import { browserEvidence } from './evidence';
const api=`http://localhost:${process.env.E2E_API_PORT??'4107'}/api`,evidence=browserEvidence('guidance-model');let address=0;
async function setup(page:Page,makePlan=true) {
  const suffix=crypto.randomUUID(),principal='guidance-browser-'+suffix+'@local.test',credential='Guidance-QA-'+suffix;
  const registered=await fetch(api+'/auth/register',{method:'POST',headers:{'content-type':'application/json','X-Forwarded-For':'198.18.10.'+(++address)},body:JSON.stringify({principal,credential})});expect(registered.status).toBe(201);const actor=(await registered.json()).data;
  async function call(path:string,body?:unknown,method=body===undefined?'GET':'POST') {const response=await fetch(api+path,{method,headers:{'content-type':'application/json',authorization:'Bearer '+actor.token},...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await response.json();expect(response.ok,JSON.stringify(result.error)).toBe(true);return result.data;}
  const studentId=(await call('/students',{nickname:'匿名指导浏览器',grade:4,preferredSessionMinutes:10,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id,atom='atomic:math:averagecount';
  await call('/students/'+studentId+'/learning-scope',{subject:'math',grade:4,term:'upper',textbookVolumeId:null,textbookVersion:'原创能力路径',learnedAtomIds:[atom],currentAtomId:atom,minutesPerSession:10},'PUT');
  const baseline=await call('/diagnostics/sessions',{studentId,subject:'math',intent:'baseline',targetAtomIds:[atom],includePrerequisites:false,maxItems:4});
  for(const item of baseline.items)await call('/diagnostics/sessions/'+baseline.id+'/responses',{itemId:item.id,disposition:'skip',elapsedMs:100});await call('/diagnostics/sessions/'+baseline.id+'/complete',{});
  const plan=makePlan?await call('/diagnostics/students/'+studentId+'/plans',{baselineSessionId:baseline.id,minutesPerDay:10,useAi:false,requestKey:crypto.randomUUID(),expectedReportVersion:1}):null;
  await page.goto('/parent/login');await page.getByLabel('登录账号').fill(principal);await page.getByLabel('密码').fill(credential);await page.getByRole('button',{name:'登录，查看学习记录 →'}).click();await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  const href='/student/assessment?'+new URLSearchParams({studentId,subject:'math',...(plan?{view:'plan',planId:plan.id}:{session:baseline.id})});await page.goto(href);
  if(plan)await expect(page.getByRole('region',{name:'AI指导说明建议'})).toBeVisible();else await expect(page.getByRole('heading',{name:'从知识点看清下一步。'})).toBeVisible();
  return {actor,studentId,baseline,plan,call,href};
}
const panel=(page:Page)=>page.getByRole('region',{name:'AI指导说明建议'});
test.afterEach(async({page})=>{await page.unrouteAll({behavior:'wait'});});

test('the original rule plan stays usable and an explicitly reviewed model description changes only its text',async({page})=>{
  const f=await setup(page);await panel(page).getByLabel('选择大模型').selectOption('deepseek-v4-flash');await panel(page).getByRole('button',{name:'生成说明建议',exact:true}).click();
  await expect(panel(page).getByText('建议已生成',{exact:true})).toBeVisible();expect((await f.call('/diagnostics/plans/'+f.plan.id)).summary).toBe(f.plan.summary);
  await panel(page).getByText('对照原说明与建议，再决定是否采用',{exact:true}).click();await expect(panel(page).getByRole('region',{name:'原计划说明'})).toContainText(f.plan.summary);
  await expect(panel(page).getByRole('region',{name:'模型建议说明'})).toContainText('合成测试建议');await panel(page).getByRole('button',{name:'采用这份说明',exact:true}).click();
  await expect(page.locator('.guidance-version')).toContainText('第 2 版');const adopted=await f.call('/diagnostics/plans/'+f.plan.id);expect(adopted.source).toBe('ai');
  expect(adopted.actions.map(({activity:_,...action}:any)=>action)).toEqual(f.plan.actions.map(({activity:_,...action}:any)=>action));
  await page.reload();await expect(page.locator('.guidance-version')).toContainText('第 2 版');await expect(panel(page)).toContainText('DeepSeek V4.1 Flash');
});

test('a dropped plan creation acknowledgement recovers the original request without making another plan',async({page})=>{
  const f=await setup(page,false);let original:any;
  await page.route('**/api/diagnostics/students/*/plans',async route=>{if(route.request().method()!=='POST')return route.continue();original=route.request().postDataJSON();await route.fetch();await route.abort('failed');});
  await page.getByRole('button',{name:/制定指导计划/}).click();await expect(page.getByRole('button',{name:'读取原计划创建结果',exact:true})).toBeEnabled();
  await page.unroute('**/api/diagnostics/students/*/plans');await page.reload();await expect(page.getByRole('button',{name:'读取原计划创建结果',exact:true})).toBeEnabled();
  let created=0;page.on('request',request=>{if(request.method()==='POST'&&/\/students\/[^/]+\/plans$/.test(request.url()))created++;});
  await page.getByRole('button',{name:'读取原计划创建结果',exact:true}).click();await expect(panel(page)).toBeVisible();expect(created).toBe(0);
  const plans=await f.call('/diagnostics/students/'+f.studentId+'/plans?subject=math');expect(plans).toHaveLength(1);expect(plans[0].baselineReportVersion).toBe(original.expectedReportVersion);
});

test('a dropped suggestion creation acknowledgement survives reload and restores the same saved task',async({page})=>{
  const f=await setup(page);let original:any;await page.route('**/api/diagnostics/plans/*/model-suggestions',async route=>{if(route.request().method()!=='POST')return route.continue();original=route.request().postDataJSON();await route.fetch();await route.abort('failed');});
  await panel(page).getByRole('button',{name:'生成说明建议',exact:true}).click();await expect(panel(page).getByRole('button',{name:'读取并恢复原操作'})).toBeEnabled();
  await page.unroute('**/api/diagnostics/plans/*/model-suggestions');await page.reload();await expect(panel(page).getByRole('button',{name:'读取并恢复原操作'})).toBeEnabled();
  await panel(page).getByRole('button',{name:'读取并恢复原操作'}).click();await expect(panel(page).getByText('建议已生成',{exact:true})).toBeVisible();
  const list=await f.call('/diagnostics/plans/'+f.plan.id+'/model-suggestions');expect(list.suggestions).toHaveLength(1);expect(list.suggestions[0].requestKey).toBe(original.requestKey);
});

test('a dropped adoption acknowledgement replays its original command and leaves exactly one adopted revision',async({page})=>{
  const f=await setup(page);await panel(page).getByRole('button',{name:'生成说明建议',exact:true}).click();await expect(panel(page).getByText('建议已生成',{exact:true})).toBeVisible();
  await panel(page).getByText('对照原说明与建议，再决定是否采用',{exact:true}).click();
  await page.route('**/api/diagnostics/plans/*/model-suggestions/*/adopt',async route=>{await route.fetch();await route.abort('failed');});
  await panel(page).getByRole('button',{name:'采用这份说明',exact:true}).click();await expect(panel(page).getByRole('button',{name:'读取并恢复原操作'})).toBeEnabled();
  await page.unroute('**/api/diagnostics/plans/*/model-suggestions/*/adopt');await page.reload();await panel(page).getByRole('button',{name:'读取并恢复原操作'}).click();await expect(page.locator('.guidance-version')).toContainText('第 2 版');
  expect((await f.call('/diagnostics/plans/'+f.plan.id+'/history')).filter((row:any)=>row.kind==='adjusted')).toHaveLength(1);
});

test('cancel and retry preserve the original selected model and plan',async({page})=>{
  const f=await setup(page);await f.call('/qa/guidance-models/'+f.plan.id+'/behavior',{mode:'hold'});await panel(page).getByLabel('选择大模型').selectOption('deepseek-v4-flash');
  await panel(page).getByRole('button',{name:'生成说明建议',exact:true}).click();await expect(panel(page).getByText('正在生成说明',{exact:true})).toBeVisible();
  await panel(page).getByRole('button',{name:'取消生成',exact:true}).click();await expect(panel(page).getByText('已取消',{exact:true})).toBeVisible();
  await f.call('/qa/guidance-models/'+f.plan.id+'/behavior',{mode:'valid'});await panel(page).getByLabel('选择大模型').selectOption('claude-sonnet-5');await panel(page).getByRole('button',{name:'重试原模型'}).click();
  await expect(panel(page).getByText('建议已生成',{exact:true})).toBeVisible();const list=await f.call('/diagnostics/plans/'+f.plan.id+'/model-suggestions');expect(list.suggestions).toHaveLength(1);expect(list.suggestions[0].modelId).toBe('deepseek-v4-flash');expect((await f.call('/diagnostics/plans/'+f.plan.id)).source).toBe('rules');
});

test('invalid output cannot be adopted and a later explicit retry keeps the original evidence',async({page})=>{
  const f=await setup(page);await f.call('/qa/guidance-models/'+f.plan.id+'/behavior',{mode:'invalid-once'});await panel(page).getByRole('button',{name:'生成说明建议',exact:true}).click();
  await expect(panel(page).getByText('生成未完成',{exact:true})).toBeVisible();await expect(panel(page).getByRole('button',{name:'采用这份说明'})).toHaveCount(0);
  await panel(page).getByRole('button',{name:'重试原模型'}).click();await expect(panel(page).getByText('建议已生成',{exact:true})).toBeVisible();expect((await f.call('/diagnostics/plans/'+f.plan.id)).actions).toEqual(f.plan.actions);
});

test('unavailable browser storage keeps the full original command downloadable',async({page})=>{
  await page.addInitScript(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('studyagent.guidance.model.v1.'))throw new DOMException('QA quota','QuotaExceededError');return set.call(this,key,value);};});
  await setup(page);await panel(page).getByRole('button',{name:'生成说明建议',exact:true}).click();await expect(panel(page).getByText(/本机暂存不可用/)).toBeVisible();
  const download=page.waitForEvent('download');await panel(page).getByRole('button',{name:'下载原命令副本'}).click();expect((await download).suggestedFilename()).toBe('指导建议原命令副本.json');await expect(panel(page).getByText('建议已生成',{exact:true})).toBeVisible();
});

test('a manually changed plan refuses an older completed suggestion and preserves its original command',async({page})=>{
  const f=await setup(page);await panel(page).getByRole('button',{name:'生成说明建议',exact:true}).click();await expect(panel(page).getByText('建议已生成',{exact:true})).toBeVisible();
  await panel(page).getByText('对照原说明与建议，再决定是否采用',{exact:true}).click();
  await f.call('/diagnostics/plans/'+f.plan.id+'/adjust',{expectedRevision:f.plan.revision,requestKey:crypto.randomUUID(),reason:'合成浏览器中在另一页面明确手工修改活动',minutesPerDay:f.plan.minutesPerDay,acknowledgeReportVersion:f.plan.baselineReportVersion,
    actions:f.plan.actions.map((action:any)=>({actionId:action.id,minutes:action.minutes,activity:'家长在另一页面确认的观察方案，保留独立小测与验证。'}))});
  await panel(page).getByRole('button',{name:'采用这份说明',exact:true}).click();await expect(panel(page).getByText('采用未获确认，已读取当前建议；原命令保留在副本中。',{exact:true})).toBeVisible();
  await expect(panel(page).getByRole('button',{name:'采用这份说明',exact:true})).toBeDisabled();const current=await f.call('/diagnostics/plans/'+f.plan.id);expect(current.source).toBe('human');expect(current.revision).toBe(2);
  await page.reload();await expect(page.locator('.guidance-version')).toContainText('第 2 版');await expect(panel(page).getByRole('button',{name:'下载原命令副本'})).toBeVisible();
});

test('a cancelled local wait resumes the server record after navigating away and back',async({page})=>{
  const f=await setup(page);await f.call('/qa/guidance-models/'+f.plan.id+'/behavior',{mode:'hold'});await panel(page).getByRole('button',{name:'生成说明建议',exact:true}).click();
  await expect(panel(page).getByText('正在生成说明',{exact:true})).toBeVisible();let cancellations=0;
  page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/model-suggestions/')&&request.url().endsWith('/cancel'))cancellations++;});
  await panel(page).getByRole('button',{name:'暂停读取状态',exact:true}).click();await expect(panel(page).getByText('已暂停自动读取，可以继续使用原计划，稍后查看建议。',{exact:true})).toBeVisible();
  expect((await f.call('/diagnostics/plans/'+f.plan.id+'/model-suggestions')).suggestions[0].status).toBe('running');expect(cancellations).toBe(0);
  await panel(page).getByRole('button',{name:'继续读取状态',exact:true}).click();await expect(panel(page).getByRole('button',{name:'暂停读取状态',exact:true})).toBeVisible();
  await page.goto('/learn');await page.goto(f.href);await expect(panel(page).getByText('正在生成说明',{exact:true})).toBeVisible();
  await panel(page).getByRole('button',{name:'取消生成',exact:true}).click();await expect(panel(page).getByText('已取消',{exact:true})).toBeVisible();
  expect((await f.call('/diagnostics/plans/'+f.plan.id+'/model-suggestions')).suggestions).toHaveLength(1);
});

test('forged cross-account cached commands are ignored and never replayed',async({page})=>{
  const f=await setup(page),key='studyagent.guidance.model.v1.'+encodeURIComponent(f.actor.user.id)+'.'+encodeURIComponent(f.plan.id);
  await page.evaluate(({key,plan})=>localStorage.setItem(key,JSON.stringify({version:1,ownerId:'another-account',planId:plan.id,studentId:plan.studentId,selectedId:null,rejected:null,
    pending:{kind:'create',command:{modelId:'deepseek-v4-flash',expectedRevision:1,requestKey:'forged-guidance-request'}}})),{key,plan:f.plan});
  let sent=0;page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/model-suggestions'))sent++;});await page.reload();
  await expect(panel(page).getByText('本机记录与当前账号或计划不匹配，已保留原缓存并忽略恢复。',{exact:true})).toBeVisible();await expect(panel(page).getByRole('button',{name:'读取并恢复原操作'})).toHaveCount(0);expect(sent).toBe(0);
  expect((await f.call('/diagnostics/plans/'+f.plan.id+'/model-suggestions')).suggestions).toHaveLength(0);
});

test('another account cannot open or adopt the prior family guidance',async({page})=>{
  const first=await setup(page);await panel(page).getByRole('button',{name:'生成说明建议',exact:true}).click();await expect(panel(page).getByText('建议已生成',{exact:true})).toBeVisible();
  const second=await setup(page);expect(second.actor.user.id).not.toBe(first.actor.user.id);await expect(panel(page).getByText('建议已生成',{exact:true})).toHaveCount(0);
  await page.goto('/student/assessment?'+new URLSearchParams({studentId:second.studentId,subject:'math',view:'plan',planId:first.plan.id}));
  await expect(page.getByRole('alert').filter({hasText:'链接中的指导计划不属于当前孩子'})).toContainText('已返回学习进度。');await expect(panel(page)).toHaveCount(0);
  await page.goto(first.href);await expect(page.getByRole('alert').filter({hasText:'无法访问链接中的孩子'})).toContainText('已返回当前账号的学习进度。');await expect(panel(page)).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('studentId')).toBe(second.studentId);expect(new URL(page.url()).searchParams.has('planId')).toBe(false);
});

for(const width of [390,768,1440])test('guidance comparisons and actions fit at '+width,async({page})=>{
  // CI uses the built-in catalog; a local Xiaojiu catalog may shorten this description.
  await page.route('**/api/ai/models',async route=>{const response=await route.fetch(),body=await response.json();
    for(const model of body.data.models)if(model.id==='deepseek-v4-flash')model.description='当前渠道：DeepSeek V4 Flash · 快速推理与文档复核';
    await route.fulfill({response,json:body});});
  await page.setViewportSize({width,height:1000});await setup(page);await panel(page).getByRole('button',{name:'生成说明建议',exact:true}).click();await expect(panel(page).getByText('建议已生成',{exact:true})).toBeVisible();
  await panel(page).getByText('对照原说明与建议，再决定是否采用',{exact:true}).click();await panel(page).getByRole('button',{name:'采用这份说明'}).scrollIntoViewIfNeeded();await expect(panel(page).getByRole('button',{name:'采用这份说明'})).toBeVisible();
  const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    overflow:[...document.querySelectorAll<HTMLElement>('body *')].filter(element=>element.getBoundingClientRect().right>innerWidth+1)
      .slice(0,12).map(element=>({tag:element.tagName,className:element.className,width:element.getBoundingClientRect().width,scrollWidth:element.scrollWidth}))}));
  expect(layout.scrollWidth,JSON.stringify(layout)).toBeLessThanOrEqual(layout.width+1);if(!process.env.CI)await page.screenshot({path:evidence+'/comparison-'+width+'.png',fullPage:true});
});
