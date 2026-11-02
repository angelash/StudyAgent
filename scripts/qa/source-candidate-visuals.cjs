// This runs before runtime/admin creation. V1 cannot silently discard a V2 image.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {mathQuestionArtwork,mathQuestionAssetPrefix:prefix}=require('../content/source-math-visuals.cjs'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const exactKeys=(value,keys)=>assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),'Unexpected visual metadata fields');
function validateCandidateVisuals(root,bundle,contracts){
 const questions=bundle.groups.flatMap(group=>group.exercises);
 if(bundle.format==='source-following-original-materials-v1'){
  assert(!('visualAssets'in bundle)&&!('minimumWriter'in bundle)&&questions.every(q=>!('blocks'in q)),'Visual content requires an explicit V2 writer');return{assets:[],imageQuestions:0};
 }
 assert.equal(bundle.format,'source-following-original-materials-v2');assert.equal(bundle.minimumWriter,'source-candidates-visual-documents-v2');assert(Array.isArray(bundle.visualAssets)&&bundle.visualAssets.length>0&&bundle.visualAssets.length<=200);
 const assets=new Map(),directory=path.join(root,'apps/web/public/question-assets/source-math-v1'),base=fs.realpathSync(directory);assert(!fs.lstatSync(directory).isSymbolicLink());assert(base.startsWith(fs.realpathSync(root)+path.sep));
 for(const item of bundle.visualAssets){
  exactKeys(item,['url','sha256','bytes','width','height','figure','index']);assert.equal(typeof item.url,'string');assert(item.url.startsWith(prefix));const filename=item.url.slice(prefix.length);assert(/^[a-f0-9]{64}\.svg$/.test(filename));assert.equal(filename,item.sha256+'.svg');assert(!assets.has(item.url),'Duplicate image URL');
  const figure=contracts.classroomMathFigureSchema.parse(item.figure);assert.deepEqual(figure,item.figure);assert(Number.isSafeInteger(item.index)&&item.index>=0);
  const image=mathQuestionArtwork(figure,item.index),file=path.join(base,filename);assert(!fs.lstatSync(file).isSymbolicLink());assert(fs.realpathSync(file).startsWith(base+path.sep));const bytes=fs.readFileSync(file);
  assert.equal(item.bytes,bytes.length);assert.equal(item.width,image.width);assert.equal(item.height,image.height);assert.equal(sha(bytes),item.sha256);assert(bytes.equals(image.bytes),'Image must equal the original controlled model');assets.set(item.url,{...item,alt:image.alt,caption:image.caption});
 }
 const referenced=new Set();let imageQuestions=0;
 for(const question of questions){
  if(!('blocks'in question))continue;assert(Array.isArray(question.blocks)&&question.blocks.length>0&&question.blocks.length<=4);const ids=new Set();
  for(const block of question.blocks){
   exactKeys(block,['id','type','url','alt',...(block.caption!==undefined?['caption']:[]),'meta']);assert.equal(block.type,'image');assert(typeof block.id==='string'&&block.id.length>0&&!ids.has(block.id));ids.add(block.id);
   const item=assets.get(block.url);assert(item,'All images must have a pinned original model');assert.equal(block.alt,item.alt);assert.equal(block.caption??'',item.caption);
   exactKeys(block.meta,['protocol','sha256','width','height']);assert.deepEqual(block.meta,{protocol:'source-math-image-v1',sha256:item.sha256,width:item.width,height:item.height});referenced.add(block.url);
  }
  const doc={questionId:'preflight-only',version:1,locale:'zh-CN',blocks:question.blocks,attachments:[],layoutMode:'default',accessibilityConfig:{}};assert.deepEqual(contracts.questionDocumentSchema.parse(doc),doc);imageQuestions++;
 }
 assert.equal(referenced.size,assets.size,'Unreferenced images cannot inflate the visual inventory');assert(imageQuestions>0);return{assets:[...assets.values()],imageQuestions};
}
module.exports={validateCandidateVisuals};
