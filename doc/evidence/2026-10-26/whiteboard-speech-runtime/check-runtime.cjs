const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{execFileSync}=require('node:child_process');
const root=process.cwd(),latest=JSON.parse(fs.readFileSync(path.join(root,'data/qa/whiteboard-speech-release-latest.json'),'utf8'));
const release=path.resolve(root,latest.folder),base='http://127.0.0.1:3217',sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
if(!release.startsWith(path.join(root,'output/daemon/release-backups')+path.sep)||fs.realpathSync(release).toLowerCase()!==release.toLowerCase())throw Error('Unexpected fresh122 rollback path');
async function main(){
 const candidate=read(path.join(release,'candidate.json'));
 if(candidate.status!=='ready-for-release'||candidate.verifiedZeroRetries!==true)throw Error('Candidate release gate incomplete');
 const artifact=path.resolve(root,candidate.browserArtifact);if(!artifact.startsWith(root+path.sep)||sha(fs.readFileSync(artifact))!==candidate.browserArtifactSha256)throw Error('Browser artifact identity differs');
 const original=zlib.gunzipSync(fs.readFileSync(artifact));if(sha(original)!==candidate.originalBrowserSha256)throw Error('Original browser digest differs');
 const stats=JSON.parse(original).stats;if(stats.expected!==229||stats.unexpected!==0||stats.flaky!==0||stats.skipped!==0)throw Error('Complete browser gate failed');
 const ci=JSON.parse(execFileSync('gh',['run','view',String(candidate.ciRun),'--json','status,conclusion,headSha,jobs'],{encoding:'utf8',windowsHide:true}));
 if(ci.status!=='completed'||ci.conclusion!=='success'||ci.headSha!==candidate.head||ci.jobs.length!==3||ci.jobs.some(job=>job.status!=='completed'||job.conclusion!=='success'))throw Error('Exact current candidate CI incomplete');
 const target=path.join(release,'runtime.json');
 if(process.argv.includes('--finalize')){
  const report=read(target),observations=[1,2,3].map(index=>read(path.join(root,'data/qa/whiteboard-speech-observation-'+index+'.json'))),first=observations[0];
  const interval=Date.parse(observations[2].at)-Date.parse(first.at);if(interval<60000)throw Error('At least sixty seconds required');
  for(const sample of observations){if(sample.services.length!==3)throw Error('Missing guardian');for(const service of sample.services){const original=first.services.find(row=>row.name===service.name);if(!original||service.status!=='online'||service.pid!==original.pid||service.restarts!==original.restarts||path.resolve(service.cwd).toLowerCase()!==root.toLowerCase())throw Error('Guardian changed');}}
  Object.assign(report,{at:new Date().toISOString(),observations,observedIntervalMs:interval,passed:true,status:'runtime-delivered'});fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,httpChecks:report.httpChecks.length,voiceSamples:report.voiceSamples.length,observedIntervalMs:interval,webBuildId:report.webBuildId}));return;
 }
 execFileSync('git',['merge-base','--is-ancestor',candidate.head,'HEAD']);
 const before=read(path.join(release,'deployment-before.json')),protectedFiles={};
 for(const[file,expected]of Object.entries(before.protectedFiles)){protectedFiles[file]=sha(fs.readFileSync(path.join(root,file)))===expected;if(!protectedFiles[file])throw Error('Protected configuration changed: '+file);}
 if(sha(fs.readFileSync(path.join(root,'.env')))!==sha(fs.readFileSync(path.join(release,'config/.env'))))throw Error('Private local environment changed');
 const compiled=[];for(const[file,expected]of Object.entries(candidate.compiledSha256)){const actual=sha(fs.readFileSync(path.join(root,file)));if(actual!==expected)throw Error('Actual compiled source differs: '+file);compiled.push({file,sha256:actual});}
 const {DatabaseSync}=require('node:sqlite'),database=new DatabaseSync(path.join(root,'data/study-agent.sqlite3'),{readOnly:true});let schemaVersion;try{schemaVersion=database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version;}finally{database.close();}if(schemaVersion!==15)throw Error('Expected production schema15');
 const httpChecks=[];async function check(url,status=200,method='GET'){const response=await fetch(base+url,{method,signal:AbortSignal.timeout(15000),...(method==='POST'?{headers:{'Content-Type':'application/json'},body:'{}'}:{})});httpChecks.push({url,method,status:response.status});if(response.status!==status)throw Error(method+' '+url+' -> '+response.status);return response;}
 for(const page of ['/learn','/parent/login','/studio','/studio/classroom','/studio/source-courses','/studio/projects','/student/assessment'])await check(page);
 await check('/api/health');if((await(await check('/api/ready')).json()).data.status!=='ready')throw Error('API not ready');
 for(const url of ['/api/learning/studio/overview','/api/learning/source-courses/nonexistent','/api/learning/projects/nonexistent/teaching'])await check(url,401);
 await check('/api/learning/studio/whiteboards/nonexistent',404);
 for(const url of ['/api/learning/studio/whiteboards','/api/learning/studio/whiteboards/nonexistent/narration/nonexistent'])await check(url,401,'POST');
 const pageChecks=[],scriptDigests=[];
 for(const[page,markers]of [['/studio',['wb-sentence-player','whiteboard-speech-v1','createConstantSource','完整讲稿与要点']],['/studio/source-courses',['sc-check-manuscript','选择1～6个课时目标']],['/studio/classroom',['ca-journey','cl-check-source']],['/studio/projects',['pj-teaching-toolbar']]]){
  const markup=await(await check(page)).text(),urls=[...new Set([...markup.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match=>match[1]).filter(url=>url.startsWith('/_next/')&&url.includes('.js')))];let body='';
  for(const url of urls){const bytes=Buffer.from(await(await check(url)).arrayBuffer());body+=bytes.toString('utf8');scriptDigests.push({page,url,sha256:sha(bytes),bytes:bytes.length});}
  for(const marker of markers)if(!body.includes(marker))throw Error('Actual Web marker missing: '+page+' '+marker);pageChecks.push({page,markers,passed:true});
 }
 const manifest=await(await check('/classroom-voice-samples/manifest.json')).json(),voiceSamples=[];
 for(const voice of manifest.voices){const bytes=Buffer.from(await(await check('/classroom-voice-samples/'+voice.file)).arrayBuffer());if(sha(bytes)!==voice.sha256)throw Error('Voice bytes differ');voiceSamples.push({file:voice.file,bytes:bytes.length,sha256:voice.sha256,passed:true});}if(voiceSamples.length!==6)throw Error('Expected six original samples');
 const backup=read(path.join(release,'backup-verified.json')),webBuildId=fs.readFileSync(path.join(root,'apps/web/.next/BUILD_ID'),'utf8').trim();if(webBuildId===before.oldWebBuildId)throw Error('Old build still present');
 const report={at:new Date().toISOString(),passed:false,status:'awaiting-stability-observations',revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),applicationRevision:'68202df',ciHead:candidate.head,ciRun:candidate.ciRun,webBuildId,schemaVersion,protectedFiles,localEnvironmentPreserved:true,httpChecks,pageChecks,scriptDigests,compiled,voiceSamples,
  backup:{path:release,bundle:'data-bundle-final',verifiedFiles:backup.verifiedFiles,assetsIncluded:backup.assetsIncluded,buildCopy:read(path.join(release,'build-backup-verification.json')),scope:'Fresh stopped-service consistent database and referenced runtime files plus SHA-verified121 compiled builds and private config. No independent research-asset archive or full restore rehearsal.'},limitations:['Anonymous production checks; authorized synthetic flows and media decode verified in isolated storage.','No teacher, original HyperKnow CSS/fonts/DPR/audio, real-device or long-term learning acceptance.']};
 fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,httpChecks:httpChecks.length,voiceSamples:voiceSamples.length,webBuildId}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
