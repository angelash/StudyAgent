// The explicit ready marker is understood by current readers and refused by
// the saved legacy reader. Restoring/unknown states never permit application startup.
const SCHEMA_VERSION=24,READY_STATE='ready-schema24';
function readyState(versions){
  if(!Array.isArray(versions)||!versions.length)throw Error('unsupported_database_schema');
  const version=versions.at(-1);
  if(!Number.isSafeInteger(version)||version<1||version>SCHEMA_VERSION)throw Error('unsupported_database_schema');
  return version===24?READY_STATE:version===23?'ready-schema23':'ready';
}
function assertReady(state,versions){
  const expected=readyState(versions);
  // Legacy pre-guard backups remain supported. Every version since23 requires its own marker.
  if(state!==undefined&&state!==expected||expected!=='ready'&&state!==expected)throw Error('source_database_restore_incomplete');
}
module.exports={SCHEMA_VERSION,READY_STATE,readyState,assertReady};
