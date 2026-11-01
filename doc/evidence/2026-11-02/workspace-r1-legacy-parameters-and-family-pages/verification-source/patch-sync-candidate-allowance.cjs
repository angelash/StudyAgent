const fs=require('node:fs'),path=require('node:path');const f=path.join(__dirname,'sync-legacy-family-batch.cjs');let s=fs.readFileSync(f,'utf8');
const from="if(head&&(!fs.existsSync(target)||![norm(head),current].includes(norm(fs.readFileSync(target)))))";
const to="const candidateRecord=JSON.parse(fs.readFileSync(path.join(__dirname,'data-page-candidate-before.json'))),allowed=row.file===candidateRecord.path?[norm(Buffer.from(candidateRecord.base64,'base64'))]:[];if(head&&(!fs.existsSync(target)||![norm(head),current,...allowed].includes(norm(fs.readFileSync(target)))))";
if(s.split(from).length!==2)throw Error('match');fs.writeFileSync(f,s.replace(from,to));console.log('candidate allowance added');
