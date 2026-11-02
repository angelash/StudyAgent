const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),dir=path.join(root,'data/qa/b4-source-fairy-next'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const fetched=JSON.parse(fs.readFileSync(path.join(dir,'ruminant-source-fetch-receipt.json'))).results.find(row=>row.label==='msstate');
assert.equal(fetched.status,200);assert.equal(fetched.qualifiedAsSource,true);
const raw=fs.readFileSync(path.join(dir,'msstate-ruminant.private.html')),text=fs.readFileSync(path.join(dir,'msstate-ruminant.private.txt'),'utf8');assert.equal(sha(raw),fetched.rawSha256);
const claims=[
 {fact:'牛等真正反刍动物为一个胃、四个分室，不是四个互不相关的独立胃。',quote:'have one stomach with four compartments: the rumen, reticulum, omasum, and abomasums.'},
 {fact:'瘤胃与网胃中的微生物发酵并分解植物材料，不能概括为前三部分只贮藏而完全不消化。',quote:'These microbes ferment and break down plant cell walls into their carbohydrate fractions'},
 {fact:'反刍包括食物回到口腔进一步咀嚼并与唾液混合，完整生理路线不由童话中的第一第二编号图替代。',quote:'forage and other feedstuffs are forced back to the mouth for further chewing and mixing with saliva.'},
];
for(const claim of claims)assert(text.includes(claim.quote),'Exact public-source passage required');
const output=path.join(root,'resources/curriculum/source-reviews/ruminant-digestion-msstate-v1.json');fs.mkdirSync(path.dirname(output),{recursive:true});
const report={format:'teaching-secondary-source-review-v1',status:'editorial_science_boundary_requires_teacher_review',reviewedAt:new Date().toISOString(),
 source:{publisher:'Mississippi State University Extension Service',title:fetched.title,url:fetched.url,finalUrl:fetched.finalUrl,httpStatus:200,rawSha256:sha(raw)},
 allListedPassagesActuallyRead:true,claims,scope:'仅纠正文中消化简化的阅读边界；不把本文当作小学需背诵的全部生理术语，也不把来源访问当正式学科或教师审核。',
 originalTextbookSourceSha256:'02915a7db6517258434d370430bbf464a1dac6e17df97b90d707dc4ecf5cfedf',originalTextbookPhysicalPage:41,
 teacherReviewed:false,automaticPublication:false,rawPublicArticleLocalOnly:true,otherFetchFailuresRecorded:true};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({readPassages:3,recorded:true,teacherReviewed:false}));
