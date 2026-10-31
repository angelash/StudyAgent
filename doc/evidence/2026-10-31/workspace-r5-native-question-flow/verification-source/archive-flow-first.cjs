const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const qa=__dirname,root=path.resolve(qa,'../../..'),out=path.join(root,'doc/evidence/2026-10-31/workspace-r5-native-question-flow'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
if(fs.existsSync(out))throw Error('Refuse existing evidence directory');
const integration=JSON.parse(fs.readFileSync(path.join(qa,'flow-integration-first.json'))),visual=JSON.parse(fs.readFileSync(path.join(qa,'flow-visual-review-first.json'))),canonical=JSON.parse(fs.readFileSync(path.join(root,'data/qa/c168v2/result.json'))),generation=JSON.parse(fs.readFileSync(path.join(root,'data/qa/s168l/result.json'))),noHead=JSON.parse(fs.readFileSync(path.join(root,'data/qa/s168k/verification.json')));
if(integration.mainUnit.passed!==24||integration.mainUnit.exit||visual.productionPagesOpened!==31||visual.independentlyRenderedDocxPagesOpened!==31||!visual.allPagesReadable||generation.attempts!==4||generation.failed||!noHead.allCountsExactlyOne||canonical.rows.length!==5)throw Error('Actual final scoped evidence required');
for(const row of integration.source)if(sha(fs.readFileSync(path.join(root,row.path)))!==row.sha256)throw Error('Final main source changed');
fs.mkdirSync(out,{recursive:true});const evidence=[];
function copy(source,relative,gzip=false){const raw=fs.readFileSync(source),bytes=gzip?zlib.gzipSync(raw):raw,target=path.join(out,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});if(sha(fs.readFileSync(target))!==sha(bytes))throw Error('Evidence readback failed');evidence.push({path:relative,bytes:bytes.length,sha256:sha(bytes),originalSha256:sha(raw),...(gzip?{encoding:'gzip'}:{})});}
for(const row of integration.source)copy(path.join(root,row.path),'source/'+row.path);
for(const file of ['flow-source-before-main.json.gz','flow-source-final.json.gz','flow-unit-final.txt','flow-unit-final.json','flow-main-unit-first.txt','flow-integration-first.json','flow-visual-review-first.json','known-flow-failures-first.json'])copy(path.join(qa,file),'reports/'+file+(file.endsWith('.gz')?'':'.gz'),!file.endsWith('.gz'));
for(const file of ['probe-continuous-sections-first.py','probe-repeating-question-rows-first.py','inspect-question-flow-failure-first.py','verify-question-flow-first.py','verify-question-flow-second.py','verify-question-flow-third.py','verify-question-flow-fourth.py','verify-question-flow-fifth.py','verify-question-flow-sixth.py','verify-question-flow-seventh.py','verify-question-flow-eighth.py','verify-table-no-head-first.py','verify-table-no-head-second.py','render-question-flow-canonical-first.py','render-question-flow-canonical-second.py','pair-flow-pages-first.py','verify-known-flow-failures-first.py','freeze-flow-final.cjs','integrate-flow-first.cjs','archive-flow-first.cjs'])copy(path.join(qa,file),'verification-source/'+file);
for(const file of ['flow-worker-first.py','flow-worker-second.py','flow-worker-fourth.py','flow-worker-fifth.py','flow-worker-sixth.py'])copy(path.join(qa,file),'original-failures/source/'+file);
const cases=[['base','practice','s168l/base'],['base','answers','s168l/base'],['long','practice','s168l/long'],['long','answers','s168l/long'],['no-head','practice','s168k']];
const books=[];
for(const[scenario,book,relative]of cases){
 const work=path.join(root,'data/qa',relative),report=JSON.parse(fs.readFileSync(path.join(work,'artifacts-'+book,'result.json'))),pages=report.files[0].pageCount;
 const lifecycle=JSON.parse(fs.readFileSync(path.join(work,'artifacts-'+book,'o-process.json')));if(lifecycle.processTree.after.activeProcesses!==0)throw Error('Actual Office child processes remain');
 for(const file of report.files){if(sha(fs.readFileSync(path.join(work,file.path)))!==file.sha256)throw Error('Actual generated file changed');copy(path.join(work,file.path),'final/'+scenario+'/'+book+'.'+file.format);}
 copy(path.join(work,'artifacts-'+book,'result.json'),'final/'+scenario+'/'+book+'-result.json');
 copy(path.join(work,'artifacts-'+book,'o-process.json'),'reports/'+scenario+'-'+book+'-process.json.gz',true);
 copy(path.join(work,'input.json'),'inputs/'+scenario+'-'+book+'.json');
 copy(path.join(work,'input.json'),'inputs/'+scenario+'-'+book+'.json.gz',true);
 const execution=scenario==='no-head'?'execution.json':book+'-execution.json';
 copy(path.join(work,execution),'reports/'+scenario+'-'+book+'-execution.json.gz',true);
 for(let page=1;page<=pages;page++){
  copy(path.join(work,book+'-page-'+page+'.png'),'final/'+scenario+'/'+book+'-pages/page-'+page+'.png');
  copy(path.join(root,'data/qa/c168v2',scenario+'-'+book,'page-'+page+'.png'),'canonical-review/'+scenario+'/'+book+'-pages/page-'+page+'.png');
 }
 copy(path.join(root,'data/qa/c168v2',scenario+'-'+book,book+'.pdf'),'canonical-review/'+scenario+'/'+book+'.pdf');
 books.push({scenario,book,pages,files:report.files,actualOfficeChildrenAfter:0});
}
copy(path.join(root,'data/qa/s168l/result.json'),'reports/final-four-book-generation.json.gz',true);
copy(path.join(root,'data/qa/s168k/verification.json'),'reports/no-original-header-verification.json');
copy(path.join(root,'data/qa/c168v2/result.json'),'reports/canonical-review.json');
copy(path.join(root,'data/qa/flow168-pairs/manifest.json'),'reports/paired-page-manifest.json');
const input=JSON.parse(fs.readFileSync(path.join(root,'data/qa/s168l/base/input.json')));for(const media of input.media)copy(path.join(root,'data/qa/s168l/base',media.path),'inputs/'+media.path);
for(const[folder,file]of[['s168a','sections.pdf'],['s168b','questions.pdf'],['s168c/base/artifacts-practice','practice.pdf'],['s168f/long/artifacts-answers','answers.pdf'],['s168g/base/artifacts-practice','practice.pdf'],['s168h/long/artifacts-answers','answers.pdf']])copy(path.join(root,'data/qa',folder,file),'original-failures/'+folder.replaceAll('/','-')+'-'+file);
for(const[folder,file]of[['s168a','observed.json'],['s168b','observed.json'],['s168c/base','failed-observed.json']])copy(path.join(root,'data/qa',folder,file),'original-failures/'+folder.replaceAll('/','-')+'-'+file);
for(const label of ['s168c','s168d','s168e','s168f','s168g','s168h','s168j']){
 const directory=path.join(root,'data/qa',label);for(const scenario of ['base','long'])for(const book of ['practice','answers']){
  const file=path.join(directory,scenario,book+'-execution.json');if(fs.existsSync(file))copy(file,'original-failures/executions/'+label+'-'+scenario+'-'+book+'.json.gz',true);
 }
}
const receipt={at:new Date().toISOString(),scope:'Bounded native DOCX/PDF prose continuation, original source destinations, answer/reference flow, nested data preservation and minimum text coverage. Application exports and all-question-kind coverage remain incomplete.',baseMain:integration.baseMain,
 source:integration.source,mainUnit:integration.mainUnit,actualGeneration:{requests:5,failed:0,books},canonicalDocx:{documents:5,pages:31,allSourceDocxUnchanged:true,defaultFormulaFontsNotDownloadProof:true},visual,
 knownActualFailureChecks:{report:'reports/known-flow-failures-first.json.gz',passed:2,failed:0},
 failuresRetained:['Native continuous section headers keep the first question on later pages','Repeating primary heading bookmarks move PDF destinations to the last repeated occurrence','Empty end bookmarks inside table cells are absent from actual PDF names','A separate answer label and answer lines split across pages','Ordinary reference keepNext creates a title-only first page and excessive blank space','A single nested data header repeats ROW01 four times; explicit context/header rows prevent using a data row as a header','An additional nested reference table loses 20 of 228 distinctive prose characters; inline labels retain full text'],
 textCoverageLimit:'Character multiplicity is a lower bound for plain prose, not a proof of exact order, all mathematical notation or every table/media variant. Source maps, frozen input and independent content/layout evidence remain required.',
 remaining:['All unsupported markup/math/font/media and overflow boundaries','All 17 question types and other mistake sources','Full native export/command/file relations and schema32','Durable selection transactions, queue/cancel/late-publication and privacy/native restore','Student old library/body/reference/media/PDF read exposure and active-diagnostic restrictions','Original workspace UI and full browser/database acceptance','R5 remaining audio/reference states, R6 textbooks/GESP, R7/R8 and original72/WS','Teacher/device/new-machine/physical-print and real1/3/7/14-day verification'],
 formal:integration.formal,protectedFiles:integration.protectedFiles,allProtectedUnchanged:integration.allProtectedUnchanged,schema32Registered:false,applicationExportRoutesRegistered:false,pushed:false,deployed:false,wholeGoal:'active',evidence};
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(out,'README.md'),'# 原生续题与文档正文核对\n\n在固定Windows/Office运行环境中，题目使用原生重复提示，唯一主标题/终止书签留在重复区域外；普通段落、超页单段、表格、图片、公式、注音、答题留白和独立参考可编辑并按实际PDF目标核对。\n\n最终24项语义/实际PDF边界检查通过；四份基线/长正文册及一份64行无列头表格实际生成，共五次请求、十份DOCX/PDF、31页。五份DOCX经集成render_docx.py独立生成31页；62张原像素页面通过31组并排图全部实际打开。默认canonical公式字体仍仅作布局观察，不代表下载字体白名单。\n\n保留首次页眉、重复书签、单元格空终止目标、留白/标题拆分、单列头导致首条数据重复，以及参考正文缺失的实际文件/源码/执行记录。新字符数量下限检查会拒绝已知缺字样本，但不代替全部顺序、数学与媒体语义验收。\n\n正式24/revision187及1063份受保护运行文件保持。没有注册32、启用应用导出路由或新集合。持久任务、精确下载/隐私恢复、学生旧读取防旁路、原工作台UI和全部其他R5～R8/原72/WS及人员/设备/时间门槛继续，整体active；仅本地提交，未推送部署。\n',{flag:'wx'});
console.log(JSON.stringify({sourceFiles:integration.source.length,evidenceFiles:evidence.length,generatedBooks:books.length,productionPages:31,canonicalPages:31,mainUnit:24,goal:'active'}));
