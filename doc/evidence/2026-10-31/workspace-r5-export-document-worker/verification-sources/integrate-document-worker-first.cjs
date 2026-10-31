const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{execFileSync}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const qa=__dirname,root=path.resolve(qa,'../../..'),candidate=path.join(root,'data/qa/p166');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(head!=='adf91e27376aafb2a1553f074e70aefa348e8f08'||execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim())throw Error('Exact clean main required before bounded source integration');
const accepted=JSON.parse(fs.readFileSync(path.join(qa,'document-worker-ninth-acceptance.json')));
if(accepted.finalRun!=='generator-ninth'||accepted.unitTests.failed||accepted.boundaries.failed||accepted.applicationExportImplemented||accepted.schema32Registered)throw Error('Actual bounded proof required');
const files=accepted.source.map(row=>row.path).concat('scripts/processing/requirements-paper-export.txt');
const protection=JSON.parse(fs.readFileSync(path.join(root,'data/qa/workspace-adult-models-first-20261031/adult165-main-protection-third.json')));
for(const file of protection.files)if(sha(fs.readFileSync(path.join(root,file.path)))!==file.sha256)throw Error('Protected runtime changed');
const db=new DatabaseSync(path.join(root,'data/study-agent.sqlite3'),{readOnly:true});let formal;
try{formal={schema:db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version,revision:db.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision};}finally{db.close();}
if(JSON.stringify(formal)!==JSON.stringify(protection.formal))throw Error('Formal metadata changed');
const copies=[];
for(const file of files){
 const source=path.join(candidate,file),target=path.join(root,file),bytes=fs.readFileSync(source),expected=accepted.source.find(row=>row.path===file);
 if(!file.startsWith('scripts/processing/')||fs.existsSync(target)||(expected&&sha(bytes)!==expected.sha256))throw Error('Source changed or destination not new: '+file);
 copies.push({path:file,bytes:bytes.length,sha256:sha(bytes)});
}
for(const row of copies){fs.writeFileSync(path.join(root,row.path),fs.readFileSync(path.join(candidate,row.path)),{flag:'wx'});if(sha(fs.readFileSync(path.join(root,row.path)))!==row.sha256)throw Error('Readback failed');}
fs.writeFileSync(path.join(qa,'worker-source-integration-first.json'),JSON.stringify({at:new Date().toISOString(),baseMain:head,files:copies,protectedFiles:protection.files.length,allProtectedUnchanged:true,formal,application:false,schema32Registered:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({newSourceFiles:copies.length,protectedFiles:protection.files.length,formal,schema32Registered:false}));
