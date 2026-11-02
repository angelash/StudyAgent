import { test,expect,type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { syntheticFamilyHeaders } from './synthetic-family';
import { browserEvidence } from './evidence';
const api='http://localhost:'+(process.env.E2E_API_PORT??'4204')+'/api',evidence=browserEvidence('workspace-gesp');
const io='gesp-student-cpp-sum-two';

test('GESP workspace: a legacy receipt without first-response metadata never displays an independent-completion claim',async({page})=>{
  test.setTimeout(120000);const f=await fixture(page);
  await page.getByRole('button',{name:'获取第 1 级提示',exact:true}).click();
  await expect(page.locator('.gesp-probes[aria-label="渐进提示"] .studio-notice')).toBeVisible();
  await page.route('**/api/gesp/code-submissions',async route=>{
    const response=await route.fetch({timeout:60000}),body=await response.json();
    // Response-only historical-shape fixture. The actual database receipt is kept unchanged.
    delete body.data.evidence;body.data.independent=true;body.data.hintLevel=0;
    await route.fulfill({response,json:body});
  });
  await f.input.fill('#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}');
  await page.getByRole('button',{name:'提交并运行 →',exact:true}).click();
  await expect(page.locator('.gesp-result')).toContainText('独立性尚未确认的历史记录',{timeout:60000});
  await expect(page.locator('.gesp-result')).not.toContainText('本次首答在反馈展示前保存');
});
test.afterEach(async({page})=>page.unrouteAll({behavior:'wait'}));
async function fixture(page:Page){
  const headers=await syntheticFamilyHeaders(page),nonce=crypto.randomUUID(),principal='gesp-workspace-'+nonce,credential='GESP-QA-'+nonce;
  let token='';async function call(path:string,body?:unknown,method=body===undefined?'GET':'POST',status=method==='POST'?201:200){const reply=await fetch(api+path,{method,headers:{...headers,...(token?{authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const payload=await reply.json();expect(reply.status,path+': '+JSON.stringify(payload.error)).toBe(status);return payload.data;}
  const actor=await call('/auth/register',{principal,credential});token=actor.token;
  const child=(await call('/students',{nickname:'认证轨道测试档案',grade:4,preferredSessionMinutes:15,defaultVersionMap:{math:'common',chinese:'common',english:'common'}})).profile;
  await call('/gesp/students/'+child.id+'/scope',{level:1,atomIds:['gesp-cpp.l1.io','gesp-cpp.l1.loop'],requestKey:crypto.randomUUID(),reason:'合成认证轨道与完整代码恢复测试'},'PUT');
  const access=await call('/students/'+child.id+'/learning-access',{enabled:true,expectedVersion:0,requestKey:crypto.randomUUID(),reason:'合成学习码独立认证课程验证'}),code=await call('/students/'+child.id+'/learning-access/codes',{expectedVersion:access.version,requestKey:crypto.randomUUID()});
  await page.goto('/student/login');await page.getByLabel('一次性学习码').fill(code.code);await page.getByRole('button',{name:'进入我的学习 →',exact:true}).click();await expect(page).toHaveURL(/\/studio(?:\?|$)/);
  const href='/student/gesp?level=1&task='+io;await page.goto(href);const input=page.getByRole('textbox',{name:'GESP C++源代码',exact:true});await expect(input).toBeEnabled();
  return {actor,child,call,href,input,principal,credential,workspace:()=>call('/gesp/students/'+child.id+'/workspace')};
}
async function capture(page:Page,name:string){mkdirSync(evidence,{recursive:true});await page.screenshot({path:evidence+'/'+name+'.png',fullPage:true});}

test('GESP workspace: code-first feedback stays held until both probe first responses are saved',async({page})=>{
  test.setTimeout(180000);const f=await fixture(page);
  await f.input.fill('#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}');
  await page.getByRole('button',{name:'提交并运行 →',exact:true}).click();
  await expect(page.getByRole('heading',{name:'代码首答已保存',exact:true})).toBeVisible({timeout:60000});
  await expect(page.locator('.gesp-result')).toHaveCount(0);
  const before=await f.workspace();expect(before.submissions[0]).toMatchObject({status:'recorded',tests:[],compilePassed:null});
  for(const [pattern,answer] of [[/理解.*标准输入/,'cin 与 cout'],[/步骤跟踪.*读入/,'5']] as const){
    const group=page.getByRole('group',{name:pattern});await group.getByLabel(answer,{exact:true}).check();
    await group.getByRole('button',{name:'提交本次判断',exact:true}).click();
    await expect(page.getByRole('region',{name:'GESP原操作恢复',exact:true})).toHaveCount(0);
  }
  await expect(page.locator('.gesp-result')).toContainText('当前隐藏测试全部通过');
  await expect(page.locator('.gesp-result')).toContainText('本次首答在反馈展示前保存');
  const after=await f.workspace();expect(after.capabilities[0].state).toBe('current_evidence_met');expect(after.reviewTasks).toHaveLength(4);
  await page.setViewportSize({width:390,height:760});expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await capture(page,'first-group-code-before-probes-mobile');
});

test('GESP workspace: exact original task and complete independent code survive task changes, reloads and a second tab',async({page,context})=>{
  test.setTimeout(120000);const f=await fixture(page),original=(await f.workspace()),loop=original.tasks.find((task:any)=>task.atomId==='gesp-cpp.l1.loop'),source='// 完整的原始推理和边界\n'.repeat(1500)+'int main(){return 0;}';
  await f.input.fill(source);await page.getByRole('combobox',{name:'本次任务',exact:true}).selectOption(loop.id);await expect(page).toHaveURL(new RegExp('task='+loop.id));await page.getByRole('combobox',{name:'本次任务',exact:true}).selectOption(io);await expect(f.input).toHaveValue(source);await page.reload();await expect(f.input).toHaveValue(source);
  await expect(page.getByLabel('学习工作台导航',{exact:true})).toHaveCSS('width','60px');await expect(page.getByLabel('学习工作台导航',{exact:true}).getByRole('link',{name:'学习任务',exact:true})).toHaveAttribute('href','/studio/tasks?studentId='+f.child.id);
  const second=await context.newPage();await second.goto(f.href);const other=second.getByRole('textbox',{name:'GESP C++源代码',exact:true});await expect(other).toBeEnabled();await expect(other).not.toHaveValue(source);await other.fill('// 另一个标签的完整独立代码\nint main(){return 1;}');await second.reload();await expect(other).toHaveValue('// 另一个标签的完整独立代码\nint main(){return 1;}');
  await page.reload();await expect(f.input).toHaveValue(source);await page.getByRole('button',{name:'查看其他本机代码副本',exact:true}).click();await page.getByRole('button',{name:/比较本机代码副本/}).first().click();await expect(page.getByRole('region',{name:'GESP代码副本比较',exact:true})).toBeVisible();await expect(f.input).toHaveValue(source);
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:760});expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await capture(page,'learner-'+width);}
  expect((await f.workspace()).submissions).toHaveLength(0);await second.close();
});

test('GESP workspace: disabled storage requires the complete code download before mobile navigation and explicit import',async({page})=>{
  test.setTimeout(120000);const f=await fixture(page),source='// 不能丢失的完整代码与中文解释\n'.repeat(1800)+'int main(){return 0;}';
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Synthetic denied storage','QuotaExceededError');};});await f.input.fill(source);await page.setViewportSize({width:390,height:760});await page.getByRole('button',{name:'打开学习导航',exact:true}).click();await page.getByLabel('学习工作台导航',{exact:true}).getByRole('link',{name:'学习任务',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'保留GESP完整输入',exact:true});await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'已保留副本，继续',exact:true})).toBeDisabled();await dialog.getByRole('button',{name:'继续编辑',exact:true}).click();await expect(f.input).toHaveValue(source);await expect(page.getByRole('button',{name:'打开学习导航',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'打开学习导航',exact:true}).click();await page.getByLabel('学习工作台导航',{exact:true}).getByRole('link',{name:'学习任务',exact:true}).click();const downloading=page.waitForEvent('download');await dialog.getByRole('button',{name:'下载完整学习副本',exact:true}).click();const file=await downloading,path=(await file.path())!,copy=JSON.parse(await readFile(path,'utf8'));expect(copy.source).toBe(source);expect(copy.pending).toBeNull();await dialog.getByRole('button',{name:'已保留副本，继续',exact:true}).click();await expect(page).toHaveURL(/\/studio\/tasks\?studentId=/);
  await page.goto(f.href);await expect(f.input).toBeEnabled();await page.getByLabel('从本次GESP完整副本恢复').setInputFiles(path);await expect(page.getByRole('textbox',{name:'准备采用的代码',exact:true})).toHaveValue(source);await page.getByRole('button',{name:'明确采用这份完整副本',exact:true}).click();await expect(f.input).toHaveValue(source);expect((await f.workspace()).submissions).toHaveLength(0);
});

test('GESP workspace: a lost probe reply retains the original full command through reload and rejects another atom',async({page})=>{
  test.setTimeout(120000);const f=await fixture(page);let writes=0;
  await page.route('**/api/gesp/probe-submissions',async route=>{writes++;await route.fetch();await route.abort('failed');});
  const probe=page.getByRole('group',{name:/理解.*标准输入/});await probe.getByLabel('cin 与 cout',{exact:true}).check();await probe.getByRole('button',{name:'提交本次判断',exact:true}).click();await expect(page.getByRole('region',{name:'GESP原操作恢复',exact:true})).toBeVisible();
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'下载完整学习副本与原操作',exact:true}).click();const file=await downloading,copy=JSON.parse(await readFile((await file.path())!,'utf8'));expect(copy.pending.kind).toBe('probe');expect(copy.pending.command.answer).toBe('cin 与 cout');expect((await f.workspace()).probeSubmissions).toHaveLength(1);
  await page.unroute('**/api/gesp/probe-submissions');await page.reload();await expect(page.getByRole('region',{name:'GESP原操作恢复',exact:true})).toBeVisible();expect((await f.workspace()).probeSubmissions).toHaveLength(1);await page.getByRole('button',{name:'核对并继续原操作',exact:true}).click();await expect(page.getByRole('region',{name:'GESP原操作恢复',exact:true})).toHaveCount(0);expect((await f.workspace()).probeSubmissions).toHaveLength(1);expect(writes).toBe(1);
  const changed=await page.request.post(api+'/gesp/probe-submissions',{data:{...copy.pending.command,atomId:'gesp-cpp.l1.loop'}});expect(changed.status()).toBe(409);
});

test('GESP workspace: a changed parent scope keeps the original full code visible for export and blocks new writes',async({page})=>{
  test.setTimeout(120000);const f=await fixture(page),workspace=await f.workspace(),loop=workspace.tasks.find((task:any)=>task.atomId==='gesp-cpp.l1.loop');await page.getByRole('combobox',{name:'本次任务',exact:true}).selectOption(loop.id);await expect(f.input).toBeEnabled();const source='// 原循环任务的完整代码\n'.repeat(1200)+'int main(){return 0;}';await f.input.fill(source);
  await f.call('/gesp/students/'+f.child.id+'/scope',{level:1,atomIds:['gesp-cpp.l1.io'],requestKey:crypto.randomUUID(),reason:'合成范围变更后保留原始代码与草稿'},'PUT');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(f.input).toBeDisabled();await expect(f.input).toHaveValue(source);await expect(page.getByRole('button',{name:'提交并运行 →',exact:true})).toBeDisabled();
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'下载完整学习副本',exact:true}).click();expect(JSON.parse(await readFile((await(await downloading).path())!,'utf8')).source).toBe(source);expect((await f.workspace()).submissions).toHaveLength(0);
});

