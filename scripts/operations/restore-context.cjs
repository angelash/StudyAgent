const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,hash=/^[a-f0-9]{64}$/;
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function targetIdentity(root,driver,connectionString) {
  const directory=path.resolve(root).replaceAll('\\','/');
  const target={directory:process.platform==='win32'?directory.toLowerCase():directory,driver};
  if(driver==='postgres'){
    const url=new URL(connectionString);
    if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('postgres_connection_required');
    target.database={host:url.hostname,port:url.port||'5432',user:decodeURIComponent(url.username),name:decodeURIComponent(url.pathname.slice(1)),sslmode:url.searchParams.get('sslmode'),options:url.searchParams.get('options')};
  }else if(driver!=='sqlite')throw new Error('unsupported_restore_driver');
  return fingerprint(target);
}
async function createRestoreContext({root,driver,manifest,ledger,connectionString,afterPhase}) {
  const { publishAtomicMarker } = require('../../apps/api/dist/apps/api/src/infrastructure/atomic-marker-publication.js');
  const directory=path.resolve(root,'.study-restore-control');
  const value={format:'study-restore-context-v1',restoreId:randomUUID(),nonce:randomUUID(),pid:process.pid,createdAt:new Date().toISOString(),driver,backupId:manifest.id,manifestHash:fingerprint(manifest),ledgerHash:ledger?.sha256??null,targetHash:targetIdentity(root,driver,connectionString)};
  if(!uuid.test(value.backupId)||value.ledgerHash!==null&&!hash.test(value.ledgerHash))throw new Error('invalid_restore_context_input');
  await publishAtomicMarker({directory,file:path.join(directory,'context.json'),purpose:'context',value,persistent:true,afterPhase});
  return{...value,bindingHash:fingerprint(value)};
}
async function readRestoreContext(root) {
  const { assertNoFileLinks } = require('../../apps/api/dist/apps/api/src/infrastructure/studio-file-paths.js');
  const file=path.resolve(root,'.study-restore-control/context.json');await assertNoFileLinks(file);
  const stat=await fs.promises.lstat(file);if(!stat.isFile()||stat.size>4096)throw new Error('invalid_restore_context');
  const value=JSON.parse(await fs.promises.readFile(file,'utf8'));
  await assertNoFileLinks(file);const after=await fs.promises.lstat(file);
  if(after.ino!==stat.ino||after.dev!==stat.dev||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs)throw new Error('restore_context_changed');
  if(value.format!=='study-restore-context-v1'||!uuid.test(value.restoreId)||!uuid.test(value.nonce)||!uuid.test(value.backupId)||!Number.isSafeInteger(value.pid)||value.pid<1||!Number.isFinite(Date.parse(value.createdAt))||!['sqlite','postgres'].includes(value.driver)||!hash.test(value.manifestHash)||!hash.test(value.targetHash)||value.ledgerHash!==null&&!hash.test(value.ledgerHash))throw new Error('invalid_restore_context');
  return{...value,bindingHash:fingerprint(value)};
}
function assertRestoreContextMatches(context,{root,driver,manifest,ledger,connectionString}){
  const{bindingHash,...value}=context;
  if(bindingHash!==fingerprint(value)||context.driver!==driver||context.backupId!==manifest.id||context.manifestHash!==fingerprint(manifest)||context.ledgerHash!==(ledger?.sha256??null)||context.targetHash!==targetIdentity(root,driver,connectionString))throw new Error('restore_context_identity_mismatch');
}
module.exports={createRestoreContext,readRestoreContext,assertRestoreContextMatches,targetIdentity,fingerprint};
