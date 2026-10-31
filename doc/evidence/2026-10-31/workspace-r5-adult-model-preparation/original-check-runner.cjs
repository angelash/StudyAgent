const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),vm=require('node:vm');
const qa=__dirname,source=path.join(qa,'integration44-source'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const ts=require(require.resolve('typescript',{paths:[source]})),modelFile=path.join(qa,'adult-classroom-models-next.ts'),input=fs.readFileSync(modelFile,'utf8');
const compiled=ts.transpileModule(input,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});
if(compiled.diagnostics?.length)throw Error('Model draft has TypeScript syntax diagnostics');const exported={};vm.runInNewContext(compiled.outputText,{exports:exported},{timeout:1000});
const models=exported.adultClassroomModels,basis=JSON.parse(fs.readFileSync(path.join(qa,'r5-adult60-authored-review-basis-second.json'))),expected=basis.rows.filter(row=>row.id!=='soc-1-1-1').map(row=>row.id).sort();
if(JSON.stringify(Object.keys(models).sort())!==JSON.stringify(expected))throw Error('Exactly one model for each of the59 unchanged lesson identities is required');
for(const [id,model]of Object.entries(models)){
 for(const key of ['prediction','setting','reading','alternative','nextEvidence','limit'])if(typeof model[key]!=='string'||model[key].trim().length<12)throw Error('Missing authored part '+id+':'+key);
 if(model.table.headers.length<3||model.table.rows.length<2||model.table.rows.some(row=>row.length!==model.table.headers.length||row.some(value=>typeof value!=='string'||!value.trim())))throw Error('Malformed conceptual comparison '+id);
}
// Independent calculations for every newly authored numeric table. These checks
// concern arithmetic and denominators, not teacher review or population evidence.
const checks=[];function check(id,name,actual,expected){if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Arithmetic mismatch '+id+':'+name);checks.push({lessonId:id,name,actual,expected});}
const mobility=models['soc-3-1-3'].table.rows.slice(0,2).map(row=>row.slice(1).map(value=>{const [n,d]=value.split('／').map(Number);return n/d;}));
check('soc-3-1-3','two periods use the same100-person denominators',mobility,[[0.2,0.4],[0.4,0.8]]);check('soc-3-1-3','descriptive ratio of proportions',mobility[0].map((value,i)=>mobility[1][i]/value),[2,2]);
check('soc-3-1-4','income minus stated costs',models['soc-3-1-4'].table.rows.slice(0,2).map(row=>Number(row[1])-Number(row[2])),[3000,1500]);
check('soc-3-3-3','weekly paid plus unpaid hours',models['soc-3-3-3'].table.rows.map(row=>Number(row[1])+Number(row[2])),[45,55]);
check('soc-5-1-3','reports with explicitly complete recording',models['soc-5-1-3'].table.rows.map(row=>Number(row[1])*parseFloat(row[2])/100),[40,80]);
check('soc-5-2-1','crude births per thousand total population',models['soc-5-2-1'].table.rows.map(row=>Number(row[2])/Number(row[1])*1000),[10,5]);
const curriculum=require(path.join(source,'apps/api/dist/apps/api/src/modules/learning/classroom-curriculum.js')),projects=require(path.join(source,'apps/api/dist/apps/api/src/modules/learning/course-project-content.js'));
const course=curriculum.classroomCourse(),ids=course.units.flatMap(unit=>unit.lectures.flatMap(lecture=>lecture.lessons.map(lesson=>lesson.id)));
function freeze(id){const lesson=curriculum.classroomLesson(id);return{lesson,contentFingerprint:curriculum.classroomFingerprint(lesson),teachingFingerprint:curriculum.classroomTeachingFingerprint(lesson),answerKeys:Object.fromEntries(lesson.questions.map(q=>[q.id,curriculum.classroomAnswerKey(q.id)])),hintKeys:Object.fromEntries(lesson.questions.map(q=>[q.id,curriculum.classroomHintKeys(q.id)]))};}
const baseline={at:new Date().toISOString(),scope:'Read-only actual source44 compiled adult course before any165 application change. Synthetic content definitions only; no real learner records.',course,lessons:ids.map(freeze),unitChecks:course.units.map(unit=>freeze('unit-exam:'+unit.id)),projects:projects.adultProjectDefinitions()};
if(ids.length!==60||baseline.lessons.reduce((n,row)=>n+row.lesson.questions.length,0)!==185||baseline.projects.length!==5)throw Error('Actual60/185/5 baseline required');
const raw=Buffer.from(JSON.stringify(baseline)),snapshot='adult165-before-content-first.json.gz';fs.writeFileSync(path.join(qa,snapshot),zlib.gzipSync(raw,{level:9}),{flag:'wx'});if(sha(zlib.gunzipSync(fs.readFileSync(path.join(qa,snapshot))))!==sha(raw))throw Error('Baseline readback mismatch');
const report={at:new Date().toISOString(),scope:'Preparation only; model data is not connected to the frozen44 app or deployed. Structure and numeric examples checked; semantic review and rendered classrooms still pending.',modelVersion:exported.ADULT_CLASSROOM_MODEL_VERSION,modelSourceSha256:sha(input),models:expected.length,rows:expected.map(id=>({lessonId:id,title:basis.rows.find(row=>row.id===id).title,modelSha256:sha(JSON.stringify(models[id])),humanReviewCompleted:false})),numericChecks:checks,baseline:{snapshot,plainSha256:sha(raw),lessons:60,questions:185,unitQuestions:baseline.unitChecks.reduce((n,row)=>n+row.lesson.questions.length,0),projects:5},humanReviewCompleted:false,applicationIntegrated:false,renderedClassroomVerified:false,realLearnerEvidence:false};
fs.writeFileSync(path.join(qa,'adult165-model-preparation-first.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({models:expected.length,numericChecks:checks.length,baseline:report.baseline,applicationIntegrated:false}));