test('GESP workspace: a parent restores the exact linked child and certification level while keeping each level draft separate',async({page})=>{
  test.setTimeout(120000);const f=await fixture(page),second=(await f.call('/students',{nickname:'第二个认证范围档案',grade:6,preferredSessionMinutes:15,defaultVersionMap:{math:'common',chinese:'common',english:'common'}})).profile;
  const catalog=await f.call('/gesp/students/'+second.id+'/workspace'),level2=catalog.availableTasks.filter((task:any)=>task.atomId.startsWith('gesp-cpp.l2.'));
  await f.call('/gesp/students/'+second.id+'/scope',{level:2,atomIds:[level2[0].atomId],expectedVersion:0,requestKey:crypto.randomUUID(),reason:'合成第二档案的独立二级认证范围'},'PUT');
  expect((await page.request.post(api+'/auth/login',{data:{principal:f.principal,credential:f.credential}})).ok()).toBe(true);await page.goto('/parent/gesp?studentId='+second.id+'&level=2');await expect(page.getByRole('combobox',{name:'GESP学习档案',exact:true})).toHaveValue(second.id);await expect(page.getByRole('combobox',{name:'GESP认证等级',exact:true})).toHaveValue('2');await expect(page.getByRole('checkbox',{name:level2[0].title,exact:true})).toBeChecked();
  await page.getByRole('checkbox',{name:level2[1].title,exact:true}).check();await page.reload();await expect(page.getByRole('checkbox',{name:level2[1].title,exact:true})).toBeChecked();await page.getByRole('combobox',{name:'GESP认证等级',exact:true}).selectOption('3');await expect(page).toHaveURL(/level=3/);await page.getByRole('combobox',{name:'GESP认证等级',exact:true}).selectOption('2');await expect(page.getByRole('checkbox',{name:level2[1].title,exact:true})).toBeChecked();
  const actual=await f.call('/gesp/students/'+second.id+'/workspace');expect(actual.scope).toMatchObject({level:2,version:1,atomIds:[level2[0].atomId]});expect(actual.scopeHistory).toHaveLength(1);await capture(page,'parent-exact-child-and-level');
});

