import {z} from 'zod';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {paperImageSourceSchema,paperImageTransformSchema,assertPaperImageVersion,type PaperImageSource} from './paper-capture-image';
import {paperCaptureScopeSchema} from './paper-capture-scope';
import type {PaperCaptureAttribution} from './paper-capture-attribution';
import type {PaperImageFileReceipt} from './paper-capture-files';

const id=z.string().min(1).max(180),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.string().datetime({offset:true});
const versionSchema=z.object({protocol:z.literal('paper-image-version-v1'),pageId:id,originalSha256:hash,baselineSha256:hash,coordinateSpace:z.literal('normalized-original-pixels-v1'),transform:paperImageTransformSchema,width:z.number().int().positive().max(6000),height:z.number().int().positive().max(6000),fingerprint:hash}).strict();
const receiptSchema=z.object({protocol:z.literal('paper-image-files-v1'),source:paperImageSourceSchema,version:versionSchema,renderer:z.string().min(1).max(180),files:z.array(z.object({role:z.enum(['original','baseline','derived']),sha256:hash,bytes:z.number().int().positive().max(40*1024*1024),mediaType:z.enum(['image/png','image/jpeg'])}).strict()).length(3)}).strict();
const attributionSchema=z.object({protocol:z.literal('paper-capture-attribution-v1'),scope:paperCaptureScopeSchema,ownerUserId:id.nullable(),createdAt:time,ownerDeletionHash:hash.optional()}).strict();
const pageSchema=z.object({protocol:z.literal('paper-capture-page-record-v1'),id,filename:z.string().min(1).max(255),attribution:attributionSchema,
 versions:z.array(z.object({receipt:receiptSchema,createdAt:time}).strict()).min(1).max(1000),
 adoptions:z.array(z.object({revision:z.number().int().positive(),versionFingerprint:hash,previousVersionFingerprint:hash.nullable(),at:time}).strict()).min(1).max(1000),
 revision:z.number().int().positive().max(1000),selectedVersionFingerprint:hash}).strict();
export type PaperCapturePageRecord=z.infer<typeof pageSchema>;
const same=(left:unknown,right:unknown)=>retentionDigest(left)===retentionDigest(right);

/** The caller has already decoded and retained the actual immutable bytes.
 * Native source checks still validate attribution against actual users/receipts;
 * file checks rebuild the source transform, independently of this metadata.
 */
function exactReceipt(value:PaperImageFileReceipt,source?:PaperImageSource){
 const receipt=receiptSchema.parse(value);if(!same(receipt,value)||source&&!same(source,receipt.source))throw Error('paper_capture_original_file_receipt_changed');
 assertPaperImageVersion(receipt.version,receipt.source);
 if(new Set(receipt.files.map(file=>file.role)).size!==3)throw Error('paper_capture_original_file_receipt_changed');
 const original=receipt.files.find(file=>file.role==='original')!,baseline=receipt.files.find(file=>file.role==='baseline')!,derived=receipt.files.find(file=>file.role==='derived')!;
 if(original.sha256!==receipt.source.originalSha256||original.bytes!==receipt.source.originalBytes||original.mediaType!==receipt.source.originalMediaType||baseline.sha256!==receipt.source.baselineSha256||baseline.mediaType!=='image/png'||derived.mediaType!=='image/png')throw Error('paper_capture_original_file_receipt_changed');
 return receipt;
}

export function createPaperCapturePage(filename:string,attribution:PaperCaptureAttribution,receipt:PaperImageFileReceipt):PaperCapturePageRecord{
 const original=exactReceipt(receipt),at=attribution.createdAt;
 const page:PaperCapturePageRecord={protocol:'paper-capture-page-record-v1',id:original.source.pageId,filename,attribution:structuredClone(attribution),versions:[{receipt:original,createdAt:at}],adoptions:[{revision:1,versionFingerprint:original.version.fingerprint,previousVersionFingerprint:null,at}],revision:1,selectedVersionFingerprint:original.version.fingerprint};
 return assertPaperCapturePage(page);
}

export function assertPaperCapturePage(value:PaperCapturePageRecord){
 const page=pageSchema.parse(value);if(!same(page,value))throw Error('paper_capture_exact_page_record_required');
 const source=page.versions[0].receipt.source;
 if(page.id!==source.pageId||page.versions[0].createdAt!==page.attribution.createdAt||page.adoptions.length!==page.revision||page.adoptions[0].at!==page.attribution.createdAt||new Set(page.versions.map(row=>row.receipt.version.fingerprint)).size!==page.versions.length)throw Error('paper_capture_original_page_history_changed');
 const firstAdoptions=new Map<string,string>();
 for(const [index,row]of page.adoptions.entries()){
  if(row.revision!==index+1||row.previousVersionFingerprint!==(page.adoptions[index-1]?.versionFingerprint??null)||index>0&&Date.parse(row.at)<Date.parse(page.adoptions[index-1].at)||!page.versions.some(version=>version.receipt.version.fingerprint===row.versionFingerprint))throw Error('paper_capture_original_page_history_changed');
  if(!firstAdoptions.has(row.versionFingerprint))firstAdoptions.set(row.versionFingerprint,row.at);
 }
 if(page.adoptions.at(-1)!.versionFingerprint!==page.selectedVersionFingerprint||page.versions.length!==firstAdoptions.size)throw Error('paper_capture_original_page_history_changed');
 const versionOrder=[...firstAdoptions.keys()];if(page.versions.some((row,index)=>row.receipt.version.fingerprint!==versionOrder[index]))throw Error('paper_capture_original_version_order_changed');
 let previousTime=Date.parse(page.attribution.createdAt);
 for(const row of page.versions){exactReceipt(row.receipt,source);if(row.receipt.source.pageId!==page.id||row.createdAt!==firstAdoptions.get(row.receipt.version.fingerprint)||Date.parse(row.createdAt)<previousTime)throw Error('paper_capture_original_page_history_changed');previousTime=Date.parse(row.createdAt);}
 return page;
}

/** A fingerprint can recur after an explicit undo. The independent monotonic
 * revision prevents an older tab from exploiting that recurrence (ABA).
 * Prior processed bytes and original source references remain immutable.
 */
export function adoptPaperCapturePageVersion(value:PaperCapturePageRecord,expected:{revision:number;versionFingerprint:string},receipt:PaperImageFileReceipt,at:string):PaperCapturePageRecord{
 const page=assertPaperCapturePage(value);time.parse(at);
 if(expected.revision!==page.revision||expected.versionFingerprint!==page.selectedVersionFingerprint)throw Error('paper_capture_page_revision_conflict');
 if(Date.parse(at)<Date.parse(page.adoptions.at(-1)!.at)||page.attribution.ownerUserId===null)throw Error('paper_capture_page_revision_not_available');
 const candidate=exactReceipt(receipt,page.versions[0].receipt.source),existing=page.versions.find(row=>row.receipt.version.fingerprint===candidate.version.fingerprint);
 if(existing&&!same(existing.receipt,candidate))throw Error('paper_capture_original_processed_version_changed');
 if(candidate.version.fingerprint===page.selectedVersionFingerprint)return page;
 if(page.revision>=1000)throw Error('paper_capture_page_revision_limit');
 if(!existing)page.versions.push({receipt:candidate,createdAt:at});
 page.adoptions.push({revision:page.revision+1,versionFingerprint:candidate.version.fingerprint,previousVersionFingerprint:page.selectedVersionFingerprint,at});page.revision++;page.selectedVersionFingerprint=candidate.version.fingerprint;
 return assertPaperCapturePage(page);
}
