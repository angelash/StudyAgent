'use client';
import Link from 'next/link';
import type { RetentionEvidence } from '@study-agent/contracts';
function sourceHref(evidence:RetentionEvidence,source:RetentionEvidence['sources'][number]){
 const query=new URLSearchParams({studentId:evidence.studentId,subject:evidence.subject});
 if(source.kind==='classroom_teaching_displayed'||source.kind==='classroom_hint'||source.kind==='classroom_feedback'){query.set('session',source.sourceId);return'/studio/classroom?'+query;}
 if(source.kind.startsWith('generated_teaching_')&&source.navigation?.assignmentId){
  query.set('view','conversation-practice');query.set('kind','generated');query.set('teachingAssignment',source.navigation.assignmentId);query.set('teachingSession',source.navigation.sessionId);if(source.navigation.questionId)query.set('question',source.navigation.questionId);return'/studio/tasks?'+query;
 }
 if(source.kind.startsWith('practice_')&&source.navigation){const navigation=source.navigation;if(navigation.origin==='assistant_artifact'&&navigation.assignmentId){query.set('view','conversation-practice');query.set('assistantAssignment',navigation.assignmentId);query.set('assistantPractice',navigation.sessionId);if(navigation.questionId)query.set('question',navigation.questionId);return'/studio/tasks?'+query;}query.set('practice',navigation.sessionId);if(navigation.questionId)query.set('question',navigation.questionId);return'/student/today?'+query;}
 if(source.kind==='diagnostic_hint'&&source.navigation){query.set('session',source.navigation.sessionId);return'/student/assessment?'+query;}
 return null;
}
export function RetentionSourceLinks({evidence}:{evidence:RetentionEvidence}){
 return <details><summary>核对实际教学和帮助来源（{evidence.sources.length}）</summary>{evidence.sources.map(source=>{const href=sourceHref(evidence,source);return <p key={source.id}>{new Date(source.at).toLocaleString('zh-CN')} · {source.kind==='practice_opened'?'原练习内容提供':source.kind==='generated_teaching_opened'?'本人AI教学开始':source.kind==='classroom_teaching_displayed'?'原课堂教学内容提供':'原帮助或练习回执'}{href&&<> · <Link href={href}>返回来源 ↗</Link></>}</p>;})}</details>;
}
