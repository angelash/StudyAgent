const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const root=path.resolve(__dirname,'../../..');
let s=fs.readFileSync(path.join(root,'data/qa/block-four-content-source-first/math-browser-run.cjs'),'utf8');
assert(s.includes('data/qa/b4-preview-web'));s=s.replaceAll('data/qa/b4-preview-web','data/qa/b4-math37-web');
assert(s.includes("'math-g1-a8e88021-preparation-v1.json',"));s=s.replace("'math-g1-a8e88021-preparation-v1.json',","'english-g3-349949e1-hello-v1.json',");
const anchor=" const last=imports.find(row=>row.file==='chinese-g3-carrot-v1.json')??imports[0];";assert(s.includes(anchor));
s=s.replace(anchor,` await check('complete-language-evidence-table-and-original-role-expressions',async()=>{
 const row=imports[0],registered=registry.books.find(b=>b.id===row.body.owner.bookId);assert.equal(registered.sourceEdition.publicationYear,null);assert.equal(registered.sourceEdition.curriculumStandardYear,2011);assert.equal(row.body.source.sourceSha256,registered.sourceSha256);
 const table=reading().getByRole('region',{name:'先看任务实际给了什么',exact:true});await table.scrollIntoViewIfNeeded();
 assert((await table.innerText()).includes('本人已听过声音或完成动作'));assert((await table.innerText()).includes('代填真人姓名、所有物和已说过的话'));
 await table.screenshot({path:path.join(folder,'english-evidence-table-desktop.png')});screenshots.push('english-evidence-table-desktop.png');
 const text=await reading().innerText();for(const expression of ['What’s your name?','My name’s Lin.','I have an eraser.','Open your pencil box','Who’s there?'])assert(text.includes(expression),'Complete original expression '+expression);
 });
`+anchor);
fs.writeFileSync(path.join(__dirname,'browser-run.cjs'),s,{flag:'wx'});console.log('Prepared original private workbench reader for exact PEP English.');
