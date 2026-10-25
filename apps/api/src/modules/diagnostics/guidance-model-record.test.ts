import { describe, it, expect } from 'vitest';
import type { GuidanceModelOriginal } from '@study-agent/contracts';
import { validateGuidanceText } from './guidance-model-record';

const original: GuidanceModelOriginal = { summary: '先补充证据，再决定是否需要讲解。', minutesPerDay: 10, actions: [
  { id:'observe',atomId:'fraction-meaning',hypothesisId:null,title:'先补充证据：分数意义',activity:'先用两个独立新情境观察，再决定讲解。',minutes:5,successCriterion:'保留独立作答与不确定项。',retestAt:'2026-10-27T09:00:00Z',evidenceIds:['response-a'] },
  { id:'practice',atomId:'fraction-compare',hypothesisId:'cause-b',title:'逐步巩固：分数比较',activity:'先比较单位整体，再解释判断依据。',minutes:5,successCriterion:'两个新题族独立完成，并安排迁移。',retestAt:'2026-10-27T09:00:00Z',evidenceIds:['response-b'] },
] };
const output = () => ({ summary:'先观察实际表现，再按证据安排下一步。',activities:[
  {actionId:'observe',activity:'先独立完成两个新情境小测，记录孩子怎样判断，再核查是否需要讲解。',evidenceIds:['response-a']},
  {actionId:'practice',activity:'先比较两个整体的单位，再让孩子说出判断依据，逐步减少帮助。',evidenceIds:['response-b']},
] });
describe('guidance descriptions cannot replace original evidence or action structure',()=>{
  it('accepts only descriptions tied to existing actions and leaves the rule plan untouched',()=>{
    const before=structuredClone(original),value=validateGuidanceText(output(),original);expect(value.activities).toHaveLength(2);expect(original).toEqual(before);
  });
  it('rejects cross-action or fabricated evidence, duplicate actions and missing original work',()=>{
    const cross=output();cross.activities[0].evidenceIds=['response-b'];expect(()=>validateGuidanceText(cross,original)).toThrow();
    const invented=output();invented.activities[1].evidenceIds=['unknown'];expect(()=>validateGuidanceText(invented,original)).toThrow();
    const duplicate=output();duplicate.activities[1].actionId='observe';expect(()=>validateGuidanceText(duplicate,original)).toThrow();
    const missing=output();missing.activities.pop();expect(()=>validateGuidanceText(missing,original)).toThrow();
  });
  it('rejects model additions that would change time, resources, status or retest dates',()=>{
    for(const extra of [{minutes:60},{resourceQuestionIds:['future-question']},{retestAt:'2027-01-01'},{status:'active'}]) {
      const value=output();Object.assign(value.activities[0],extra);expect(()=>validateGuidanceText(value,original)).toThrow();
    }
    expect(()=>validateGuidanceText({...output(),mastery:1},original)).toThrow();
  });
  it('retains unknown evidence and rejects conclusive cause or personal labels',()=>{
    for(const activity of ['孩子已经掌握，不必再核查任何证据。','根因已确定，应直接按这个原因训练。','孩子确诊注意力缺陷，因此不必再安排验证。','每天讲解三遍概念，然后继续讲解三遍。']) {
      const value=output();value.activities[0].activity=activity;expect(()=>validateGuidanceText(value,original)).toThrow();
    }
  });
});
