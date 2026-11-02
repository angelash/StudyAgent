// Corrupt owned copies of real candidate packets; source PDFs and application data stay read-only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{validateSourceCandidates}=require('./source-candidate-preflight.cjs');
const root=path.resolve(__dirname,'../..'),qa=path.join(root,'data/qa'),output=path.resolve(root,process.argv[2]??'');
assert(output.startsWith(qa+path.sep)&&output.endsWith('.json')&&!fs.existsSync(output));
const fixture=fs.mkdtempSync(path.join(qa,'source-preflight-fixture-')),apiRoot=path.join(root,'data/qa/p187'),bookId='archive-book:math-g1-upper-a8e880217c456db6';
const material='resources/curriculum/source-lesson-materials/math-g1-a8e88021-preparation-v1.json',draft='resources/curriculum/source-lessons/math-g1-a8e88021-preparation-v1.json';
const original=JSON.parse(fs.readFileSync(path.join(root,'resources/curriculum/chinatextbook-primary-v1.json'))).books.find(s=>s.sha256.startsWith('a8e88021'));
const files=['textbooks-v1.json','textbook-edition-conformities-v1.json','textbook-mapping-candidates-v1.json','chinatextbook-chinese-v1.json','chinatextbook-primary-v1.json'].map(n=>'resources/curriculum/'+n).concat([material,draft,original.extractedPath]);
const bytes=new Map(files.map(f=>[f,fs.readFileSync(path.join(root,f))]));
function reset(){for(const [f,b]of bytes){const dest=path.join(fixture,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,b);}}
function change(file,fn){const dest=path.join(fixture,file),r=JSON.parse(fs.readFileSync(dest));fn(r);fs.writeFileSync(dest,JSON.stringify(r));}
const options={root:fixture,apiRoot,sourceRoot:'H:/ChinaTextbook',bookId,materials:material,lessonNames:[path.basename(draft)]},checks=[];
function rejects(name,mutate,override={}){reset();mutate();assert.throws(()=>validateSourceCandidates({...options,...override}),undefined,name);checks.push({name,rejectedBeforeRuntime:true});}
const runtimes=()=>fs.readdirSync(qa).filter(n=>n.startsWith('source-candidates-http-')).sort(),before=runtimes();let error,validPacketAccepted=false,legacyChineseAccepted=false;
try{
 reset();const good=validateSourceCandidates(options);assert.equal(good.questionCount,49);assert.equal(good.book.subject,'math');assert.equal(good.book.grade,1);assert.equal(good.drafts[0].draft.source.curriculumStandardYear,2011);validPacketAccepted=true;
 const legacy=validateSourceCandidates({root,apiRoot,sourceRoot:options.sourceRoot,bookId:'archive-book:chinese-g3-upper-02915a7db6517258',materials:'resources/curriculum/source-lesson-materials/chinese-g3-care-final-v1.json',lessonNames:['chinese-g3-surgery-battlefield-v1.json']});assert.equal(legacy.questionCount,49);assert.equal(legacy.book.subject,'chinese');legacyChineseAccepted=true;
 rejects('different-book',()=>{}, {bookId:'archive-book:chinese-g3-upper-02915a7db6517258'});
 rejects('wrong-original-sha',()=>change(draft,d=>d.source.sourceSha256='0'.repeat(64)));
 rejects('course-standard-confused-with-publication',()=>change(draft,d=>d.source.curriculumStandardYear=2022));
 rejects('different-subject-definition',()=>change(draft,d=>d.definitionCandidates[0].subject='chinese'));
 rejects('source-range-outside-directory-entry',()=>change(draft,d=>d.source.pageEnd=14));
 rejects('quote-not-in-current-original',()=>change(draft,d=>d.content.citations[0].quote='这是一段原件没有的引用文本。'));
 rejects('stale-draft-binding',()=>change(draft,d=>d.content.concept.explanation+='改变后的讲解。'));
 rejects('duplicate-question-id',()=>change(material,b=>b.groups[1].exercises[0].id=b.groups[0].exercises[0].id));
 rejects('wrong-retention-interval',()=>change(material,b=>b.groups[0].exercises[3].proposedIntervalDays=14));
 rejects('unapproved-family-marked-approved',()=>change(material,b=>b.groups[0].familyIndependenceReviewed=true));
 rejects('stale-isolated-registry',()=>change('resources/curriculum/textbooks-v1.json',r=>r.books[0].title+=' changed'));
 rejects('filename-traversal',()=>{}, {lessonNames:['../source-lessons/'+path.basename(draft)]});
 rejects('duplicate-source-binding',()=>change(material,b=>b.sourceLessons.push(b.sourceLessons[0])));
 rejects('material-binding-to-different-original',()=>change(material,b=>b.sourceLessons[0].source.sourceSha256='0'.repeat(64)));
 rejects('candidate-claims-publication',()=>change(draft,d=>d.scope.published=true));
 assert.deepEqual(runtimes(),before);
}catch(e){error=e.message;process.exitCode=1;}
const report={at:new Date().toISOString(),passed:!error,validPacketAccepted,legacyChineseAccepted,negativeCasesRejected:checks.length,checks,error,runtimeDirectoriesUnchanged:JSON.stringify(runtimes())===JSON.stringify(before),databaseWritten:false,originalSourceWritten:false,teacherReviewed:false};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
