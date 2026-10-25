'use client';
import type { CourseLessonActivity,CourseProjectActivity } from '@study-agent/contracts';
import './course-activity.css';
export function CourseLessonStatus({value}:{value?:CourseLessonActivity}){
  if(!value)return null;const summary=value.practice.summary;
  return <div className="ca-status" aria-label="讲解与练习记录">{value.kind!=='unit_check'&&<span>{{not_started:'讲解未开始',reading:'讲解进行中',read:'讲解已读'}[value.reading.state]}{value.reading.state==='read'&&value.reading.resuming?' · 本次复习未结束':''}</span>}<span>{value.kind==='unit_check'?'单元核查 · ':''}{summary.answered?'已作答 '+summary.answered+'/'+summary.total:value.kind==='unit_check'?'尚未开始':'练习未开始'}</span>{summary.answered>0&&<small>本次练习：独立首答正确 {summary.independentCorrect} · 使用帮助 {summary.assisted} · 跳过 {summary.skipped} · 不会 {summary.dontKnow}</small>}</div>;
}
export function CourseProjectStatus({value}:{value:CourseProjectActivity}){
  return <p className="ca-project-status">{value.definitionCurrent?'与本页课程一致':'保留的项目版本'} · 已保存内容 {value.draftStages}/{value.totalStages} · 已提交 {value.submittedStages}/{value.totalStages} · 最新提交已有人工复核 {value.reviewedStages}/{value.totalStages}<small>人工复核针对提交版本；自评和AI建议单独记录。</small></p>;
}
