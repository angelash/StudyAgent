// Legacy backups do not load compiled teaching code unless new teaching records exist.
const path=require('node:path');
const privateNames=['assistantPracticeArtifacts','assistantPracticeAssignments','assistantPracticeGroupStarts','assistantTeachingPracticeSessions'];
const sql="SELECT collection,record_id,body FROM domain_records WHERE collection IN ('assistantSessions','students','users','privacyRequests','practiceSessions','practiceAttempts','practiceHints',"+privateNames.map(name=>"'"+name+"'").join(',')+")";
function validate(rows){
 const present=rows.some(row=>{
  if(privateNames.includes(row.collection))return true;
  if(!['practiceSessions','practiceAttempts','practiceHints'].includes(row.collection))return false;
  const body=typeof row.body==='string'?JSON.parse(row.body):row.body;
  return body?.origin==='assistant_artifact'||body?.sourceGroupId||body?.assistantAssignmentId||body?.assistantInput;
 });
 if(present)require(path.resolve(__dirname,'../../apps/api/dist/apps/api/src/modules/learning/assistant-practice-integrity.js')).assertAssistantPracticeRecords(rows);
}
module.exports={sql,validate};
