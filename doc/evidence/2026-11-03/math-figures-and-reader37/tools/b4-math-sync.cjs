const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=process.cwd(),candidate=path.join(root,'data/qa/p187'),label=process.argv[2];
if(!/^[a-z0-9-]+$/.test(label||''))throw Error('New label required');
const report=path.join(root,'data/qa/block-four-math-figures-first',label+'.json');if(fs.existsSync(report))throw Error('Do not overwrite');
const norm=b=>crypto.createHash('sha256').update(b.toString('utf8').replace(/\r\n/g,'\n')).digest('hex');
const prior=fs.readdirSync(path.dirname(report)).filter(f=>/^sync-.*\.json$/.test(f)).flatMap(f=>JSON.parse(fs.readFileSync(path.join(path.dirname(report),f))).rows??[]);
const files=[...new Set([...cp.execFileSync('git',['diff','--name-only','HEAD'],{encoding:'utf8'}).split('\n'),...cp.execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).split('\n'),
 'resources/compatibility/math-before-figures-schema36-reader-v1.json.gz','resources/compatibility/math-before-figures-schema36-reader-v1.receipt.json'])].filter(f=>/^(apps|packages|scripts|resources|tests)\//.test(f));
const rows=files.map(file=>{const target=path.join(candidate,file),bytes=fs.readFileSync(path.join(root,file)),binary=file.endsWith('.gz');let head=null;
 try{head=cp.execFileSync('git',['show','HEAD:'+file],{stdio:['ignore','pipe','ignore']});}catch{}
 if(fs.existsSync(target)){const actual=fs.readFileSync(target),known=prior.some(row=>row.file===file&&row.sha256===crypto.createHash('sha256').update(actual).digest('hex'));if(!known&&(binary?!actual.equals(bytes):![norm(bytes),...(head?[norm(head)]:[])].includes(norm(actual))))throw Error('Candidate diverges: '+file);}
 return {file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};});
for(const row of rows){const target=path.join(candidate,row.file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,row.file),target);if(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')!==row.sha256)throw Error('Readback failed');}
fs.writeFileSync(report,JSON.stringify({at:new Date().toISOString(),source:'main',target:'data/qa/p187',rows},null,2),{flag:'wx'});console.log(JSON.stringify({synced:rows.length,report:path.relative(root,report)}));
