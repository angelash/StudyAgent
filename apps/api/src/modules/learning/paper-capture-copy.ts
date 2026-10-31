import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {PaperCaptureScope} from './paper-capture-group';
import {paperCapturePrivateScopeSchema,paperCaptureSourceScope,type PaperCapturePrivateScope} from './paper-capture-scope';
import type {PaperCapturePendingCommand} from './paper-capture-command';
import {paperImageVersion,type PaperImageSource,type PaperImageTransform} from './paper-capture-image';
import {retentionDigest} from '../diagnostics/retention-anchor';

import {paperCaptureCompleteCopySchema as copySchema,paperCaptureCopyOriginalSchema as originalSchema,paperCaptureTransformDraftSchema as draftSchema,paperCaptureCopyUploadBindingSchema as uploadBinding,paperCaptureCopyGroupBindingSchema as groupBinding,paperCaptureCopyDerivationBindingSchema as derivationBinding,type PaperCaptureEditor} from '@study-agent/contracts';
const byteLimit=50*1024*1024;

type CopyPage={pageId:string;name:string;source:PaperImageSource|null;transform:PaperImageTransform|null;bytes:Buffer;original?:z.infer<typeof originalSchema>;draft?:z.infer<typeof draftSchema>|null};
type CopyInput={actorId:string;scope:PaperCaptureScope;title:string;intent:'single_question'|'whole_page'|'material_collection';pages:readonly CopyPage[];selectedPageIds?:readonly string[];uploads?:readonly z.infer<typeof uploadBinding>[];groups?:readonly z.infer<typeof groupBinding>[];derivations?:readonly z.infer<typeof derivationBinding>[];editor?:PaperCaptureEditor;pending:PaperCapturePendingCommand|null;rejected:readonly PaperCapturePendingCommand[]};
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

/** Exact local originals and inputs, including files not yet accepted/decoded.
 * Server upload/page/group references must still be checked against actual
 * authorized records before replay. This copy never executes a command.
 */
