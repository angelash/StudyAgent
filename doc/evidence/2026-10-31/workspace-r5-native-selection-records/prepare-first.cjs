const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),previous=path.join(root,'data/qa/p166'),target=path.join(root,'data/qa/p168'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(!head.startsWith('3e31aebb')||execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()||fs.existsSync(target))throw Error('Expected committed protocol and fresh source');
const old=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'data/qa/workspace-selected-exports-first-20261031/export166-source-preparation-first.json.gz'))));
const tracked=new Set(execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).split('\0').filter(Boolean));
const selected=new Set([...old.inputs.map(row=>row.path),...[...tracked].filter(file=>/^(apps|packages|resources|scripts|tests\/e2e)\//.test(file)||['package.json','package-lock.json','tsconfig.base.json','playwright.config.ts'].includes(file))]);
const files=[];
for(const file of [...selected].sort()){
 if(file.includes('..')||/(^|\/)(\.env[^/]*|credentials.json|node_modules|\.next[^/]*)(\/|$)/.test(file))throw Error('Private or generated input');
 const source=path.join(tracked.has(file)?root:previous,file),bytes=fs.readFileSync(source),destination=path.join(target,file);
 fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes,{flag:'wx'});if(sha(fs.readFileSync(destination))!==sha(bytes))throw Error('Copy readback failed');files.push({path:file,sha256:sha(bytes),bytes:bytes.length});
}
const dependencies=path.join(target,'node_modules'),shared=path.join(previous,'node_modules'),links=[];fs.mkdirSync(dependencies);
for(const item of fs.readdirSync(shared,{withFileTypes:true})){
 if(item.name==='@study-agent'||item.name.startsWith('.')&&item.name!=='.bin')continue;
 const from=fs.realpathSync(path.join(shared,item.name));if(!fs.statSync(from).isDirectory())continue;const link=path.join(dependencies,item.name);fs.symlinkSync(from,link,'junction');links.push({path:path.relative(root,link),target:from});
}
fs.mkdirSync(path.join(dependencies,'@study-agent'));for(const name of ['config','contracts']){const from=path.join(target,'packages',name),link=path.join(dependencies,'@study-agent',name);fs.symlinkSync(from,link,'junction');links.push({path:path.relative(root,link),target:from});}
fs.writeFileSync(path.join(__dirname,'source-preparation-first.json.gz'),zlib.gzipSync(JSON.stringify({head,target:path.relative(root,target),files,links,schema:31,schema32Registered:false,formalRuntimeCopied:false})),{flag:'wx'});
console.log(JSON.stringify({head,files:files.length,dependencyLinks:links.length,target:'data/qa/p168',schema:31}));
