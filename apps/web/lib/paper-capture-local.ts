import type {PaperCaptureCompleteCopy,PaperCapturePrivateScope} from '@study-agent/contracts';
import {paperCaptureEditorSchema,paperCapturePrivateScopeSchema} from '@study-agent/contracts';
import {readBrowserPaperCaptureCopy} from './paper-capture-copy';

const databaseName='studyagent-paper-capture-v1',storeName='drafts';
// A cleared slot retains only its monotonic revision. Original files and input
// are removed; a stale tab cannot mistake a later recreated draft for its own.
type Saved={key:string;revision:number;fingerprint:string;body:string|null;savedAt:string};
export class PaperCaptureLocalConflict extends Error{
 constructor(){super('另一标签已更新这份本机采集。当前原文件仍保留，请先下载副本再核对两个版本。');this.name='PaperCaptureLocalConflict';}
}
export class PaperCaptureLocalUnavailable extends Error{
 constructor(){super('本机暂时不能完整保留图片草稿。当前文件仍在页面中，请下载完整图片副本后再离开。');this.name='PaperCaptureLocalUnavailable';}
}
export const paperCaptureLocalKey=(value:PaperCapturePrivateScope,slot?:string)=>{const scope=paperCapturePrivateScopeSchema.parse(value);return JSON.stringify(['paper-capture-local-v1',scope.actorId,scope.studentId,scope.subject,...(slot===undefined?[]:[paperCaptureEditorSchema.shape.slot.parse(slot)])]);};
function checkSlot(copy:PaperCaptureCompleteCopy,slot?:string){if(slot!==undefined&&copy.editor?.slot!==slot)throw Error('这份副本属于另一份本机采集，未覆盖或移除当前草稿。');}
function stopped(signal?:AbortSignal){if(signal?.aborted)throw new DOMException('本机采集操作已停止，原文件仍保留。','AbortError');}
function open():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  let request:IDBOpenDBRequest;try{if(!globalThis.indexedDB)throw Error();request=indexedDB.open(databaseName,1);}catch{return reject(new PaperCaptureLocalUnavailable());}
  let rejected=false;
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(storeName))request.result.createObjectStore(storeName,{keyPath:'key'});};
  request.onerror=()=>{rejected=true;reject(new PaperCaptureLocalUnavailable());};
  request.onblocked=()=>{rejected=true;reject(new PaperCaptureLocalUnavailable());};
  request.onsuccess=()=>{const db=request.result;if(rejected){db.close();return;}db.onversionchange=()=>db.close();resolve(db);};
 });
}
function saved(value:unknown,key:string):Saved|null{
 if(value===undefined)return null;
 const row=value as Saved;
 if(!row||typeof row!=='object'||Object.keys(row).sort().join(',')!=='body,fingerprint,key,revision,savedAt'||row.key!==key||!Number.isSafeInteger(row.revision)||row.revision<1||row.body!==null&&(typeof row.body!=='string'||row.body.length>75*1024*1024)||!/^[a-f0-9]{64}$/.test(row.fingerprint)||typeof row.savedAt!=='string'||!Number.isFinite(Date.parse(row.savedAt)))throw Error('本机旧稿的格式或归属需要核对，未覆盖或移除。');
 return row;
}
async function readRaw(key:string,signal?:AbortSignal){
 stopped(signal);const db=await open();
 try{stopped(signal);return await new Promise<Saved|null>((resolve,reject)=>{
  const tx=db.transaction(storeName,'readonly'),request=tx.objectStore(storeName).get(key);let result:Saved|null=null;
  const abort=()=>{try{tx.abort();}catch{}};signal?.addEventListener('abort',abort,{once:true});
  request.onsuccess=()=>{try{result=saved(request.result,key);}catch(error){reject(error);abort();}};
  tx.oncomplete=()=>{signal?.removeEventListener('abort',abort);try{stopped(signal);resolve(result);}catch(error){reject(error);}};
  tx.onerror=tx.onabort=()=>{signal?.removeEventListener('abort',abort);reject(signal?.aborted?new DOMException('本机采集读取已停止。','AbortError'):new PaperCaptureLocalUnavailable());};
 });}finally{db.close();}
}
export async function loadPaperCaptureLocal(scope:PaperCapturePrivateScope,signal?:AbortSignal,slot?:string){
 const key=paperCaptureLocalKey(scope,slot),row=await readRaw(key,signal);if(!row||row.body===null)return null;
 const restored=await readBrowserPaperCaptureCopy(JSON.parse(row.body),scope,signal);checkSlot(restored.copy,slot);if(restored.copy.fingerprint!==row.fingerprint)throw Error('本机原文件与草稿记录不一致，未覆盖当前采集。');
 return{...restored,revision:row.revision,savedAt:row.savedAt};
}
/** Compare the actual revision in the same IndexedDB write transaction.
 * Neither a stale tab nor a failed readback may replace a newer draft. */