test('GESP workspace: a lost parent confirmation replays its original version while a later confirmed scope stays current',async({page})=>{
  test.setTimeout(120000);const f=await fixture(page);expect((await page.request.post(api+'/auth/login',{data:{principal:f.principal,credential:f.credential}})).ok()).toBe(true);await page.goto('/parent/gesp?studentId='+f.child.id+'&level=1');await expect(page.getByRole('checkbox',{name:'读入两个整数并输出和',exact:true})).toBeChecked();
  let writes=0;await page.route('**/api/gesp/students/*/scope',async route=>{writes++;await route.fetch();await route.abort('failed');});await page.getByRole('checkbox',{name:'读入两个整数并输出和',exact:true}).uncheck();await page.getByRole('button',{name:'确认并保存范围',exact:true}).click();await expect(page.getByRole('region',{name:'GESP原管理操作恢复',exact:true})).toBeVisible();await expect.poll(async()=>(await f.workspace()).scope.version).toBe(2);
  await page.unroute('**/api/gesp/students/*/scope');await f.call('/gesp/students/'+f.child.id+'/scope',{level:1,atomIds:['gesp-cpp.l1.io'],expectedVersion:2,requestKey:crypto.randomUUID(),reason:'合成另一处明确确认更新的当前认证范围'},'PUT');await page.reload();await expect(page.getByRole('region',{name:'GESP原管理操作恢复',exact:true})).toBeVisible();await page.getByRole('button',{name:'核对并继续原管理操作',exact:true}).click();await expect(page.getByRole('region',{name:'GESP原管理操作恢复',exact:true})).toHaveCount(0);await expect(page.getByRole('region',{name:'GESP范围版本比较',exact:true})).toContainText('当前范围为 v3');
  expect((await f.workspace()).scope).toMatchObject({version:3,atomIds:['gesp-cpp.l1.io']});expect((await f.workspace()).scopeHistory).toHaveLength(3);expect(writes).toBe(1);await capture(page,'parent-original-receipt-and-current-scope');
});

