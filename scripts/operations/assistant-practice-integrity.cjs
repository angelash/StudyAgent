// Preserve legacy backup independence from compiled teaching code when there are no new private records.
const path=require('node:path');
const privateCollections="'assistantPracticeArtifacts','assistantPracticeAssignments','assistantTeachingPracticeSessions'";
const sql="SELECT collection,record_id,body FROM domain_records WHERE collection IN ('assistantSessions','students','users',"+privateCollections+") AND EXISTS (SELECT 1 FROM domain_records WHERE collection IN ("+privateCollections+") LIMIT 1)";
function validate(rows){
 if(rows.some(row=>['assistantPracticeArtifacts','assistantPracticeAssignments','assistantTeachingPracticeSessions'].includes(row.collection)))
  require(path.resolve(__dirname,'../../apps/api/dist/apps/api/src/modules/learning/assistant-practice-integrity.js')).assertAssistantPracticeRecords(rows);
}
module.exports={sql,validate};
