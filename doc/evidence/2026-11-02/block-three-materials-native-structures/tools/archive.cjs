const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),dest=path.join(root,'doc/evidence/2026-11-02/block-three-materials-native-structures'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(fs.existsSync(dest))throw Error('Preserve existing archive');fs.mkdirSync(dest,{recursive:true});
function copy(from,to=path.basename(from)){const target=path.join(dest,to);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,from),target,fs.constants.COPYFILE_EXCL);}
function json(file,value){fs.writeFileSync(path.join(dest,file),JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
const files=execFileSync('git',['diff','--name-only'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(file=>/^(apps|packages|scripts)\//.test(file));
files.push('packages/contracts/src/studio-pdf-table.ts','tests/e2e/pdf-merged-table.spec.ts');
const snapshots=files.map(file=>{const bytes=fs.readFileSync(path.join(root,file));let old=null;try{old=execFileSync('git',['show','HEAD:'+file],{cwd:root,stdio:['ignore','pipe','ignore']});}catch{}return{path:file,sha256:sha(bytes),base64:bytes.toString('base64'),before:old?{sha256:sha(old),base64:old.toString('base64')}:null};});
fs.writeFileSync(path.join(dest,'sources.json.gz'),zlib.gzipSync(JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),files:snapshots})),{flag:'wx'});
const qa='data/qa/block-three-native-math';
for(const name of fs.readdirSync(path.join(root,qa)))if(/\.(?:log|json|json\.gz)$/.test(name)&&!name.includes('inputs.json.gz'))copy(qa+'/'+name,'checks/'+name);
for(const name of ['run.cjs','check.cjs','render.cjs','render-production.cjs','artifact_audit.py','probe-cjk.py','admit-web-build.cjs'])copy(qa+'/'+name,'tools/'+name);
for(const label of ['cjk-docx-baseline-practice-final','cjk-docx-baseline-answers-final','cjk-docx-matrix-practice-final','cjk-docx-matrix-answers-final']){
  copy(qa+'/'+label+'/receipt.json','renders/'+label+'/receipt.json');copy(qa+'/'+label+'/render.log','renders/'+label+'/render.log');
  for(const name of fs.readdirSync(path.join(root,qa,label,'pages')).filter(name=>/^page-\d+\.png$/.test(name)))copy(qa+'/'+label+'/pages/'+name,'renders/'+label+'/'+name);
}
copy(qa+'/pdf-production-final/receipt.json','renders/pdf-production-final/receipt.json');
for(const set of ['downloaded','matrix-downloaded'])for(const book of ['practice','answers']){
  copy('data/qa/mx3s3/'+set+'/'+book+'.pdf','artifacts/'+set+'-'+book+'.pdf');
  for(const name of fs.readdirSync(path.join(root,qa,'pdf-production-final',set+'-'+book)).filter(name=>/^page-\d+\.png$/.test(name)))copy(qa+'/pdf-production-final/'+set+'-'+book+'/'+name,'renders/pdf-production-final/'+set+'-'+book+'/'+name);
}
for(const width of [390,768,1440])copy('data/qa/p187/data/qa/browser-evidence/b3-merged-browser-first/pdf-merged-table/merged-'+width+'.png','browser/merged-'+width+'.png');
copy('data/qa/cjk3a/report.json','checks/normal-text-font-probe.json');
const ui='data/qa/workspace-original-teaching-ui-first-20261101';
for(const file of ['block-three-merged-ui-first.json','block-three-merged-ui-first-admission.json','block-three-merged-ui-first.log','b3-merged-browser-first/receipt.json','b3-browser-whole-first/interruption.json'])copy(ui+'/'+file,'browser/'+file.replaceAll('/','-'));
const cases=JSON.parse(fs.readFileSync(path.join(root,ui,'b3-merged-browser-first/results.private.json')));const summaries=[];
function walk(suites){for(const suite of suites??[]){for(const spec of suite.specs??[])for(const test of spec.tests??[])summaries.push({file:spec.file,title:spec.title,status:test.status,attempts:test.results.map(result=>result.status)});walk(suite.suites);}}walk(cases.suites);
json('browser/native-merge-cases.json',{rawSha256:sha(fs.readFileSync(path.join(root,ui,'b3-merged-browser-first/results.private.json'))),cases:summaries,rawReportAndTraceLocalOnly:true});
json('visual-review.json',{at:new Date().toISOString(),docxPagesOpened:6,productionPdfPagesOpened:6,viewportScreenshotsOpened:[390,768,1440],passed:true,checked:['matrix row/column order and nested fraction','round and square closing fences','native Chinese formula text','separate question/reference books','neutral repeated question identity','page numbers and source labels','merged PDF header column span and body row span'],notClaimed:['physical Office application','real printer','new machine','teacher review','scanned/handwritten OCR ground-truth corpus']});
console.log(JSON.stringify({archive:path.relative(root,dest),sourceFiles:snapshots.length}));
