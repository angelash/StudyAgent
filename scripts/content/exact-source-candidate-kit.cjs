// Explicit book context for authored candidates. No database writes or review approval.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function createKit({bookId,prefix,filePrefix}){
 const read=file=>JSON.parse(fs.readFileSync(path.join(root,'resources/curriculum',file)));
 const matches=read('textbooks-v1.json').books.filter(b=>b.id===bookId);assert.equal(matches.length,1,'Unique exact registered book required');
 const book=matches[0],proofs=read('textbook-edition-conformities-v1.json').rows.filter(p=>p.bookId===bookId&&p.bookVersion===book.version);assert.equal(proofs.length,1,'Exact edition record required');
 const proof=proofs[0],sources=[...read('chinatextbook-chinese-v1.json').books.map(s=>({...s,subject:s.subject??'chinese'})),...read('chinatextbook-primary-v1.json').books].filter(s=>s.id===proof.sourceBookId&&s.sha256===proof.sourceSha256&&s.extractedSha256===proof.extractedSha256);
 assert.equal(sources.length,1);const source=sources[0];
 assert.equal(source.subject,book.subject);assert.equal(source.grade,book.grade);assert.equal(source.term,book.term);assert.equal(book.sourceSha256,source.sha256);
 assert.equal(book.sourceEdition.sourceSha256,source.sha256);assert.equal(book.sourceEdition.publicationYear,proof.edition.publicationYear);assert.equal(book.sourceEdition.curriculumStandardYear,proof.edition.curriculumStandardYear);
 assert.equal(prefix,`source:${book.subject}:g${book.grade}:${source.sha256.slice(0,8)}:`,'Prefix must identify this source');
 assert(new RegExp(`^${book.subject}-g${book.grade}-[a-z0-9-]+$`).test(filePrefix),'Explicit subject/grade filename prefix required');
 const extractionBytes=fs.readFileSync(path.join(root,source.extractedPath));assert.equal(sha(extractionBytes),source.extractedSha256);const extraction=JSON.parse(extractionBytes);assert.equal(extraction.sourceSha256,source.sha256);
 const targetId=suffix=>suffix.startsWith(prefix)?suffix:prefix+suffix;
 function draft({slug,lessonId,start,end,scope,definitions,content,sourceReview}){
  assert(/^[a-z0-9-]+$/.test(slug));const ranges=proof.directory.entries.filter(e=>e.lessonId===lessonId);assert.equal(ranges.length,1);assert(start>=ranges[0].physicalStartPage&&end<=ranges[0].physicalEndPage&&end>=start);
  assert.equal(sourceReview.confirmedRange,true);assert.deepEqual(sourceReview.pages.map(p=>p.page),Array.from({length:end-start+1},(_,i)=>start+i));assert(sourceReview.pages.every(p=>p.visualChecked===true&&p.statement.length>=15));
  const defs=definitions.map(([suffix,name,objective,successCriterion,strand,prerequisiteIds=[]])=>({id:targetId(suffix),version:1,name,subject:book.subject,grade:book.grade,term:book.term,strand,objective,successCriterion,prerequisiteIds,curriculumVersion:`source-original-${source.sha256.slice(0,8)}-v1`,status:'draft'}));
  assert(defs.length>0&&defs.length<=8);assert.equal(new Set(defs.map(d=>d.id)).size,defs.length);
  for(const c of content.citations){assert(c.page>=start&&c.page<=end);assert(c.quote.trim().length>=8);assert(extraction.pages[c.page-1].text.includes(c.quote),'Exact citation required');}
  const goals=defs.map((d,i)=>({id:'goal-'+(i+1),atomId:d.id,objective:d.objective,successCriterion:d.successCriterion}));
  return{format:'source-original-lesson-draft-v1',status:'draft_needs_materials_and_review',source:{bookId,lessonId,sourceSha256:source.sha256,pageStart:start,pageEnd:end,publicationYear:proof.edition.publicationYear,curriculumStandardYear:proof.edition.curriculumStandardYear},definitionCandidates:defs,targetIds:defs.map(d=>d.id),sourceReview,scope:{...scope,teacherReviewed:false,published:false},content:{...content,goals,prerequisites:content.prerequisites??[],retention:{intervalDays:[1,3,7,14],anchor:'last_relevant_teaching_or_help',instructions:'按实际教学和帮助时间安排真实到期复测；候选每间隔一题不等充分未见库存、独立题族或长期效果。'}},editorNotes:{slug,teacherReviewed:false,automaticPublication:false,realLearnerEvidence:false,sourceBoundary:'原页和现代教材全文仅本地参考，正文为原创讲解；必要短引必须符合本件准确页段。',materialStatus:'目标、讲解、评分和结构均为待审候选，不自动发布或登记学习事实。'}};
 }
 function group(lesson,suffix,structure,mode,criteria,rows){
  assert.equal(rows.length,7);assert.equal(criteria.length,3);assert(['short_answer','audio_record','image_upload'].includes(mode));
  return{lesson,atomId:targetId(suffix),structure,familyProposal:source.sha256.slice(0,8)+'-'+structure,familyIndependenceReviewed:false,mode,rubric:criteria.map((criterion,i)=>({criterion,weight:[0.4,0.4,0.2][i]})),goldAnchors:{acceptedExample:rows[0][1],insufficientExample:'看起来是这样，没有核对当前对象。',insufficientReason:'缺当前对象与过程依据；参考、他人帮助和本人实际表现未区分。',alternativeAnswers:'按目标核对实际过程，合理不同方法可接受；不自动批准题族、评分或保持库存。'},exercises:rows.map(([stem,answer],i)=>({id:filePrefix+'-'+lesson+'-'+structure+'-'+(i+1),purpose:i<3?['understanding','procedure','transfer'][i]:'retention',dimension:i<3?['understanding','procedure','transfer'][i]:['understanding','procedure','transfer','understanding'][i-3],proposedIntervalDays:i<3?null:[1,3,7,14][i-3],stem,answer,analysis:answer+' 仅作候选人工核对参考；真实原答、过程、帮助及曝光另存，不据此自动认定独立掌握或保持。',expectedSeconds:mode==='image_upload'?240:180}))};
 }
 function write(basename,lessons,groups,reservePolicy,visualAssets=[]){
  assert(/^[a-z0-9-]+$/.test(basename));assert(lessons.length>0);const outputs=[],sourceLessons=[];
  for(const d of lessons){assert.equal(d.source.bookId,bookId);assert.equal(d.source.sourceSha256,source.sha256);const lesson=d.editorNotes.slug;assert.deepEqual(groups.filter(g=>g.lesson===lesson).map(g=>g.atomId).sort(),[...d.targetIds].sort());const file=`resources/curriculum/source-lessons/${filePrefix}-${lesson}-v1.json`,bytes=Buffer.from(JSON.stringify(d,null,2)+'\n');outputs.push([file,bytes]);sourceLessons.push({lesson,path:file,sha256:sha(bytes),source:d.source});}
  assert.equal(new Set(outputs.map(r=>r[0])).size,outputs.length);assert(groups.every(g=>sourceLessons.some(l=>l.lesson===g.lesson)));const ids=groups.flatMap(g=>g.exercises.map(q=>q.id));assert.equal(new Set(ids).size,ids.length);
  const hasVisuals=groups.some(g=>g.exercises.some(q=>q.blocks!==undefined));assert.equal(hasVisuals,visualAssets.length>0,'Visual blocks require an explicit complete asset manifest');
  const bundle={format:hasVisuals?'source-following-original-materials-v2':'source-following-original-materials-v1',status:'editorial_candidate',sourceLessons,teacherReviewed:false,targetAlignmentReviewed:false,scoringReviewed:false,familyIndependenceReviewed:false,automaticPublication:false,reservePolicy,...(hasVisuals?{minimumWriter:'source-candidates-visual-documents-v2',visualAssets}:{}),groups};outputs.push([`resources/curriculum/source-lesson-materials/${basename}.json`,Buffer.from(JSON.stringify(bundle,null,2)+'\n')]);
  for(const [file,bytes]of outputs)fs.writeFileSync(path.join(root,file),bytes);
  console.log(JSON.stringify({bookId,drafts:lessons.length,targets:lessons.map(d=>d.targetIds.length),questions:ids.length,teacherReviewed:false,published:false,learnerEvidenceCreated:false}));
 }
 return{draft,group,write};
}
module.exports={createKit};
