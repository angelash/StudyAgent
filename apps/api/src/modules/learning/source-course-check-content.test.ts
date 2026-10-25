import { describe,it,expect } from 'vitest';
import type { SourceCourseCheckContent } from '@study-agent/contracts';
import type { SourceCourseRecord } from './source-course-content';
import { prepareSourceCourseCheck,validateSourceCourseCheck,sourceCheckDigest,SOURCE_CHECK_CONTEXT_LIMIT } from './source-course-check-content';

const quote='匿名阅览室周末排队，工作日有空位。';
function course():SourceCourseRecord{
  return{id:'source-course',status:'active',confirmedAt:'2026-10-26T00:00:00Z',fingerprint:'published-content-v1',lessonIds:['observe','compare'],
    input:{title:'来源与条件',goal:'比较观察、推断与其他解释',language:'zh-CN',modelId:'original-model',minutesPerSession:15,targetAtomIds:[]},
    sources:[{key:'page-one',materialId:'original',page:1,title:'匿名观察',kind:'text',sha256:'frozen-sha',version:'v1',fingerprint:'page-v1',text:quote,blocks:[],structureReviewRequired:false}],
    result:{title:'来源与条件',overview:'公开导向',lessons:['观察与推断','比较条件'].map((title,index)=>({title,objective:'保留条件并核查替代解释'+index,citations:[{sourceKey:'page-one',quote}],questions:[{prompt:'原微课题 '+index+'？',answer:3,explanation:'PRIVATE ORIGINAL ANSWER'}]}))},
    originalResult:{secret:'PRIVATE ORIGINAL DRAFT'},generation:{privateReview:'PRIVATE REVIEW'}} as unknown as SourceCourseRecord;
}
const selection={modelId:'deepseek-v4-flash',lessonIds:['observe','compare']};
function content():SourceCourseCheckContent{return{title:'来源与条件独立核查',instructions:'先保留自己的判断。',questions:Array.from({length:4},(_,index)=>({prompt:'匿名新情境 '+index+' 应如何核查条件？',targetLessonIds:[index%2?'compare':'observe'],options:['核查其他解释','直接确认唯一原因','忽略观察范围','以个人偏好推断'],selectionMode:'single',correctIndices:[0],optionExplanations:['保留比较边界','没有排除其他原因','会忽略来源条件','不是证据'],explanation:'需要比较替代解释并保留观察局限。',hints:['先看已有观察','再找还缺的比较条件'],citations:[{sourceKey:'page-one',quote}]}))};}
describe('source-course independent check frozen inputs and provider output',()=>{
  it('freezes only selected public goals and original sources, binding the original model without sending private drafts or answer keys',()=>{
    const row=course(),before=structuredClone(row),prepared=prepareSourceCourseCheck(row,selection);
    expect(row).toEqual(before);expect(prepared.targets.map(target=>target.lessonId)).toEqual(selection.lessonIds);expect(prepared.modelId).toBe('deepseek-v4-flash');expect(prepared.contextCharacters).toBe(prepared.context.length);expect(prepared.contextCharacters).toBeLessThanOrEqual(SOURCE_CHECK_CONTEXT_LIMIT);
    expect(prepared.sources[0].text).toBe(quote);expect(JSON.stringify(prepared)).not.toContain('PRIVATE');expect(prepared.context).not.toContain('原微课题');expect(prepared.excludedPromptDigests).toHaveLength(2);
    row.sources[0].text='后来改变';row.result!.lessons[0].objective='后来改变目标';expect(prepared.sources[0].text).toBe(quote);expect(prepared.targets[0].objective).not.toBe('后来改变目标');
  });
  it('refuses inactive, unconfirmed, private, missing or duplicate targets and changed source quotes',()=>{
    for(const row of [{...course(),status:'ready'},{...course(),confirmedAt:null},{...course(),fingerprint:null},{...course(),versioning:{state:'draft'}}])expect(()=>prepareSourceCourseCheck(row as SourceCourseRecord,selection)).toThrow('course_not_published');
    expect(()=>prepareSourceCourseCheck(course(),{...selection,lessonIds:['observe','foreign']})).toThrow('target_not_in_course');expect(()=>prepareSourceCourseCheck(course(),{...selection,lessonIds:['observe','observe']})).toThrow();
    const missing=course();missing.sources=[];expect(()=>prepareSourceCourseCheck(missing,selection)).toThrow('source_missing');const changed=course();changed.sources[0].text='其他原文';expect(()=>prepareSourceCourseCheck(changed,selection)).toThrow('source_quote_changed');
  });
  it('rejects the complete oversized context without truncating source text or silently dropping goals',()=>{
    const row=course();row.sources[0].text=quote+'完整尾段。'.repeat(5000);const before=structuredClone(row);expect(()=>prepareSourceCourseCheck(row,selection)).toThrow('context_over_budget');expect(row).toEqual(before);
  });
  it('keeps the same frozen identity after JSONB object-key reordering but changes it for a real source or model change',()=>{
    const row=course(),reverse=(value:any):any=>Array.isArray(value)?value.map(reverse):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,child])=>[key,reverse(child)])):value;
    const before=prepareSourceCourseCheck(row,selection);expect(prepareSourceCourseCheck(reverse(row),selection).inputFingerprint).toBe(before.inputFingerprint);expect(prepareSourceCourseCheck(row,{...selection,modelId:'different-model'}).inputFingerprint).not.toBe(before.inputFingerprint);row.sources[0].sha256='different-original';expect(prepareSourceCourseCheck(row,selection).inputFingerprint).not.toBe(before.inputFingerprint);expect(sourceCheckDigest([1,2])).not.toBe(sourceCheckDigest([2,1]));
  });
  it('retains the exact pre-existing two-target fingerprints frozen by the compiled 120 candidate',()=>{
    const prepared=prepareSourceCourseCheck(course(),selection);
    expect(prepared.inputFingerprint).toBe('1ef53e69a7415904b7dad3a965b7205ecae01c5b4233dc8eb56039b0d6b56098');
    expect(sourceCheckDigest(prepared)).toBe('2e624bc8ad866c9bf824deb42da2a4fe720c5e9cea1c38f91a67a0f1174db487');
  });
  it('checks one complete selected goal through four different scenarios and still rejects zero, repeated and seven goals',()=>{
    const prepared=prepareSourceCourseCheck(course(),{...selection,lessonIds:['observe']}),output=content();output.questions.forEach(question=>question.targetLessonIds=['observe']);
    expect(prepared.targets.map(target=>target.lessonId)).toEqual(['observe']);expect(JSON.parse(prepared.context).targets).toHaveLength(1);expect(validateSourceCourseCheck(prepared,output).questions).toHaveLength(4);
    for(const lessonIds of [[],['observe','observe'],Array.from({length:7},(_,index)=>'lesson-'+index)])expect(()=>prepareSourceCourseCheck(course(),{...selection,lessonIds})).toThrow();
    output.questions[0].targetLessonIds=['compare'];expect(()=>validateSourceCourseCheck(prepared,output)).toThrow('target_outside_selection');
  });
  it('accepts complete single and multiple answer definitions without changing the provider output object',()=>{
    const prepared=prepareSourceCourseCheck(course(),selection),output=content();output.questions[0].selectionMode='multiple';output.questions[0].correctIndices=[2,0];const before=structuredClone(output),checked=validateSourceCourseCheck(prepared,output);expect(checked.questions[0].correctIndices).toEqual([0,2]);expect(output).toEqual(before);
  });
  it('detects normalized repeats against every original micro-lesson and within the new check',()=>{
    const prepared=prepareSourceCourseCheck(course(),selection),repeat=content();repeat.questions[0].prompt=' 原 微课题 ０？！ ';expect(()=>validateSourceCourseCheck(prepared,repeat)).toThrow('question_repeated');
    const duplicate=content();duplicate.questions[1].prompt=duplicate.questions[0].prompt+'！';expect(()=>validateSourceCourseCheck(prepared,duplicate)).toThrow('question_repeated');
  });
  it('requires source evidence for each of two claimed targets, rather than accepting one unrelated target as covered',()=>{
    const row=course();row.sources.push({...structuredClone(row.sources[0]),key:'page-two',text:'第二段独立原文。'});row.result!.lessons[1].citations=[{sourceKey:'page-two',quote:'第二段独立原文。'}];
    const prepared=prepareSourceCourseCheck(row,selection),output=content();output.questions.forEach(question=>question.targetLessonIds=['observe','compare']);expect(()=>validateSourceCourseCheck(prepared,output)).toThrow('target_source_uncovered');
    for(const question of output.questions)question.citations.push({sourceKey:'page-two',quote:'第二段独立原文。'});expect(validateSourceCourseCheck(prepared,output).questions).toHaveLength(4);
  });
  it.each([
    ['option_repeated',(value:SourceCourseCheckContent)=>{value.questions[0].options[1]=' 核查其他解释！';}],
    ['answer_set_invalid',(value:SourceCourseCheckContent)=>{value.questions[0].correctIndices=[0,0];}],
    ['answer_set_invalid',(value:SourceCourseCheckContent)=>{value.questions[0].correctIndices=[5];}],
    ['answer_set_invalid',(value:SourceCourseCheckContent)=>{value.questions[0].selectionMode='multiple';}],
    ['option_feedback_missing',(value:SourceCourseCheckContent)=>{value.questions[0].options.push('新增选项');}],
    ['target_outside_selection',(value:SourceCourseCheckContent)=>{value.questions[0].targetLessonIds=['another-course'];}],
    ['target_uncovered',(value:SourceCourseCheckContent)=>{value.questions.forEach(question=>question.targetLessonIds=['observe']);}],
    ['citation_outside_target',(value:SourceCourseCheckContent)=>{value.questions[0].citations[0].sourceKey='foreign-source';}],
    ['citation_outside_target',(value:SourceCourseCheckContent)=>{value.questions[0].citations[0].quote='不存在的原文';}],
  ] as const)('rejects %s',(reason,change)=>{const value=content();change(value);expect(()=>validateSourceCourseCheck(prepareSourceCourseCheck(course(),selection),value)).toThrow(reason);});
});
