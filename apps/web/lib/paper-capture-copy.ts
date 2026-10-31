import {paperCaptureCompleteCopySchema,paperCapturePrivateScopeSchema,paperImageSourceSchema,paperImageTransformSchema,
 type PaperCaptureCompleteCopy,type PaperCapturePrivateScope,type PaperCaptureScope,type PaperImageSource,type PaperImageTransform,type PaperImageVersion,type PaperCapturePendingCommand,type PaperCaptureIntent,type PaperCaptureTransformDraft} from '@study-agent/contracts';

const byteLimit=50*1024*1024;
const stable=(value:unknown):unknown=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,stable(item)])):value;
export async function paperCaptureBytesHash(bytes:Uint8Array){
 if(!globalThis.crypto?.subtle)throw Error('当前浏览器暂不能校验原文件，请保留当前文件并换用受支持的浏览器。');
 const input=new Uint8Array(bytes.length);input.set(bytes);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',input)),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export const paperCaptureValueHash=(value:unknown)=>paperCaptureBytesHash(new TextEncoder().encode(JSON.stringify(stable(value))));
export async function browserPaperCaptureScope(value:PaperCapturePrivateScope):Promise<PaperCaptureScope>{const actual=paperCapturePrivateScopeSchema.parse(value);return{creatorFingerprint:await paperCaptureValueHash({id:actual.actorId}),studentId:actual.studentId,subject:actual.subject};}
export async function browserPaperImageVersion(sourceValue:PaperImageSource,transformValue:PaperImageTransform):Promise<PaperImageVersion>{
 const source=paperImageSourceSchema.parse(sourceValue),transform=paperImageTransformSchema.parse(transformValue),{crop,rotation}=transform;
 if(source.width*source.height>20_000_000||crop.x+crop.width>source.width||crop.y+crop.height>source.height)throw Error('裁剪范围超出这张原图，请保留当前输入后重新核对。');
 const body={protocol:'paper-image-version-v1' as const,pageId:source.pageId,originalSha256:source.originalSha256,baselineSha256:source.baselineSha256,coordinateSpace:'normalized-original-pixels-v1' as const,transform,width:rotation%180?crop.height:crop.width,height:rotation%180?crop.width:crop.height};
 return{...body,fingerprint:await paperCaptureValueHash(body)};
}
function base64(bytes:Uint8Array){let binary='';for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));return btoa(binary);}
function interrupted(signal?:AbortSignal){if(signal?.aborted)throw new DOMException('原文件操作已停止，当前文件仍保留。','AbortError');}
type Original=PaperCaptureCompleteCopy['pages'][number]['original'];
export type BrowserPaperCopyPage={pageId:string;name:string;bytes:Uint8Array;original:Original;source:PaperImageSource|null;transform:PaperImageTransform|null;draft:PaperCaptureTransformDraft|null};
export type BrowserPaperCopyInput={actorId:string;scope:PaperCaptureScope;title:string;intent:PaperCaptureIntent;pages:readonly BrowserPaperCopyPage[];selectedPageIds?:readonly string[];uploads?:PaperCaptureCompleteCopy['uploads'];groups?:PaperCaptureCompleteCopy['groups'];derivations?:PaperCaptureCompleteCopy['derivations'];editor?:PaperCaptureCompleteCopy['editor'];pending:PaperCapturePendingCommand|null;rejected:readonly PaperCapturePendingCommand[]};

/** Export exact originals and complete pending/rejected inputs. This function
 * never infers that an upload, revision, or recognition has been published. */
