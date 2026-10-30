import {expect,type Page,type Browser} from '@playwright/test';
import {syntheticFamilyHeaders} from './synthetic-family';
const api='http://localhost:'+(process.env.E2E_API_PORT??'4421')+'/api';
export async function controlledFixture(page:Page,legacyText=false){
 const headers=await syntheticFamilyHeaders(page),principal='controlled-browser-'+crypto.randomUUID(),credential='synthetic-controlled-browser-2026';
 async function call(path:string,body?:unknown,actor?:{token:string},method=body===undefined?'GET':'POST'){
  const response=await fetch(api+path,{method,headers:{...headers,...(actor?{Authorization:'Bearer '+actor.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),value=await response.json();expect(response.ok,path+':'+JSON.stringify(value.error)).toBe(true);return value.data;
 }
 const parent=await call('/auth/register',{principal,credential}),child=(await call('/students',{nickname:'受控浏览器工程档案',grade:4,preferredSessionMinutes:10,defaultVersionMap:{math:'',chinese:'',english:''}},parent)).profile;
 const source=await call('/qa/controlled-materials',{studentId:child.id,legacyText},parent);await call('/students/'+child.id+'/learning-scope',source.scope,parent,'PUT');
 const admin=await call('/auth/login',{principal:process.env.E2E_ADMIN_PRINCIPAL??'browser-admin',credential:process.env.E2E_ADMIN_PASSWORD??'Browser-admin-only-20261021'});
 async function login(target:Page,who:'parent'|'admin'){await target.goto('/parent/login');await target.getByLabel('登录账号').fill(who==='parent'?principal:process.env.E2E_ADMIN_PRINCIPAL??'browser-admin');await target.getByLabel('密码').fill(who==='parent'?credential:process.env.E2E_ADMIN_PASSWORD??'Browser-admin-only-20261021');await target.getByRole('button',{name:'登录，查看学习记录 →',exact:true}).click();await expect(target).toHaveURL(/\/studio(?:\?|$)/);}
 await login(page,'parent');
 return{parent,child,source,admin,principal,credential,headers,login,call:(path:string,body?:unknown,actor=parent,method?:string)=>call(path,body,actor,method)};
}
export async function approveThroughUI(page:Page,f:Awaited<ReturnType<typeof controlledFixture>>){
 await f.login(page,'admin');await page.goto('/admin/curriculum');
 await page.locator('.admin-grade-map').getByRole('button',{name:/^4年级/}).click();await page.getByRole('button',{name:new RegExp(f.source.name)}).click();const panel=page.getByRole('region',{name:'受控材料审核与发布',exact:true});await expect(panel).toBeVisible();
 await panel.getByText('审核单道实际原件',{exact:true}).click();
 for(const item of f.source.items){await panel.getByRole('combobox',{name:'选择当前有效材料',exact:true}).selectOption(item.id);await expect(panel.getByText(item.stem,{exact:true}).first()).toBeVisible();
  await panel.getByRole('textbox',{name:'实际所需操作',exact:true}).fill('核对同一单位后比较给定数量。');await panel.getByRole('textbox',{name:'主要表示方式',exact:true}).fill('只以文字给出必要数量和单位。');await panel.getByRole('textbox',{name:'必要条件（每行一条）',exact:true}).fill('比较数量的单位与整体完全相同。');await panel.getByRole('textbox',{name:'逐项审核依据',exact:true}).fill('明确合成的工程审核，只验证控制变量、原件和持久化，不表示真实教师质量审核。');
  await panel.getByRole('checkbox',{name:'已逐项核对实际原题、评分、所需知识与必要条件。',exact:true}).check();await panel.getByRole('checkbox',{name:'同意将审核原件用于共享受控材料，账号关闭后保留匿名最小审核事实。',exact:true}).check();await panel.getByRole('button',{name:'确认这份原件审核',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'确认受控材料操作',exact:true});await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'已核对，明确保存审核',exact:true}).click();await expect(dialog).toBeHidden();await expect(panel.getByRole('status')).toContainText('原材料审核已保存');
 }
 return panel;
}
export async function learnerPage(browser:Browser,f:Awaited<ReturnType<typeof controlledFixture>>){
 await f.call('/students/'+f.child.id+'/learning-access',{enabled:true,expectedVersion:0,requestKey:crypto.randomUUID(),reason:'工程合成浏览器受控任务，由孩子本人身份作答。'});const code=await f.call('/students/'+f.child.id+'/learning-access/codes',{expectedVersion:1,requestKey:crypto.randomUUID()});
 const page=await browser.newPage({baseURL:'http://localhost:'+(process.env.E2E_WEB_PORT??'3421')});await page.setExtraHTTPHeaders({'x-forwarded-for':f.headers['x-forwarded-for']});await page.goto('/student/login');await page.getByLabel('一次性学习码').fill(code.code);await page.getByRole('button',{name:'进入我的学习 →',exact:true}).click();await expect(page).toHaveURL(/\/studio(?:\?|$)/);return page;
}
export async function publishControlledThroughHTTP(f:Awaited<ReturnType<typeof controlledFixture>>){
 const reviews=[];for(const item of f.source.items){const source=await f.call('/admin/controlled-contrasts/materials/'+item.id+'/preflight',undefined,f.admin);const receipt=await f.call('/admin/controlled-contrasts/material-reviews',{protocol:'controlled-material-approval-input-v1',itemId:item.id,expectedMappingVersion:source.mappingVersion,expectedContentFingerprint:source.contentFingerprint,expectedDefinitionFingerprint:source.definitionFingerprint,expectedPrerequisiteFingerprint:source.prerequisiteFingerprint,operation:'核对同一单位后比较给定数量。',representation:'只以文字给出必要数量与单位。',requiredConditions:['比较数量的单位和整体完全相同。'],reason:'明确工程合成的原件审核，只验证协议与数据行为，不表示真实教师质量或结构独立性审核。',acknowledgeHumanReview:true,acknowledgeSharedMaterial:true,requestKey:crypto.randomUUID()},f.admin);reviews.push({...receipt,source,item});}
 const receipt=await f.call('/admin/controlled-contrasts/protocols',{protocol:'controlled-publication-input-v1',logicalId:'engineering-browser-controlled-'+crypto.randomUUID(),expectedRevision:0,expectedPreviousFingerprint:null,cause:'language_condition_gap',subject:'math',atomId:f.source.atomId,expectedDefinitionFingerprint:reviews[0].source.definitionFingerprint,controlCondition:'保留必要数量和相同单位的简洁表达。',challengeCondition:'保留同一必要关系的完整文字表达。',allowedChange:'只改变必要条件的文字表达。',units:[0,1].map(unit=>({id:'engineering-unit-'+unit+'-'+crypto.randomUUID(),family:f.source.items.find((item:any)=>item.unit===unit).family,controlMaterialReviewId:reviews.find(row=>row.item.unit===unit&&row.item.condition==='control').id,challengeMaterialReviewId:reviews.find(row=>row.item.unit===unit&&row.item.condition==='challenge').id,changedCondition:'把同一必要条件扩写为完整文字。',changedSourceLocators:[{condition:'control',locator:'简洁原题中记录数量与相同单位。'},{condition:'challenge',locator:'完整原题中的单位条件与数量记录。'}],heldConditions:'原数量、整体、单位、所需操作和评分键保持。',additionalKnowledgeExcluded:'不增加新的目标或先修知识。',difficultyRationale:'只核对原必要条件的文字变化。',reviewReason:'明确工程合成，仅检验协议和交互，真实教师质量审核仍未完成。'})),acknowledgeHumanReview:true,acknowledgeSharedMaterial:true,requestKey:crypto.randomUUID()},f.admin);return receipt;
}
