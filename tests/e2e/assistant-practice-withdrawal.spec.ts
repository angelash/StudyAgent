import { test,expect,type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { browserEvidence } from './evidence';
import { api,fixture,enter,selectAndCreate,assign,learner,start } from './assistant-practice-fixture';
const evidence=browserEvidence('assistant-practice-withdrawal');
const dialog=(page:Page)=>page.getByRole('dialog',{name:'撤回教学安排',exact:true});
async function prepare(page:Page,media=false){const f=await fixture(page,media);await enter(page,f);await selectAndCreate(page);const href=await assign(page);await page.goto(href);await expect(page.getByRole('button',{name:'撤回这份安排',exact:true})).toBeEnabled();return{...f,href,id:new URL(href,'https://study.invalid').searchParams.get('assistantAssignment')!};}
async function confirm(page:Page,reason:string){await page.getByRole('button',{name:'撤回这份安排',exact:true}).click();await dialog(page).getByLabel('撤回教学安排说明',{exact:true}).fill(reason);await dialog(page).getByRole('button',{name:'核对撤回影响',exact:true}).click();await dialog(page).getByRole('button',{name:'确认撤回，保留历史',exact:true}).click();}
async function shot(page:Page,name:string){mkdirSync(evidence,{recursive:true});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:evidence+'/'+name+'.png',fullPage:true});}
test.afterEach(async({page})=>page.unrouteAll({behavior:'wait'}));

test('practice withdrawal: explicit reason and two confirmations preserve all unstarted groups and keyboard focus',async({page})=>{
  test.setTimeout(150000);const f=await prepare(page),button=page.getByRole('button',{name:'撤回这份安排',exact:true}),reason='本周先集中完成原课程，明确撤回这份安排，保留已有记录。';let writes=0;
  page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/withdraw'))writes++;});
  await button.click();await dialog(page).getByLabel('撤回教学安排说明',{exact:true}).fill(reason);await dialog(page).getByRole('button',{name:'核对撤回影响',exact:true}).click();expect(writes).toBe(0);
  await page.keyboard.press('Escape');await expect(dialog(page)).toHaveCount(0);await expect(button).toBeFocused();await button.click();await expect(dialog(page).getByLabel('撤回教学安排说明',{exact:true})).toHaveValue(reason);
  await dialog(page).getByRole('button',{name:'核对撤回影响',exact:true}).click();await dialog(page).getByRole('button',{name:'确认撤回，保留历史',exact:true}).click();
  await expect(dialog(page).getByRole('region',{name:'原安排撤回说明',exact:true})).toContainText(reason);expect(writes).toBe(1);await dialog(page).getByRole('button',{name:'关闭',exact:true}).click();
  const saved=await f.call('/learning/assistant-practice/assignments/'+f.id);expect(saved).toMatchObject({assignmentState:'withdrawn',stateVersion:1});expect(saved.groupActivities.every((group:any)=>group.status==='not_started'&&!group.canStart)).toBe(true);
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:760});expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await shot(page,'withdrawn-original-arrangement-'+width);}
  const access=await f.call('/students/'+f.child.id+'/learning-access',{enabled:true,expectedVersion:0,requestKey:crypto.randomUUID(),reason:'合成撤回后只读本人验证'}),code=await f.call('/students/'+f.child.id+'/learning-access/codes',{expectedVersion:access.version,requestKey:crypto.randomUUID()});
  await page.goto('/student/login');await page.getByLabel('一次性学习码').fill(code.code);await page.getByRole('button',{name:'进入我的学习 →',exact:true}).click();await expect(page).toHaveURL(/\/studio(?:\?|$)/);await page.goto(f.href);
  await expect(page.getByRole('region',{name:'原安排撤回说明',exact:true})).toContainText(reason);await expect(page.getByRole('button',{name:'本人开始这一组 →',exact:true})).toHaveCount(3);for(const item of await page.getByRole('button',{name:'本人开始这一组 →',exact:true}).all())await expect(item).toBeDisabled();
});

test('practice withdrawal: a lost committed acknowledgement resumes the exact original reason and key after reload',async({page})=>{
  test.setTimeout(150000);const f=await prepare(page),reason='原撤回说明逐字保留，不用新的请求代替已经成功的操作。',keys:string[]=[];
  await page.route('**/api/learning/assistant-practice/assignments/*/withdraw',async route=>{keys.push(route.request().postDataJSON().requestKey);if(keys.length===1){expect((await route.fetch()).status()).toBe(201);await route.abort('failed');}else await route.continue();});
  await confirm(page,reason);await expect(dialog(page).getByRole('button',{name:'用原操作核对撤回结果',exact:true})).toBeEnabled();await page.reload();
  await expect(page.getByRole('region',{name:'原安排撤回说明',exact:true})).toContainText(reason);expect(keys).toHaveLength(1);
  await page.getByRole('button',{name:'用原操作核对撤回结果',exact:true}).click();await expect(page.getByText('原撤回已确认。已经发生的教学历史保持。',{exact:true})).toBeVisible();expect(keys).toHaveLength(2);expect(keys[1]).toBe(keys[0]);expect((await f.call('/learning/assistant-practice/assignments/'+f.id)).withdrawal.reason).toBe(reason);await shot(page,'original-withdrawal-receipt-recovered');
});

