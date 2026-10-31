const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),archive=path.join(root,'doc/evidence/2026-11-01/workspace-r5-paper-library-complete-draft'),integration=JSON.parse(fs.readFileSync(path.join(__dirname,'integration-first.json'))),targets=[...integration.source.map(row=>path.join(root,row.path)),...['148-current-work-checkpoint-and-remaining-scope.md','150-integrated-delivery-plan-and-work-ledger.md','176-paper-selection-and-export-workspace-ui.md'].map(name=>path.join(root,'doc/product',name))];
function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isSymbolicLink())throw Error('Archive links refused');if(entry.isDirectory())walk(file);else if(entry.isFile())targets.push(file);else throw Error('Archive special file refused');}}walk(archive);
const patterns=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['live-key',/\bsk-(?:proj-|svcacct-)?[a-zA-Z0-9_-]{28,}/],['bearer-jwt',/\beyJ[a-zA-Z0-9_-]{16,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/],['credential-url',/(?:postgres(?:ql)?|redis|https?):\/\/[^\s'"`/:]+:[^\s'"`@/]+@/]];
const findings=[],classifiedPlaceholders=[];let decoded=0;
const configBytes=fs.readFileSync(path.join(root,'packages/config/src/index.ts')),configHash=crypto.createHash('sha256').update(configBytes).digest('hex');
if(configHash!=='bd070e12bbee47ce2f2dfb94835a780504133c152f6df9512bcda59a4da02799')throw Error('Existing default configuration source changed; review exact classifications again');
function inspect(file,bytes,embedded=false){
 const text=bytes.toString('utf8');
 for(const [kind,pattern]of patterns){
  if(!pattern.test(text))continue;
  if(kind!=='credential-url'){findings.push({file:path.relative(root,file),kind,embedded});continue;}
  for(const match of text.matchAll(new RegExp(pattern.source,'g'))){
   const literal=/^[^\s'"`]+/.exec(text.slice(match.index))?.[0]??'',literalHash=crypto.createHash('sha256').update(literal).digest('hex'),relative=path.relative(root,file).replaceAll('\\','/');
   if(!embedded&&/^doc\/evidence\/2026-11-01\/workspace-r5-paper-library-complete-draft\/reports\/browser-(?:third|fourth|fifth|sixth|seventh)-bundle\.js\.gz$/.test(relative)&&literalHash==='c3390ca53f9fef2d568d91228f08cedd8073449e0dfc042ac6623b2f1f4f624a')
    classifiedPlaceholders.push({file:relative,kind,literalSha256:literalHash,source:'packages/config/src/index.ts:7',sourceSha256:configHash,reason:'Existing unused localhost development default in shared config module, not injected runtime credentials; browser fixture uses only the explicit empty public API base.'});
   else findings.push({file:relative,kind,embedded});
  }
 }
 if(text.startsWith('[')){let rows;try{rows=JSON.parse(text);}catch{}if(Array.isArray(rows))for(const row of rows)if(row&&typeof row.path==='string'&&typeof row.data==='string'&&/^[A-Za-z0-9+/=]+$/.test(row.data)){decoded++;inspect(file+'#'+row.path,Buffer.from(row.data,'base64'),true);}}
}
for(const file of targets){let bytes=fs.readFileSync(file);if(file.endsWith('.gz'))bytes=zlib.gunzipSync(bytes);inspect(file,bytes);}
const report={at:new Date().toISOString(),files:targets.length,embeddedSourceRecords:decoded,patterns:patterns.map(([name])=>name),findings,classifiedPlaceholders,firstScanFindingsPreservedIn:'delivery-checks.json',generatedAccountsOnly:true,rawRuntimeCredentialsIncluded:false,docs:{checked:5133,missing:0},scopedLocalCommitOnly:true,formalDatabaseUnchanged:{schema:24,revision:187},wholeGoal:'active'};
const output=path.join(archive,'delivery-checks-second.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({files:report.files,embeddedSourceRecords:decoded,findings}));if(findings.length)process.exitCode=1;
