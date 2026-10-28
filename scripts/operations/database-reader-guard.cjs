// The explicit ready marker is understood by current readers and refused by
// the saved legacy reader. Restoring/unknown states never permit application startup.
const SCHEMA_VERSION=23,READY_STATE='ready-schema23';
function readyState(versions){
  if(!Array.isArray(versions)||!versions.length)throw Error('unsupported_database_schema');
  const version=versions.at(-1);
  if(!Number.isSafeInteger(version)||version<1||version>SCHEMA_VERSION)throw Error('unsupported_database_schema');
  return version===SCHEMA_VERSION?READY_STATE:'ready';
}
function assertReady(state,versions){
  const expected=readyState(versions);
  // Legacy pre-guard backups remain supported. Schema23 always requires its marker.
  if(state!==undefined&&state!==expected||expected===READY_STATE&&state!==expected)throw Error('source_database_restore_incomplete');
}
module.exports={SCHEMA_VERSION,READY_STATE,readyState,assertReady};
