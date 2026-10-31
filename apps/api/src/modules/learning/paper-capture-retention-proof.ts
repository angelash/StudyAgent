import type {PrivacyReceipt} from '@study-agent/contracts';
import {retentionDigest} from '../diagnostics/retention-anchor';

type Proof=NonNullable<PrivacyReceipt['retainedPaperSources']>[number];
type Row={id:string;[key:string]:any};
/** The actual deletion transaction freezes every retained history prefix, so an
 * older backup can restore its original prefix without inventing a newer one.
 * This function must only receive the actual post-anonymization source row.
 */
export function paperCaptureRetentionProof(collection:Proof['collection'],row:Row):Proof{
 const fingerprints:string[]=[];
 if(collection==='paperCapturePages'){
  const{adoptions,versions,revision:_revision,selectedVersionFingerprint:_selected,...original}=row,adopted=new Set<string>(),byVersion=new Map<string,unknown>(versions.map((version:any)=>[version.receipt.version.fingerprint,version]));
  let previous=retentionDigest({protocol:'paper-capture-retention-chain-v1',collection,original});
  for(const adoption of adoptions){const firstVersion=adopted.has(adoption.versionFingerprint)?null:byVersion.get(adoption.versionFingerprint);if(firstVersion===undefined)throw Error('paper_capture_retained_original_version_missing');adopted.add(adoption.versionFingerprint);previous=retentionDigest({previous,adoption,firstVersion});fingerprints.push(previous);}
 }else if(collection==='paperCaptureGroups'){
  const{history,revision:_revision,...original}=row;let previous=retentionDigest({protocol:'paper-capture-retention-chain-v1',collection,original});
  for(const saved of history){previous=retentionDigest({previous,saved});fingerprints.push(previous);}
 }else if(collection==='paperCaptureDerivations'){
  const{pdf,materialId,publishedAt,publishedGeneration,...original}=row,first=retentionDigest({protocol:'paper-capture-retention-chain-v1',collection,original});fingerprints.push(first);
  if(pdf!==null)fingerprints.push(retentionDigest({previous:first,pdf,materialId,publishedAt,publishedGeneration}));
 }else{
  const{publication,...original}=row,first=retentionDigest({protocol:'paper-capture-retention-chain-v1',collection,original});fingerprints.push(first);if(publication!==null)fingerprints.push(retentionDigest({previous:first,publication}));
 }
 return{collection,id:row.id,fingerprints};
}
export function paperCaptureRetainedSourceMatches(collection:Proof['collection'],row:Row,receipt:PrivacyReceipt){
 const actual=paperCaptureRetentionProof(collection,row).fingerprints.at(-1);return Boolean(actual&&receipt.retainedPaperSources?.some(proof=>proof.collection===collection&&proof.id===row.id&&proof.fingerprints.includes(actual)));
}
