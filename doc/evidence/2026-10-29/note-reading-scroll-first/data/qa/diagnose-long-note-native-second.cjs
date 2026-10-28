const { chromium }=require('@playwright/test'); const fs=require('node:fs');
(async()=>{const browser=await chromium.launch({headless:true});const rows=[];try{
 for(const config of [{font:'sans-serif',spellcheck:false},{font:'monospace',spellcheck:false},{font:'sans-serif',spellcheck:true,ascii:true}]){
  const page=await browser.newPage(); await page.setContent('<textarea aria-label="synthetic" style="width:800px;height:250px;font:14px/1.6 '+config.font+'" spellcheck="'+config.spellcheck+'"></textarea>');
  const text=(config.ascii?'Complete.\n':'全文保留，不截断。\n').repeat(3100)+'完整末尾_MARKER',start=Date.now();
  try{await page.getByLabel('synthetic').fill(text,{timeout:15000});rows.push({...config,ms:Date.now()-start,success:true});}catch(e){rows.push({...config,ms:Date.now()-start,success:false,error:e.message.split('\n')[0]});}
  rows.at(-1).characters=(await page.getByLabel('synthetic').inputValue()).length; await page.close();
 }
}finally{await browser.close();} fs.writeFileSync('data/qa/diagnose-long-note-native-second.json',JSON.stringify(rows,null,2)+'\n',{flag:'wx'}); console.log(JSON.stringify(rows));})().catch(e=>{console.error(e);process.exitCode=1;});
