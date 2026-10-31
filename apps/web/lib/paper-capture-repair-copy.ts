import {z} from 'zod';
import {paperCaptureScopeSchema,paperCapturePrivateScopeSchema,paperCaptureRepairSelectionSchema,paperCaptureRepairCommandSchema,paperCaptureRepairCandidateSchema,type PaperCaptureRepairCandidate,type PaperCapturePrivateScope,type PaperCaptureScope,type PaperCaptureRepairSelection,type PaperCaptureRepairCommand} from '@study-agent/contracts';
import {browserPaperCaptureScope,paperCaptureBytesHash,paperCaptureValueHash} from './paper-capture-copy';

const byteLimit=80*1024*1024,headerLimit=2*1024*1024,magic=new TextEncoder().encode('STUDY-PAPER-REPAIR-COPY/1\n');
const id=z.string().min(1).max(180),hash=z.string().regex(/^[a-f0-9]{64}$/),raw=z.string().max(10000);
export const paperRepairCopyFormSchema=z.object({filename:raw,strategy:raw,role:raw,note:z.string().max(20000)}).strict();
export const paperRepairCopyManifestSchema=z.object({protocol:z.literal('paper-capture-repair-copy-v1'),actorId:id,scope:paperCaptureScopeSchema,sourceScope:paperCaptureScopeSchema.nullable(),selection:paperCaptureRepairSelectionSchema.nullable(),candidate:paperCaptureRepairCandidateSchema.optional(),
 file:z.object({name:z.string().max(255),mediaType:z.string().max(180),bytes:z.number().int().nonnegative().max(byteLimit),sha256:hash}).strict().nullable(),fileUse:z.enum(['none','exact_candidate','rejected_candidate']),form:paperRepairCopyFormSchema,
 uploadIds:z.array(id).max(100),repairIds:z.array(id).max(100),pending:paperCaptureRepairCommandSchema.nullable(),rejected:z.array(paperCaptureRepairCommandSchema).max(50),requiresSourceRecheck:z.literal(true),requiresOriginalResultLookup:z.boolean(),fingerprint:hash}).strict();
export type PaperRepairCopyManifest=z.infer<typeof paperRepairCopyManifestSchema>;
export type BrowserPaperRepairCopyInput={actorId:string;scope:PaperCaptureScope;sourceScope:PaperCaptureScope|null;selection:PaperCaptureRepairSelection|null;candidate?:PaperCaptureRepairCandidate;file:{name:string;mediaType:string;blob:Blob}|null;form:z.infer<typeof paperRepairCopyFormSchema>;uploadIds:readonly string[];repairIds:readonly string[];pending:PaperCaptureRepairCommand|null;rejected:readonly PaperCaptureRepairCommand[]};
function stopped(signal?:AbortSignal){if(signal?.aborted)throw new DOMException('恢复副本操作已停止，当前原文件仍保留。','AbortError');}
const same=async(a:unknown,b:unknown)=>await paperCaptureValueHash(a)===await paperCaptureValueHash(b);
function fileUse(selection:PaperCaptureRepairSelection|null,file:PaperRepairCopyManifest['file']):PaperRepairCopyManifest['fileUse']{return !file?'none':selection&&selection.sha256===file.sha256&&selection.bytes===file.bytes?'exact_candidate':'rejected_candidate';}
async function graph(copy:PaperRepairCopyManifest,scopeValue:PaperCapturePrivateScope,signal?:AbortSignal){
 const scope=paperCapturePrivateScopeSchema.parse(scopeValue),expected=await browserPaperCaptureScope(scope);stopped(signal);
 if(copy.actorId!==scope.actorId||!await same(copy.scope,expected)||Boolean(copy.selection)!==Boolean(copy.sourceScope)||copy.sourceScope&&(copy.sourceScope.studentId!==scope.studentId||copy.sourceScope.subject!==scope.subject)||new Set(copy.uploadIds).size!==copy.uploadIds.length||new Set(copy.repairIds).size!==copy.repairIds.length||copy.fileUse!==fileUse(copy.selection,copy.file))throw Error('恢复副本的账号、原文件或学习范围不一致，未覆盖当前输入。');
 const requests=[copy.pending,...copy.rejected].filter((command):command is PaperCaptureRepairCommand=>command!==null),lookup=Boolean(copy.pending||copy.rejected.length||copy.uploadIds.length||copy.repairIds.length);
 if(copy.requiresOriginalResultLookup!==lookup||!copy.selection&&(requests.length||copy.uploadIds.length||copy.repairIds.length)||!copy.file&&requests.some(command=>command.kind==='upload'||command.kind==='start'))throw Error('恢复副本缺少完整的原文件或原操作对应关系。');
 const candidates=[...(copy.candidate?[copy.candidate]:[]),...requests.flatMap(command=>command.kind==='upload'&&command.input.candidate?[command.input.candidate]:[])];
 for(const candidate of candidates){const{fingerprint,...body}=candidate;if(await paperCaptureValueHash(body)!==fingerprint)throw Error('恢复候选的完整来源依据已变化，当前文件仍保留。');}
 if(copy.candidate&&(!await same(copy.candidate.selection,copy.selection)||copy.fileUse!=='exact_candidate'))throw Error('重建候选的来源、目标或实际文件不同，当前原文件仍保留。');
 for(const command of requests){
  stopped(signal);
  if(command.kind==='upload'||command.kind==='start'){
   const selection=command.input.selection,current=copy.selection;
   if(!current||!await same(selection.target,current.target)||selection.role!==current.role||selection.sha256!==current.sha256||selection.bytes!==current.bytes||selection.mediaType!==current.mediaType)throw Error('恢复副本中的原命令属于另一份准确文件，当前文件仍保留。');
   if(command.kind==='upload'&&!await same(command.input.scope,copy.scope))throw Error('恢复副本中的原上传账号或学习对象不一致。');
   if(command.kind==='start'&&!copy.uploadIds.includes(command.input.uploadId))throw Error('恢复副本缺少原恢复暂存的对应标识。');
  }else if(command.kind==='cancelUpload'){if(!copy.uploadIds.includes(command.uploadId))throw Error('恢复副本缺少原取消暂存的对应标识。');}
  else if(!copy.repairIds.includes(command.repairId))throw Error('恢复副本缺少原任务的对应标识。');
 }
}
/** A bounded JSON header plus original binary bytes avoids base64 expansion for
 * an80MiB PDF. Original inputs remain strings; this never submits a command. */
