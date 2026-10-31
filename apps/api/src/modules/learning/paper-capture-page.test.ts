import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import sharp from 'sharp';
import {afterAll,describe,it,expect} from 'vitest';
import {paperCaptureSourceScope} from './paper-capture-scope';
import {renderPaperCaptureImage} from './paper-capture-image';
import {persistPaperImageFiles,readPaperImageFile,verifyPaperImageFileSet} from './paper-capture-files';
import {createPaperCapturePage,adoptPaperCapturePageVersion,assertPaperCapturePage} from './paper-capture-page';

const qa=resolve(process.cwd(),'../../data/qa'),root=mkdtempSync(join(qa,'paper-page-'));
afterAll(()=>{if(!resolve(root).startsWith(qa+sep))throw Error('Unsafe generated page scratch');rmSync(root,{recursive:true,force:true});});
const firstAt='2026-10-30T00:00:00.000Z',secondAt='2026-10-30T00:01:00.000Z',thirdAt='2026-10-30T00:02:00.000Z';
async function fixture(name:string){
 const folder=join(root,name),bytes=await sharp({create:{width:60,height:40,channels:3,background:'#56789a'}}).png().toBuffer(),hash=createHash('sha256').update(bytes).digest('hex'),crop={x:0,y:0,width:60,height:40};
 const original=await persistPaperImageFiles(folder,bytes,await renderPaperCaptureImage(bytes,'image/png',hash,'original-page-'+name,{crop,rotation:0})),rotated=await persistPaperImageFiles(folder,bytes,await renderPaperCaptureImage(bytes,'image/png',hash,'original-page-'+name,{crop,rotation:90}));
 const attribution={protocol:'paper-capture-attribution-v1' as const,scope:paperCaptureSourceScope({actorId:'actual-private-author',studentId:'actual-child',subject:'math'}),ownerUserId:'actual-private-author',createdAt:firstAt};
 return{folder,bytes,original,rotated,page:createPaperCapturePage('original.png',attribution,original)};
}
describe('retained paper page versions, actual bytes and monotonic adoption',()=>{
 it('retains original and processed files while rotate/undo adds ordered adoption revisions without replacing either original snapshot',async()=>{
  const f=await fixture('undo'),before=structuredClone(f.page),second=adoptPaperCapturePageVersion(f.page,{revision:1,versionFingerprint:f.page.selectedVersionFingerprint},f.rotated,secondAt),third=adoptPaperCapturePageVersion(second,{revision:2,versionFingerprint:second.selectedVersionFingerprint},f.original,thirdAt);
  expect(f.page).toEqual(before);expect(second.revision).toBe(2);expect(third.revision).toBe(3);expect(third.selectedVersionFingerprint).toBe(before.selectedVersionFingerprint);expect(third.versions).toHaveLength(2);expect(third.versions[0]).toEqual(before.versions[0]);expect(third.adoptions.map(row=>row.revision)).toEqual([1,2,3]);
  expect(await readPaperImageFile(f.folder,f.original,'original')).toEqual(f.bytes);expect(await verifyPaperImageFileSet(f.folder,f.original)).toEqual({original:true,baseline:true,derived:true,renderer:f.original.renderer});await verifyPaperImageFileSet(f.folder,f.rotated);
 });
 it('rejects a stale first-tab command after an actual rotate/undo even though the selected fingerprint is again exactly the old value',async()=>{
  const f=await fixture('aba'),second=adoptPaperCapturePageVersion(f.page,{revision:1,versionFingerprint:f.page.selectedVersionFingerprint},f.rotated,secondAt),third=adoptPaperCapturePageVersion(second,{revision:2,versionFingerprint:second.selectedVersionFingerprint},f.original,thirdAt);
  expect(third.selectedVersionFingerprint).toBe(f.page.selectedVersionFingerprint);expect(()=>adoptPaperCapturePageVersion(third,{revision:1,versionFingerprint:f.page.selectedVersionFingerprint},f.rotated,'2026-10-30T00:03:00.000Z')).toThrow('paper_capture_page_revision_conflict');expect(third.revision).toBe(3);
 });
 it('refuses a changed processed receipt for the same frozen transform and a different original source',async()=>{
  const f=await fixture('changed'),changed=structuredClone(f.original);changed.files.find(file=>file.role==='derived')!.sha256='a'.repeat(64);
  expect(()=>adoptPaperCapturePageVersion(f.page,{revision:1,versionFingerprint:f.page.selectedVersionFingerprint},changed,secondAt)).toThrow('paper_capture_original_processed_version_changed');
  const foreign=await fixture('foreign');expect(()=>adoptPaperCapturePageVersion(f.page,{revision:1,versionFingerprint:f.page.selectedVersionFingerprint},foreign.rotated,secondAt)).toThrow('paper_capture_original_file_receipt_changed');
 });
 it('rejects a missing processed version, changed revision and disconnected adoption history instead of treating it as a new current page',async()=>{
  const f=await fixture('history'),second=adoptPaperCapturePageVersion(f.page,{revision:1,versionFingerprint:f.page.selectedVersionFingerprint},f.rotated,secondAt);
  for(const alter of [(page:typeof second)=>page.versions.pop(),(page:typeof second)=>page.revision++,(page:typeof second)=>page.adoptions[1].previousVersionFingerprint='b'.repeat(64)]){const forged=structuredClone(second);alter(forged);expect(()=>assertPaperCapturePage(forged)).toThrow('paper_capture_original_page_history_changed');}
 });
 it('keeps a retained closed-author source readable as immutable history while refusing any new page adoption',async()=>{
  const f=await fixture('closed'),closed=structuredClone(f.page);closed.attribution.ownerUserId=null;closed.attribution.ownerDeletionHash=closed.attribution.scope.creatorFingerprint;
  expect(assertPaperCapturePage(closed)).toEqual(closed);expect(()=>adoptPaperCapturePageVersion(closed,{revision:1,versionFingerprint:closed.selectedVersionFingerprint},f.rotated,secondAt)).toThrow('paper_capture_page_revision_not_available');
  // Actual receipt and absent-user validation remains a separate native relation check.
 });
});
