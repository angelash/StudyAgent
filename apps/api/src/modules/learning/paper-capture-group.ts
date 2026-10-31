import { z } from 'zod';
import { retentionDigest } from '../diagnostics/retention-anchor';
import { assertPaperImageVersion,type PaperImageSource,type PaperImageVersion } from './paper-capture-image';
import {paperCaptureScopeSchema,type PaperCaptureScope} from './paper-capture-scope';
export {paperCaptureScopeSchema,type PaperCaptureScope} from './paper-capture-scope';

import {paperCaptureGroupInputSchema,paperCaptureGroupVersionSchema as groupVersionSchema,type PaperCaptureGroupVersion} from '@study-agent/contracts';
export {paperCaptureGroupInputSchema,paperCaptureGroupVersionSchema,type PaperCaptureGroupVersion} from '@study-agent/contracts';
const id=z.string().min(1).max(180);
export type RetainedPaperCapturePage={scope:PaperCaptureScope;source:PaperImageSource;versions:ReadonlyArray<{version:PaperImageVersion;renderedSha256:string;renderedBytes:number;mediaType:'image/png'}>};

/** The service must supply authorized retained originals, not client-declared image metadata. */
export function preparePaperCaptureGroup(groupId:string,scopeValue:PaperCaptureScope,value:unknown,retained:readonly RetainedPaperCapturePage[],previous?:PaperCaptureGroupVersion):PaperCaptureGroupVersion{
 const scope=paperCaptureScopeSchema.parse(scopeValue),input=paperCaptureGroupInputSchema.parse(value);id.parse(groupId);
 if(retentionDigest(scope)!==retentionDigest(scopeValue)||retentionDigest(input)!==retentionDigest(value))throw Error('paper_capture_full_input_required');
 if(previous){const parsed=groupVersionSchema.parse(previous),{fingerprint,...body}=parsed;if(retentionDigest(parsed)!==retentionDigest(previous)||fingerprint!==retentionDigest(body)||previous.groupId!==groupId||retentionDigest(previous.scope)!==retentionDigest(scope)||previous.revision!==input.expectedRevision)throw Error('paper_capture_original_revision_conflict');}
 else if(input.expectedRevision!==0)throw Error('paper_capture_original_revision_conflict');
 const limit=input.intent==='whole_page'?1:input.intent==='single_question'?4:120;if(input.pages.length>limit)throw Error('paper_capture_intent_page_limit');
 const seen=new Set<string>();let originalBytes=0;
 const pages=input.pages.map(reference=>{
  if(seen.has(reference.pageId))throw Error('paper_capture_duplicate_page_identity');seen.add(reference.pageId);
  const originals=retained.filter(row=>row.source.pageId===reference.pageId);if(originals.length!==1)throw Error('paper_capture_original_page_unavailable');const original=originals[0];
  if(retentionDigest(paperCaptureScopeSchema.parse(original.scope))!==retentionDigest(scope))throw Error('paper_capture_original_scope_mismatch');
  const versions=original.versions.filter(row=>row.version.fingerprint===reference.versionFingerprint);if(versions.length!==1)throw Error('paper_capture_original_version_unavailable');const saved=versions[0],version=assertPaperImageVersion(saved.version,original.source);
  if(!/^[a-f0-9]{64}$/.test(saved.renderedSha256)||!Number.isSafeInteger(saved.renderedBytes)||saved.renderedBytes<=0||saved.renderedBytes>40*1024*1024||saved.mediaType!=='image/png')throw Error('paper_capture_rendered_original_unavailable');
  originalBytes+=original.source.originalBytes;
  return{pageId:reference.pageId,originalSha256:original.source.originalSha256,baselineSha256:original.source.baselineSha256,versionFingerprint:version.fingerprint,renderedSha256:saved.renderedSha256,width:version.width,height:version.height};
 });
 if(originalBytes>50*1024*1024)throw Error('paper_capture_group_byte_limit');
 const result={protocol:'paper-capture-group-version-v1' as const,groupId,scope,revision:input.expectedRevision+1,previousFingerprint:previous?.fingerprint??null,title:input.title,intent:input.intent,pages,originalBytes};return{...result,fingerprint:retentionDigest(result)};
}

export function assertPaperCaptureGroupVersion(value:PaperCaptureGroupVersion,retained:readonly RetainedPaperCapturePage[],previous?:PaperCaptureGroupVersion){
 const parsed=groupVersionSchema.parse(value),expected=preparePaperCaptureGroup(parsed.groupId,parsed.scope,{protocol:'paper-capture-group-input-v1',title:parsed.title,intent:parsed.intent,expectedRevision:parsed.revision-1,pages:parsed.pages.map(row=>({pageId:row.pageId,versionFingerprint:row.versionFingerprint}))},retained,previous);
 if(retentionDigest(parsed)!==retentionDigest(value)||retentionDigest(expected)!==retentionDigest(parsed))throw Error('paper_capture_group_source_integrity_failed');return expected;
}