test('GESP workspace: a parent with disabled storage downloads the full selection before changing levels and restores it explicitly',async({page})=>{
  test.setTimeout(120000);const f=await fixture(page);expect((await page.request.post(api+'/auth/login',{data:{principal:f.principal,credential:f.credential}})).ok()).toBe(true);await page.goto('/parent/gesp?studentId='+f.child.id+'&level=1');await expect(page.getByRole('checkbox',{name:'读入两个整数并输出和',exact:true})).toBeChecked();await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Synthetic denied storage','QuotaExceededError');};});await page.getByRole('checkbox',{name:'读入两个整数并输出和',exact:true}).uncheck();
  await page.getByRole('combobox',{name:'GESP认证等级',exact:true}).selectOption('2');const dialog=page.getByRole('dialog',{name:'保留GESP范围与原操作',exact:true});await expect(dialog.getByRole('button',{name:'已保留副本，继续',exact:true})).toBeDisabled();const downloading=page.waitForEvent('download');await dialog.getByRole('button',{name:'下载完整范围与计划副本',exact:true}).click();const file=await downloading,path=(await file.path())!,copy=JSON.parse(await readFile(path,'utf8'));expect(copy.atomIds).toEqual(['gesp-cpp.l1.loop']);await dialog.getByRole('button',{name:'已保留副本，继续',exact:true}).click();await expect(page).toHaveURL(/level=2/);
  await page.goto('/parent/gesp?studentId='+f.child.id+'&level=1');await expect(page.getByRole('combobox',{name:'GESP认证等级',exact:true})).toHaveValue('1');await page.getByLabel('从本次GESP管理副本恢复').setInputFiles(path);await expect(page.getByRole('region',{name:'GESP范围副本比较',exact:true})).toContainText('gesp-cpp.l1.loop');await page.getByRole('button',{name:'明确采用这份完整管理副本',exact:true}).click();await expect(page.getByRole('checkbox',{name:'读入两个整数并输出和',exact:true})).not.toBeChecked();expect((await f.workspace()).scope).toMatchObject({version:1,atomIds:['gesp-cpp.l1.io','gesp-cpp.l1.loop']});
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:760});expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await capture(page,'parent-'+width);}
});

