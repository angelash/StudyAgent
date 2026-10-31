import {z} from 'zod';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {paperCaptureAttributionSchema} from './paper-capture-attribution';
import {assertPaperCapturePage,type PaperCapturePageRecord} from './paper-capture-page';
import {paperCaptureGroupVersionSchema,assertPaperCaptureGroupVersion,type RetainedPaperCapturePage} from './paper-capture-group';

const time=z.string().datetime({offset:true});
export const paperCaptureGroupRecordSchema=z.object({protocol:z.literal('paper-capture-group-record-v1'),id:z.string().min(1).max(180),attribution:paperCaptureAttributionSchema,
 revision:z.number().int().min(1).max(1000),history:z.array(z.object({version:paperCaptureGroupVersionSchema,at:time}).strict()).min(1).max(1000)}).strict();
export type PaperCaptureGroupRecord=z.infer<typeof paperCaptureGroupRecordSchema>;
export function retainedPaperCapturePage(value:PaperCapturePageRecord):RetainedPaperCapturePage{
 const page=assertPaperCapturePage(value);return{scope:structuredClone(page.attribution.scope),source:structuredClone(page.versions[0].receipt.source),versions:page.versions.map(row=>{const file=row.receipt.files.find(file=>file.role==='derived')!;return{version:structuredClone(row.receipt.version),renderedSha256:file.sha256,renderedBytes:file.bytes,mediaType:'image/png' as const};})};
}
/** Rebuild the full ordered history from actual page/version records. Public
 * fingerprints alone never prove an original page, author, or adoption time.
 */
export function assertPaperCaptureGroupRecord(value:PaperCaptureGroupRecord,pages:readonly PaperCapturePageRecord[]){
 const row=paperCaptureGroupRecordSchema.parse(value);if(retentionDigest(row)!==retentionDigest(value)||row.revision!==row.history.length||row.attribution.createdAt!==row.history[0].at)throw Error('paper_capture_original_group_record_changed');
 const originals=pages.map(retainedPaperCapturePage);let previous:typeof row.history[number]|undefined;
 for(const saved of row.history){
  if(saved.version.groupId!==row.id||saved.version.revision!==(previous?.version.revision??0)+1||retentionDigest(saved.version.scope)!==retentionDigest(row.attribution.scope)||previous&&Date.parse(saved.at)<Date.parse(previous.at))throw Error('paper_capture_original_group_history_changed');
  assertPaperCaptureGroupVersion(saved.version,originals,previous?.version);
  for(const reference of saved.version.pages){const page=pages.find(page=>page.id===reference.pageId),version=page?.versions.find(version=>version.receipt.version.fingerprint===reference.versionFingerprint);if(!version||Date.parse(version.createdAt)>Date.parse(saved.at))throw Error('paper_capture_group_original_adoption_missing');}
  previous=saved;
 }
 return row;
}
