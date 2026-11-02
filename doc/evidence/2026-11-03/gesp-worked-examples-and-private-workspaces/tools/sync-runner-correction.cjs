const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),qa=path.join(root,'data/qa/p187'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const changes=['scripts/gesp/run_submission.cjs','scripts/qa/verify-gesp-concurrent-workspaces.cjs','apps/api/src/modules/gesp/isolated-runner.test.ts','apps/api/src/modules/gesp/gesp.integration.test.ts'];
const previous=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'application-inputs-first.json.gz'))));for(const row of previous)assert.equal(sha(fs.readFileSync(path.join(qa,row.path))),row.sha256);
const before=changes.filter(file=>fs.existsSync(path.join(qa,file))).map(file=>{const bytes=fs.readFileSync(path.join(qa,file));return{path:file,sha256:sha(bytes),base64:bytes.toString('base64')};});
assert.equal(before.find(row=>row.path==='scripts/gesp/run_submission.cjs').sha256,'f871584f56f298e2dcc308f7fa436188c66ea0f213a65161e6af33c3ceb07571');
fs.writeFileSync(path.join(__dirname,'before-runner-and-fixture-fix.json.gz'),zlib.gzipSync(JSON.stringify({files:before})),{flag:'wx'});
for(const file of changes){fs.copyFileSync(path.join(root,file),path.join(qa,file));assert.equal(sha(fs.readFileSync(path.join(root,file))),sha(fs.readFileSync(path.join(qa,file))));}
const sync=JSON.parse(fs.readFileSync(path.join(__dirname,'sync-first.json'))).sync.concat(changes.map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(root,file)))})));
fs.writeFileSync(path.join(__dirname,'sync-second.json'),JSON.stringify({at:new Date().toISOString(),sync,correction:'Private namespace /dev/shm; deterministic overlapping-workspace regression; real persisted HTTP identities in the old research test fixture.',apiRuntimeTypesAndDatabaseProtocolUnchanged:true},null,2)+'\n',{flag:'wx'});
const app=previous.map(row=>({...row,sha256:sha(fs.readFileSync(path.join(qa,row.path)))}));fs.writeFileSync(path.join(__dirname,'application-inputs-second.json.gz'),zlib.gzipSync(JSON.stringify(app)),{flag:'wx'});
console.log(JSON.stringify({copied:changes.length,applicationInputs:app.length,sourceFiles:sync.length,originalTasksUnchanged:true}));