test('GESP workspace: without Navigation API browser back preserves the full original-task code until its exact download',async({page})=>{
  test.setTimeout(120000);await page.addInitScript(()=>Object.defineProperty(window,'navigation',{configurable:true,value:undefined}));const f=await fixture(page),loop=(await f.workspace()).tasks.find((task:any)=>task.atomId==='gesp-cpp.l1.loop');await page.getByRole('combobox',{name:'本次任务',exact:true}).selectOption(loop.id);await expect(f.input).toBeEnabled();await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Synthetic denied storage','QuotaExceededError');};});const source='// 旧浏览器后退仍保留本题完整代码\n'.repeat(1400);await f.input.fill(source);await page.evaluate(()=>history.back());const dialog=page.getByRole('dialog',{name:'保留GESP完整输入',exact:true});await expect(dialog).toBeVisible();await expect(f.input).toHaveValue(source);expect(new URL(page.url()).searchParams.get('task')).toBe(loop.id);await dialog.getByRole('button',{name:'继续编辑',exact:true}).click();await expect(f.input).toHaveValue(source);
  await page.evaluate(()=>history.back());const downloading=page.waitForEvent('download');await dialog.getByRole('button',{name:'下载完整学习副本',exact:true}).click();expect(JSON.parse(await readFile((await(await downloading).path())!,'utf8')).source).toBe(source);await dialog.getByRole('button',{name:'已保留副本，继续',exact:true}).click();await expect(page).toHaveURL(new RegExp('task='+io));expect((await f.workspace()).submissions).toHaveLength(0);
});

