const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{DatabaseSync}=require('node:sqlite');
const qa=__dirname,root=path.resolve(qa,'../../..'),out=path.join(root,'doc/evidence/2026-10-31/workspace-r5-export-runtime-and-books'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const acceptance=JSON.parse(fs.readFileSync(path.join(qa,'delivery-second.json'))),integration=JSON.parse(fs.readFileSync(path.join(qa,'source-integration-first.json'))),mainUnit=JSON.parse(fs.readFileSync(path.join(qa,'main-unit-first.json')));
if(mainUnit.exit||!acceptance.runtime.available||acceptance.applicationExportImplemented||acceptance.schema32Registered)throw Error('Exact bounded validation required');
fs.mkdirSync(out,{recursive:false});const artifacts=[];
function copy(source,relative,compressed=false){const original=fs.readFileSync(source),bytes=compressed?zlib.gzipSync(original):original,target=path.join(out,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});if(sha(fs.readFileSync(target))!==sha(bytes))throw Error('Archive readback failed');artifacts.push({path:relative,bytes:bytes.length,sha256:sha(bytes),originalSha256:sha(original),...(compressed?{encoding:'gzip'}:{})});}
for(const row of acceptance.source){if(sha(fs.readFileSync(path.join(root,row.path)))!==row.sha256||sha(fs.readFileSync(path.join(root,'data/qa/p166',row.path)))!==row.sha256)throw Error('Exact source changed');copy(path.join(root,row.path),'source/'+row.path);}
for(const file of ['prepare-office-catalog-first.py','prepare-python-wheels-first.py','verify-runtime-and-books-first.py','verify-runtime-and-books-second.py','verify-runtime-and-books-third.py','verify-runtime-boundaries-first.py','verify-runtime-boundaries-second.py','verify-delivery-first.py','verify-delivery-second.py','probe-native-continuations-first.py','probe-native-continuations-second.py','office-field-export-first.py','office-field-export-second.py','setup-paper-export-first.ps1','integrate-runtime-first.cjs','archive-runtime-first.cjs'])copy(path.join(qa,file),'verification-source/'+file);
for(const file of ['source-before-first.json.gz','runtime-candidate-first.json.gz'])copy(path.join(qa,file),'reports/'+file);
for(const file of ['setup-first-failure.json','stripped-environment-architecture-first.json','office-catalog-first.json','delivery-second.json','source-integration-first.json','main-unit-first.json','unit-first.log','unit-second.log','unit-final.log','preflight-cli-first.json','known-office-crash-dumps-first.json','runtime-boundaries-first/result.json','runtime-boundaries-second/result.json','generation-third/result.json'])copy(path.join(qa,file),'reports/'+file.replaceAll('/','-')+'.gz',true);
for(const dir of ['er1','er2']){
 for(const step of ['python-version','python-venv','python-install','office-extract','font-prepare','runtime-probe']){
  const file=path.join(root,'data/qa',dir,'logs',step+'.json');if(fs.existsSync(file))copy(file,'setup/'+dir+'-'+step+'.json.gz',true);
 }
}
copy(path.join(root,'data/qa/er2/probe-final-second/capability.json'),'setup/final-capability.json');
copy(path.join(root,'data/qa/er2/probe-final-second/artifacts-practice/practice.pdf'),'setup/final-probe.pdf');
copy(path.join(root,'data/qa/er2/probe-final-second/artifacts-practice/probe.png'),'setup/final-probe.png');
for(const label of ['first','second','third'])for(const scenario of ['full','unsupported-reference','unsupported-question']){
 const directory=path.join(qa,'generation-'+label,scenario);
 for(const file of ['input.json','preflight.json','practice-execution.json','answers-execution.json'])if(fs.existsSync(path.join(directory,file)))copy(path.join(directory,file),'attempts/'+label+'-'+scenario+'-'+file+'.gz',true);
 for(const book of ['practice','answers'])for(const file of ['worker-error.log','office-worker.log','office-profile-process.json','o-process.json'])if(fs.existsSync(path.join(directory,'artifacts-'+book,file)))copy(path.join(directory,'artifacts-'+book,file),'attempts/'+label+'-'+scenario+'-'+book+'-'+file+'.gz',true);
}
for(const book of ['practice','answers']){
 const directory=path.join(qa,'generation-third/full'),result=JSON.parse(fs.readFileSync(path.join(directory,'artifacts-'+book,'result.json')));
 for(const file of result.files){if(sha(fs.readFileSync(path.join(directory,file.path)))!==file.sha256)throw Error('Actual final artifact changed');copy(path.join(directory,file.path),'final/'+book+'.'+file.format);}
 copy(path.join(directory,'artifacts-'+book,'result.json'),'final/'+book+'-result.json');
 for(let page=1;page<=(book==='practice'?6:2);page++){
  copy(path.join(directory,book+'-page-'+page+'.png'),'final/'+book+'-pages/page-'+page+'.png');
  copy(path.join(directory,'canonical-'+book,'page-'+page+'.png'),'canonical-review/'+book+'-pages/page-'+page+'.png');
 }
 copy(path.join(directory,'canonical-'+book,book+'.pdf'),'canonical-review/'+book+'.pdf');
}
for(const [scenario,book]of[['unsupported-reference','practice'],['unsupported-question','answers']]){
 const directory=path.join(qa,'generation-third',scenario);copy(path.join(directory,'artifacts-'+book,book+'.pdf'),'per-book/'+scenario+'.pdf');copy(path.join(directory,book+'-page-1.png'),'per-book/'+scenario+'.png');
}
copy(path.join(qa,'generation-first/full/artifacts-practice/practice.pdf'),'original-failures/image-margin.pdf');
for(const label of ['first','second']){
 copy(path.join(qa,'continuations-'+label,'observed.json'),'original-failures/continuations-'+label+'.json');copy(path.join(qa,'continuations-'+label,'continuations.pdf'),'original-failures/continuations-'+label+'.pdf');
}
copy(path.join(qa,'continuations-first/page-1.png'),'original-failures/continuation-header.png');
for(const profile of ['office-profile','office-profile-replay','p'])copy(path.join(qa,'generation-second/unsupported-reference/artifacts-practice',profile+'-process.json'),'original-failures/path-'+profile+'-process.json');
const protection=JSON.parse(fs.readFileSync(path.join(root,'data/qa/workspace-adult-models-first-20261031/adult165-main-protection-third.json')));
for(const row of protection.files)if(sha(fs.readFileSync(path.join(root,row.path)))!==row.sha256)throw Error('Protected main runtime changed');
const db=new DatabaseSync(path.join(root,'data/study-agent.sqlite3'),{readOnly:true});let formal;
try{formal={schema:db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version,revision:db.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision};}finally{db.close();}
if(JSON.stringify(formal)!==JSON.stringify(protection.formal))throw Error('Formal metadata changed');
const receipt={at:new Date().toISOString(),baseMain:acceptance.baseMain,scope:acceptance.scope,acceptance,integration,
 mainUnit:{exit:mainUnit.exit,passed:19,failed:0},formalReadOnly:formal,protectedFiles:protection.files.length,allProtectedUnchanged:true,
 originalEvidenceGaps:['Initial delivery-inventory checker also selected the unrelated restored-paper-captures operation and failed its expected count; corrected explicit feature filter retains that source unchanged.',
 'Raw administrative MSI logs, crash dump memory, standalone Office binaries, wheels and branch DOCX originals remain in ignored local QA/tool directories. Public archive retains hashes, bounded setup reports and the exact final base books.',
 'Final health probe first refused the two known generated crash dumps. After exact SHA inventory and preservation outside the tool root, a new complete probe passed. No unknown files were deleted or ignored.'],
 applicationExportImplemented:false,schema32Registered:false,newMachineVerified:false,physicalPrintVerified:false,teacherReviewCompleted:false,wholeGoal:'active',artifacts};
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(out,'README.md'),'# 166 运行工具重建与按册预检\n\n本批在同一台Windows设备的新目录重建Python3.10隔离环境、六份逐PyPI摘要和pip哈希锁定的离线wheel、签名和SHA固定的Office行政映像以及两套可复现OFL字体。最终完整19417文件/1583065349字节校验后，实际DOCX/PDF自检通过；不是新机器或Linux验收。\n\n按册预检保留完整原始输入，分别处理练习和答案所用正文/媒体。最终六次实际请求包含四次应成功、两次应拒绝，均符合预期；主干19项语义/几何/真实清空环境测试、另批7项实际二进制/依赖/路径/配置拒绝及3项只读CLI分别记账，不合并成完整应用通过数。\n\n原生起止书签导出为实际PDF目标，保存每题开始和结束页。真实图片位置检查定位并修复隐式留边越界；长Office profile两次原生失败及短目录成功保留，执行前明确拒绝超MAX_PATH的固定后端文件路径。两个已知转储按SHA私下保留后重新做完整工具校验，没有忽略未知文件。\n\n最终基础练习册6页、答案册2页及四份真实文件，两个按册隔离场景PDF、18张实际打开的生产/独立布局页面、最终工具自检页均有记录。默认canonical转换仍可能使用默认公式字体，仅作为独立布局检查，下载候选只使用逐文档UNO产物。\n\n两次长正文原生条件页眉都渲染为1335，明确未采用，长正文续题仍未完成。持久清单/队列/来源授权与曝光防旁路/原生恢复/工作台UI、全部题型与其他R5～R8、教师/实机/实体打印/真人条件继续。正式24/revision187及1063份运行配置/构建保持，仅本地源码，未推送或部署，整体active。\n',{flag:'wx'});
for(const row of artifacts)if(sha(fs.readFileSync(path.join(out,row.path)))!==row.sha256)throw Error('Final evidence changed');
console.log(JSON.stringify({archive:path.relative(root,out).replaceAll('\\','/'),artifacts:artifacts.length,formal,protectedFiles:protection.files.length,goal:'active'}));
