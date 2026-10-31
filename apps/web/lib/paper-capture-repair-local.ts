import {z} from 'zod';
import {paperCapturePrivateScopeSchema,paperCaptureFileTargetSchema,type PaperCapturePrivateScope} from '@study-agent/contracts';
import {readBrowserPaperRepairCopy,paperRepairCopyLimits,type PaperRepairCopyManifest} from './paper-capture-repair-copy';

const databaseName='studyagent-paper-repair-v1',storeName='drafts';
const targetSchema=z.object({target:paperCaptureFileTargetSchema,role:z.enum(['original','baseline','derived','pdf','material_pdf'])}).strict();
export type PaperRepairLocalTarget=z.infer<typeof targetSchema>;
type Saved={key:string;revision:number;fingerprint:string;body:Blob|null;savedAt:string};
export class PaperRepairLocalConflict extends Error{constructor(){super('另一标签已保存这份原件恢复草稿。请先下载当前完整副本，再核对两个版本。');this.name='PaperRepairLocalConflict';}}
export class PaperRepairLocalUnavailable extends Error{constructor(){super('本机暂时不能完整保存这份原件恢复草稿。当前文件仍保留，请下载完整恢复副本后再离开。');this.name='PaperRepairLocalUnavailable';}}
function stopped(signal?:AbortSignal){if(signal?.aborted)throw new DOMException('本机恢复草稿操作已停止，当前文件仍保留。','AbortError');}
export function paperRepairLocalKey(scopeValue:PaperCapturePrivateScope,targetValue:PaperRepairLocalTarget){const scope=paperCapturePrivateScopeSchema.parse(scopeValue),target=targetSchema.parse(targetValue);if((target.target.kind==='derivation')!==['pdf','material_pdf'].includes(target.role))throw Error('请选择这份原页或PDF实际对应的恢复文件。');return JSON.stringify(['paper-repair-local-v1',scope.actorId,scope.studentId,scope.subject,target.target,target.role]);}
function saved(value:unknown,key:string):Saved|null{
 if(value===undefined)return null;const row=value as Saved;
 if(!row||typeof row!=='object'||Object.keys(row).sort().join(',')!=='body,fingerprint,key,revision,savedAt'||row.key!==key||!Number.isSafeInteger(row.revision)||row.revision<1||!/^[a-f0-9]{64}$/.test(row.fingerprint)||row.body!==null&&(!(row.body instanceof Blob)||row.body.size>paperRepairCopyLimits.fileBytes+paperRepairCopyLimits.headerBytes+64)||typeof row.savedAt!=='string'||!Number.isFinite(Date.parse(row.savedAt)))throw new PaperRepairLocalUnavailable();return row;
}
const sameRecord=(left:Saved|null,right:Saved|null)=>left===null||right===null?left===right:left.key===right.key&&left.revision===right.revision&&left.fingerprint===right.fingerprint&&(left.body===null||right.body===null?left.body===right.body:left.body.size===right.body.size)&&left.savedAt===right.savedAt;
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 let request:IDBOpenDBRequest;try{if(!globalThis.indexedDB)throw Error();request=indexedDB.open(databaseName,1);}catch{return reject(new PaperRepairLocalUnavailable());}let rejected=false;
 request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(storeName))request.result.createObjectStore(storeName,{keyPath:'key'});};request.onerror=()=>{rejected=true;reject(new PaperRepairLocalUnavailable());};request.onblocked=()=>{rejected=true;reject(new PaperRepairLocalUnavailable());};request.onsuccess=()=>{const db=request.result;if(rejected){db.close();return;}db.onversionchange=()=>db.close();resolve(db);};
 });}
async function readRaw(key:string,signal?:AbortSignal){
 stopped(signal);const db=await open();try{return await new Promise<Saved|null>((resolve,reject)=>{
  const tx=db.transaction(storeName,'readonly'),request=tx.objectStore(storeName).get(key);let result:Saved|null=null,reason:unknown;const abort=()=>{try{tx.abort();}catch{}};signal?.addEventListener('abort',abort,{once:true});
  request.onsuccess=()=>{try{stopped(signal);result=saved(request.result,key);}catch(error){reason=error;abort();}};tx.oncomplete=()=>{signal?.removeEventListener('abort',abort);try{stopped(signal);resolve(result);}catch(error){reject(error);}};tx.onerror=tx.onabort=()=>{signal?.removeEventListener('abort',abort);reject(reason??(signal?.aborted?new DOMException('恢复草稿读取已停止。','AbortError'):new PaperRepairLocalUnavailable()));};
 });}finally{db.close();}
}
function matchTarget(manifest:PaperRepairCopyManifest,targetValue:PaperRepairLocalTarget){const target=targetSchema.parse(targetValue),selection=manifest.selection;if(!selection||selection.role!==target.role||JSON.stringify(paperCaptureFileTargetSchema.parse(selection.target))!==JSON.stringify(target.target))throw new PaperRepairLocalConflict();}
async function checked(row:Saved,scope:PaperCapturePrivateScope,target:PaperRepairLocalTarget,signal?:AbortSignal){if(row.body===null)throw new PaperRepairLocalConflict();const read=await readBrowserPaperRepairCopy(row.body,scope,signal);matchTarget(read.manifest,target);if(read.manifest.fingerprint!==row.fingerprint)throw new PaperRepairLocalUnavailable();return read;}
export async function loadPaperRepairLocal(scope:PaperCapturePrivateScope,target:PaperRepairLocalTarget,signal?:AbortSignal){const row=await readRaw(paperRepairLocalKey(scope,target),signal);if(!row||row.body===null)return null;return{...await checked(row,scope,target,signal),blob:row.body,revision:row.revision,savedAt:row.savedAt};}
/** The write transaction compares the actual saved revision. Full payloads are
 * checked before publication and read back afterwards, including idempotent saves. */
