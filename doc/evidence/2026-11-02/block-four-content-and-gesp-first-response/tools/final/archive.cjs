const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),dest=path.join(root,'doc/evidence/2026-11-02/block-four-content-and-gesp-first-response'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const mode=process.argv[2];if(!['initial','final'].includes(mode))throw Error('initial or final required');
function write(rel,bytes){const file=path.join(dest,rel);fs.mkdirSync(path.dirname(file),{recursive:true});if(fs.existsSync(file)){if(sha(fs.readFileSync(file))!==sha(bytes))throw Error('Preserve earlier archive: '+rel);return;}fs.writeFileSync(file,bytes,{flag:'wx'});if(sha(fs.readFileSync(file))!==sha(bytes))throw Error('Archive readback differs');}
const scrub=text=>text.replace(/study_session=[A-Za-z0-9_-]{16,}/g,'study_session=[REDACTED_QA_SESSION]').replace(/Bearer [A-Za-z0-9_.-]{20,}/g,'Bearer [REDACTED_QA_AUTHORIZATION]');
const entries=fs.readdirSync(__dirname).filter(name=>!name.includes('.private.')&&(/\.json(?:\.gz)?$/.test(name))&&!name.startsWith('archive-'));
for(const name of entries){const file=path.join(__dirname,name);let bytes=fs.readFileSync(file);if(/vitest\.json$/.test(name))bytes=Buffer.from(scrub(bytes.toString('utf8')));write('checks/'+name,bytes);}
for(const [source,target] of [['data/qa/b4-source-intake-first/receipt.json','source-intake/chinese-original.json'],['data/qa/b4-gesp-source-first/receipt.json','source-intake/gesp-original.json']])write(target,fs.readFileSync(path.join(root,source)));
if(mode==='final')for(const[source,target]of [['data/qa/b4-source-next-lessons-first/intake.json','source-intake/chinese-following-lessons.json'],['data/qa/b4-source-unit-end-first/reviewed-receipt.json','source-intake/chinese-unit-activities.json']])write(target,fs.readFileSync(path.join(root,source)));
const sources=spawnSync('git',['ls-files','--modified','--others','--exclude-standard'],{cwd:root,encoding:'utf8'});if(sources.status)throw Error('Source inventory failed');
const files=sources.stdout.trim().split(/\r?\n/).filter(file=>/^(apps|packages|resources|scripts|tests)\//.test(file)).map(file=>{const bytes=fs.readFileSync(path.join(root,file));return{path:file,sha256:sha(bytes),base64:bytes.toString('base64')};});
write('sources-'+mode+'.json.gz',zlib.gzipSync(JSON.stringify({format:'block-four-main-source-snapshot-v1',files})));
const transcripts=[];
for(const name of fs.readdirSync(__dirname).filter(name=>name.endsWith('.log')&&!name.includes('.private.'))){const bytes=fs.readFileSync(path.join(__dirname,name)),safe=Buffer.from(scrub(bytes.toString('utf8')));transcripts.push({path:name,originalSha256:sha(bytes),sha256:sha(safe),redacted:sha(bytes)!==sha(safe),base64:safe.toString('base64')});}
write('run-transcripts-'+mode+'.json.gz',zlib.gzipSync(JSON.stringify({format:'study-redacted-run-transcripts-v1',originalsRetainedLocally:true,files:transcripts})));
for(const run of ['b4-browser-first-ca5cef66d9','b4-schema34-browser-browser-a3a4db115f',...(mode==='final'?['b4-group-browser-browser-294a3ac56e']:[])]){
 const folder=path.join(root,'data/qa/p187/data/qa/browser-evidence',run,'gesp-teaching');
 for(const name of fs.readdirSync(folder))if(name.endsWith('.png'))write('browser/'+run+'/'+name,fs.readFileSync(path.join(folder,name)));
}
if(mode==='final')write('browser/schema35-first-group-mobile.png',fs.readFileSync(path.join(root,'data/qa/p187/data/qa/browser-evidence/b4-group-browser-browser-294a3ac56e/workspace-gesp/first-group-code-before-probes-mobile.png')));
for(const [source,name] of [['data/qa/p187/data/qa/b4-browser-first.json','schema33-first'],['data/qa/p187/data/qa/b4-schema34-browser-browser.json','schema34-first'],...(mode==='final'?[['data/qa/p187/data/qa/b4-group-browser-browser.json','schema35-first']]:[])]){
 const rawBytes=fs.readFileSync(path.join(root,source)),raw=JSON.parse(rawBytes),cases=[];
 function walk(suites){for(const suite of suites??[]){for(const spec of suite.specs??[])for(const test of spec.tests??[])cases.push({file:spec.file,title:spec.title,status:test.status,attempts:test.results.map(result=>({status:result.status,duration:result.durationMs??result.duration,error:result.error?{message:scrub(result.error.message).split('\nCall log:')[0]}:null}))});walk(suite.suites);}}walk(raw.suites);
 write('browser/'+name+'-index.json',Buffer.from(JSON.stringify({stats:raw.stats,rawReportSha256:sha(rawBytes),rawReportLocalOnly:true,cases},null,2)+'\n'));
}
for(const name of ['check.cjs','extra.cjs','postgres.cjs','postgres-before34.cjs','freeze-reader33.cjs','legacy-browser.cjs','validate-following-drafts.cjs','verify.cjs','archive.cjs',...(mode==='final'?['freeze-reader34.cjs','postgres35.cjs','intake-unit-end.cjs','validate-five-drafts.cjs']:[])])write('tools/'+mode+'/'+name,fs.readFileSync(path.join(__dirname,name)));
const report={at:new Date().toISOString(),mode,sourceFiles:files.length,archivedCheckFiles:entries.length,transcripts:transcripts.length,redactedTranscripts:transcripts.filter(row=>row.redacted).length,fullOriginalBrowserReportsTracesAndPrivateConfigurationLocalOnly:true,teacherReviewCompleted:false,wholeGoal:'active'};
fs.writeFileSync(path.join(__dirname,'archive-'+mode+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
