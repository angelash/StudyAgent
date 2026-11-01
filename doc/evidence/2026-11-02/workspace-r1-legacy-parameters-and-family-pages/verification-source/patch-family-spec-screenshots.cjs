const fs=require('node:fs'),path=require('node:path');const f=path.resolve(__dirname,'../../../tests/e2e/workspace-family-pages.spec.ts');let s=fs.readFileSync(f,'utf8');
const edits=[["async function phoneLayout(page: Page) {\n","async function phoneLayout(page: Page, name: string) {\n  await test.info().attach(name + '-desktop', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });\n"],
["expect(state.mains).toBe(1);\n","expect(state.mains).toBe(1);\n  await test.info().attach(name + '-phone', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });\n"],
["  await phoneLayout(page);\n  await page.getByLabel('孩子的档案')","  await phoneLayout(page, 'authorization');\n  await page.getByLabel('孩子的档案')"],
["  await phoneLayout(page);\n  const scope","  await phoneLayout(page, 'data-management');\n  const scope"]];
for(const[from,to]of edits){const n=s.split(from).length-1;if(n!==1)throw Error('expected one match, found '+n+': '+from.slice(0,50));s=s.replace(from,to);}fs.writeFileSync(f,s);console.log('screenshots attached');
