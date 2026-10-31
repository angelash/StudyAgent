const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{execFileSync}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const qa=__dirname,root=path.resolve(qa,'../../..'),candidate=path.join(root,'data/qa/p168'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const preparation=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(qa,'source-preparation-first.json.gz'))));
const accepted=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(qa,'source-third.json.gz'))));
const regression=JSON.parse(fs.readFileSync(path.join(qa,'library-regression-fourth.json')));
if(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==preparation.head||execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()||accepted.files.length!==10||regression.numPassedTests!==81||regression.numFailedTests!==0||regression.numPendingTests!==1)throw Error('Exact clean baseline and actual regression required');
const protection=JSON.parse(fs.readFileSync(path.join(root,'data/qa/workspace-adult-models-first-20261031/adult165-main-protection-third.json')));
for(const row of protection.files)if(sha(fs.readFileSync(path.join(root,row.path)))!==row.sha256)throw Error('Protected runtime changed');
const db=new DatabaseSync(path.join(root,'data/study-agent.sqlite3'),{readOnly:true}),formal={schema:db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version,revision:db.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision};db.close();
if(JSON.stringify(formal)!==JSON.stringify(protection.formal))throw Error('Formal metadata changed');
const changes=[];
for(const row of accepted.files){
 const bytes=fs.readFileSync(path.join(candidate,row.path)),target=path.join(root,row.path),before=preparation.files.find(item=>item.path===row.path);
 if(sha(bytes)!==row.sha256||before&&sha(fs.readFileSync(target))!==before.sha256||!before&&fs.existsSync(target))throw Error('Exact source changed');
 changes.push({...row,previousSha256:before?.sha256??null});
}
for(const row of changes){const target=path.join(root,row.path),bytes=Buffer.from(row.utf8);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:row.previousSha256?'w':'wx'});if(sha(fs.readFileSync(target))!==row.sha256)throw Error('Independent source readback failed');}
fs.writeFileSync(path.join(qa,'selection-integration-first.json'),JSON.stringify({at:new Date().toISOString(),head:preparation.head,changes:changes.map(({utf8,...row})=>row),formal,protectedFiles:protection.files.length,allProtectedUnchanged:true,schema32Registered:false,applicationRoutesRegistered:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({changed:changes.length,formal,protectedFiles:protection.files.length,schema32Registered:false,applicationRoutesRegistered:false}));