test('practice withdrawal: denied storage sends nothing until the complete reason and original command are downloaded',async({page})=>{
  test.setTimeout(150000);await prepare(page);const reason='完整说明第一行：调整本周安排。\n第二行：已经发生的学习记录保留，不改首答。';let writes=0;
  await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('studyagent.practice.workspace.v1.'))throw new DOMException('Synthetic quota','QuotaExceededError');return original.call(this,key,value);};});
  page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/withdraw'))writes++;});await confirm(page,reason);
  const resume=dialog(page).getByRole('button',{name:'用原操作核对撤回结果',exact:true});await expect(resume).toBeDisabled();expect(writes).toBe(0);
  const downloading=page.waitForEvent('download');await dialog(page).getByRole('button',{name:'下载完整练习副本',exact:true}).click();const copy=JSON.parse(await readFile((await(await downloading).path())!,'utf8'));
  expect(copy.phase).toBe('withdraw');expect(copy.reason).toBe(reason);expect(copy.pending.reason).toBe(reason);expect(copy.pending.assignmentFingerprint).toBe(copy.payloadFingerprint);expect(copy.pending.requestKey).toBeTruthy();
  await expect(resume).toBeEnabled();await resume.click();await expect(dialog(page).getByRole('region',{name:'原安排撤回说明',exact:true})).toContainText(reason);expect(writes).toBe(1);await shot(page,'download-before-withdrawal');
});

test('practice withdrawal: parent confirmation makes the actual learner history readonly while keeping a complete unsubmitted correction',async({page,browser})=>{
  test.setTimeout(180000);const f=await prepare(page),parentContext=await browser.newContext({baseURL:'http://localhost:'+(process.env.E2E_WEB_PORT??'3257')}),parent=await parentContext.newPage();
  try{
    await parent.goto('/parent/login');await parent.getByLabel('登录账号').fill(f.principal);await parent.getByLabel('密码').fill(f.credential);await parent.getByRole('button',{name:'登录，查看学习记录 →',exact:true}).click();await expect(parent).toHaveURL(/\/studio(?:\?|$)/);await parent.goto(f.href);await expect(parent.getByRole('button',{name:'撤回这份安排',exact:true})).toBeEnabled();
    await learner(page,f,f.href);await start(page);const originalReason='首次理由：每盒一样多，所以用2×2。',laterReason='撤回前的完整未提交订正理由。\n仍要核对数量条件，不能被刷新丢掉。';
    await page.getByRole('textbox',{name:'数字或分数答案',exact:true}).fill('4');await page.getByRole('textbox',{name:'我的练习理由',exact:true}).fill(originalReason);await page.getByRole('button',{name:'提交答案和理由 →',exact:true}).click();await page.getByRole('button',{name:'保留首答，开始订正',exact:true}).click();await page.getByRole('textbox',{name:'数字或分数答案',exact:true}).fill('400');await page.getByRole('textbox',{name:'我的练习理由',exact:true}).fill(laterReason);
    const reason='监护人明确调整安排；原首答和孩子的未提交订正分别保留。';await confirm(parent,reason);await expect(dialog(parent).getByRole('region',{name:'原安排撤回说明',exact:true})).toContainText(reason);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('region',{name:'原安排撤回说明',exact:true})).toContainText(reason);await expect(page.getByRole('textbox',{name:'我的练习理由',exact:true})).toBeDisabled();await expect(page.getByRole('textbox',{name:'我的练习理由',exact:true})).toHaveValue(laterReason);await expect(page.getByRole('textbox',{name:'数字或分数答案',exact:true})).toHaveValue('400');await expect(page.getByRole('button',{name:'提交答案和理由 →',exact:true})).toBeDisabled();
    await expect(page.getByRole('region',{name:'原答案与理由反馈',exact:true})).toContainText(originalReason);const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'下载完整练习副本',exact:true}).click();const copy=JSON.parse(await readFile((await(await downloading).path())!,'utf8'));expect(copy.answer.response.value).toBe('400');expect(copy.learnerExplanation).toBe(laterReason);
    const id=new URL(page.url()).searchParams.get('assistantPractice')!,view=await f.call('/learning/assistant-practice/sessions/'+id);expect(view).toMatchObject({status:'in_progress',writable:false,assignmentState:'withdrawn'});expect(view.questions[0].attempts).toBe(1);expect(view.questions[0].attemptHistory[0].learnerExplanation).toBe(originalReason);expect(view.summary.independentFirstPass).toBe(0);
    const rejected=await page.request.post(api+'/learning/assistant-practice/sessions/'+id+'/complete',{data:{protocol:'assistant-practice-answer-v1',completionFingerprint:view.completionFingerprint,requestKey:crypto.randomUUID()}});expect(rejected.status()).toBe(409);await shot(page,'learner-original-and-unsubmitted-correction');
  }finally{await parentContext.close();}
});

