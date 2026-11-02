// Deterministic question images use the same source geometry as the classroom.
// A content address names visible artwork, never its hidden answer or shape.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {classroomMathFigureSchema,classroomMathDrawings,classroomMathDrawingSvg}=require('../../packages/contracts/src/classroom-math.ts');
const prefix='/question-assets/source-math-v1/',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function mathQuestionArtwork(figure,index){
 const checked=classroomMathFigureSchema.parse(figure);assert.deepEqual(checked,figure,'No discarded model fields');
 const model=classroomMathDrawings(checked)[index];assert(model,'Model index required');
 const drawing={...model,description:checked.kind==='clocks'&&!checked.showHandLabels?model.description.replaceAll('短时针','较短指针').replaceAll('长分针','较长指针'):model.description};
 const svg=classroomMathDrawingSvg(drawing).replace('<svg ','<svg font-family="Microsoft YaHei, sans-serif" ');assert(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(svg),'XML control characters refused');
 const bytes=Buffer.from(svg+'\n');return{bytes,width:drawing.width,height:drawing.height,alt:drawing.description,caption:drawing.caption};
}
function createMathQuestionVisuals(root){
 const assets=new Map(),directory=path.join(root,'apps/web/public/question-assets/source-math-v1');
 return{blocks(figure){
  classroomMathFigureSchema.parse(figure);const count=figure.kind==='clocks'?figure.clocks.length:figure.solids.length;
  return Array.from({length:count},(_,index)=>{
   const image=mathQuestionArtwork(figure,index),hash=sha(image.bytes),url=prefix+hash+'.svg',target=path.join(directory,hash+'.svg');
   fs.mkdirSync(directory,{recursive:true});assert(!fs.lstatSync(directory).isSymbolicLink(),'Image directory links refused');assert(fs.realpathSync(directory).startsWith(fs.realpathSync(root)+path.sep),'Image directory must remain in this source workspace');
   if(fs.existsSync(target)){assert(!fs.lstatSync(target).isSymbolicLink(),'Image links refused');assert.equal(sha(fs.readFileSync(target)),hash,'Never overwrite an existing different image');}
   else fs.writeFileSync(target,image.bytes,{flag:'wx'});
   assert.equal(sha(fs.readFileSync(target)),hash);if(!assets.has(url))assets.set(url,{url,sha256:hash,bytes:image.bytes.length,width:image.width,height:image.height,figure:structuredClone(figure),index});
   return{id:'math-image-'+index,type:'image',url,alt:image.alt,...(image.caption?{caption:image.caption}:{}),meta:{protocol:'source-math-image-v1',sha256:hash,width:image.width,height:image.height}};
  });
 },manifest(){return[...assets.values()].sort((a,b)=>a.url.localeCompare(b.url));}};
}
module.exports={createMathQuestionVisuals,mathQuestionArtwork,mathQuestionAssetPrefix:prefix};
