// Adds reservation-derived gap-kind checks for this group and the following preview to the response runner.
const fs=require('node:fs'),path=require('node:path');
const f=path.join(__dirname,'inspect-original-responses.cjs');
let s=fs.readFileSync(f,'utf8');
const helper="const gapKind=row=>row.selected>=row.required?null:row.available<row.required?'exhausted':'deferred';"+
"const verifyGapKinds=async name=>{const reservation=await store.requestContext(()=>structuredClone(store.select('diagnosticBlueprints',{studentId:source.childId,actorId:source.studentId}).at(-1))),rows=reservation.blueprint.teachingCoverage,deferred=rows.filter(row=>gapKind(row)==='deferred'),exhausted=rows.filter(row=>gapKind(row)==='exhausted'),notices=studentPage.locator('.blueprint-notices');"+
"if(deferred.length)await expect(notices).toContainText('下一组可以继续 '+deferred.length+' 项检查目的');else await expect(notices).not.toContainText('下一组可以继续');"+
"if(exhausted.length)await expect(notices).toContainText(exhausted.length+' 项检查目的的未接触原材料不够');else await expect(notices).not.toContainText('未接触原材料不够');"+
"for(const[kind,list]of[['deferred',deferred],['exhausted',exhausted]]){await expect(studentPage.locator('div.blueprint-coverage [data-gap-kind='+kind+']')).toHaveCount(list.length);await expect(studentPage.locator('details.blueprint-coverage [data-gap-kind='+kind+']')).toHaveCount(list.length);}"+
"await studentPage.locator('details.blueprint-coverage summary').click();await capture(studentPage,name);const byPurpose=list=>Object.fromEntries(['understanding','procedure','transfer','retention'].map(purpose=>[purpose,list.filter(row=>row.purpose===purpose).length]));"+
"const result={reservationId:reservation.id,deferred:deferred.length,exhausted:exhausted.length,deferredByPurpose:byPurpose(deferred),exhaustedByPurpose:byPurpose(exhausted),remainingUnexposedAfterGroup:rows.reduce((sum,row)=>sum+Math.max(0,row.available-row.selected),0)};write(name+'-gap-kinds.private.json',{...result,rows});return result;};";
const edits=[
  ["let app,store,web,browser,parent,course,lesson,failure,apiInputsBefore,contrastResult;","let app,store,web,browser,parent,course,lesson,failure,apiInputsBefore,contrastResult,gapKinds={};"],
  ["toContainText(missing+' 个点本次证据覆盖不足');});","toContainText(missing+' 个点本次证据覆盖不足');});\n  "+helper+"\n  await check('original-purpose-gaps-separate-next-group-from-exhausted-material',async()=>{gapKinds.currentGroup=await verifyGapKinds('child-purpose-gap-kinds-mobile');});"],
  ["await capture(studentPage,'original-completed-report-mobile');});","await capture(studentPage,'original-completed-report-mobile');});\n  await check('original-following-preview-reports-remaining-and-exhausted-purposes',async()=>{await studentPage.goto(origin+lesson.textbookTeaching.lesson.verificationHref);await expect(studentPage.getByRole('region',{name:'本课独立检查入口',exact:true})).toBeVisible({timeout:30000});await studentPage.getByRole('link',{name:'查看本课独立检查 →',exact:true}).click();await expect(studentPage.getByRole('region',{name:'本次评测范围与题组',exact:true})).toBeVisible({timeout:30000});await expect(studentPage.getByText('采用原课程教学稿第 1 版。',{exact:false})).toBeVisible();gapKinds.followingPreview=await verifyGapKinds('child-following-preview-mobile');});"],
  ["contrastResult,checks,screenshots","contrastResult,gapKinds,checks,screenshots"],
];
for(const[from,to]of edits){const count=s.split(from).length-1;if(count!==1)throw Error('Expected one match, found '+count+': '+from.slice(0,60));s=s.replace(from,to);}
fs.writeFileSync(f,s);console.log('patched '+edits.length+' runner edits');
