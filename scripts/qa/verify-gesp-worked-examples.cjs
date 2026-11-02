// Validate authored reference examples and execute their C++17 programs in the existing isolated runner.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{runSubmission}=require('../gesp/run_submission.cjs');
const root=path.resolve(__dirname,'../..'),options={},args=process.argv.slice(2),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
for(let i=0;i<args.length;i+=2){if(!['--api-root','--output'].includes(args[i])||!args[i+1]||options[args[i]])throw Error('Use --api-root <compiled QA checkout> --output <new QA JSON>');options[args[i]]=args[i+1];}
const apiRoot=path.resolve(root,options['--api-root']??''),output=path.resolve(root,options['--output']??'');
for(const file of [apiRoot,output])assert(file.startsWith(path.join(root,'data/qa')+path.sep),'Owned isolated QA paths required');assert(output.endsWith('.json')&&!fs.existsSync(output),'Fresh output required');
for(let dir=path.dirname(output);dir!==root;dir=path.dirname(dir)){assert(dir!==path.dirname(dir));if(fs.existsSync(dir))assert(!fs.lstatSync(dir).isSymbolicLink());}
const sources=['scripts/content/gesp-worked-examples.cjs','scripts/content/build-gesp-teaching-candidates.cjs','resources/gesp/teaching-candidates-v1.json','resources/gesp/student-curriculum-v2.json','resources/gesp/knowledge-map.json','scripts/gesp/run_submission.cjs'];
const inputs=sources.map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(root,file)))}));
const bundle=JSON.parse(fs.readFileSync(path.join(root,sources[2]))),worked=require('../content/gesp-worked-examples.cjs');
require(path.join(apiRoot,'packages/contracts/dist/index.js')).gespTeachingBundleSchema.parse(bundle);
assert.equal(worked.rows.length,49);assert.equal(new Set(worked.rows.map(row=>row.atomId)).size,49);
assert.deepEqual(worked.rows.map(row=>row.atomId).sort(),bundle.lessons.map(row=>row.atomId).sort());
assert.equal(worked.teacherReviewed,false);assert.equal(worked.automaticPublication,false);
fs.mkdirSync(path.dirname(output),{recursive:true});
const resultFolder=output.slice(0,-5)+'-programs';assert(!fs.existsSync(resultFolder));fs.mkdirSync(resultFolder);
const report={at:new Date().toISOString(),passed:false,inputs,teachingExamples:49,programs:0,programCases:0,conceptualTraces:0,rows:[],teacherReviewed:false,automaticPublication:false,learnerRecordsWritten:false};
let failure;
try{
 const rebuild=spawnSync(process.execPath,[sources[1]],{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(rebuild.status,0,rebuild.stderr);assert.equal(sha(fs.readFileSync(path.join(root,sources[2]))),inputs[2].sha256,'Deterministic output');
 for(const row of worked.rows){const lesson=bundle.lessons.find(lesson=>lesson.atomId===row.atomId);assert(row.steps.length>=3);for(const step of row.steps)assert(lesson.example.referenceAnswer.includes(step));assert(lesson.example.referenceAnswer.endsWith('适用范围：'+row.boundary));
  if(row.program){
   assert(lesson.example.referenceAnswer.includes(row.program.source.trimEnd()),'The reviewed source must be the displayed source');
   const runtime=runSubmission({source:row.program.source,tests:row.program.tests});
   fs.writeFileSync(path.join(resultFolder,row.atomId+'.json'),JSON.stringify(runtime,null,2)+'\n',{flag:'wx'});
   assert(runtime.passed,JSON.stringify({atomId:row.atomId,compile:runtime.compile,tests:runtime.tests}));
   assert.equal(runtime.sourceSha256,sha(row.program.source));assert.equal(runtime.testsSha256,sha(JSON.stringify(row.program.tests)));
   assert.equal(runtime.tests.length,row.program.tests.length);
   // The product runner permits trailing whitespace; these references additionally require the exact displayed output.
   for(const [i,test]of runtime.tests.entries())assert.equal(test.stdout.replace(/\r\n/g,'\n'),row.program.tests[i].expected,'Exact displayed reference output: '+row.atomId);
   report.programs++;report.programCases+=runtime.tests.length;
   report.rows.push({atomId:row.atomId,kind:'cpp',passed:true,sourceSha256:runtime.sourceSha256,testsSha256:runtime.testsSha256,cases:runtime.tests.length,host:runtime.host,toolchain:runtime.toolchain,exactOutputPreserved:true});
  }else{report.conceptualTraces++;report.rows.push({atomId:row.atomId,kind:'conceptual_trace',steps:row.steps.length,programExecutionNotApplicable:true,realDeviceOrToolAcceptance:false});}
  console.log(JSON.stringify({atomId:row.atomId,kind:row.program?'cpp':'trace',programsPassed:report.programs}));
 }
 for(const row of inputs)assert.equal(sha(fs.readFileSync(path.join(root,row.path))),row.sha256,'Inputs unchanged during execution');
 report.passed=true;
}catch(error){failure=error;report.error=error.message;}
finally{report.finishedAt=new Date().toISOString();fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({passed:report.passed,teachingExamples:49,programs:report.programs,programCases:report.programCases,conceptualTraces:report.conceptualTraces}));if(failure){console.error(failure.stack);process.exitCode=1;}
