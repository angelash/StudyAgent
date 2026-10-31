const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{DatabaseSync}=require('node:sqlite');
const qa=__dirname,root=path.resolve(qa,'../../..'),out=path.join(root,'doc/evidence/2026-10-31/workspace-r5-export-document-worker');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=f=>JSON.parse(fs.readFileSync(path.join(qa,f)));
const accepted=read('document-worker-ninth-acceptance.json'),integration=read('worker-source-integration-first.json');
if(accepted.finalRun!=='generator-ninth'||accepted.unitTests.failed||accepted.boundaries.failed||accepted.applicationExportImplemented||accepted.schema32Registered)throw Error('Bounded actual acceptance required');
fs.mkdirSync(out,{recursive:false});const artifacts=[];
function copy(source,relative,compressed=false){const raw=fs.readFileSync(source),bytes=compressed?zlib.gzipSync(raw):raw,target=path.join(out,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});if(sha(fs.readFileSync(target))!==sha(bytes))throw Error('Evidence readback failed');artifacts.push({path:relative,bytes:bytes.length,sha256:sha(bytes),originalSha256:sha(raw),...(compressed?{encoding:'gzip'}:{})});}
for(const row of integration.files){if(sha(fs.readFileSync(path.join(root,row.path)))!==row.sha256||sha(fs.readFileSync(path.join(root,'data/qa/p166',row.path)))!==row.sha256)throw Error('Integrated source differs from actual candidate');copy(path.join(root,row.path),'sources/'+path.basename(row.path));}
for(const file of ['verify-document-worker-first.py','verify-document-worker-second.py','verify-document-worker-third.py','verify-document-worker-fourth.py','verify-document-worker-fifth.py','verify-document-worker-sixth.py','verify-document-worker-seventh.py','verify-document-worker-eighth.py','verify-document-worker-ninth.py','verify-renderer-boundaries-first.py','verify-renderer-boundaries-second.py','verify-worker-delivery-first.py','integrate-document-worker-first.cjs','archive-document-worker-first.cjs','test-paper-export-first.py','office-candidate-first.py'])copy(path.join(qa,file),'verification-sources/'+file);
for(const file of ['document-worker-ninth-acceptance.json','worker-source-integration-first.json','unit-first-failures.json','unit-second.log','unit-third.log','unit-fourth.log','main-unit-first.log','renderer-boundaries-second/result.json'])copy(path.join(qa,file),'reports/'+file.replaceAll('/','-')+'.gz',true);
for(const label of ['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth']){
 const directory=path.join(qa,'generator-'+label);
 for(const name of ['input.json','failure.json','preflight.json','practice-execution.json','answers-execution.json','font-failure.json'])if(fs.existsSync(path.join(directory,name)))copy(path.join(directory,name),'attempts/'+label+'/'+name+'.gz',true);
 for(const book of ['practice','answers'])for(const name of ['worker-error.log','office-worker.log','office-profile-process.json'])if(fs.existsSync(path.join(directory,'artifacts-'+book,name)))copy(path.join(directory,'artifacts-'+book,name),'attempts/'+label+'/'+book+'-'+name+'.gz',true);
}
for(const book of ['practice','answers']){
 const run=path.join(qa,'generator-ninth'),result=read('generator-ninth/artifacts-'+book+'/result.json');
 for(const file of result.files){if(sha(fs.readFileSync(path.join(run,file.path)))!==file.sha256)throw Error('Final document changed');copy(path.join(run,file.path),'final/'+book+'.'+file.format);}
 copy(path.join(run,'artifacts-'+book,'result.json'),'final/'+book+'-result.json');
 for(let index=1;index<=(book==='practice'?6:2);index++){
  copy(path.join(run,book+'-pages','page-'+index+'.png'),'final/'+book+'-pages/page-'+index+'.png');
  copy(path.join(run,'canonical-'+book,'page-'+index+'.png'),'canonical-review/'+book+'-pages/page-'+index+'.png');
 }
 copy(path.join(run,'canonical-'+book,book+'.pdf'),'canonical-review/'+book+'.pdf');
 copy(path.join(run,'canonical-'+book+'-run.log'),'reports/canonical-'+book+'-run.log.gz',true);
}
for(const label of ['fourth','fifth'])copy(path.join(qa,'generator-'+label,'artifacts-practice/practice.pdf'),'original-failures/'+label+'.pdf');
copy(path.join(qa,'generator-seventh/practice-pages/page-1.png'),'original-failures/seventh-title-border.png');
copy(path.join(qa,'generator-eighth/practice-pages/page-3.png'),'original-failures/eighth-split-short-row.png');
for(const name of ['tree.json','job-before.json'])copy(path.join(qa,'renderer-boundaries-first',name),'original-failures/boundary-first-'+name);
copy(path.join(root,'data/tools/paper-export-fonts-v1/manifest.json'),'fonts/manifest.json');
// Preserve exact third-party license bytes, including original whitespace and
// line endings, without Git text normalization or editing the license itself.
for(const name of ['Noto-OFL.txt','STIX-OFL.txt'])copy(path.join(root,'data/tools/paper-export-fonts-v1',name),'fonts/'+name+'.gz',true);
const protection=JSON.parse(fs.readFileSync(path.join(root,'data/qa/workspace-adult-models-first-20261031/adult165-main-protection-third.json')));
for(const file of protection.files)if(sha(fs.readFileSync(path.join(root,file.path)))!==file.sha256)throw Error('Protected runtime changed');
const db=new DatabaseSync(path.join(root,'data/study-agent.sqlite3'),{readOnly:true});let formal;
try{formal={schema:db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version,revision:db.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision};}finally{db.close();}
if(JSON.stringify(formal)!==JSON.stringify(protection.formal))throw Error('Formal metadata changed');
const result={at:new Date().toISOString(),baseMain:integration.baseMain,scope:accepted.scope,acceptance:accepted,
  sourceFiles:integration.files,formalReadOnly:formal,protectedFiles:protection.files.length,allProtectedBytesUnchanged:true,
  failures:[
   'First preflight: libxml HTML4 unknown-tag handling rejected supported MathML/ruby. Original input and parser source preserved.',
   'Second preflight: actual missing math-font glyph for fullwidth semicolon. Input changed to supported ASCII separator after an intermediate CJK mtext fallback failure.',
   'Third: generic render failure before DOCX output. A keyword collision in bookmark helper was identified by source inspection; no original traceback was captured for that attempt.',
   'Fourth: real SourceHanSans CJK formula fallback rejected by actual PDF font inspection. CJK mtext now explicitly unsupported.',
   'Fifth: source-map checker did not account for real PDF-extraction spacing between Chinese and digits. Heading size/order plus whitespace-normalized labels now checked.',
   'Sixth/seventh functional outputs passed, but seventh page review found template Title border and merged answer lines. Eighth page review found split short-row blank continuations. Exact failure pages retained.',
   'Initial eight unit cases had two failures: table structural prose was silently omitted, and ruby itertext assertion double-counted aggregate run text. Second run exposed an assertion namespace error. Final ten real assertions pass on exact integrated source.',
   'First process audit incorrectly assumed two runtime processes; actual Windows launcher produced three. Second audit enumerated the entire job and waited on every actual PID after known-supervisor kill, all three exited.'
  ],applicationExportImplemented:false,schema32Registered:false,studentFactsCreated:false,physicalPrintVerified:false,teacherReviewCompleted:false,wholeGoal:'active',artifacts};
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(out,'README.md'),'# 166 可复用文档生成器的第一批真实证据\n\n新增冻结输入校验、原生HTML/MathML→Word、固定OFL字体、逐文档UNO和Windows Job Object执行器。它们尚未接入应用的持久清单、队列、授权、曝光或工作台UI，schema仍31。\n\n最终第九轮练习册6页、独立答案册2页，四份真实DOCX/PDF及16张生产/独立渲染页面均打开检查。48表格行、原生分式/上下标/根号、图片、注音、合并单元格、续表头/题号、两条答题线、来源与答案分离核对通过。10项语义测试、12项预检拒绝和8项字体/进程/取消检查分别记账，不混算为应用全绿。\n\n只有明确设置公式字体的生产PDF通过两套派生字体白名单；canonical-review是未配置默认转换的独立布局检查，仍有Times New Roman/OpenSymbol，不是下载产物。CJK公式文字已因真实后备字体失败而明确拒绝。\n\n原失败输入、执行/局部源码、字体失败PDF和版式失败页单列。第三轮未捕获原始traceback，如实保留这个证据缺口。字体二进制只包含在实际DOCX中，原件/派生缓存及所有QA/junction不删除。\n\n工具完整部署/能力探测、长正文续题、全部溢出边界、按册能力分列、应用持久关系/原生恢复/授权防旁路/UI，以及实体打印、教师/实机/真人和原72/WS/R1～R8范围继续未完成。正式24/revision187和1063份配置/构建逐SHA保持，未推送或部署，整体active。\n',{flag:'wx'});
for(const file of artifacts)if(sha(fs.readFileSync(path.join(out,file.path)))!==file.sha256)throw Error('Final archive readback changed');
console.log(JSON.stringify({archive:path.relative(root,out).replaceAll('\\','/'),artifacts:artifacts.length,sourceFiles:integration.files.length,formal,protectedFiles:protection.files.length,goal:'active'}));
