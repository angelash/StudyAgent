const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const root=path.resolve(__dirname,'../../..');let s=fs.readFileSync(path.join(root,'scripts/qa/verify-source-candidates.cjs'),'utf8');
s=s.replace("path.resolve(__dirname,'../..')","path.resolve(__dirname,'../../..')").replace("require('./source-candidate-preflight.cjs')","require(path.join(root,'scripts/qa/source-candidate-preflight.cjs'))");
const marker="  const registry=JSON.parse(fs.readFileSync(path.join(apiRoot,'resources/curriculum/textbooks-v1.json')));";assert(s.includes(marker));s=s.replace(marker,marker+`
  const oldCopy=JSON.parse(fs.readFileSync(path.join(root,'data/qa/b4-chinese-g1-source-first/browser-first/chinese-g1-a692a990-school-start-v1.json'))),oldSource=oldCopy.source;
  assert.equal(oldSource.extractedSha256,'6dae830e70696a636c29022d580bec4ddfeb357b8370df9539e4cab8b13526dc');
  load('modules/diagnostics/textbook-teaching-package').assertTeachingSourceSnapshot(oldSource);
  const normalized=JSON.parse(fs.readFileSync(path.join(root,'data/assets/textbook-sources/chinatextbook-chinese-v1/extracted/chinatextbook-chinese-g1-upper-tone-9d4c9c93727eadcf.json'))),ranges=[[25,26],[27,28],[29,30],[31,32],[33,34]],pinyin=[];
  for(let i=0;i<ranges.length;i++){const [start,end]=ranges[i],book=registry.books.find(b=>b.id===validated.book.id),preview=await call('POST',route+'/source-preview',{bookId:book.id,bookVersion:book.version,lessonId:book.id+':chapter3:entry'+(i+1),pageStart:start,pageEnd:end});
    assert.equal(preview.extractedSha256,'9d4c9c93727eadcf19bfeda6580833b68b5ada8d2cdaed2daca1e578441ee987');assert.deepEqual(preview.pages.map(p=>p.text),normalized.pages.slice(start-1,end).map(p=>p.text));
    pinyin.push({entry:i+1,physicalPages:[start,end],textSha256:preview.pages.map(p=>p.textSha256),exactNormalizedText:true});
  }result.pinyinSourcePreviews=pinyin;result.oldFrozenSourceSnapshotStillParses=true;
`);
const second="    const preflight=await call('POST',route+'/preflight',input);";assert(s.includes(second));s=s.replace(second,`
    const stale={...input,packageId:input.packageId+':stale-old-source',requestKey:crypto.randomUUID(),source:teachingSourceDescriptor(oldSource),sourceFingerprint:oldSource.fingerprint};
    await call('POST',route+'/preflight',stale,409);await call('POST',route+'/commands',stale,409);
    assert.equal(teachingHash(draft.content),teachingHash(oldCopy.content.checks?Object.fromEntries(Object.entries(oldCopy.content).filter(([k])=>k!=='checks')):oldCopy.content));
    result.oldDescriptorCannotSaveAgainstNewExtraction=true;
`+second);
fs.writeFileSync(path.join(__dirname,'pinyin-http.cjs'),s,{flag:'wx'});