export async function savePaperCaptureLocal(copy:PaperCaptureCompleteCopy,scope:PaperCapturePrivateScope,expectedRevision:number|null,signal?:AbortSignal,slot?:string){
 stopped(signal);if(expectedRevision!==null&&(!Number.isSafeInteger(expectedRevision)||expectedRevision<1))throw new PaperCaptureLocalConflict();
 await readBrowserPaperCaptureCopy(copy,scope,signal);checkSlot(copy,slot);const key=paperCaptureLocalKey(scope,slot),body=JSON.stringify(copy);if(body.length>75*1024*1024)throw new PaperCaptureLocalUnavailable();
 const db=await open();let written:Saved;
 try{written=await new Promise<Saved>((resolve,reject)=>{
  const tx=db.transaction(storeName,'readwrite'),store=tx.objectStore(storeName),request=store.get(key);let result:Saved|undefined,reason:unknown;
  const abort=()=>{try{tx.abort();}catch{}};signal?.addEventListener('abort',abort,{once:true});
  request.onsuccess=()=>{try{
   stopped(signal);const previous=saved(request.result,key);
   if(previous?.body===body&&previous.fingerprint===copy.fingerprint){result=previous;return;}
   if((previous&&previous.body!==null?previous.revision:null)!==expectedRevision||previous&&previous.revision>=Number.MAX_SAFE_INTEGER)throw new PaperCaptureLocalConflict();
   result={key,revision:(previous?.revision??0)+1,fingerprint:copy.fingerprint,body,savedAt:new Date().toISOString()};store.put(result);
  }catch(error){reason=error;abort();}};
  tx.oncomplete=()=>{signal?.removeEventListener('abort',abort);if(result)resolve(result);else reject(new PaperCaptureLocalUnavailable());};
  tx.onerror=tx.onabort=()=>{signal?.removeEventListener('abort',abort);reject(reason??(signal?.aborted?new DOMException('本机采集保存已停止。','AbortError'):new PaperCaptureLocalUnavailable()));};
 });}finally{db.close();}
 const actual=await readRaw(key,signal);if(!actual||actual.revision!==written.revision||actual.fingerprint!==copy.fingerprint||actual.body!==body)throw new PaperCaptureLocalConflict();
 stopped(signal);return{revision:actual.revision,savedAt:actual.savedAt,fingerprint:actual.fingerprint};
}
/** Only an explicit clear action may remove the exact currently reviewed draft. */
export async function clearPaperCaptureLocal(scope:PaperCapturePrivateScope,expectedRevision:number,expectedFingerprint:string,signal?:AbortSignal,slot?:string){
 const key=paperCaptureLocalKey(scope,slot);stopped(signal);const reviewed=await readRaw(key,signal);
 if(!reviewed||reviewed.body===null||reviewed.revision!==expectedRevision||reviewed.fingerprint!==expectedFingerprint||reviewed.revision>=Number.MAX_SAFE_INTEGER)throw new PaperCaptureLocalConflict();
 const original=await readBrowserPaperCaptureCopy(JSON.parse(reviewed.body),scope,signal);checkSlot(original.copy,slot);if(original.copy.fingerprint!==reviewed.fingerprint)throw new PaperCaptureLocalConflict();
 const db=await open();
 try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(storeName,'readwrite'),store=tx.objectStore(storeName),request=store.get(key);let reason:unknown;
  const abort=()=>{try{tx.abort();}catch{}};signal?.addEventListener('abort',abort,{once:true});
  request.onsuccess=()=>{try{stopped(signal);const row=saved(request.result,key);if(!row||row.revision!==expectedRevision||row.fingerprint!==expectedFingerprint||row.body!==reviewed.body)throw new PaperCaptureLocalConflict();store.put({...row,revision:row.revision+1,fingerprint:'0'.repeat(64),body:null,savedAt:new Date().toISOString()});}catch(error){reason=error;abort();}};
  tx.oncomplete=()=>{signal?.removeEventListener('abort',abort);resolve();};
  tx.onerror=tx.onabort=()=>{signal?.removeEventListener('abort',abort);reject(reason??(signal?.aborted?new DOMException('本机采集清理已停止。','AbortError'):new PaperCaptureLocalUnavailable()));};
 });}finally{db.close();}
 stopped(signal);
}
