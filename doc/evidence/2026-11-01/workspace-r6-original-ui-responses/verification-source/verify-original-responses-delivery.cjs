const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),label=process.argv[2],staged=process.argv[3]==='staged',sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
if(!/^[a-z0-9-]+$/.test(label||'')||fs.existsSync(path.join(__dirname,label+'.json')))throw Error('New verification label required');
const directories=['doc/evidence/2026-11-01/workspace-r6-original-ui-responses'],files=[],findings=[];
function walk(relative){for(const row of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){const file=relative+'/'+row.name;if(row.isSymbolicLink())throw Error('No archive links');if(row.isDirectory())walk(file);else files.push(file);}}
directories.forEach(walk);
const rules=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['jwt-value',/eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/],['bearer-value',/Bearer [A-Za-z0-9_.-]{25,}/],['remote-database-url',/postgres(?:ql)?:\/\/[^\s'"`]+:[^\s'"`]+@/],['api-key-value',/\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}/]];
let decodedGzip=0,decodedBase64=0,decodedCharacters=0;
function inspect(bytes,origin,depth=0){if(depth>12)throw Error('Unexpected nested archive depth');if(bytes[0]===31&&bytes[1]===139){decodedGzip++;return inspect(zlib.gunzipSync(bytes),origin+'!gzip',depth+1);}if(bytes[0]===137&&bytes.subarray(1,4).toString()==='PNG')return;
 const text=bytes.toString('utf8');decodedCharacters+=text.length;for(const[name,pattern]of rules)if(pattern.test(text))findings.push({origin,rule:name});
 let json;try{json=JSON.parse(text);}catch{return;}
 function values(value,location){if(!value||typeof value!=='object')return;if(!Array.isArray(value)&&typeof value.base64==='string'){const decoded=Buffer.from(value.base64,'base64');if(value.sha256&&sha(decoded)!==value.sha256)throw Error('Archived source digest mismatch: '+origin);decodedBase64++;inspect(decoded,origin+'!'+(value.path??location),depth+1);}for(const[key,child]of Object.entries(value))if(key!=='base64')values(child,location+'/'+key);}
 values(json,'');
}
for(const file of files){if(/(?:^|\/)\w*\.?private(?:\.|\/)/i.test(file))findings.push({origin:file,rule:'private-file-name'});inspect(fs.readFileSync(path.join(root,file)),file);}
const protection=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'data/qa/workspace-teaching-package-first-20261101/preparation-first.json.gz')))),changed=protection.protectedFiles.filter(row=>sha(fs.readFileSync(path.join(root,row.path)))!==row.sha256).map(row=>row.path);
const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(path.join(root,'data/study-agent.sqlite3'),{readOnly:true});let formal;try{formal={schema:db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v,revision:db.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision};}finally{db.close();}
const stagedMismatches=[];if(staged)for(const file of files){const result=spawnSync('git',['show',':'+file],{cwd:root,maxBuffer:20*1024*1024});if(result.status||sha(result.stdout)!==sha(fs.readFileSync(path.join(root,file))))stagedMismatches.push(file);}
const report={at:new Date().toISOString(),archiveFiles:files.length,decodedGzip,decodedBase64,decodedCharacters,credentialFindings:findings,protectedFiles:protection.protectedFiles.length,changedProtectedFiles:changed,formal,stagedByteReadback:staged,stagedMismatches,scope:'Original-plan and original-response UI archive only; generated QA screenshots visually reviewed separately.'};
fs.writeFileSync(path.join(__dirname,label+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(findings.length||changed.length||stagedMismatches.length||formal.schema!==24||formal.revision!==187)process.exitCode=1;