export async function completeBrowserPaperCaptureCopy(input:BrowserPaperCopyInput,signal?:AbortSignal):Promise<PaperCaptureCompleteCopy>{
 interrupted(signal);
 if(input.pages.length>120||input.pages.reduce((sum,page)=>sum+page.bytes.length,0)>byteLimit)throw Error('完整图片副本最多120张、合计50MiB。请先保留当前文件，再明确拆分采集。');
 const actual=await browserPaperCaptureScope({actorId:input.actorId,studentId:input.scope.studentId,subject:input.scope.subject});
 if(await paperCaptureValueHash(actual)!==await paperCaptureValueHash(input.scope))throw Error('当前副本不属于这个账号或学习对象，请保留原副本。');
 const ids=new Set<string>(),pages:PaperCaptureCompleteCopy['pages']=[];
 for(const page of input.pages){
  interrupted(signal);const original=page.original;
  if(ids.has(page.pageId)||!(page.bytes instanceof Uint8Array)||page.bytes.length!==original.bytes||await paperCaptureBytesHash(page.bytes)!==original.sha256||page.source&&(page.pageId!==page.source.pageId||page.source.originalBytes!==original.bytes||page.source.originalSha256!==original.sha256||page.source.originalMediaType!==original.mediaType))throw Error('完整副本中的原图字节与原文件不一致，当前文件仍保留。');
  if(page.source&&page.transform)await browserPaperImageVersion(page.source,page.transform);
  ids.add(page.pageId);pages.push({pageId:page.pageId,name:page.name,original:structuredClone(original),source:structuredClone(page.source),transform:structuredClone(page.transform),draft:structuredClone(page.draft),base64:base64(page.bytes)});
 }
 const selectedPageIds=[...(input.selectedPageIds??pages.map(page=>page.pageId))];
 if(new Set(selectedPageIds).size!==selectedPageIds.length||selectedPageIds.some(id=>!ids.has(id))||input.intent==='whole_page'&&selectedPageIds.length>1||input.intent==='single_question'&&selectedPageIds.length>4)throw Error('所选原页不符合当前用途，请保留原页后核对选择。');
 const body={protocol:'paper-capture-complete-copy-v1' as const,actorId:input.actorId,scope:structuredClone(input.scope),title:input.title,intent:input.intent,pages,selectedPageIds,uploads:structuredClone(input.uploads??[]),groups:structuredClone(input.groups??[]),...(input.derivations!==undefined?{derivations:structuredClone(input.derivations)}:{}),...(input.editor!==undefined?{editor:structuredClone(input.editor)}:{}),pending:structuredClone(input.pending),rejected:structuredClone([...input.rejected]),requiresOriginalResultLookup:input.pending!==null||input.rejected.length>0};
 const copy=paperCaptureCompleteCopySchema.parse({...body,fingerprint:await paperCaptureValueHash(body)});
 if(new Set(copy.uploads.map(row=>row.uploadId)).size!==copy.uploads.length||copy.uploads.some(row=>!ids.has(row.pageId))||new Set(copy.groups.map(row=>row.groupId)).size!==copy.groups.length||copy.groups.some(row=>new Set(row.pageIds).size!==row.pageIds.length||row.pageIds.some(id=>!ids.has(id)))||copy.derivations&&(new Set(copy.derivations.map(row=>row.derivationId)).size!==copy.derivations.length||copy.derivations.some(row=>!copy.groups.some(group=>group.groupId===row.groupId))))throw Error('副本中的上传、原页或采集组对应关系不完整，未生成替代副本。');
 for(const command of [copy.pending,...copy.rejected].filter((command):command is PaperCapturePendingCommand=>command!==null)){
  if(command.kind==='upload'){const page=pages.find(page=>page.pageId===command.input.pageId);if(await paperCaptureValueHash(command.input.scope)!==await paperCaptureValueHash(actual)||!page||page.original.sha256!==command.input.sha256||page.original.bytes!==command.input.size||page.original.mediaType!==command.input.mediaType||page.name!==command.input.name)throw Error('副本中的原上传命令与实际文件不一致。');}
  if(command.kind==='pageRevision'){const page=pages.find(page=>page.pageId===command.pageId);if(!page)throw Error('副本缺少原页修订所需的实际文件。');if(page.source)await browserPaperImageVersion(page.source,command.input.transform);}
  if((command.kind==='completeUpload'||command.kind==='cancelUpload')&&!copy.uploads.some(row=>row.uploadId===command.uploadId))throw Error('副本缺少原上传的对应记录。');
  if(command.kind==='groupRevision'&&command.input.pages.some(reference=>!ids.has(reference.pageId)))throw Error('副本缺少原采集组所用的完整图片。');
  if(command.kind==='recognize'&&!copy.groups.some(row=>row.groupId===command.groupId&&row.pageIds.length>0))throw Error('副本缺少原识别确认的采集组。');
  if((command.kind==='cancelDerivation'||command.kind==='retryDerivation')&&!copy.derivations?.some(row=>row.derivationId===command.derivationId&&row.groupId===command.groupId))throw Error('副本缺少原识别任务的对应记录。');
 }
 interrupted(signal);return copy;
}

/** Local restoration performs no network request or automatic command replay. */
export async function readBrowserPaperCaptureCopy(value:unknown,scopeValue:PaperCapturePrivateScope,signal?:AbortSignal){
 interrupted(signal);const copy=paperCaptureCompleteCopySchema.parse(value),{fingerprint,...body}=copy,scope=paperCapturePrivateScopeSchema.parse(scopeValue);
 if(copy.actorId!==scope.actorId||await paperCaptureValueHash(await browserPaperCaptureScope(scope))!==await paperCaptureValueHash(copy.scope)||await paperCaptureValueHash(body)!==fingerprint||await paperCaptureValueHash(copy)!==await paperCaptureValueHash(value))throw Error('副本归属或内容校验不一致，未覆盖当前采集。');
 if(copy.pages.reduce((sum,page)=>sum+page.original.bytes,0)>byteLimit||copy.pages.some(page=>page.base64.length!==Math.ceil(page.original.bytes/3)*4))throw Error('副本没有保留完整原图字节，未覆盖当前采集。');
 const pages:BrowserPaperCopyPage[]=[];
 for(const page of copy.pages){
  interrupted(signal);const binary=atob(page.base64),bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
  if(base64(bytes)!==page.base64)throw Error('副本中的原文件编码已变化，未覆盖当前采集。');
  pages.push({pageId:page.pageId,name:page.name,original:page.original,source:page.source,transform:page.source&&page.transform?(await browserPaperImageVersion(page.source,page.transform)).transform:page.transform,draft:page.draft,bytes});
 }
 const rebuilt=await completeBrowserPaperCaptureCopy({...copy,pages},signal);if(await paperCaptureValueHash(rebuilt)!==await paperCaptureValueHash(copy))throw Error('副本中的原输入或文件对应关系不完整，未覆盖当前采集。');
 return{copy,pages};
}
