// Waits for the client to show the lost first reply before checking the held server receipt.
const fs=require('node:fs'),path=require('node:path');
const f=path.join(__dirname,'inspect-original-responses.cjs');
const s=fs.readFileSync(f,'utf8');
const from="await studentPage.getByRole('button',{name:'提交，下一步 →',exact:true}).click();await expect(studentPage.getByRole('button',{name:'核对原提交',exact:true})).toBeEnabled({timeout:15000});expect(held).toBeTruthy();";
const to="await studentPage.getByRole('button',{name:'提交，下一步 →',exact:true}).click();await expect(studentPage.getByText('提交尚待核对：',{exact:false}).first()).toBeVisible({timeout:30000});await expect(studentPage.getByRole('button',{name:'核对原提交',exact:true})).toBeEnabled({timeout:15000});expect(held).toBeTruthy();";
const count=s.split(from).length-1;if(count!==1)throw Error('Expected one lost-reply wait, found '+count);
fs.writeFileSync(f,s.replace(from,to));console.log('patched lost-reply wait');
