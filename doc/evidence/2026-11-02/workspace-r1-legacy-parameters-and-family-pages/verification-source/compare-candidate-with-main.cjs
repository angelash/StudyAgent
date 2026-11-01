// Lists every tracked file whose isolated candidate or Web source differs from main HEAD after line-ending normalization.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),trees={p187:path.join(root,'data/qa/p187'),source:path.join(__dirname,'source')};
const norm=b=>crypto.createHash('sha256').update(Buffer.from(b.toString('latin1').replace(/\r\n/g,'\n'),'latin1')).digest('hex');
const tracked=execFileSync('git',['ls-files','apps/web/app','apps/web/components','apps/web/lib','apps/api/src','packages/contracts/src','tests/e2e','scripts/qa','resources/curriculum'],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}).split('\n').filter(Boolean);
const dirty=new Set(execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:root,encoding:'utf8'}).split('\n').filter(Boolean).map(line=>line.slice(3).trim()));
const result={tracked:tracked.length,differs:{p187:[],source:[]},missing:{p187:[],source:[]}};
for(const file of tracked){const head=norm(execFileSync('git',['show','HEAD:'+file],{cwd:root,maxBuffer:64*1024*1024})),main=norm(fs.readFileSync(path.join(root,file)));
  for(const[name,tree]of Object.entries(trees)){if(name==='source'&&!/^(apps\/web|packages)/.test(file))continue;const target=path.join(tree,file);
    if(!fs.existsSync(target)){result.missing[name].push(file);continue;}const value=norm(fs.readFileSync(target));
    if(value!==head&&!(dirty.has(file)&&value===main))result.differs[name].push(file);}}
console.log(JSON.stringify(result,null,1));
