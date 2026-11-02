const fs=require('fs'),path=require('path'),assert=require('assert/strict');const root=path.resolve(__dirname,'../../..'),qa=path.join(root,'data/qa/p187');
const source=fs.readFileSync(path.join(root,'data/qa/block-four-content-source-first/math-browser-run.cjs'),'utf8');
const start=source.indexOf(" for(const row of imports)await check('actual-candidate-reading:'"),end=source.indexOf('})().catch(e=>{failure=e;');assert(start>0&&end>start);
const runner=source.slice(0,start).replace('data/qa/b4-preview-web','data/qa/b4-math37-web')+fs.readFileSync(path.join(__dirname,'browser-checks.cjs'),'utf8')+source.slice(end).replace('accurateTextbookCandidates:true','generatedEngineeringMathModels:true');
fs.writeFileSync(path.join(__dirname,'browser-run.cjs'),runner,{flag:'wx'});
require('esbuild').buildSync({absWorkingDir:qa,entryPoints:['apps/web/app/studio/whiteboard-frame.ts'],bundle:true,platform:'browser',format:'iife',globalName:'MathBoardHarness',alias:{'@study-agent/contracts':path.join(qa,'packages/contracts/dist/index.js')},outfile:path.join(__dirname,'whiteboard-harness.js')});
console.log(JSON.stringify({prepared:true,mainSourceChanged:false}));
