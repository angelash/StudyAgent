import {createHash} from 'node:crypto';
import {promises as fs,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {afterAll,describe,it,expect} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import sharp from 'sharp';
import {renderPaperCaptureImage,paperImageVersion} from './paper-capture-image';
import {persistPaperImageFiles,type PaperImageFileReceipt} from './paper-capture-files';
import {preparePaperCaptureGroup,type RetainedPaperCapturePage} from './paper-capture-group';
import {derivePaperCapturePdf,verifyPaperCapturePdf,capturedBoxToPdf} from './paper-capture-derived-pdf';
import {retentionDigest} from '../diagnostics/retention-anchor';

describe('actual derived PDF, frozen image page identities and original byte mapping',()=>{
 const qa=resolve(process.cwd(),'../../data/qa'),root=mkdtempSync(join(qa,'paper-pdf-')),scope={creatorFingerprint:retentionDigest({id:'synthetic-paper-author'}),studentId:'synthetic-paper-child',subject:'math' as const};
 afterAll(()=>{if(!resolve(root).startsWith(qa+sep))throw Error('Unsafe generated paper PDF scratch');rmSync(root,{recursive:true,force:true});});
 const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
 async function fixture(name:string){
  const folder=join(root,name),retained:RetainedPaperCapturePage[]=[],files:PaperImageFileReceipt[]=[];
  for(const[id,width,height]of [['front',400,600],['landscape',600,400],['same-original-new-page',400,600]] as const){
   const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><rect x="20" y="20" width="100" height="80" fill="#ce3e3e"/><rect x="${width-120}" y="20" width="100" height="80" fill="#2454bb"/><path d="M20 ${height-20}L120 ${height-20}L20 ${height-120}Z" fill="#247646"/><rect x="${width-120}" y="${height-100}" width="100" height="80" fill="#efc232"/></svg>`),bytes=await sharp(svg).png().toBuffer(),result=await renderPaperCaptureImage(bytes,'image/png',digest(bytes),id,{crop:{x:0,y:0,width,height},rotation:0}),receipt=await persistPaperImageFiles(folder,bytes,result);
   files.push(receipt);retained.push({scope:{...scope},source:result.source,versions:[{version:result.version,renderedSha256:result.receipt.sha256,renderedBytes:result.bytes.length,mediaType:'image/png'}]});
  }
  const command={protocol:'paper-capture-group-input-v1',title:'Engineering image group - original page mapping',intent:'material_collection',expectedRevision:0,pages:retained.map(page=>({pageId:page.source.pageId,versionFingerprint:page.versions[0].version.fingerprint}))},group=preparePaperCaptureGroup('synthetic-original-group-'+name,scope,command,retained);return{root:folder,retained,files,group,command,history:[]};
 }
 it('creates reproducible portrait and landscape A4 pages while retaining duplicate original bytes as separate page identities',async()=>{
  const f=await fixture('original'),first=await derivePaperCapturePdf(f),second=await derivePaperCapturePdf(f);expect(second).toEqual(first);expect(await verifyPaperCapturePdf(f,first.bytes,first.receipt)).toEqual(first.receipt);
  expect(first.receipt.pages.map(page=>page.pageId)).toEqual(['front','landscape','same-original-new-page']);expect(f.retained[0].source.originalSha256).toBe(f.retained[2].source.originalSha256);expect(first.receipt.pages[0].versionFingerprint).not.toBe(first.receipt.pages[2].versionFingerprint);
  const document=await PDFDocument.load(first.bytes);expect(document.getPageCount()).toBe(3);expect(document.getPages().map(page=>page.getSize())).toEqual([{width:595.28,height:841.89},{width:841.89,height:595.28},{width:595.28,height:841.89}]);
  for(const page of first.receipt.pages){expect(page.imageBox.x).toBeGreaterThanOrEqual(24);expect(page.imageBox.y).toBeGreaterThanOrEqual(24);expect(page.imageBox.x+page.imageBox.width).toBeLessThanOrEqual(page.pdfWidth-24+1e-8);expect(page.imageBox.y+page.imageBox.height).toBeLessThanOrEqual(page.pdfHeight-24+1e-8);expect(capturedBoxToPdf(page,{x:0,y:0,width:page.width,height:page.height})).toEqual(page.imageBox);}
  if(process.env.STUDY_TEST_PAPER_PDF_EVIDENCE){const destination=resolve(process.env.STUDY_TEST_PAPER_PDF_EVIDENCE),allowed=resolve(process.cwd(),'../../../..');if(!destination.startsWith(allowed+sep)||!destination.endsWith('.pdf'))throw Error('PDF QA evidence must stay under main data/qa');await fs.mkdir(resolve(destination,'..'),{recursive:true});await fs.writeFile(destination,first.bytes,{flag:'wx'});await fs.writeFile(destination+'.receipt.json',JSON.stringify(first.receipt,null,2)+'\n',{flag:'wx'});}
 });
 it('keeps the old PDF unchanged after an explicit page reorder and refuses a rehashed mapping or an unrelated original file set',async()=>{
  const f=await fixture('reorder'),before=await derivePaperCapturePdf(f),snapshot=structuredClone(before.receipt),group=preparePaperCaptureGroup(f.group.groupId,scope,{...f.command,expectedRevision:1,pages:[...f.command.pages].reverse()},f.retained,f.group),after=await derivePaperCapturePdf({...f,group,history:[f.group]});
  expect(after.receipt.pages.map(page=>page.pageId)).toEqual(['same-original-new-page','landscape','front']);expect(after.receipt.groupRevision).toBe(2);expect(before.receipt).toEqual(snapshot);await expect(derivePaperCapturePdf({...f,group})).rejects.toThrow('paper_pdf_original_group_history_required');
  const changed=structuredClone(before.receipt);changed.pages[0].pageId='another-original';const{fingerprint,...body}=changed;changed.fingerprint=retentionDigest(body);await expect(verifyPaperCapturePdf(f,before.bytes,changed)).rejects.toThrow('paper_pdf_actual_source_mapping_mismatch');
  const files=structuredClone(f.files);files[0].source.pageId='another-original';await expect(derivePaperCapturePdf({...f,files})).rejects.toThrow('paper_pdf_actual_file_set_required');expect(await verifyPaperCapturePdf(f,before.bytes,before.receipt)).toEqual(snapshot);
 });
 it('maps the top left captured quadrant into PDF bottom left coordinates and rejects invalid or resource-heavy requests before decoding missing files',async()=>{
  const f=await fixture('coordinates'),pdf=await derivePaperCapturePdf(f),page=pdf.receipt.pages[0],box=capturedBoxToPdf(page,{x:0,y:0,width:page.width/2,height:page.height/2});expect(box.x).toBe(page.imageBox.x);expect(box.y).toBeCloseTo(page.imageBox.y+page.imageBox.height/2);expect(box.width).toBeCloseTo(page.imageBox.width/2);expect(box.height).toBeCloseTo(page.imageBox.height/2);expect(()=>capturedBoxToPdf(page,{x:0,y:0,width:page.width+1,height:1})).toThrow('paper_pdf_capture_box_out_of_bounds');
  const retained=Array.from({length:5},(_,index)=>{const source={...f.retained[0].source,pageId:'budget-page-'+index,width:5000,height:4000},version=paperImageVersion(source,{crop:{x:0,y:0,width:5000,height:4000},rotation:0});return{scope,source,versions:[{version,renderedSha256:'b'.repeat(64),renderedBytes:100,mediaType:'image/png' as const}]};}),group=preparePaperCaptureGroup('synthetic-pdf-budget',scope,{...f.command,pages:retained.map(row=>({pageId:row.source.pageId,versionFingerprint:row.versions[0].version.fingerprint}))},retained);await expect(derivePaperCapturePdf({...f,group,retained,files:[]})).rejects.toThrow('paper_pdf_decoded_page_budget_exceeded');
 });
});
