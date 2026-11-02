const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file))),encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const first=read('data/qa/block-four-content-source-first/autumn-activities-materials-http-first.json'),draftPath='resources/curriculum/source-lessons/chinese-g3-garden-two-v1.json',draft=read(draftPath),previous=structuredClone(draft);
previous.content.citations.find(row=>row.page===31).quote='横画要写得平稳';
const oldDraftSha=first.drafts.find(row=>row.file==='chinese-g3-garden-two-v1.json').sha256;assert.equal(sha(encode(previous)),oldDraftSha);
const bundlePath='resources/curriculum/source-lesson-materials/chinese-g3-autumn-activities-v1.json',bundle=read(bundlePath),oldBundle=structuredClone(bundle);
oldBundle.sourceLessons.find(row=>row.lesson==='garden-two').sha256=oldDraftSha;assert.equal(sha(encode(oldBundle)),first.materials.sha256);
const bundles=['resources/curriculum/source-lesson-materials/chinese-g3-autumn-v1.json',bundlePath].map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(root,file))),value:read(file)}));
for(const b of bundles)for(const row of b.value.sourceLessons)assert.equal(sha(fs.readFileSync(path.join(root,row.path))),row.sha256);
const report={at:new Date().toISOString(),firstHttpReportPassedOnlyItsSaveColdReadAssertions:true,firstGardenExactCitationQualified:false,originalSourceReportRetained:true,
 changedDraft:{path:draftPath,previousSha256:oldDraftSha,currentSha256:sha(encode(draft)),onlyDifference:'Physical page31 quotation gains its original comma, length7 becomes8.'},
 changedBundle:{path:bundlePath,previousSha256:first.materials.sha256,currentSha256:sha(encode(bundle)),onlyDifference:'Exact source draft binding hash; all105 exercise stems, answers, analyses, modes, rubrics and proposed intervals unchanged.'},
 currentBundleInputs:bundles.map(({path,sha256})=>({path,sha256})),allCurrentDraftBindingsMatch:true,
 verificationScript:'Now requires minimum-length and literal quotation match before saving, rejects actual citation_not_in_source preflight gaps, uses exact lesson source name and cold-reads all authored-source metadata.',
 actualStrictResults:['autumn-materials-http-source-checked.json','autumn-activities-materials-http-source-checked.json'],teacherReviewed:false,published:false,wholeGoal:'active'};
fs.writeFileSync(path.join(__dirname,'autumn-source-citation-revision.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({onlyDraftCitationAndBundleBindingChanged:true,exerciseContentUnchanged:105}));
