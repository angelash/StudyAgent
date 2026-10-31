'use client';
import {paperCaptureCommandResultSchema,paperCaptureRepairCandidateSchema,type PaperCaptureRepairSelection,type PaperCapturePendingCommand} from '@study-agent/contracts';
import {apiBaseUrl,apiRequest,getAuthToken} from './api';
import {paperCaptureBytesHash,paperCaptureValueHash} from './paper-capture-copy';

export const paperCaptureApi='/learning/paper-captures';
export function paperCaptureCommandPath(command:PaperCapturePendingCommand){
 const part=(value:string)=>encodeURIComponent(value);
 switch(command.kind){
  case'upload':return'/uploads';
  case'completeUpload':return'/uploads/'+part(command.uploadId)+'/complete';
  case'cancelUpload':return'/uploads/'+part(command.uploadId)+'/cancel';
  case'pageRevision':return'/pages/'+part(command.pageId)+'/revisions';
  case'groupRevision':return'/groups/'+part(command.groupId)+'/revisions';
  case'recognize':return'/groups/'+part(command.groupId)+'/recognize';
  case'cancelDerivation':return'/derivations/'+part(command.derivationId)+'/cancel';
  case'retryDerivation':return'/derivations/'+part(command.derivationId)+'/retry';
 }
}
export async function sendPaperCaptureCommand(command:PaperCapturePendingCommand,signal:AbortSignal){
 return paperCaptureCommandResultSchema.parse(await apiRequest(paperCaptureApi+paperCaptureCommandPath(command),{method:'POST',body:JSON.stringify(command),signal}));
}
export async function readPaperCaptureBlob(path:string,signal:AbortSignal){
 const token=getAuthToken(),response=await fetch(apiBaseUrl+'/api'+paperCaptureApi+path,{credentials:'include',headers:token?{Authorization:'Bearer '+token}:{},signal});
 if(!response.ok)throw Error('原文件暂不可读取，请核对当前权限和原件状态。');
 return response.blob();
}
export function downloadPaperCaptureBlob(blob:Blob,name:string){
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export async function generatePaperRepairCandidate(selection:PaperCaptureRepairSelection,strategy:'source_rebuild'|'other_pdf',signal:AbortSignal){
 const token=getAuthToken(),response=await fetch(apiBaseUrl+'/api'+paperCaptureApi+'/repair-candidates',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({selection,strategy}),signal});
 if(!response.ok){const value=await response.json().catch(()=>null);throw Error(value?.error?.message??'准确来源暂不可重建，请保留当前输入后核对原件。');}
 const encoded=response.headers.get('x-study-paper-candidate');if(!encoded||encoded.length>16000)throw Error('候选缺少完整来源依据，请保留当前输入。');
 const candidate=paperCaptureRepairCandidateSchema.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(encoded),character=>character.charCodeAt(0))))),{fingerprint,...body}=candidate;
 if(await paperCaptureValueHash(selection)!==await paperCaptureValueHash(candidate.selection)||strategy!==candidate.strategy||await paperCaptureValueHash(body)!==fingerprint||Number(response.headers.get('content-length'))!==selection.bytes)throw Error('实际候选的来源、目标或完整字节数不同。');
 const blob=await response.blob();if(blob.size!==selection.bytes||blob.type!==selection.mediaType||await paperCaptureBytesHash(new Uint8Array(await blob.arrayBuffer()))!==selection.sha256)throw Error('实际候选字节与准确原件不同，未覆盖当前文件。');if(signal.aborted)throw new DOMException('候选读取已停止。','AbortError');return{candidate,blob};
}
