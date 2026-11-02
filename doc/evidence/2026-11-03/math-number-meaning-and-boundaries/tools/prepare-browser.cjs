const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../../..'),source=path.join(root,'data/qa/block-four-content-source-first/math-browser-run.cjs');let text=fs.readFileSync(source,'utf8');assert(text.includes('data/qa/b4-preview-web'));text=text.replaceAll('data/qa/b4-preview-web','data/qa/b4-math37-web');
const marker="'math-g1-a8e88021-preparation-v1.json'";assert(text.includes(marker));text=text.replace(marker,"'math-g1-a8e88021-five-v1.json','math-g1-a8e88021-twenty-v1.json'");
const point=" const last=imports.find(row=>row.file==='chinese-g3-carrot-v1.json')??imports[0];";assert(text.includes(point));text=text.replace(point,` await check('twenty-second-table-mobile-boundary-and-full-conditions',async()=>{
  const row=imports.find(r=>r.file==='math-g1-a8e88021-twenty-v1.json');await page.goto(origin+row.href);await desk().getByLabel('导入完整教学稿',{exact:true}).waitFor();await desk().getByRole('button',{name:'来源与引用',exact:true}).waitFor();await importCopy(row.importFile);await desk().getByText('阅读当前教学稿',{exact:true}).click();await reading().waitFor();
  const table=reading().getByRole('region',{name:row.body.content.visuals[1].title,exact:true});await table.screenshot({path:path.join(folder,'twenty-counting-boundaries-table.png')});screenshots.push('twenty-counting-boundaries-table.png');
  await page.setViewportSize({width:390,height:844});await table.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(folder,'twenty-counting-boundaries-mobile.png')});screenshots.push('twenty-counting-boundaries-mobile.png');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.setViewportSize({width:1440,height:1000});
 });
`+point);
fs.writeFileSync(path.join(__dirname,'browser-run.cjs'),text,{flag:'wx'});console.log('Prepared original workbench reader for two number candidates; application JS unchanged.');