export function completePaperCaptureCopy(input:CopyInput){
 if(!Array.isArray(input.pages)||input.pages.length>120||input.pages.some(page=>!Buffer.isBuffer(page.bytes))||input.pages.reduce((sum,page)=>sum+page.bytes.length,0)>byteLimit)throw Error('paper_capture_copy_limit');
 const ids=new Set<string>();
 const pages=input.pages.map(page=>{
  const original=page.original??(page.source?{sha256:page.source.originalSha256,bytes:page.source.originalBytes,mediaType:page.source.originalMediaType}:null);
  if(!original||ids.has(page.pageId)||!Buffer.isBuffer(page.bytes)||page.bytes.length!==original.bytes||sha(page.bytes)!==original.sha256||page.source&&(page.pageId!==page.source.pageId||page.source.originalBytes!==original.bytes||page.source.originalSha256!==original.sha256||page.source.originalMediaType!==original.mediaType))throw Error('paper_capture_complete_original_unavailable');ids.add(page.pageId);
  if(page.source&&page.transform)paperImageVersion(page.source,page.transform);
  return{pageId:page.pageId,name:page.name,original:structuredClone(original),source:structuredClone(page.source),transform:structuredClone(page.transform),draft:structuredClone(page.draft??null),base64:page.bytes.toString('base64')};
 });
 const selectedPageIds=[...(input.selectedPageIds??pages.map(page=>page.pageId))];
 if(new Set(selectedPageIds).size!==selectedPageIds.length||selectedPageIds.some(id=>!ids.has(id))||input.intent==='whole_page'&&selectedPageIds.length>1||input.intent==='single_question'&&selectedPageIds.length>4)throw Error('paper_capture_copy_limit');
 const actual=paperCaptureSourceScope({actorId:input.actorId,studentId:input.scope.studentId,subject:input.scope.subject});if(retentionDigest(actual)!==retentionDigest(input.scope))throw Error('paper_capture_copy_scope_or_integrity_mismatch');
 const result={protocol:'paper-capture-complete-copy-v1' as const,actorId:input.actorId,scope:structuredClone(input.scope),title:input.title,intent:input.intent,pages,selectedPageIds,uploads:structuredClone([...(input.uploads??[])]),groups:structuredClone([...(input.groups??[])]),...(input.derivations!==undefined?{derivations:structuredClone([...input.derivations])}:{}),...(input.editor!==undefined?{editor:structuredClone(input.editor)}:{}),pending:structuredClone(input.pending),rejected:structuredClone([...input.rejected]),requiresOriginalResultLookup:input.pending!==null||input.rejected.length>0},copy={...result,fingerprint:retentionDigest(result)},parsed=copySchema.parse(copy);
 if(retentionDigest(parsed)!==retentionDigest(copy))throw Error('paper_capture_complete_copy_input_mismatch');
 if(new Set(parsed.uploads.map(row=>row.uploadId)).size!==parsed.uploads.length||parsed.uploads.some(row=>!ids.has(row.pageId))||new Set(parsed.groups.map(row=>row.groupId)).size!==parsed.groups.length||parsed.groups.some(row=>new Set(row.pageIds).size!==row.pageIds.length||row.pageIds.some(id=>!ids.has(id))))throw Error('paper_capture_copy_original_binding_mismatch');
 if(parsed.derivations&&(new Set(parsed.derivations.map(row=>row.derivationId)).size!==parsed.derivations.length||parsed.derivations.some(row=>!parsed.groups.some(group=>group.groupId===row.groupId))))throw Error('paper_capture_copy_original_binding_mismatch');
 for(const command of [parsed.pending,...parsed.rejected].filter((command):command is PaperCapturePendingCommand=>command!==null)){
  if(command.kind==='upload'){const page=pages.find(page=>page.pageId===command.input.pageId);if(retentionDigest(command.input.scope)!==retentionDigest(actual)||!page||page.original.sha256!==command.input.sha256||page.original.bytes!==command.input.size||page.original.mediaType!==command.input.mediaType||page.name!==command.input.name)throw Error('paper_capture_copy_original_command_mismatch');}
  if(command.kind==='pageRevision'){const page=pages.find(page=>page.pageId===command.pageId);if(!page)throw Error('paper_capture_copy_original_command_mismatch');if(page.source)paperImageVersion(page.source,command.input.transform);}
  if((command.kind==='completeUpload'||command.kind==='cancelUpload')&&!parsed.uploads.some(row=>row.uploadId===command.uploadId))throw Error('paper_capture_copy_original_binding_mismatch');
  if(command.kind==='groupRevision'&&command.input.pages.some(reference=>!ids.has(reference.pageId)))throw Error('paper_capture_copy_original_command_mismatch');
  if(command.kind==='recognize'&&!parsed.groups.some(row=>row.groupId===command.groupId&&row.pageIds.length>0))throw Error('paper_capture_copy_original_binding_mismatch');
  if((command.kind==='retryDerivation'||command.kind==='cancelDerivation')&&!parsed.derivations?.some(row=>row.derivationId===command.derivationId&&row.groupId===command.groupId))throw Error('paper_capture_copy_original_binding_mismatch');
 }
 return copy;
}

/** Restore local files without inferring publication, decoding or ownership. */
export function readCompletePaperCaptureCopy(value:unknown,actualScope:PaperCapturePrivateScope){
 const copy=copySchema.parse(value),{fingerprint,...body}=copy,actual=paperCapturePrivateScopeSchema.parse(actualScope);
 if(retentionDigest(copy)!==retentionDigest(value)||retentionDigest(body)!==fingerprint||copy.actorId!==actual.actorId||retentionDigest(paperCaptureSourceScope(actual))!==retentionDigest(copy.scope))throw Error('paper_capture_copy_scope_or_integrity_mismatch');
 if(copy.pages.reduce((sum,page)=>sum+page.original.bytes,0)>byteLimit||copy.pages.some(page=>page.base64.length!==Math.ceil(page.original.bytes/3)*4))throw Error('paper_capture_copy_encoded_size_mismatch');
 const pages=copy.pages.map(page=>{const bytes=Buffer.from(page.base64,'base64');if(bytes.toString('base64')!==page.base64)throw Error('paper_capture_copy_original_encoding_mismatch');return{pageId:page.pageId,name:page.name,original:page.original,source:page.source,transform:page.source&&page.transform?paperImageVersion(page.source,page.transform).transform:page.transform,draft:page.draft,bytes};});
 if(retentionDigest(completePaperCaptureCopy({...copy,pages}))!==retentionDigest(copy))throw Error('paper_capture_complete_copy_integrity_failed');
 return{actorId:copy.actorId,scope:copy.scope,title:copy.title,intent:copy.intent,pages,selectedPageIds:copy.selectedPageIds,uploads:copy.uploads,groups:copy.groups,...(copy.derivations!==undefined?{derivations:copy.derivations}:{}),...(copy.editor!==undefined?{editor:copy.editor}:{}),pending:copy.pending,rejected:copy.rejected,requiresOriginalResultLookup:copy.requiresOriginalResultLookup};
}
