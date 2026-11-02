const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const root=path.resolve(__dirname,'../../..');
let s=fs.readFileSync(path.join(root,'data/qa/block-four-content-source-first/math-browser-run.cjs'),'utf8');
assert(s.includes('data/qa/b4-preview-web'));s=s.replaceAll('data/qa/b4-preview-web','data/qa/b4-math37-web');
assert(s.includes("'math-g1-a8e88021-preparation-v1.json',"));s=s.replace("'math-g1-a8e88021-preparation-v1.json',","'english-g3-349949e1-colours-v1.json',");
const anchor=" const last=imports.find(row=>row.file==='chinese-g3-carrot-v1.json')??imports[0];";assert(s.includes(anchor));
s=s.replace(anchor,` const lettersTable=reading().getByRole('region',{name:'字母配对与当前示例',exact:true});await lettersTable.scrollIntoViewIfNeeded();await lettersTable.screenshot({path:path.join(folder,'colours-letter-pairs-desktop.png')});screenshots.push('colours-letter-pairs-desktop.png');
`+anchor);
fs.writeFileSync(path.join(__dirname,'colours-browser-run.cjs'),s,{flag:'wx'});console.log('Prepared existing workbench reader for Colours.');
