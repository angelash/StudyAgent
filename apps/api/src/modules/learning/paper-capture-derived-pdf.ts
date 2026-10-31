import {createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import type {PaperCapturePdfPage,PaperCapturePdfReceipt} from '@study-agent/contracts';
export type {PaperCapturePdfPage,PaperCapturePdfReceipt} from '@study-agent/contracts';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {assertPaperCaptureGroupVersion,type PaperCaptureGroupVersion,type RetainedPaperCapturePage} from './paper-capture-group';
import {readPaperImageFile,verifyPaperImageFileSet,type PaperImageFileReceipt} from './paper-capture-files';

export const PAPER_DERIVED_PDF_LIMITS={pages:120,pixels:80_000_000,bytes:80*1024*1024} as const;
import {PAPER_CAPTURE_PDF_RENDERER,PAPER_CAPTURE_PDF_NOTICE} from '@study-agent/contracts';
export {PAPER_CAPTURE_PDF_RENDERER,PAPER_CAPTURE_PDF_NOTICE} from '@study-agent/contracts';

const renderer=PAPER_CAPTURE_PDF_RENDERER,sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
type Input={root:string;group:PaperCaptureGroupVersion;history:readonly PaperCaptureGroupVersion[];retained:readonly RetainedPaperCapturePage[];files:readonly PaperImageFileReceipt[];signal?:AbortSignal};

/** Authorize the actual audience and hold source leases before calling. This
 * projection creates no material, OCR task, approved question or learning fact. */
export async function derivePaperCapturePdf(input:Input){
 const history=[...input.history].sort((a,b)=>a.revision-b.revision);if(history.length!==input.group.revision-1)throw Error('paper_pdf_original_group_history_required');
 let previous:PaperCaptureGroupVersion|undefined;for(const version of history){if(version.revision!==(previous?.revision??0)+1)throw Error('paper_pdf_original_group_history_required');assertPaperCaptureGroupVersion(version,input.retained,previous);previous=version;}
 const group=assertPaperCaptureGroupVersion(input.group,input.retained,previous);
 if(group.pages.length>PAPER_DERIVED_PDF_LIMITS.pages||group.pages.reduce((sum,page)=>sum+page.width*page.height,0)>PAPER_DERIVED_PDF_LIMITS.pixels)throw Error('paper_pdf_decoded_page_budget_exceeded');
 const document=await PDFDocument.create({updateMetadata:false});document.setCreationDate(new Date(0));document.setModificationDate(new Date(0));document.setProducer('StudyAgent '+renderer);document.setCreator('StudyAgent paper capture');document.setTitle(group.title);
 const pages:PaperCapturePdfPage[]=[];
 for(const reference of group.pages){
  if(input.signal?.aborted)throw Error('paper_capture_pdf_interrupted');
  const originals=input.files.filter(file=>file.source.pageId===reference.pageId&&file.version.fingerprint===reference.versionFingerprint);if(originals.length!==1)throw Error('paper_pdf_actual_file_set_required');const original=originals[0],derived=original.files.find(file=>file.role==='derived');
  if(original.source.originalSha256!==reference.originalSha256||original.source.baselineSha256!==reference.baselineSha256||derived?.sha256!==reference.renderedSha256||original.version.width!==reference.width||original.version.height!==reference.height)throw Error('paper_pdf_original_mapping_mismatch');
  await verifyPaperImageFileSet(input.root,original);const bytes=await readPaperImageFile(input.root,original,'derived'),image=await document.embedPng(bytes);
  if(image.width!==reference.width||image.height!==reference.height)throw Error('paper_pdf_actual_image_size_mismatch');
  const[pdfWidth,pdfHeight]=image.width>image.height?[841.89,595.28]:[595.28,841.89],scale=Math.min((pdfWidth-48)/image.width,(pdfHeight-48)/image.height),width=image.width*scale,height=image.height*scale,imageBox={x:(pdfWidth-width)/2,y:(pdfHeight-height)/2,width,height};
  document.addPage([pdfWidth,pdfHeight]).drawImage(image,imageBox);pages.push({...reference,page:pages.length+1,pdfWidth,pdfHeight,imageBox,coordinateSpace:'pdf-bottom-left-points-v1'});
 }
 if(input.signal?.aborted)throw Error('paper_capture_pdf_interrupted');const bytes=Buffer.from(await document.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));if(!bytes.length||bytes.length>PAPER_DERIVED_PDF_LIMITS.bytes)throw Error('paper_pdf_output_byte_budget_exceeded');
 const body:Omit<PaperCapturePdfReceipt,'fingerprint'>={protocol:'paper-capture-derived-pdf-v1',groupId:group.groupId,groupRevision:group.revision,groupFingerprint:group.fingerprint,renderer,pdfSha256:sha(bytes),pdfBytes:bytes.length,pages,
  notice:PAPER_CAPTURE_PDF_NOTICE};
 const receipt:PaperCapturePdfReceipt={...body,fingerprint:retentionDigest(body)};return{bytes,receipt};
}

/** Rebuilding from actual retained bytes also detects reordered or unrelated
 * PDFs whose public metadata hashes were recomputed. */
export async function verifyPaperCapturePdf(input:Input,bytes:Buffer,value:PaperCapturePdfReceipt){
 const{fingerprint,...body}=value;if(fingerprint!==retentionDigest(body)||bytes.length!==value.pdfBytes||sha(bytes)!==value.pdfSha256)throw Error('paper_pdf_saved_receipt_mismatch');
 const expected=await derivePaperCapturePdf(input);if(!expected.bytes.equals(bytes)||retentionDigest(expected.receipt)!==retentionDigest(value))throw Error('paper_pdf_actual_source_mapping_mismatch');return expected.receipt;
}

export function capturedBoxToPdf(page:PaperCapturePdfPage,box:{x:number;y:number;width:number;height:number}){
 const{x,y,width,height}=box;if(![x,y,width,height,page.width,page.height,page.pdfWidth,page.pdfHeight,page.imageBox.x,page.imageBox.y,page.imageBox.width,page.imageBox.height].every(Number.isFinite)||x<0||y<0||width<=0||height<=0||page.width<=0||page.height<=0||x+width>page.width||y+height>page.height||page.coordinateSpace!=='pdf-bottom-left-points-v1'||page.imageBox.x<0||page.imageBox.y<0||page.imageBox.width<=0||page.imageBox.height<=0||page.imageBox.x+page.imageBox.width>page.pdfWidth||page.imageBox.y+page.imageBox.height>page.pdfHeight)throw Error('paper_pdf_capture_box_out_of_bounds');
 return{x:page.imageBox.x+x/page.width*page.imageBox.width,y:page.imageBox.y+(1-(y+height)/page.height)*page.imageBox.height,width:width/page.width*page.imageBox.width,height:height/page.height*page.imageBox.height};
}
