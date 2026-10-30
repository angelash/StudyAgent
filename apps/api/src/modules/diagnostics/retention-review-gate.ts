import { RETENTION_DAY_MS,type RetentionAnchorResult } from './retention-anchor';
export type RetentionReviewGateInput={now:string;planStatus:string;needsReview:boolean;taskStatus:string;sessionId:string|null;
 dueAt:string;earliestDueAt:string;anchor:RetentionAnchorResult};
/** A read-only gate: changing a calendar date cannot change original evidence or intervals. */
export function retentionReviewGate(input:RetentionReviewGateInput){
 const epochs=[input.now,input.dueAt,input.earliestDueAt].map(Date.parse);if(epochs.some(epoch=>!Number.isFinite(epoch)))throw Error('invalid_retention_review_time');
 const minimum=input.anchor.anchor?Date.parse(input.anchor.anchor.at)+input.anchor.requiredIntervalDays*RETENTION_DAY_MS:null;
 const earliestAt=new Date(Math.max(epochs[1],epochs[2],minimum??0)).toISOString();
 const reason=input.sessionId?'already_started':input.taskStatus!=='pending'?'task_finished':input.planStatus!=='active'?'plan_inactive':input.needsReview?'source_needs_review':input.anchor.unresolvedSourceIds.length?'unknown_teaching_source':epochs[0]<Date.parse(earliestAt)?'waiting_interval':'can_check';
 return{canStart:reason==='can_check',reason,earliestAt,originalDueAt:input.dueAt,originalEarliestDueAt:input.earliestDueAt,
  latestTeachingAt:input.anchor.anchor?.kind==='independent_baseline'?null:input.anchor.anchor?.at??null,independentBaselineAvailable:input.anchor.baseline!==null,notice:reason==='can_check'?'可以进入原复测核对新题；完成仍需按真实作答判断。':reason==='waiting_interval'?'最近教学或帮助之后尚未满足这次原复测的真实间隔，请核对最早时间。':reason==='unknown_teaching_source'?'部分原教学来源或时间无法核对，请保留原任务并先核查。':'原任务、计划或报告状态需要先核对。'};
}
