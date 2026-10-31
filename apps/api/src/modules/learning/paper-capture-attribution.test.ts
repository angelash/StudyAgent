import {describe,it,expect} from 'vitest';
import type {PrivacyReceipt} from '@study-agent/contracts';
import {paperCaptureSourceScope} from './paper-capture-scope';
import {assertPaperCaptureAttribution,anonymizePaperCaptureAttribution,type PaperCaptureAttribution} from './paper-capture-attribution';
import {retentionDigest} from '../diagnostics/retention-anchor';

function fixture(){
 const actorId='synthetic-author',studentId='synthetic-child',scope=paperCaptureSourceScope({actorId,studentId,subject:'math'});
 const row:PaperCaptureAttribution={protocol:'paper-capture-attribution-v1',scope,ownerUserId:actorId,createdAt:'2026-10-30T00:00:00.000Z'};
 const receipt:PrivacyReceipt={id:'synthetic-deletion',actorId,kind:'account_delete',subjectHash:scope.creatorFingerprint,requestKey:'synthetic-close-command',inputHash:'a'.repeat(64),completedAt:'2026-10-31T00:00:00.000Z',erasedStudentHashes:[],retainedStudentHashes:[retentionDigest({id:studentId})],counts:{records:0,observations:0,activities:0,plans:0,conversations:0,accessRecords:0}};
 return{actorId,studentId,row,receipt};
}
describe('private paper author and retained child source attribution',()=>{
 it('preserves the exact shared source scope after deletion while native validation requires the matching actual receipt and absent author',()=>{
  const f=fixture(),original=structuredClone(f.row);expect(assertPaperCaptureAttribution(f.row,[{id:f.actorId}],[])).toEqual(f.row);
  const result=anonymizePaperCaptureAttribution(f.row,f.actorId,f.receipt)!;expect(result.scope).toEqual(original.scope);expect(f.row).toEqual(original);expect(result.ownerUserId).toBeNull();expect(JSON.stringify(result)).not.toContain(f.actorId);expect(assertPaperCaptureAttribution(result,[],[f.receipt])).toEqual(result);
  expect(()=>assertPaperCaptureAttribution(result,[],[])).toThrow('paper_capture_actual_shared_deletion_receipt_required');expect(()=>assertPaperCaptureAttribution(result,[{id:f.actorId}],[f.receipt])).toThrow('paper_capture_actual_shared_deletion_receipt_required');
 });
 it('refuses another actor, a changed child, an earlier deletion and a fabricated retained-child declaration',()=>{
  const f=fixture(),result=anonymizePaperCaptureAttribution(f.row,f.actorId,f.receipt)!;
  for(const receipt of [{...f.receipt,actorId:'another-author'},{...f.receipt,completedAt:'2026-10-29T00:00:00.000Z'},{...f.receipt,retainedStudentHashes:[]}])expect(()=>assertPaperCaptureAttribution(result,[],[receipt])).toThrow('paper_capture_actual_shared_deletion_receipt_required');
  expect(()=>assertPaperCaptureAttribution({...result,scope:{...result.scope,studentId:'another-child'}},[],[f.receipt])).toThrow('paper_capture_actual_shared_deletion_receipt_required');expect(()=>anonymizePaperCaptureAttribution(f.row,f.actorId,{...f.receipt,actorId:'another-author'})).toThrow('paper_capture_original_deletion_receipt_required');
 });
 it('removes private personal and erased-child sources and never retains a contradictory erased/retained source',()=>{
  const f=fixture(),personal={...f.row,scope:paperCaptureSourceScope({actorId:f.actorId,studentId:null,subject:null})};expect(anonymizePaperCaptureAttribution(personal,f.actorId,f.receipt)).toBeNull();
  const receipt={...f.receipt,erasedStudentHashes:[retentionDigest({id:f.studentId})]};expect(anonymizePaperCaptureAttribution(f.row,f.actorId,receipt)).toBeNull();const retained=anonymizePaperCaptureAttribution(f.row,f.actorId,f.receipt)!;expect(()=>assertPaperCaptureAttribution(retained,[],[receipt])).toThrow('paper_capture_actual_shared_deletion_receipt_required');
 });
});
