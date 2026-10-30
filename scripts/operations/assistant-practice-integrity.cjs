// Legacy backups do not load compiled teaching code unless new teaching records exist.
const path=require('node:path');
const privateNames=['assistantGuidanceIntents','assistantPracticeArtifacts','assistantPracticeAssignments','assistantPracticeAssignmentWithdrawals','assistantPracticeGroupStarts','assistantTeachingPracticeSessions','assistantTeachingPracticeDrafts','assistantTeachingPractices','assistantTeachingAssignments','assistantTeachingSessions'];
const sql="SELECT collection,record_id,body FROM domain_records WHERE collection IN ('assistantSessions','assistantMessages','students','users','privacyRequests','diagnosticSessions','diagnosticReports','diagnosticResponses','diagnosticPlans','guidancePlanRevisions','practiceSessions','practiceAttempts','practiceHints','studentMedia',"+privateNames.map(name=>"'"+name+"'").join(',')+")";
function validate(rows){
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
