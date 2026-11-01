const fs=require('node:fs'),path=require('node:path');const f=path.join(__dirname,'sync-legacy-family-batch.cjs');let s=fs.readFileSync(f,'utf8');
const from="if(head&&(!fs.existsSync(target)||norm(fs.readFileSync(target))!==norm(head)))throw Error('Isolated copy diverged from HEAD: '+path.relative(root,target));";
const to="const current=norm(fs.readFileSync(path.join(root,row.file)));if(head&&(!fs.existsSync(target)||![norm(head),current].includes(norm(fs.readFileSync(target)))))throw Error('Isolated copy diverged from HEAD and main: '+path.relative(root,target));";
if(s.split(from).length!==2)throw Error('match');fs.writeFileSync(f,s.replace(from,to));console.log('rule updated');
