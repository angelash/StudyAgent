// Legacy backups do not load compiled teaching code unless new teaching records exist.
const path=require('node:path');
const privateNames=['guidanceCalendarArrangements','studioCalendarCommands','assistantGuidanceIntents','assistantPracticeArtifacts','assistantPracticeAssignments','assistantPracticeAssignmentWithdrawals','assistantPracticeGroupStarts','assistantTeachingPracticeSessions','assistantTeachingPracticeDrafts','assistantTeachingPractices','assistantTeachingAssignments','assistantTeachingSessions'];
const sql="SELECT collection,record_id,body FROM domain_records WHERE collection IN ('retentionExposureEvents','diagnosticHints','classroomSessions','studioCourses','sourceCourses','knowledgeAtoms','curriculumRevisions','scoringRevisions','assistantSessions','assistantMessages','students','users','privacyRequests','diagnosticSessions','diagnosticReports','diagnosticResponses','diagnosticPlans','guidancePlanRevisions','reviewTasks','studioScheduleEvents','studioStudyPlans','practiceSessions','practiceAttempts','practiceHints','studentMedia',"+privateNames.map(name=>"'"+name+"'").join(',')+")";
function validate(rows){
 if(rows.some(row=>row.collection==='retentionExposureEvents'||['practiceSessions','assistantTeachingSessions','diagnosticSessions'].includes(row.collection)&&Boolean((typeof row.body==='string'?JSON.parse(row.body):row.body)?.retentionProtocol)||row.collection==='diagnosticResponses'&&Boolean((typeof row.body==='string'?JSON.parse(row.body):row.body)?.retentionEvidence)||row.collection==='classroomSessions'&&Boolean((typeof row.body==='string'?JSON.parse(row.body):row.body)?.retentionContext)))require(path.resolve(__dirname,'../../apps/api/dist/apps/api/src/modules/diagnostics/retention-integrity.js')).assertRetentionNativeRows(rows);
 const hasCalendar=rows.some(row=>['guidanceCalendarArrangements','studioCalendarCommands'].includes(row.collection)||row.collection==='studioScheduleEvents'&&Boolean((typeof row.body==='string'?JSON.parse(row.body):row.body)?.guidance));
 if(hasCalendar)require(path.resolve(__dirname,'../../apps/api/dist/apps/api/src/modules/learning/guidance-calendar-record.js')).assertGuidanceCalendarRecords(rows);
 if(rows.some(row=>row.collection==='assistantGuidanceIntents'))require(path.resolve(__dirname,'../../apps/api/dist/apps/api/src/modules/learning/assistant-guidance-integrity.js')).assertAssistantGuidanceRecords(rows);
 const present=rows.some(row=>{
  if(privateNames.includes(row.collection))return true;
  if(!['practiceSessions','practiceAttempts','practiceHints'].includes(row.collection))return false;
  const body=typeof row.body==='string'?JSON.parse(row.body):row.body;
  return body?.origin==='assistant_artifact'||body?.sourceGroupId||body?.assistantAssignmentId||body?.assistantInput;
 });
 if(present)require(path.resolve(__dirname,'../../apps/api/dist/apps/api/src/modules/learning/assistant-practice-integrity.js')).assertAssistantPracticeRecords(rows);
 if(rows.some(row=>['assistantTeachingPracticeDrafts','assistantTeachingPractices','assistantTeachingAssignments','assistantTeachingSessions'].includes(row.collection)))require(path.resolve(__dirname,'../../apps/api/dist/apps/api/src/modules/learning/assistant-teaching-integrity.js')).assertAssistantTeachingRecords(rows);
}
module.exports={sql,validate};