export async function savePaperRepairLocal(blob:Blob,scope:PaperCapturePrivateScope,target:PaperRepairLocalTarget,expectedRevision:number|null,signal?:AbortSignal){
 stopped(signal);if(expectedRevision!==null&&(!Number.isSafeInteger(expectedRevision)||expectedRevision<1))throw new PaperRepairLocalConflict();const read=await readBrowserPaperRepairCopy(blob,scope,signal);matchTarget(read.manifest,target);const key=paperRepairLocalKey(scope,target),previous=await readRaw(key,signal);if(previous?.body)await checked(previous,scope,target,signal);
 if(previous?.fingerprint!==read.manifest.fingerprint&&(previous?.body?previous.revision:null)!==expectedRevision)throw new PaperRepairLocalConflict();const db=await open();let written:Saved;
 try{written=await new Promise<Saved>((resolve,reject)=>{
  const tx=db.transaction(storeName,'readwrite'),store=tx.objectStore(storeName),request=store.get(key);let result:Saved|undefined,reason:unknown;const abort=()=>{try{tx.abort();}catch{}};signal?.addEventListener('abort',abort,{once:true});
  request.onsuccess=()=>{try{
   stopped(signal);const actual=saved(request.result,key);if(!sameRecord(actual,previous))throw new PaperRepairLocalConflict();if(actual?.body&&actual.fingerprint===read.manifest.fingerprint){result=actual;return;}if((actual?.body?actual.revision:null)!==expectedRevision||actual&&actual.revision>=Number.MAX_SAFE_INTEGER)throw new PaperRepairLocalConflict();result={key,revision:(actual?.revision??0)+1,fingerprint:read.manifest.fingerprint,body:blob,savedAt:new Date().toISOString()};store.put(result);
  }catch(error){reason=error;abort();}};tx.oncomplete=()=>{signal?.removeEventListener('abort',abort);if(result)resolve(result);else reject(new PaperRepairLocalUnavailable());};tx.onerror=tx.onabort=()=>{signal?.removeEventListener('abort',abort);reject(reason??(signal?.aborted?new DOMException('恢复草稿保存已停止。','AbortError'):new PaperRepairLocalUnavailable()));};
 });}finally{db.close();}
 const actual=await readRaw(key,signal);if(!actual||!sameRecord(actual,written))throw new PaperRepairLocalConflict();await checked(actual,scope,target,signal);stopped(signal);return{revision:actual.revision,fingerprint:actual.fingerprint,savedAt:actual.savedAt};
}
/** Only the exact reviewed local revision is cleared. A newer draft remains. */
export async function clearPaperRepairLocal(scope:PaperCapturePrivateScope,target:PaperRepairLocalTarget,expectedRevision:number,expectedFingerprint:string,signal?:AbortSignal){
 const key=paperRepairLocalKey(scope,target);stopped(signal);const reviewed=await readRaw(key,signal);if(!reviewed||reviewed.body===null||reviewed.revision!==expectedRevision||reviewed.fingerprint!==expectedFingerprint||reviewed.revision>=Number.MAX_SAFE_INTEGER)throw new PaperRepairLocalConflict();await checked(reviewed,scope,target,signal);const db=await open();
 try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(storeName,'readwrite'),store=tx.objectStore(storeName),request=store.get(key);let reason:unknown;const abort=()=>{try{tx.abort();}catch{}};signal?.addEventListener('abort',abort,{once:true});request.onsuccess=()=>{try{stopped(signal);if(!sameRecord(saved(request.result,key),reviewed))throw new PaperRepairLocalConflict();store.put({...reviewed,body:null,fingerprint:'0'.repeat(64),revision:reviewed.revision+1,savedAt:new Date().toISOString()});}catch(error){reason=error;abort();}};tx.oncomplete=()=>{signal?.removeEventListener('abort',abort);resolve();};tx.onerror=tx.onabort=()=>{signal?.removeEventListener('abort',abort);reject(reason??(signal?.aborted?new DOMException('恢复草稿清空已停止。','AbortError'):new PaperRepairLocalUnavailable()));};
 });}finally{db.close();}const after=await readRaw(key,signal);if(!after||after.body!==null||after.revision!==reviewed.revision+1)throw new PaperRepairLocalConflict();stopped(signal);
}
