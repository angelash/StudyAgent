 const row=imports[0];
 const clock={kind:'clocks',title:'工程合成钟面 · 比较长短针',showDigitalTime:false,showHandLabels:true,clocks:[{hour:3,minute:0,caption:'短时针与长分针。'},{hour:7,minute:58,caption:'观察接近整时的针位。\n完整尾行保留。'},{hour:12,minute:0,caption:'两针重合。'},{hour:11,minute:59,caption:'跨12前的位置。'}]};
 const solids={kind:'solids',title:'工程合成立体模型 · 识别形状',showNames:false,solids:['cuboid','cube','cylinder','sphere'].map((shape,index)=>({shape,caption:'模型'+(index+1)+'：'+(index===1?'完整长图注。'.repeat(45):'比较可见平面和曲面。')}))};
 row.body.content.title='工程合成数学图示验证稿（未审核）';row.body.content.visuals=[{kind:'math',figure:clock,explanation:'这是功能验证材料，不是本课教材教学候选或审核结论。'},{kind:'math',figure:solids,explanation:'比较理想形状投影，实际摆搭与滚动仍需本人观察。'}];
 fs.writeFileSync(row.importFile,JSON.stringify({...row.body,fingerprint:teachingHash(row.body)}));
 async function download(name){const waiting=page.waitForEvent('download');await desk().getByRole('button',{name:'下载当前完整稿',exact:true}).click();const item=await waiting,file=path.join(folder,name);await item.saveAs(file);return{file,value:JSON.parse(fs.readFileSync(file))};}
 async function shot(name,element){await element.scrollIntoViewIfNeeded();await element.screenshot({path:path.join(folder,name)});screenshots.push(name);}
 await check('desktop-actual-clocks-solids-and-keyboard-reader',async()=>{
  await importCopy(row.importFile);await desk().getByText('阅读当前教学稿',{exact:true}).click();await reading().waitFor();
  const clocks=reading().getByRole('figure',{name:clock.title,exact:true}),shapes=reading().getByRole('figure',{name:solids.title,exact:true});
  assert.equal(await clocks.locator('svg').count(),4);assert.equal(await shapes.locator('svg').count(),4);assert(!(await clocks.innerText()).includes('7:58'));assert(!(await shapes.innerText()).includes('正方体'));
  const hand=await clocks.locator('svg').first().locator('line[x1="120"][y1="108"][stroke-width="5"]').evaluate(el=>[+el.getAttribute('x2'),+el.getAttribute('y2')]);assert.deepEqual(hand,[160,108]);
  assert.equal(await shapes.locator('svg').nth(1).locator('polygon').count(),3);assert.equal(await shapes.locator('svg').nth(2).locator('ellipse').count(),1);assert.equal(await shapes.locator('svg').nth(3).locator('radialGradient').count(),1);
  await shot('clocks-desktop.png',clocks);await shot('solids-desktop.png',shapes);
  const open=clocks.getByRole('button',{name:'放大数学图示：'+clock.title,exact:true});await open.focus();await page.keyboard.press('Enter');await page.getByRole('dialog',{name:clock.title,exact:true}).waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog',{name:clock.title,exact:true}).waitFor({state:'hidden'});assert(await open.evaluate(el=>el===document.activeElement));
 });
 await check('mobile-complete-captions-and-print-retain-models',async()=>{
  await page.setViewportSize({width:390,height:844});const shapes=reading().getByRole('figure',{name:solids.title,exact:true}),clocks=reading().getByRole('figure',{name:clock.title,exact:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await shapes.locator('.cl-math-caption').nth(1).textContent(),solids.solids[1].caption);
  assert.equal(await shapes.locator('.cl-math-models').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);await shot('clocks-mobile.png',clocks);await shot('solids-mobile.png',shapes);
  await page.emulateMedia({media:'print'});assert.equal(await shapes.locator('svg').count(),4);assert.equal(await shapes.getByRole('button',{name:'放大数学图示：'+solids.title,exact:true}).isVisible(),false);await shot('solids-print.png',shapes);await page.emulateMedia({media:'screen'});await page.setViewportSize({width:1440,height:1000});
 });
 await check('raw-invalid-input-switch-download-import-and-cold-local-recovery',async()=>{
  await desk().getByText('阅读当前教学稿',{exact:true}).click();await desk().getByRole('button',{name:'图示与演示',exact:true}).click();
  await desk().getByLabel('第1个钟面的小时',{exact:true}).fill('13');await desk().getByLabel('第1个钟面的分钟',{exact:true}).fill('-');const prior=mutations.length;
  await desk().getByRole('button',{name:'保存完整教学稿',exact:true}).click();await desk().getByText('图形数值仍有未完成输入，请修正后保存；原数值文字已保留在完整本机稿中。',{exact:true}).waitFor();assert.equal(mutations.length,prior);
  await desk().getByLabel('呈现方式',{exact:true}).first().selectOption('table');const history=desk().locator('details').filter({has:page.locator('summary').filter({hasText:'保留的原表征'})});await history.locator('summary').click();await history.getByRole('button',{name:'复制回当前稿',exact:true}).first().click();
  assert.equal(await desk().getByLabel('第1个钟面的小时',{exact:true}).inputValue(),'13');assert.equal(await desk().getByLabel('第1个钟面的分钟',{exact:true}).inputValue(),'-');
  const saved=await download('generated-math-copy.private.json');assert.equal(saved.value.rawInputs['visual:2:hour:0'],'13');assert.equal(saved.value.rawInputs['visual:2:minute:0'],'-');assert.deepEqual(saved.value.content.visuals[2].figure,clock);assert.deepEqual(saved.value.visualHistory[0].visual.figure,clock);
  await importCopy(saved.file);await desk().getByRole('button',{name:'图示与演示',exact:true}).click();assert.equal(await desk().getByLabel('第1个钟面的小时',{exact:true}).inputValue(),'13');await page.reload();await desk().getByLabel('第1个钟面的小时',{exact:true}).waitFor();assert.equal(await desk().getByLabel('第1个钟面的分钟',{exact:true}).inputValue(),'-');await shot('invalid-clock-recovered.png',desk().getByLabel('第1个钟面的小时',{exact:true}).locator('..'));
 });
 await check('shared-whiteboard-renderer-keeps-boundaries-captions-and-decodable-recording',async()=>{
  await page.addScriptTag({path:path.join(__dirname,'whiteboard-harness.js')});
  const result=await page.evaluate(async({clock,solids})=>{
   const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=1200;canvas.id='qa-math-recording';canvas.style.cssText='position:fixed;inset:0;z-index:999999;background:white;width:100%;height:100%;object-fit:contain';document.body.append(canvas);
   const context=canvas.getContext('2d'),scenes=[clock,solids].map((math,index)=>({id:'math-'+index,kind:'concept',title:math.title,narration:'先比较。再观察模型。',math,durationMs:1000,reveal:{version:'whiteboard-reveal-v1',sourceText:'先比较。再观察模型。',bulletEnds:[],exhibits:[],diagramAt:10}})),units=scenes.map(scene=>({id:scene.id,sceneId:scene.id,start:0,end:10,text:scene.narration,visibleBulletIndices:[],estimatedMs:1000}));
   const harness=window.MathBoardHarness,hidden=harness.drawTeachingFrame(context,scenes,units,{...units[0],end:4},new Map(),{font:'print',captions:false,dots:false,camera:{zoom:1,x:0,y:0,follow:false}});
   if(hidden.visiblePartIds.some(id=>id.includes(':math')))throw Error('Future model leaked');
   const shown=harness.drawTeachingFrame(context,scenes,units,units[1],new Map(),{font:'print',captions:false,dots:false,camera:{zoom:1,x:0,y:0,follow:false}});
   if(!shown.visiblePartIds.includes('math-0:math:0')||!shown.visiblePartIds.includes('math-1:math:3'))throw Error('Model missing');
   const stream=canvas.captureStream(10),recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),chunks=[];const done=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=resolve;});recorder.start();await new Promise(r=>setTimeout(r,1000));recorder.stop();await done;stream.getTracks().forEach(track=>track.stop());
   const blob=new Blob(chunks,{type:'video/webm'}),url=URL.createObjectURL(blob),video=document.createElement('video');video.muted=true;video.src=url;await new Promise((yes,no)=>{video.onloadeddata=yes;video.onerror=()=>no(Error('Recording decode failed'));});const decoded={width:video.videoWidth,height:video.videoHeight,ready:video.readyState};URL.revokeObjectURL(url);
   return{parts:shown.visiblePartIds,layout:shown.blocks.map(block=>({id:block.id,height:block.height,parts:block.parts.map(part=>({id:part.id,y:part.y,height:part.height,lines:part.kind==='text'?part.lines:undefined}))})),recording:Array.from(new Uint8Array(await blob.arrayBuffer())),decoded};
  },{clock,solids});
  assert.equal(result.decoded.width,1280);assert.equal(result.decoded.height,1200);assert(result.recording.length>2000);assert(result.layout[1].parts.some(part=>part.lines?.join('').includes('完整长图注')));
  fs.writeFileSync(path.join(folder,'generated-math-recording.webm'),Buffer.from(result.recording),{flag:'wx'});delete result.recording;fs.writeFileSync(path.join(folder,'recording-readback.json'),JSON.stringify(result,null,2),{flag:'wx'});await shot('whiteboard-shared-models.png',page.locator('#qa-math-recording'));await page.locator('#qa-math-recording').evaluate(el=>el.remove());
 });
 await check('preview-and-invalid-save-create-no-publication-or-learner-facts',async()=>{assert.deepEqual(await facts(),before);assert.deepEqual(mutations,[]);assert.deepEqual(errors,[]);});
 await check('actual-http-exact-command-replay-and-independent-cold-read',async()=>{
  const body=row.body,source=body.source;const input={action:'save',packageId:'qa:math-figures-http',requestKey:'qa:math-figures-http-original',expectedRevision:0,basedOn:null,source:Object.fromEntries(['bookId','bookVersion','lessonId','sourceBookId','sourceSha256','extractedSha256','lessonFingerprint','editionProofFingerprint','pageStart','pageEnd'].filter(key=>source[key]!==undefined).map(key=>[key,source[key]])),sourceFingerprint:source.fingerprint,targetRefs:body.targetRefs,sourceReview:body.sourceReview,content:body.content};
  const first=await api('POST','/admin/curriculum/teaching-packages/commands',input),replay=await api('POST','/admin/curriculum/teaching-packages/commands',input),lookup=await api('GET','/admin/curriculum/teaching-packages/commands/'+encodeURIComponent(input.requestKey));assert.deepEqual(replay,first);assert.deepEqual(lookup.input,input);assert.deepEqual(lookup.result,first);
  const detail=await api('GET','/admin/curriculum/teaching-packages/'+encodeURIComponent(input.packageId));assert.deepEqual(detail.version.body.content.visuals,body.content.visuals);assert.equal(detail.version.report.publishable,false);assert.equal(detail.header.status,'draft');
  await browser.close();browser=null;await app.close();app=null;const Reader=load('infrastructure/domain-database').DomainDatabase,cold=new Reader(path.join(data,'study-agent.sqlite3'));await cold.open();let actual;try{actual=(await cold.read()).state;}finally{await cold.close();}
  assert.deepEqual(actual.textbookTeachingCommands.find(command=>command.requestKey===input.requestKey).input,input);assert.deepEqual(actual.textbookTeachingVersions.find(version=>version.packageId===input.packageId).body.content.visuals,body.content.visuals);assert.equal(actual.diagnosticResponses?.length??0,0);assert.equal(actual.classroomSessions?.length??0,0);
  fs.writeFileSync(path.join(folder,'http-cold-read.json'),JSON.stringify({passed:true,exactOriginalCommandAndReplay:true,fullMathModelsPreserved:true,schema:37,published:0,studentResponses:0,teacherAcceptance:false},null,2),{flag:'wx'});
 });