test('practice withdrawal: two actual tabs retain separate explanations and the losing command never borrows another success',async({page,context})=>{
  test.setTimeout(150000);const f=await prepare(page),second=await context.newPage();await second.goto(f.href);await expect(second.getByRole('button',{name:'撤回这份安排',exact:true})).toBeEnabled();
  const reasons=['第一标签的独立撤回说明，保留原始版本。','第二标签的独立撤回说明，也必须保留原件。'];
  for(const [index,target]of [page,second].entries()){await target.getByRole('button',{name:'撤回这份安排',exact:true}).click();await dialog(target).getByLabel('撤回教学安排说明',{exact:true}).fill(reasons[index]);await dialog(target).getByRole('button',{name:'核对撤回影响',exact:true}).click();}
  const replies=[page.waitForResponse(response=>response.url().endsWith('/withdraw')),second.waitForResponse(response=>response.url().endsWith('/withdraw'))];
  await Promise.all([page,second].map(target=>dialog(target).getByRole('button',{name:'确认撤回，保留历史',exact:true}).click()));const results=await Promise.all(replies);expect(results.map(reply=>reply.status()).sort()).toEqual([201,409]);
  const lost=results[0].status()===409?page:second,index=lost===page?0:1;await expect(dialog(lost).getByRole('alert')).toContainText('已经撤回');await expect(dialog(lost).getByLabel('撤回教学安排说明',{exact:true})).toHaveValue(reasons[index]);
  const downloading=lost.waitForEvent('download');await dialog(lost).getByRole('button',{name:'下载完整练习副本',exact:true}).click();const copy=JSON.parse(await readFile((await(await downloading).path())!,'utf8'));expect(copy.pending.reason).toBe(reasons[index]);const shared=await f.call('/learning/assistant-practice/assignments/'+f.id);expect(shared.withdrawal.reason).toBe(reasons[1-index]);await shot(lost,'concurrent-withdrawal-keeps-losing-original');await second.close();
});