export async function completeBrowserPaperRepairCopy(input:BrowserPaperRepairCopyInput,signal?:AbortSignal){
 stopped(signal);if(input.file&&(!(input.file.blob instanceof Blob)||input.file.blob.size>byteLimit))throw Error('完整恢复副本最多保留80MiB原文件，当前文件未改动。');
 const file=input.file?{name:input.file.name,mediaType:input.file.mediaType,bytes:input.file.blob.size,sha256:await paperCaptureBytesHash(new Uint8Array(await input.file.blob.arrayBuffer()))}:null;stopped(signal);
 const body={protocol:'paper-capture-repair-copy-v1' as const,actorId:input.actorId,scope:structuredClone(input.scope),sourceScope:structuredClone(input.sourceScope),selection:structuredClone(input.selection),...(input.candidate!==undefined?{candidate:structuredClone(input.candidate)}:{}),file,fileUse:fileUse(input.selection,file),form:structuredClone(input.form),uploadIds:[...input.uploadIds],repairIds:[...input.repairIds],pending:structuredClone(input.pending),rejected:structuredClone([...input.rejected]),requiresSourceRecheck:true as const,requiresOriginalResultLookup:Boolean(input.pending||input.rejected.length||input.uploadIds.length||input.repairIds.length)},manifest=paperRepairCopyManifestSchema.parse({...body,fingerprint:await paperCaptureValueHash(body)});
 await graph(manifest,{actorId:input.actorId,studentId:input.scope.studentId,subject:input.scope.subject},signal);if(!await same(body,(({fingerprint:_fingerprint,...body})=>body)(manifest)))throw Error('恢复副本的原输入不能被裁剪或改写。');
 const header=new TextEncoder().encode(JSON.stringify(manifest));if(header.length>headerLimit)throw Error('恢复副本中的原输入超过完整保存预算，当前输入仍保留。');const length=new ArrayBuffer(4);new DataView(length).setUint32(0,header.length,false);
 const blob=new Blob([magic.buffer.slice(magic.byteOffset,magic.byteOffset+magic.byteLength)as ArrayBuffer,length,header.buffer as ArrayBuffer,...(input.file?[input.file.blob]:[])],{type:'application/x-studyagent-paper-repair'});stopped(signal);return{manifest,blob};
}
/** Imports validate the complete original payload and scope before returning a
 * local draft. Server source/result checks and explicit confirmation follow. */
export async function readBrowserPaperRepairCopy(blob:Blob,scopeValue:PaperCapturePrivateScope,signal?:AbortSignal){
 stopped(signal);if(!(blob instanceof Blob)||blob.size<magic.length+4||blob.size>magic.length+4+headerLimit+byteLimit)throw Error('恢复副本格式或完整字节数无效，当前输入仍保留。');
 const prefix=new Uint8Array(await blob.slice(0,magic.length+4).arrayBuffer());if(magic.some((value,index)=>prefix[index]!==value))throw Error('请选择完整的纸面原件恢复副本。');const headerBytes=new DataView(prefix.buffer,prefix.byteOffset+magic.length,4).getUint32(0,false);if(headerBytes<2||headerBytes>headerLimit||blob.size<magic.length+4+headerBytes)throw Error('恢复副本的完整表单头需要核对。');
 const rawHeader=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await blob.slice(magic.length+4,magic.length+4+headerBytes).arrayBuffer())),manifest=paperRepairCopyManifestSchema.parse(rawHeader),{fingerprint,...body}=manifest;
 if(!await same(manifest,rawHeader)||await paperCaptureValueHash(body)!==fingerprint)throw Error('恢复副本的原输入摘要不一致，未覆盖当前文件。');await graph(manifest,scopeValue,signal);
 const offset=magic.length+4+headerBytes;if(blob.size-offset!==(manifest.file?.bytes??0))throw Error('恢复副本缺少完整原文件字节，未覆盖当前输入。');const original=manifest.file?blob.slice(offset,blob.size,manifest.file.mediaType):null;
 if(original&&await paperCaptureBytesHash(new Uint8Array(await original.arrayBuffer()))!==manifest.file!.sha256)throw Error('恢复副本中的原文件字节校验失败，未覆盖当前输入。');stopped(signal);return{manifest,file:original&&manifest.file?{name:manifest.file.name,mediaType:manifest.file.mediaType,blob:original}:null};
}
export const paperRepairCopyLimits={fileBytes:byteLimit,headerBytes:headerLimit}as const;
