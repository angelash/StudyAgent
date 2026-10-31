import {z} from 'zod';
import {paperCapturePrivateScopeSchema,paperCaptureUploadViewSchema,paperCaptureUploadCommandsSchema,paperCapturePendingCommandSchema,type PaperCapturePrivateScope} from '@study-agent/contracts';
import {paperCaptureValueHash,browserPaperCaptureScope} from './paper-capture-copy';

const controlSchema=z.object({protocol:z.literal('paper-capture-upload-control-copy-v1'),containsOriginalBytes:z.literal(false),scope:paperCapturePrivateScopeSchema,upload:paperCaptureUploadViewSchema,originalCommands:paperCaptureUploadCommandsSchema,pending:paperCapturePendingCommandSchema.nullable(),note:z.string().max(20000),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type PaperCaptureUploadControl=z.infer<typeof controlSchema>;
export async function completePaperUploadControl(value:Omit<PaperCaptureUploadControl,'fingerprint'>){
 const {fingerprint:_prior,...body}=value as Omit<PaperCaptureUploadControl,'fingerprint'>&{fingerprint?:string};
 const copy=controlSchema.parse({...body,fingerprint:await paperCaptureValueHash(body)});return readPaperUploadControl(copy,value.scope);
}
export async function readPaperUploadControl(value:unknown,scope:PaperCapturePrivateScope){
 const copy=controlSchema.parse(value),{fingerprint,...body}=copy,actual=await browserPaperCaptureScope(scope),initial=copy.originalCommands.initialization;
 if(await paperCaptureValueHash(value)!==await paperCaptureValueHash(copy)||await paperCaptureValueHash(body)!==fingerprint||await paperCaptureValueHash(copy.scope)!==await paperCaptureValueHash(scope)||await paperCaptureValueHash(copy.upload.scope)!==await paperCaptureValueHash(actual)||copy.upload.id!==copy.originalCommands.uploadId||initial.state!=='committed'||initial.input.kind!=='upload'||initial.result?.kind!=='upload'||initial.result.uploadId!==copy.upload.id||initial.result.pageId!==copy.upload.pageId||initial.input.input.pageId!==copy.upload.pageId||initial.input.input.sha256!==copy.upload.sha256||initial.input.input.size!==copy.upload.size||initial.input.input.mediaType!==copy.upload.mediaType||initial.input.input.name!==copy.upload.name||await paperCaptureValueHash(initial.scope)!==await paperCaptureValueHash(actual)||copy.originalCommands.terminal&&copy.originalCommands.terminal.state!=='unknown'&&await paperCaptureValueHash(copy.originalCommands.terminal.scope)!==await paperCaptureValueHash(actual)||copy.pending&&(copy.pending.kind!=='cancelUpload'||copy.pending.uploadId!==copy.upload.id))throw Error('私人上传控制记录的实际归属或原命令不一致，未覆盖当前记录。');
 return copy;
}
export function paperUploadControlKey(scope:PaperCapturePrivateScope,uploadId:string){paperCapturePrivateScopeSchema.parse(scope);if(!/^paper_upload_[a-f0-9-]{36}$/.test(uploadId))throw Error('原上传身份无效。');return JSON.stringify(['paper-upload-control-v1',scope.actorId,scope.studentId,scope.subject,uploadId]);}
