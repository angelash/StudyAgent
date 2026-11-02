const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto'),assert=require('assert/strict'),{spawnSync,execFileSync}=require('child_process');
const root=process.cwd(),folder=path.join(root,'data/qa/b4-native-math-question-figures-first'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');assert(!fs.existsSync(folder));fs.mkdirSync(folder);
const {validateSourceCandidates}=require(path.join(root,'scripts/qa/source-candidate-preflight.cjs')),base={apiRoot:path.join(root,'data/qa/p187'),sourceRoot:'H:/ChinaTextbook',bookId:'archive-book:math-g1-upper-a8e880217c456db6'},summary=[];
for(const slug of ['preparation','position','solids','clock']){
 const draft='resources/curriculum/source-lessons/math-g1-a8e88021-'+slug+'-v1.json',material='resources/curriculum/source-lesson-materials/math-g1-a8e88021-'+slug+'-v1.json',paths=[draft,material],before=paths.map(f=>sha(fs.readFileSync(path.join(root,f)))),r=spawnSync(process.execPath,['scripts/content/build-math-g1-'+slug+'-candidates.cjs'],{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.deepEqual(paths.map(f=>sha(fs.readFileSync(path.join(root,f)))),before);
 const valid=validateSourceCandidates({...base,root,materials:material,lessonNames:[path.basename(draft)]});assert.equal(valid.questionCount,49);assert.equal(valid.bundle.teacherReviewed,false);summary.push({slug,format:valid.bundle.format,questions:49,imageQuestions:valid.visualValidation.imageQuestions,assets:valid.visualValidation.assets.length,outputBytesRebuilt:true});
}
const slug='clock',material='resources/curriculum/source-lesson-materials/math-g1-a8e88021-clock-v1.json',draft='resources/curriculum/source-lessons/math-g1-a8e88021-clock-v1.json',source=JSON.parse(fs.readFileSync(path.join(root,'resources/curriculum/chinatextbook-primary-v1.json'))).books.find(row=>row.sha256.startsWith('a8e88021'));
const bundle=JSON.parse(fs.readFileSync(path.join(root,material))),asset=bundle.visualAssets[0],assetFiles=bundle.visualAssets.map(row=>'apps/web/public'+row.url);
const files=['textbooks-v1.json','textbook-edition-conformities-v1.json','textbook-mapping-candidates-v1.json','chinatextbook-chinese-v1.json','chinatextbook-primary-v1.json'].map(name=>'resources/curriculum/'+name).concat([draft,material,source.extractedPath,...assetFiles]);
const originals=new Map(files.map(file=>[file,fs.readFileSync(path.join(root,file))])),fixture=path.join(folder,'negative-fixture');
function reset(){for(const[file,bytes]of originals){const target=path.join(fixture,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}}
function mutate(fn){const file=path.join(fixture,material),value=JSON.parse(fs.readFileSync(file));fn(value);fs.writeFileSync(file,JSON.stringify(value));}
const firstQuestion=value=>value.groups.flatMap(group=>group.exercises).find(q=>q.blocks),checks=[];
function rejects(name,change){reset();change();assert.throws(()=>validateSourceCandidates({...base,root:fixture,materials:material,lessonNames:[path.basename(draft)]}),undefined,name);checks.push({name,rejectedBeforeRuntime:true});}
reset();assert.equal(validateSourceCandidates({...base,root:fixture,materials:material,lessonNames:[path.basename(draft)]}).questionCount,49);
rejects('missing-image',()=>fs.unlinkSync(path.join(fixture,'apps/web/public'+asset.url)));
rejects('changed-image-bytes',()=>fs.appendFileSync(path.join(fixture,'apps/web/public'+asset.url),'changed'));
rejects('downgrade-v2-with-visuals-to-v1',()=>mutate(v=>{v.format='source-following-original-materials-v1';}));
rejects('missing-writer-marker',()=>mutate(v=>{delete v.minimumWriter;}));
rejects('missing-manifest',()=>mutate(v=>{delete v.visualAssets;}));
rejects('duplicate-image-url',()=>mutate(v=>{v.visualAssets.push(structuredClone(v.visualAssets[0]));}));
rejects('image-url-path-traversal',()=>mutate(v=>{v.visualAssets[0].url='/question-assets/source-math-v1/../outside.svg';}));
rejects('remote-image-reference',()=>mutate(v=>{firstQuestion(v).blocks[0].url='https://unowned.invalid/image.svg';}));
rejects('unverified-block-digest',()=>mutate(v=>{firstQuestion(v).blocks[0].meta.sha256='0'.repeat(64);}));
rejects('changed-visible-alternative-text',()=>mutate(v=>{firstQuestion(v).blocks[0].alt+='隐藏答案';}));
rejects('discarded-block-fields',()=>mutate(v=>{firstQuestion(v).blocks[0].onload='untrusted';}));
rejects('unsupported-document-block',()=>mutate(v=>{firstQuestion(v).blocks[0].type='unhandled_math';}));
rejects('extra-executable-model-field',()=>mutate(v=>{v.visualAssets[0].figure.svg='<script />';}));
rejects('invalid-model-hour',()=>mutate(v=>{v.visualAssets[0].figure.clocks[0].hour=13;}));
rejects('changed-digital-answer-setting',()=>mutate(v=>{v.visualAssets[0].figure.showDigitalTime=true;}));
rejects('model-index-not-integer',()=>mutate(v=>{v.visualAssets[0].index=.5;}));
rejects('active-svg-with-recomputed-file-hash',()=>mutate(v=>{
 const item=v.visualAssets[0],old=item.url,bytes=Buffer.from(fs.readFileSync(path.join(fixture,'apps/web/public'+old),'utf8').replace('</svg>','<script>alert(1)</script></svg>')),hash=sha(bytes);item.url='/question-assets/source-math-v1/'+hash+'.svg';item.sha256=hash;item.bytes=bytes.length;fs.writeFileSync(path.join(fixture,'apps/web/public'+item.url),bytes);
 for(const q of v.groups.flatMap(g=>g.exercises))for(const block of q.blocks??[])if(block.url===old){block.url=item.url;block.meta.sha256=hash;}
}));
rejects('unreferenced-valid-image',()=>mutate(v=>{
 const figure={kind:'clocks',title:'未引用图',showDigitalTime:false,showHandLabels:false,clocks:[{hour:4,minute:17,caption:''}]},image=require(path.join(root,'scripts/content/source-math-visuals.cjs')).mathQuestionArtwork(figure,0),hash=sha(image.bytes),url='/question-assets/source-math-v1/'+hash+'.svg';fs.writeFileSync(path.join(fixture,'apps/web/public'+url),image.bytes);v.visualAssets.push({url,sha256:hash,bytes:image.bytes.length,width:image.width,height:image.height,figure,index:0});
}));
const assets=[...new Map(['solids','clock'].flatMap(name=>JSON.parse(fs.readFileSync(path.join(root,'resources/curriculum/source-lesson-materials/math-g1-a8e88021-'+name+'-v1.json'))).visualAssets).map(row=>[row.url,row])).values()];
const report={at:new Date().toISOString(),passed:true,positive:summary,negativeCases:checks,negativeCasesRejected:checks.length,assets:assets.map(row=>({url:row.url,sha256:row.sha256,bytes:row.bytes,width:row.width,height:row.height})),applicationRuntimeChanged:false,newLearnerEvidence:false,teacherReviewed:false,published:0};
fs.writeFileSync(path.join(folder,'preflight-first.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:true,positive:summary,rejected:checks.length,assets:assets.length}));