test('GESP workspace: actual isolated code execution recovers one lost receipt while preserving later complete code edits',async({page})=>{
  test.setTimeout(180000);const f=await fixture(page),source='#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}';let writes=0;
  await page.route('**/api/gesp/code-submissions',async route=>{writes++;const response=await route.fetch({timeout:60000});expect(response.ok()).toBe(true);await route.abort('failed');});await f.input.fill(source);await page.getByRole('button',{name:'提交并运行 →',exact:true}).click();const later=source+'\n// 原请求发出后的完整边界说明与后续编辑。';await f.input.fill(later);await expect.poll(async()=>(await f.workspace()).submissions.length,{timeout:60000}).toBe(1);await expect(page.getByRole('button',{name:'核对并继续原操作',exact:true})).toBeEnabled();const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'下载完整学习副本与原操作',exact:true}).click();const copy=JSON.parse(await readFile((await(await downloading).path())!,'utf8'));expect(copy.source).toBe(later);expect(copy.pending.command.source).toBe(source);
  await page.unroute('**/api/gesp/code-submissions');await page.reload();await expect(f.input).toHaveValue(later);await page.getByRole('button',{name:'核对并继续原操作',exact:true}).click();await expect(page.getByRole('region',{name:'GESP原操作恢复',exact:true})).toHaveCount(0);await expect(f.input).toHaveValue(later);const workspace=await f.workspace();expect(workspace.submissions).toHaveLength(1);expect(workspace.submissions[0]).toMatchObject({status:'recorded',compilePassed:null,tests:[]});await expect(page.getByRole('heading',{name:'代码首答已保存',exact:true})).toBeVisible();expect(workspace.capabilities.find((item:any)=>item.atomId==='gesp-cpp.l1.io').state).not.toBe('current_evidence_met');expect(writes).toBe(1);await capture(page,'real-code-receipt-and-later-code');
});

test('GESP workspace: delayed parent reads and a disconnected refresh cannot replace another child or erase its complete draft',async({page})=>{
  test.setTimeout(120000);const f=await fixture(page),other=(await f.call('/students',{nickname:'迟到响应隔离档案',grade:5,preferredSessionMinutes:15,defaultVersionMap:{math:'common',chinese:'common',english:'common'}})).profile;
  await f.call('/gesp/students/'+other.id+'/scope',{level:1,atomIds:['gesp-cpp.l1.io'],expectedVersion:0,requestKey:crypto.randomUUID(),reason:'合成另一档案用于迟到响应与断网恢复'},'PUT');expect((await page.request.post(api+'/auth/login',{data:{principal:f.principal,credential:f.credential}})).ok()).toBe(true);await page.goto('/parent/gesp?studentId='+f.child.id+'&level=1');await expect(page.getByRole('combobox',{name:'GESP学习档案',exact:true})).toHaveValue(f.child.id);
  let release!:()=>void,observed!:()=>void,finished!:()=>void;const delay=new Promise<void>(resolve=>{release=resolve;}),seen=new Promise<void>(resolve=>{observed=resolve;}),done=new Promise<void>(resolve=>{finished=resolve;});
  await page.route('**/api/gesp/students/'+f.child.id+'/workspace',async route=>{try{const response=await route.fetch();observed();await delay;await route.fulfill({response});}finally{finished();}});
  try{await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await seen;await page.getByRole('combobox',{name:'GESP学习档案',exact:true}).selectOption(other.id);await expect(page.getByRole('combobox',{name:'GESP学习档案',exact:true})).toHaveValue(other.id);release();await done;await expect(page.getByRole('checkbox',{name:'读入两个整数并输出和',exact:true})).toBeChecked();await expect(page.getByRole('checkbox',{name:'累加1到n',exact:true})).not.toBeChecked();}finally{release();await page.unroute('**/api/gesp/students/'+f.child.id+'/workspace');}
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Synthetic denied storage','QuotaExceededError');};});await page.getByRole('checkbox',{name:'读入两个整数并输出和',exact:true}).uncheck();await page.route('**/api/gesp/students/'+other.id+'/workspace',route=>route.abort('internetdisconnected'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('main').getByRole('alert')).toBeVisible();await expect(page.getByRole('combobox',{name:'GESP学习档案',exact:true})).toHaveValue(other.id);await expect(page.getByRole('checkbox',{name:'读入两个整数并输出和',exact:true})).not.toBeChecked();await capture(page,'parent-failed-refresh-keeps-current-draft');
  await page.unroute('**/api/gesp/students/'+other.id+'/workspace');expect((await page.request.post(api+'/auth/logout',{data:{}})).ok()).toBe(true);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('combobox',{name:'GESP学习档案',exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'家长登录',exact:true})).toBeVisible();
});
