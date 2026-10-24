import { createHash } from 'node:crypto';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { describe,it,expect } from 'vitest';
import { DomainDatabase } from './domain-database';
const {createBundle,verifyBundle,restoreBundle}=require(resolve(__dirname,'../../../../scripts/operations/backup.cjs'));
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

describe('private course originals and independent stage recovery',()=>{
 it('keeps a frozen PDF original after its mutable material record is gone, recording the actual size only after hash verification',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'study-frozen-original-')),source=join(directory,'source'),bundle=join(directory,'bundle'),restored=join(directory,'restored'),bytes=Buffer.from('%PDF-1.4 frozen source original'),sha=digest(bytes);mkdirSync(join(source,'studio-materials'),{recursive:true});writeFileSync(join(source,'studio-materials',sha+'.pdf'),bytes);const db=new DomainDatabase(join(source,'study-agent.sqlite3'));await db.open();
  try{await db.commit(await db.read(),{sourceCourses:[{id:'frozen-only',sources:[{kind:'pdf',sha256:sha,materialId:'removed-material',text:'Preserved course conditions.'}]}]});await createBundle({dataDir:source,destination:bundle});const manifest=JSON.parse(readFileSync(join(bundle,'manifest.json'),'utf8'));expect(manifest.files.find((file:any)=>file.path.endsWith(sha+'.pdf'))).toMatchObject({sha256:sha,size:bytes.length});await restoreBundle({bundle,destination:restored});expect(readFileSync(join(restored,'studio-materials',sha+'.pdf'))).toEqual(bytes);writeFileSync(join(bundle,'data','studio-materials',sha+'.pdf'),Buffer.alloc(bytes.length,'x'));await expect(verifyBundle({bundle})).rejects.toThrow('bundle_integrity_failed');}
  finally{await db.close();rmSync(directory,{recursive:true,force:true});}
 });
 it('does not relax an explicit material byte size because the same original also has a frozen reference without a size',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'study-frozen-size-')),source=join(directory,'source'),bundle=join(directory,'bundle'),bytes=Buffer.from('%PDF-1.4 known size'),sha=digest(bytes);mkdirSync(join(source,'studio-materials'),{recursive:true});writeFileSync(join(source,'studio-materials',sha+'.pdf'),bytes);const db=new DomainDatabase(join(source,'study-agent.sqlite3'));await db.open();
  try{await db.commit(await db.read(),{sourceCourses:[{id:'frozen',sources:[{kind:'pdf',sha256:sha}]}],studioSourceMaterials:[{id:'material',kind:'pdf',sha256:sha,byteSize:bytes.length+1}]});await expect(createBundle({dataDir:source,destination:bundle})).rejects.toThrow('referenced_file_integrity_failed');expect(readFileSync(join(source,'studio-materials',sha+'.pdf'))).toEqual(bytes);expect(readFileSync(join(bundle,'.study-backup-incomplete'),'utf8')).toContain('verification');}
  finally{await db.close();rmSync(directory,{recursive:true,force:true});}
 });
 it('retains a frozen text snapshot without inventing a TXT original from an unspecified historical format',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'study-frozen-text-')),source=join(directory,'source'),bundle=join(directory,'bundle'),restored=join(directory,'restored'),text='Frozen original text with conditions.',sha=digest(Buffer.from(text));mkdirSync(source);const db=new DomainDatabase(join(source,'study-agent.sqlite3'));await db.open();
  try{await db.commit(await db.read(),{sourceCourses:[{id:'pasted-frozen',sources:[{kind:'text',sha256:sha,text}]}]});expect((await createBundle({dataDir:source,destination:bundle})).files).toBe(1);await restoreBundle({bundle,destination:restored});const recovered=new DomainDatabase(join(restored,'study-agent.sqlite3'));await recovered.open();try{expect((await recovered.read()).state.sourceCourses).toEqual([{id:'pasted-frozen',sources:[{kind:'text',sha256:sha,text}]}]);}finally{await recovered.close();}}
  finally{await db.close();rmSync(directory,{recursive:true,force:true});}
 });
 it('restores byte-exact PDF/TXT originals, page images and saved stage payloads into an empty directory',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'study-source-backup-')),source=join(directory,'source'),bundle=join(directory,'bundle'),restored=join(directory,'restored');mkdirSync(source);
  const pdf=Buffer.from('%PDF-1.4 anonymous original'),text=Buffer.from('\ufeff完整保存条件、反例与末段。\r\n'.repeat(5000)),png=Buffer.from('anonymous synthetic page image'),pdfHash=digest(pdf),textHash=digest(text),imageHash=digest(png);
  mkdirSync(join(source,'studio-materials','processed',pdfHash),{recursive:true});writeFileSync(join(source,'studio-materials',pdfHash+'.pdf'),pdf);writeFileSync(join(source,'studio-materials',textHash+'.txt'),text);writeFileSync(join(source,'studio-materials','processed',pdfHash,'page-1.png'),png);
  const db=new DomainDatabase(join(source,'study-agent.sqlite3'));await db.open();
  try{
   const stage={id:'stage-fixture',courseId:'long-course',kind:'draft',key:'lesson-stable',payload:{concept:'原始的完整条件。',answer:'private-answer'},inputFingerprint:'input',outputFingerprint:'output'};
   await db.commit(await db.read(),{studioSourceMaterials:[{id:'pdf',kind:'pdf',sha256:pdfHash,byteSize:pdf.length,pageFiles:[{page:1,sha256:imageHash,size:png.length}]},{id:'txt',kind:'text',originalFormat:'txt',sha256:textHash,byteSize:text.length},{id:'paste',kind:'text',sha256:digest(Buffer.from('pasted source text'))}],sourceCourses:[{id:'long-course',sources:[],lessonIds:['lesson-stable']}],sourceCourseStages:[stage]});
   const receipt=await createBundle({dataDir:source,destination:bundle});expect(receipt.files).toBe(4);expect((await verifyBundle({bundle})).verifiedFiles).toBe(4);
   await restoreBundle({bundle,destination:restored});expect(readFileSync(join(restored,'studio-materials',pdfHash+'.pdf'))).toEqual(pdf);expect(readFileSync(join(restored,'studio-materials',textHash+'.txt'))).toEqual(text);expect(readFileSync(join(restored,'studio-materials','processed',pdfHash,'page-1.png'))).toEqual(png);
   const recovered=new DomainDatabase(join(restored,'study-agent.sqlite3'));await recovered.open();try{expect((await recovered.read()).state.sourceCourseStages).toEqual([stage]);}finally{await recovered.close();}
   writeFileSync(join(bundle,'data','studio-materials',textHash+'.txt'),'corrupt');await expect(verifyBundle({bundle})).rejects.toThrow('bundle_integrity_failed');
  }finally{await db.close();rmSync(directory,{recursive:true,force:true});}
 });
});
