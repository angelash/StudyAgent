const {chromium}=require('@playwright/test');const fs=require('node:fs');
(async()=>{const browser=await chromium.launch({headless:true});let page,original;const rows=[];try{
 const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});page=await context.newPage();
 await page.route('http://localhost:3129/owned-synthetic-paste',r=>r.fulfill({contentType:'text/html',body:'<textarea aria-label="synthetic" style="width:800px;height:250px;font:14px/1.6 sans-serif"></textarea>'}));
 await page.goto('http://localhost:3129/owned-synthetic-paste');
 original=await page.evaluate(()=>navigator.clipboard.readText());
 const text='全文保留，不截断。\n'.repeat(3100)+'完整末尾_MARKER';
 await page.evaluate(t=>navigator.clipboard.writeText(t),text);await page.getByLabel('synthetic').focus();const start=Date.now();await page.keyboard.press('ControlOrMeta+V');
 const value=await page.getByLabel('synthetic').inputValue();rows.push({method:'actual native clipboard paste',ms:Date.now()-start,characters:value.length,complete:value===text});
}finally{if(page&&original!==undefined)await page.evaluate(t=>navigator.clipboard.writeText(t),original);await browser.close();}
fs.writeFileSync('data/qa/diagnose-long-note-native-paste-third.json',JSON.stringify(rows,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(rows));})().catch(e=>{console.error(e);process.exitCode=1;});