test('practice withdrawal: actual saved PNG and PCM audio remain readable after withdrawal while new media writes are refused',async({page,browser})=>{
  test.setTimeout(180000);const f=await prepare(page,true),parentContext=await browser.newContext({baseURL:'http://localhost:'+(process.env.E2E_WEB_PORT??'3257')}),parent=await parentContext.newPage();
  try{
    await parent.goto('/parent/login');await parent.getByLabel('登录账号').fill(f.principal);await parent.getByLabel('密码').fill(f.credential);await parent.getByRole('button',{name:'登录，查看学习记录 →',exact:true}).click();await expect(parent).toHaveURL(/\/studio(?:\?|$)/);await parent.goto(f.href);
    const shared=await f.call('/learning/assistant-practice/assignments/'+f.id);await learner(page,f,f.href);await page.getByRole('button',{name:'本人开始这一组 →',exact:true}).first().click();await expect(page.getByRole('textbox',{name:'我的练习理由',exact:true})).toBeVisible();
    const png=await sharp({create:{width:96,height:64,channels:3,background:'#4c6696'}}).png().toBuffer(),wav=Buffer.alloc(44+12800);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(12800,40);for(let index=0;index<6400;index++)wav.writeInt16LE(Math.round(7000*Math.sin(2*Math.PI*440*index/16000)),44+index*2);
    const originals:string[]=[];
    for(let index=0;index<2;index++){
      if(index)await page.getByRole('button',{name:'第2题',exact:true}).click();const image=shared.groups[0].questions[index].payload.answerSchema.mode==='image_upload';await page.getByLabel(image?'选择或拍摄作答图片':'选择录音文件',{exact:true}).setInputFiles({name:image?'owned-answer.png':'owned-answer.wav',mimeType:image?'image/png':'audio/wav',buffer:image?png:wav});await expect(page.locator('.saved-media-evidence[data-student-media-state="ready"]')).toBeVisible();
      const src=await page.locator('.saved-media-evidence img,.saved-media-evidence audio').getAttribute('src'),response=await page.request.get(src!);expect(response.ok()).toBe(true);originals.push(createHash('sha256').update(await response.body()).digest('hex'));
      await page.getByRole('textbox',{name:'我的练习理由',exact:true}).fill(image?'原PNG图示，撤回后继续作为教学历史保留。':'合成PCM音频原件，不能冒充真人学习效果。');await page.getByRole('button',{name:'提交答案和理由 →',exact:true}).click();await expect(page.getByRole('region',{name:'原答案与理由反馈',exact:true})).toBeVisible();
    }
    const activityId=new URL(page.url()).searchParams.get('assistantPractice')!,reason='撤回后保留原图片和录音，停止新作答与新附件。';await confirm(parent,reason);await expect(dialog(parent).getByRole('region',{name:'原安排撤回说明',exact:true})).toContainText(reason);await page.reload();await expect(page.getByRole('region',{name:'原安排撤回说明',exact:true})).toContainText(reason);
    for(let index=0;index<2;index++){
      await page.getByRole('button',{name:new RegExp('^第'+(index+1)+'题(?: · 已记录)?$')}).click();await expect(page.locator('.saved-media-evidence[data-student-media-state="ready"]')).toBeVisible();const src=await page.locator('.saved-media-evidence img,.saved-media-evidence audio').getAttribute('src'),response=await page.request.get(src!);expect(response.ok()).toBe(true);expect(createHash('sha256').update(await response.body()).digest('hex')).toBe(originals[index]);await expect(page.getByRole('button',{name:'提交答案和理由 →',exact:true})).toBeDisabled();await shot(page,'withdrawn-readable-original-media-'+index);
    }
    const rejected=await page.request.post(api+'/learning/media',{data:{kind:'practice',sessionId:activityId,itemId:shared.groups[0].questions[0].question.id,name:'new-after-withdrawal.png',size:png.length,mediaType:'image/png',requestKey:crypto.randomUUID()}});expect(rejected.status()).toBe(409);const view=await f.call('/learning/assistant-practice/sessions/'+activityId);expect(view.summary.pendingReview).toBe(2);expect(view.writable).toBe(false);expect(view.questions.every((question:any)=>question.attempts===1)).toBe(true);
  }finally{await parentContext.close();}
});

test('practice withdrawal: a delayed pre-withdrawal activity projection cannot reenable learner writing',async({page,browser})=>{
  test.setTimeout(180000);const f=await prepare(page),parentContext=await browser.newContext({baseURL:'http://localhost:'+(process.env.E2E_WEB_PORT??'3257')}),parent=await parentContext.newPage();let release:()=>void=()=>{},captured:()=>void=()=>{};const held=new Promise<void>(resolve=>release=resolve),ready=new Promise<void>(resolve=>captured=resolve);
  try{
    await parent.goto('/parent/login');await parent.getByLabel('登录账号').fill(f.principal);await parent.getByLabel('密码').fill(f.credential);await parent.getByRole('button',{name:'登录，查看学习记录 →',exact:true}).click();await expect(parent).toHaveURL(/\/studio(?:\?|$)/);await parent.goto(f.href);await learner(page,f,f.href);await start(page);
    const activityId=new URL(page.url()).searchParams.get('assistantPractice')!;let first=true;
    await page.route('**/api/learning/assistant-practice/sessions/'+activityId,async route=>{if(first){first=false;const original=await route.fetch();expect((await original.json()).data.stateVersion).toBe(0);captured();await held;await route.fulfill({response:original});}else await route.continue();});
    await page.getByRole('textbox',{name:'数字或分数答案',exact:true}).fill('4');await page.getByRole('textbox',{name:'我的练习理由',exact:true}).fill('原成功草稿和迟到投影分别核对。');await page.getByRole('button',{name:'保存答案和理由',exact:true}).click();await ready;
    const reason='原草稿成功后明确撤回，迟到的旧活动不能重新开放作答。';await confirm(parent,reason);await expect(dialog(parent).getByRole('region',{name:'原安排撤回说明',exact:true})).toContainText(reason);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('region',{name:'原安排撤回说明',exact:true})).toContainText(reason);
    const delivered=page.waitForResponse(response=>response.url().endsWith('/sessions/'+activityId)&&response.request().method()==='GET');release();await delivered;await expect(page.getByRole('region',{name:'原安排撤回说明',exact:true})).toContainText(reason);await expect(page.getByRole('textbox',{name:'我的练习理由',exact:true})).toBeDisabled();await expect(page.getByRole('textbox',{name:'我的练习理由',exact:true})).toHaveValue('原成功草稿和迟到投影分别核对。');await expect(page.getByRole('button',{name:'提交答案和理由 →',exact:true})).toBeDisabled();await shot(page,'late-original-projection-remains-readonly');
  }finally{release();await parentContext.close();}
});
