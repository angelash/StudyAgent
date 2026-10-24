import { createHash } from 'node:crypto';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { describe,it,expect } from 'vitest';
import { DomainDatabase } from './domain-database';
const {createBundle,verifyBundle,restoreBundle}=require(resolve(__dirname,'../../../../scripts/operations/backup.cjs'));
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

describe('private course originals and independent stage recovery',()=>{
 it('restores byte-exact PDF/TXT originals, page images and saved stage payloads into an empty directory',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'study-source-backup-')),source=join(directory,'source'),bundle=join(directory,'bundle'),restored=join(directory,'restored');mkdirSync(source);
  const pdf=Buffer.from('%PDF-1.4 anonymous original'),text=Buffer.from('\ufeff完整保存条件、反例与末段。\r\n'.repeat(5000)),png=Buffer.from('anonymous synthetic page image'),pdfHash=digest(pdf),textHash=digest(text),imageHash=digest(png);
  mkdirSync(join(source,'studio-materials','processed',pdfHash),{recursive:true});writeFileSync(join(source,'studio-materials',pdfHash+'.pdf'),pdf);writeFileSync(join(source,'studio-materials',textHash+'.txt'),text);writeFileSync(join(source,'studio-materials','processed',pdfHash,'page-1.png'),png);
  const db=new DomainDatabase(join(source,'study-agent.sqlite3'));await db.open();
  try{
   const stage={id:'stage-fixture',courseId:'long-course',kind:'draft',key:'lesson-stable',payload:{concept:'原始的完整条件。',answer:'private-answer'},inputFingerprint:'input',outputFingerprint:'output'};
   await db.commit(await db.read(),{studioSourceMaterials:[{id:'pdf',kind:'pdf',sha256:pdfHash,byteSize:pdf.length,pageFiles:[{page:1,sha256:imageHash,size:png.length}]},{id:'txt',kind:'text',originalFormat:'txt',sha256:textHash,byteSize:text.length},{id:'paste',kind:'text',sha256:'not-a-file'}],sourceCourses:[{id:'long-course',lessonIds:['lesson-stable']}],sourceCourseStages:[stage]});
   const receipt=await createBundle({dataDir:source,destination:bundle});expect(receipt.files).toBe(4);expect((await verifyBundle({bundle})).verifiedFiles).toBe(4);
   await restoreBundle({bundle,destination:restored});expect(readFileSync(join(restored,'studio-materials',pdfHash+'.pdf'))).toEqual(pdf);expect(readFileSync(join(restored,'studio-materials',textHash+'.txt'))).toEqual(text);expect(readFileSync(join(restored,'studio-materials','processed',pdfHash,'page-1.png'))).toEqual(png);
   const recovered=new DomainDatabase(join(restored,'study-agent.sqlite3'));await recovered.open();try{expect((await recovered.read()).state.sourceCourseStages).toEqual([stage]);}finally{await recovered.close();}
   writeFileSync(join(bundle,'data','studio-materials',textHash+'.txt'),'corrupt');await expect(verifyBundle({bundle})).rejects.toThrow('bundle_integrity_failed');
  }finally{await db.close();rmSync(directory,{recursive:true,force:true});}
 });
});
