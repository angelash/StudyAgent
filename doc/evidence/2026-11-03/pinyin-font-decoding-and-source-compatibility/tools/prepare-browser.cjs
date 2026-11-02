const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const root=path.resolve(__dirname,'../../..');let s=fs.readFileSync(path.join(root,'data/qa/b4-chinese-g1-source-first/browser-run.cjs'),'utf8');
const marker=" const last=imports.find(row=>row.file==='chinese-g3-carrot-v1.json')??imports[0];";assert(s.includes(marker));
const hook=`
 await check('normalized-pinyin-tone-source-renders-in-original-workbench',async()=>{
  const book=registry.books.find(b=>b.id==='archive-book:chinese-g1-upper-a692a990d41b6291'),extraction=JSON.parse(fs.readFileSync(path.join(root,'data/assets/textbook-sources/chinatextbook-chinese-v1/extracted/chinatextbook-chinese-g1-upper-tone-9d4c9c93727eadcf.json')));
  for(const [entry,start,end] of [[1,25,26],[2,27,28]]){
   const href='/admin/curriculum?'+new URLSearchParams({subject:'chinese',grade:'1',term:'upper',textbook:book.id,textbookVersion:book.version,textbookLesson:book.id+':chapter3:entry'+entry});await page.goto(origin+href);
   await desk().getByRole('button',{name:'来源与引用',exact:true}).click();await desk().getByLabel('PDF物理起始页',{exact:true}).fill(String(start));await desk().getByLabel('PDF物理结束页',{exact:true}).fill(String(end));
   const response=page.waitForResponse(r=>r.url().endsWith('/teaching-packages/source-preview')&&r.request().method()==='POST');await desk().getByRole('button',{name:'核对这个完整范围',exact:true}).click();assert.equal((await response).status(),201);
   const adopt=desk().getByRole('button',{name:'采用新来源另开本机稿',exact:true});if(await adopt.isVisible())await adopt.click();
   const target=entry===1?26:27;await desk().getByRole('combobox',{name:/^逐页核对/}).selectOption(String(target));const text=desk().getByLabel('PDF物理页'+target+'完整提取文字',{exact:true});await text.waitFor();assert.equal(await text.textContent(),extraction.pages[target-1].text);
   await page.evaluate(()=>document.fonts.ready);await text.scrollIntoViewIfNeeded();const desktop='pinyin-source-'+target+'-desktop.png';await text.screenshot({path:path.join(folder,desktop)});screenshots.push(desktop);
   await page.setViewportSize({width:390,height:844});await text.scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await new Promise(r=>setTimeout(r,250));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const mobile='pinyin-source-'+target+'-mobile.png';await text.screenshot({path:path.join(folder,mobile)});screenshots.push(mobile);await page.setViewportSize({width:1440,height:1000});
  }
 });
`;
s=s.replace(marker,hook+marker);fs.writeFileSync(path.join(__dirname,'browser-run.cjs'),s,{flag:'wx'});
