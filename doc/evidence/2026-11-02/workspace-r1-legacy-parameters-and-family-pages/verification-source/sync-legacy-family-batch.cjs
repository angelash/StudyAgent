// Copies this batch's main changes into the isolated API candidate and Web source after checking both still match HEAD.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),candidate=path.join(root,'data/qa/p187'),web=path.join(__dirname,'source');
const norm=b=>crypto.createHash('sha256').update(Buffer.from(b.toString('latin1').replace(/\r\n/g,'\n'),'latin1')).digest('hex');
const rows=execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:root,encoding:'utf8'}).split('\n').filter(Boolean).map(line=>({state:line.slice(0,2),file:line.slice(3).trim()})).filter(row=>/^(apps\/web\/|tests\/e2e\/)/.test(row.file));
const copied=[];
for(const row of rows){const head=row.state.includes('?')?null:execFileSync('git',['show','HEAD:'+row.file],{cwd:root});
  for(const tree of [candidate,...(row.file.startsWith('apps/web/')?[web]:[])]){const target=path.join(tree,row.file);
    const current=norm(fs.readFileSync(path.join(root,row.file)));const candidateRecord=JSON.parse(fs.readFileSync(path.join(__dirname,'data-page-candidate-before.json'))),allowed=row.file===candidateRecord.path?[norm(Buffer.from(candidateRecord.base64,'base64'))]:[];if(head&&(!fs.existsSync(target)||![norm(head),current,...allowed].includes(norm(fs.readFileSync(target)))))throw Error('Isolated copy diverged from HEAD and main: '+path.relative(root,target));
    if(!head&&fs.existsSync(target)&&norm(fs.readFileSync(target))!==norm(fs.readFileSync(path.join(root,row.file))))throw Error('Unexpected existing new file: '+path.relative(root,target));
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,row.file),target);copied.push(path.relative(root,target).replace(/\\/g,'/'));}}
console.log(JSON.stringify({files:rows.length,copied:copied.length,list:rows.map(row=>row.state.trim()+' '+row.file)},null,1));
