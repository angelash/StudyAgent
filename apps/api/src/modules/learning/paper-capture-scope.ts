import {paperCapturePrivateScopeSchema,type PaperCapturePrivateScope,type PaperCaptureScope} from '@study-agent/contracts';
export {paperCapturePrivateScopeSchema,paperCaptureScopeSchema,type PaperCapturePrivateScope,type PaperCaptureScope} from '@study-agent/contracts';
import {retentionDigest} from '../diagnostics/retention-anchor';

export function paperCaptureSourceScope(value:PaperCapturePrivateScope):PaperCaptureScope{
 const actual=paperCapturePrivateScopeSchema.parse(value);if(retentionDigest(actual)!==retentionDigest(value))throw Error('paper_capture_actual_scope_required');
 return{creatorFingerprint:retentionDigest({id:actual.actorId}),studentId:actual.studentId,subject:actual.subject};
}
