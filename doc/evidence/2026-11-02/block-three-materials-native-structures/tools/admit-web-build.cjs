const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),base=path.join(root,'data/qa/workspace-original-teaching-ui-first-20261101'),label='block-three-merged-ui-first',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const build=JSON.parse(fs.readFileSync(path.join(base,label+'.json'))),manifest=JSON.parse(fs.readFileSync(path.join(base,label+'-inputs.json'))),compiled=JSON.parse(fs.readFileSync(path.join(__dirname,'b3-api-build-first.json')));
if(build.status||compiled.exit||compiled.changedDuringRun.length)throw Error('Both independent builds must succeed');
const expected=['apps/api/dist/apps/api/src/modules/learning/studio-pdf-structure.js','apps/api/dist/packages/contracts/src/index.js'];
if(JSON.stringify([...build.originalApiCandidateChangedInputs].sort())!==JSON.stringify(expected.sort()))throw Error('Unexpected overlap');
const generated=new Map(build.inputChanges.map(r=>[r.path,r.afterSha256]));
for(const row of manifest.inputs){const actual=sha(fs.readFileSync(path.join(base,'source',row.path)));if(actual!==(generated.get(row.path)??row.sha256))throw Error('Web input changed');}
const report={at:new Date().toISOString(),buildId:build.buildId,webInputCount:manifest.inputs.length,webInputsStillMatch:true,initialGuardExit:1,actualNextBuildExit:0,reason:'The concurrent isolated API build changed two compiled API inputs watched by the Web wrapper; those files are not Web build inputs.',expectedCompiledApiChanges:expected.map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(root,'data/qa/p187',file)))})),unresolvedWebBuildFailure:false};
fs.writeFileSync(path.join(base,label+'-admission.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
