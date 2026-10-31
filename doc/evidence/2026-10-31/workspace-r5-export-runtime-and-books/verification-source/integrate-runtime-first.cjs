const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{execFileSync}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const qa=__dirname,root=path.resolve(qa,'../../..'),candidate=path.join(root,'data/qa/p166'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const accepted=JSON.parse(fs.readFileSync(path.join(qa,'delivery-second.json'))),before=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(qa,'source-before-first.json.gz'))));
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(head!==accepted.baseMain||execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()||accepted.source.length!==16||!accepted.runtime.available||accepted.applicationExportImplemented||accepted.schema32Registered)throw Error('Exact clean main and actual bounded candidate proof required');
const protection=JSON.parse(fs.readFileSync(path.join(root,'data/qa/workspace-adult-models-first-20261031/adult165-main-protection-third.json')));
for(const row of protection.files)if(sha(fs.readFileSync(path.join(root,row.path)))!==row.sha256)throw Error('Protected runtime changed');
const db=new DatabaseSync(path.join(root,'data/study-agent.sqlite3'),{readOnly:true});let formal;
try{formal={schema:db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version,revision:db.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision};}finally{db.close();}
if(JSON.stringify(formal)!==JSON.stringify(protection.formal))throw Error('Formal database metadata changed');
const changes=[],unchanged=[];
for(const row of accepted.source){
 const bytes=fs.readFileSync(path.join(candidate,row.path)),target=path.join(root,row.path),original=before.files.find(file=>file.path===row.path);
 if(sha(bytes)!==row.sha256)throw Error('Accepted candidate changed');
 if(original){if(!fs.existsSync(target)||sha(fs.readFileSync(target))!==original.sha256)throw Error('Main source changed');}
 else if(fs.existsSync(target))throw Error('New source destination already exists');
 if(original&&original.sha256===row.sha256)unchanged.push(row);
 else changes.push({...row,previousSha256:original?.sha256??null});
}
if(changes.length!==13||unchanged.length!==3)throw Error('Unexpected source integration scope');
for(const row of changes){const target=path.join(root,row.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,fs.readFileSync(path.join(candidate,row.path)),{flag:row.previousSha256?'w':'wx'});if(sha(fs.readFileSync(target))!==row.sha256)throw Error('Independent source readback failed');}
const result={at:new Date().toISOString(),baseMain:head,changes,unchanged,formalReadOnly:formal,protectedFiles:protection.files.length,allProtectedUnchanged:true,applicationExportImplemented:false,schema32Registered:false,goal:'active'};
fs.writeFileSync(path.join(qa,'source-integration-first.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({changed:changes.length,unchanged:unchanged.length,formal,protectedFiles:protection.files.length,goal:'active'}));
