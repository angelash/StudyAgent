// The explicit ready marker is understood by current readers and refused by
// the saved legacy reader. Restoring/unknown states never permit application startup.
const SCHEMA_VERSION=37,READY_STATE='ready-schema37-math-figures-v1';
function readyState(versions){
  if(!Array.isArray(versions)||!versions.length)throw Error('unsupported_database_schema');
  const version=versions.at(-1);
  if(!Number.isSafeInteger(version)||version<1||version>SCHEMA_VERSION)throw Error('unsupported_database_schema');
  return version===37?READY_STATE:version===36?'ready-schema36-gesp-retention-feedback-v1':version===35?'ready-schema35-gesp-first-group-v2':version===34?'ready-schema34-gesp-first-response-v1':version===33?'ready-schema33-exact-edition-v1':version===32?'ready-schema32':version===31?'ready-schema31':version===30?'ready-schema30':version===29?'ready-schema29':version===28?'ready-schema28':version===27?'ready-schema27':version===26?'ready-schema26':version===25?'ready-schema25':version===24?'ready-schema24':version===23?'ready-schema23':'ready';
}
function assertReady(state,versions){
  const expected=readyState(versions);
  // Legacy pre-guard backups remain supported. Every version since23 requires its own marker.
  if(state!==undefined&&state!==expected||expected!=='ready'&&state!==expected)throw Error('source_database_restore_incomplete');
}
module.exports={SCHEMA_VERSION,READY_STATE,readyState,assertReady};
