import { promises as fs } from 'node:fs';
import { resolve,sep } from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { bytesDigest,verifyImmutableFile,writeAtomicImmutableBytes } from '../../infrastructure/immutable-files';
import { assertNoFileLinks } from '../../infrastructure/studio-file-paths';
import {retentionDigest} from '../diagnostics/retention-anchor';
import { assertPaperImageVersion,renderPaperCaptureImage,type PaperImageSource,type PaperImageVersion } from './paper-capture-image';

type Rendered=Awaited<ReturnType<typeof renderPaperCaptureImage>>;
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export type PaperImageFile={role:'original'|'baseline'|'derived';sha256:string;bytes:number;mediaType:'image/png'|'image/jpeg'};
export type PaperImageFileReceipt={protocol:'paper-image-files-v1';source:PaperImageSource;version:PaperImageVersion;renderer:string;files:PaperImageFile[]};
export function paperImageFilePath(root:string,file:PaperImageFile){
 hash.parse(file.sha256);if(!['original','baseline','derived'].includes(file.role)||!['image/png','image/jpeg'].includes(file.mediaType)||file.role!=='original'&&file.mediaType!=='image/png'||!Number.isSafeInteger(file.bytes)||file.bytes<=0||file.bytes>40*1024*1024)throw Error('invalid_paper_image_file_identity');
 const parent=resolve(root,'paper-images'),target=resolve(parent,file.role,file.sha256+(file.mediaType==='image/jpeg'?'.jpg':'.png'));if(!target.startsWith(parent+sep))throw Error('invalid_paper_image_file_path');return target;
}
/** Caller holds the actual upload authorization and source lease. This byte layer never creates learning records. */
export function paperImageFilesReceipt(original:Buffer,result:Rendered):PaperImageFileReceipt{
 assertPaperImageVersion(result.version,result.source);
 const files:PaperImageFile[]=[{role:'original',sha256:result.source.originalSha256,bytes:result.source.originalBytes,mediaType:result.source.originalMediaType},{role:'baseline',sha256:result.source.baselineSha256,bytes:result.baselineBytes.length,mediaType:'image/png'},{role:'derived',sha256:result.receipt.sha256,bytes:result.receipt.bytes,mediaType:'image/png'}],buffers=[original,result.baselineBytes,result.bytes];
 if(result.receipt.versionFingerprint!==result.version.fingerprint||result.receipt.width!==result.version.width||result.receipt.height!==result.version.height)throw Error('paper_image_file_render_mismatch');
 for(const[index,file]of files.entries())if(buffers[index].length!==file.bytes||bytesDigest(buffers[index])!==file.sha256)throw Error('paper_image_file_bytes_mismatch');
 return{protocol:'paper-image-files-v1',source:structuredClone(result.source),version:structuredClone(result.version),renderer:result.receipt.renderer,files};
}
export async function persistPaperImageFiles(root:string,original:Buffer,result:Rendered):Promise<PaperImageFileReceipt>{
 const receipt=paperImageFilesReceipt(original,result),buffers=[original,result.baselineBytes,result.bytes];
 for(const[index,file]of receipt.files.entries()){const target=paperImageFilePath(root,file),staging=resolve(root,'paper-images','working',retentionDigest({role:file.role,sha256:file.sha256}));await assertNoFileLinks(target);await assertNoFileLinks(staging);await writeAtomicImmutableBytes(target,buffers[index],staging);await verifyImmutableFile(target,file.sha256,file.bytes);}
 return receipt;
}
export async function readPaperImageFile(root:string,receipt:PaperImageFileReceipt,role:PaperImageFile['role']){
 assertPaperImageVersion(receipt.version,receipt.source);if(receipt.protocol!=='paper-image-files-v1'||receipt.files.length!==3||new Set(receipt.files.map(file=>file.role)).size!==3)throw Error('paper_image_original_files_required');
 const file=receipt.files.find(file=>file.role===role);if(!file)throw Error('paper_image_original_file_missing');
 if(role==='original'&&(file.sha256!==receipt.source.originalSha256||file.bytes!==receipt.source.originalBytes||file.mediaType!==receipt.source.originalMediaType)||role==='baseline'&&file.sha256!==receipt.source.baselineSha256)throw Error('paper_image_original_file_mismatch');
 const target=paperImageFilePath(root,file);await assertNoFileLinks(target);await verifyImmutableFile(target,file.sha256,file.bytes);const bytes=await fs.readFile(target);if(bytes.length!==file.bytes||bytesDigest(bytes)!==file.sha256)throw Error('paper_image_original_file_changed');
 if(role!=='original'){const meta=await sharp(bytes,{limitInputPixels:20_000_000,failOn:'warning'}).metadata(),expected=role==='baseline'?receipt.source:receipt.version;if(meta.format!=='png'||meta.width!==expected.width||meta.height!==expected.height||meta.exif||meta.orientation)throw Error('paper_image_processed_file_mismatch');}
 return bytes;
}

/** Rebuilds the actual source transform; rehashed unrelated PNGs do not become retained originals. */
export async function verifyPaperImageFileSet(root:string,receipt:PaperImageFileReceipt){
 const original=await readPaperImageFile(root,receipt,'original'),baseline=await readPaperImageFile(root,receipt,'baseline'),derived=await readPaperImageFile(root,receipt,'derived'),rebuilt=await renderPaperCaptureImage(original,receipt.source.originalMediaType,receipt.source.originalSha256,receipt.source.pageId,receipt.version.transform);
 if(rebuilt.receipt.renderer!==receipt.renderer)throw Error('paper_image_renderer_version_requires_review');
 if(bytesDigest(rebuilt.baselineBytes)!==bytesDigest(baseline)||bytesDigest(rebuilt.bytes)!==bytesDigest(derived)||rebuilt.source.baselineSha256!==receipt.source.baselineSha256)throw Error('paper_image_actual_transform_integrity_failed');return{original:true,baseline:true,derived:true,renderer:receipt.renderer};
}
