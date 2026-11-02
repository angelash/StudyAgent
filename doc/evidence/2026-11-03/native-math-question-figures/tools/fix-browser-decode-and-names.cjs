const fs=require('fs'),path=require('path'),assert=require('assert/strict');const file=path.join(__dirname,'browser-run.cjs');let text=fs.readFileSync(file,'utf8');
for(const[old,next]of [
 ['selected.push({id:q.id,slug,suffix,task,document})','selected.push({id:q.id,slug,suffix,position,task,document})'],
 ["row.slug+':'+row.suffix,async()","row.slug+':'+row.suffix+':'+row.position,async()"],
 ["const name=row.slug+'-'+row.suffix+'-desktop.png'","const name=row.slug+'-'+row.suffix+'-'+row.position+'-desktop.png'"],
 ["assert.equal(await images.count(),row.task.blocks.length);assert.equal(await images.evaluateAll","assert.equal(await images.count(),row.task.blocks.length);await images.evaluateAll(nodes=>Promise.all(nodes.map(img=>img.decode())));assert.equal(await images.evaluateAll"],
 ["assert.equal(await content.locator('img').count(),4);await content.getByRole","assert.equal(await content.locator('img').count(),4);await content.locator('img').evaluateAll(nodes=>Promise.all(nodes.map(img=>img.decode())));await content.getByRole"],
 ["const recovered=await open(row);assert.equal","const recovered=await open(row);await recovered.locator('img').evaluateAll(nodes=>Promise.all(nodes.map(img=>img.decode())));assert.equal"],
 ["await print.locator('img').first().waitFor();assert.equal","await print.locator('img').first().waitFor();await print.locator('img').evaluateAll(nodes=>Promise.all(nodes.map(img=>img.decode())));assert.equal"]
 ]){assert(text.includes(old),old);text=text.replace(old,next);}fs.writeFileSync(file,text);
