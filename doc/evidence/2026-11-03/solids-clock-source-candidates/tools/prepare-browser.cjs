const fs=require('fs'),path=require('path'),assert=require('assert/strict');const root=path.resolve(__dirname,'../../..'),source=fs.readFileSync(path.join(root,'data/qa/block-four-content-source-first/math-browser-run.cjs'),'utf8');
const start=source.indexOf(" for(const row of imports)await check('actual-candidate-reading:'"),end=source.indexOf('})().catch(e=>{failure=e;');assert(start>0&&end>start);
const body=String.raw`
 for(const row of imports)await check('actual-controlled-model-reading:'+row.file,async()=>{
  await page.goto(origin+row.href);await desk().getByLabel('导入完整教学稿',{exact:true}).waitFor();await importCopy(row.importFile);await desk().getByText('阅读当前教学稿',{exact:true}).click();await reading().waitFor();
  const concept=reading().locator('.cl-board-step').filter({has:page.getByRole('heading',{name:'完整概念讲解',exact:true})});assert.equal(await concept.locator('p').textContent(),row.body.content.concept.explanation);
  let index=0;for(const visual of row.body.content.visuals)if(visual.kind==='math'){
   const figure=reading().getByRole('figure',{name:visual.figure.title,exact:true}),models=visual.figure.kind==='clocks'?visual.figure.clocks:visual.figure.solids;assert.equal(await figure.locator('svg').count(),models.length);assert.deepEqual(await figure.locator('.cl-math-caption').allTextContents(),models.map(model=>model.caption));
   if(visual.figure.kind==='clocks'&&!visual.figure.showDigitalTime)assert.equal(await figure.locator('svg text').filter({hasText:/\d+:\d+/}).count(),0);
   await figure.scrollIntoViewIfNeeded();const name=row.file.replace('.json','')+'-figure-'+(++index)+'-desktop.png';await figure.screenshot({path:path.join(folder,name)});screenshots.push(name);
  }
  const first=reading().getByRole('button',{name:/^放大数学图示：/}).first();await first.focus();await page.keyboard.press('Enter');await page.getByRole('dialog').filter({has:page.getByRole('button',{name:'关闭图片',exact:true})}).waitFor();await page.keyboard.press('Escape');assert(await first.evaluate(el=>el===document.activeElement));
  const waiting=page.waitForEvent('download');await desk().getByRole('button',{name:'下载当前完整稿',exact:true}).click();const download=await waiting,file=path.join(folder,'readback-'+row.file);await download.saveAs(file);const copy=JSON.parse(fs.readFileSync(file));assert.deepEqual(copy.content,row.body.content);assert.deepEqual(copy.targetRefs,row.body.targetRefs);assert.deepEqual(copy.journal,[]);
 });
 await check('actual-models-mobile-complete-captions-no-overflow',async()=>{
  await page.setViewportSize({width:390,height:844});for(const row of imports){await page.goto(origin+row.href);await desk().getByLabel('导入完整教学稿',{exact:true}).waitFor();await importCopy(row.importFile);await desk().getByText('阅读当前教学稿',{exact:true}).click();await reading().waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));let index=0;
   for(const visual of row.body.content.visuals)if(visual.kind==='math'){const figure=reading().getByRole('figure',{name:visual.figure.title,exact:true});assert.equal(await figure.locator('.cl-math-models').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);await figure.scrollIntoViewIfNeeded();const name=row.file.replace('.json','')+'-figure-'+(++index)+'-mobile.png';await figure.screenshot({path:path.join(folder,name)});screenshots.push(name);}
  }
 });
 await check('reading-has-no-publication-or-learner-writes',async()=>{assert.deepEqual(await facts(),before);assert.deepEqual(mutations,[]);assert.deepEqual(errors,[]);});
`;
fs.writeFileSync(path.join(__dirname,'browser-run.cjs'),source.slice(0,start).replace('data/qa/b4-preview-web','data/qa/b4-math37-web')+body+source.slice(end),{flag:'wx'});console.log(JSON.stringify({prepared:true,applicationUnchanged:true}));
