import {describe,it,expect,afterEach,vi} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {renderPaperCaptureImage,paperImageVersion} from './paper-capture-image';
import {paperCaptureSourceScope} from './paper-capture-scope';
import {completePaperCaptureCopy,readCompletePaperCaptureCopy} from './paper-capture-copy';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {browserPaperCaptureScope,browserPaperImageVersion,completeBrowserPaperCaptureCopy,readBrowserPaperCaptureCopy,paperCaptureValueHash} from '../../../../web/lib/paper-capture-copy';
import type {PaperCapturePendingCommand} from '@study-agent/contracts';

const scope={actorId:'synthetic-browser-copy-owner',studentId:'synthetic-browser-copy-child',subject:'math' as const},sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
async function fixture(){const bytes=await sharp({create:{width:80,height:60,channels:3,background:'#456789'}}).png().toBuffer(),rendered=await renderPaperCaptureImage(bytes,'image/png',sha(bytes),'synthetic-copy-page');return{bytes,rendered};}
afterEach(()=>vi.restoreAllMocks());

describe('actual browser-format copies interoperate with the retained native paper protocol',()=>{
 it('preserves frozen editor revisions through native/browser copies while keeping the old format and its fingerprint unchanged',async()=>{
  const f=await fixture(),input={actorId:scope.actorId,scope:paperCaptureSourceScope(scope),title:'冻结编辑依据',intent:'material_collection' as const,pages:[{pageId:f.rendered.source.pageId,name:'original.png',bytes:f.bytes,source:f.rendered.source,transform:f.rendered.version.transform}],groups:[{groupId:'actual-group',pageIds:[f.rendered.source.pageId]}],pending:null,rejected:[]};
  const old=completePaperCaptureCopy(input),legacy=await readBrowserPaperCaptureCopy(old,scope);expect(legacy.copy).not.toHaveProperty('editor');expect(await completeBrowserPaperCaptureCopy({...legacy.copy,pages:legacy.pages})).toEqual(old);
  const editor={slot:'actual-group',activeGroupId:'actual-group',pageBases:[{pageId:f.rendered.source.pageId,revision:7,selectedVersionFingerprint:f.rendered.version.fingerprint}],groupBases:[{groupId:'actual-group',revision:4,fingerprint:'a'.repeat(64)}]},native=completePaperCaptureCopy({...input,editor}),browser=await readBrowserPaperCaptureCopy(native,scope),roundTrip=await completeBrowserPaperCaptureCopy({...browser.copy,pages:browser.pages});expect(roundTrip).toEqual(native);expect(readCompletePaperCaptureCopy(roundTrip,scope).editor).toEqual(editor);expect(old.fingerprint).not.toBe(native.fingerprint);
 });
 it('refuses duplicate and foreign frozen editor bases even after recomputing the public manifest fingerprint',async()=>{
  const f=await fixture(),input={actorId:scope.actorId,scope:paperCaptureSourceScope(scope),title:'保留错误编辑依据',intent:'whole_page' as const,pages:[{pageId:f.rendered.source.pageId,name:'original.png',bytes:f.bytes,source:f.rendered.source,transform:f.rendered.version.transform}],pending:null,rejected:[]},base={pageId:f.rendered.source.pageId,revision:1,selectedVersionFingerprint:f.rendered.version.fingerprint};
  for(const editor of [{slot:'new',activeGroupId:null,pageBases:[base,base],groupBases:[]},{slot:'new',activeGroupId:null,pageBases:[{...base,pageId:'foreign-page'}],groupBases:[]},{slot:'new',activeGroupId:'missing-group',pageBases:[base],groupBases:[]}]){const copy={...completePaperCaptureCopy(input),editor}, {fingerprint,...body}=copy;copy.fingerprint=retentionDigest(body);await expect(readBrowserPaperCaptureCopy(copy,scope)).rejects.toThrow();expect(()=>readCompletePaperCaptureCopy(copy,scope)).toThrow();}expect(f.bytes.length).toBeGreaterThan(0);
 });
 it('uses the same private scope and crop/rotation fingerprints as native processing for all four rotations of an actual original',async()=>{
  const f=await fixture();expect(await browserPaperCaptureScope(scope)).toEqual(paperCaptureSourceScope(scope));
  for(const rotation of [0,90,180,270]as const){const transform={crop:{x:4,y:6,width:45,height:30},rotation};expect(await browserPaperImageVersion(f.rendered.source,transform)).toEqual(paperImageVersion(f.rendered.source,transform));}
 });
 it('round trips native to browser and back with actual original bytes, raw invalid form text and complete pending/rejected commands while performing no network action',async()=>{
  const f=await fixture(),groupId='paper_group_'+randomUUID(),pending:PaperCapturePendingCommand={kind:'recognize',requestKey:randomUUID(),groupId,input:{protocol:'paper-capture-recognize-input-v1',expectedRevision:1,expectedFingerprint:'a'.repeat(64),acknowledgePageOrder:true}},rejected:PaperCapturePendingCommand={kind:'pageRevision',requestKey:randomUUID(),pageId:f.rendered.source.pageId,input:{protocol:'paper-image-revision-input-v1',expectedRevision:1,expectedVersionFingerprint:f.rendered.version.fingerprint,transform:{crop:{x:4,y:6,width:45,height:30},rotation:180}}},draft={x:'-',y:'  ',width:'0',height:'未输入',rotation:'450'};
  const native=completePaperCaptureCopy({actorId:scope.actorId,scope:paperCaptureSourceScope(scope),title:'原始纸面与完整未确认输入',intent:'material_collection',pages:[{pageId:f.rendered.source.pageId,name:'实际原图.png',source:f.rendered.source,transform:f.rendered.version.transform,draft,bytes:f.bytes}],groups:[{groupId,pageIds:[f.rendered.source.pageId]}],pending,rejected:[rejected]}),network=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('No command replay is authorized by local restoration'));
  const restored=await readBrowserPaperCaptureCopy(JSON.parse(JSON.stringify(native)),scope),portable=await completeBrowserPaperCaptureCopy({...restored.copy,pages:restored.pages}),read=readCompletePaperCaptureCopy(JSON.parse(JSON.stringify(portable)),scope);
  expect(portable).toEqual(native);expect(Buffer.from(restored.pages[0].bytes).equals(f.bytes)).toBe(true);expect(read.pages[0].bytes.equals(f.bytes)).toBe(true);expect(read.pages[0].draft).toEqual(draft);expect(read.pending).toEqual(pending);expect(read.rejected).toEqual([rejected]);expect(read.requiresOriginalResultLookup).toBe(true);expect(network).not.toHaveBeenCalled();
 });
 it('rejects altered original bytes even after public manifest hashes are recomputed, and refuses another current actor, child or subject',async()=>{
  const f=await fixture(),copy=completePaperCaptureCopy({actorId:scope.actorId,scope:paperCaptureSourceScope(scope),title:'实际文件恢复校验',intent:'whole_page',pages:[{pageId:f.rendered.source.pageId,name:'original.png',source:f.rendered.source,transform:f.rendered.version.transform,bytes:f.bytes}],pending:null,rejected:[]});
  for(const patch of [{actorId:'different-actor'},{studentId:'different-child'},{subject:'english' as const}])await expect(readBrowserPaperCaptureCopy(copy,{...scope,...patch})).rejects.toThrow('副本归属或内容校验不一致');
  const changed=structuredClone(copy),bytes=Buffer.from(f.bytes);bytes[20]^=1;changed.pages[0].base64=bytes.toString('base64');const{fingerprint:_fingerprint,...body}=changed;changed.fingerprint=await paperCaptureValueHash(body);expect(changed.fingerprint).toBe(retentionDigest(body));await expect(readBrowserPaperCaptureCopy(changed,scope)).rejects.toThrow('完整副本中的原图字节与原文件不一致');expect(Buffer.from(copy.pages[0].base64,'base64').equals(f.bytes)).toBe(true);
 });
 it('preserves a real local file above the server image budget in a complete copy and stops an aborted restoration without producing a metadata-only replacement',async()=>{
  const bytes=Buffer.alloc(13*1024*1024,71),original={sha256:sha(bytes),bytes:bytes.length,mediaType:'image/png'},copy=await completeBrowserPaperCaptureCopy({actorId:scope.actorId,scope:paperCaptureSourceScope(scope),title:'尚未被服务接收的原文件',intent:'material_collection',pages:[{pageId:'unaccepted-local-page',name:'unaccepted.png',bytes,original,source:null,transform:null,draft:null}],pending:null,rejected:[]});
  expect(copy.pages[0].base64.length).toBe(Math.ceil(bytes.length/3)*4);const native=readCompletePaperCaptureCopy(copy,scope);expect(native.pages[0].bytes.equals(bytes)).toBe(true);const abort=new AbortController();abort.abort();await expect(readBrowserPaperCaptureCopy(copy,scope,abort.signal)).rejects.toMatchObject({name:'AbortError'});expect(copy.pages[0].original).toEqual(original);
 });
});
