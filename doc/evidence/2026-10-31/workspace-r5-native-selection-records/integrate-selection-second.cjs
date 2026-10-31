const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const qa=__dirname,root=path.resolve(qa,'../../..'),candidate=path.join(root,'data/qa/p168'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const old=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(qa,'source-third.json.gz')))),current=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(qa,'source-fifth.json.gz'))));
const report=JSON.parse(fs.readFileSync(path.join(qa,'library-regression-fifth.json')));
if(report.numPassedTests!==82||report.numFailedTests!==0||report.numPendingTests!==1)throw Error('Final actual targeted regression required');
const changes=[];
for(const row of current.files){const before=old.files.find(value=>value.path===row.path);if(!before||sha(fs.readFileSync(path.join(root,row.path)))!==before.sha256||sha(fs.readFileSync(path.join(candidate,row.path)))!==row.sha256)throw Error('Exact source changed');if(before.sha256!==row.sha256)changes.push(row);}
if(changes.length!==3)throw Error('Expected only exact original-key validation and its test');
for(const row of changes){const target=path.join(root,row.path);fs.writeFileSync(target,Buffer.from(row.utf8));if(sha(fs.readFileSync(target))!==row.sha256)throw Error('Source readback failed');}
fs.writeFileSync(path.join(qa,'selection-integration-second.json'),JSON.stringify({at:new Date().toISOString(),changed:changes.map(({utf8,...row})=>row),finalSources:current.files.map(({utf8,...row})=>row),tests:{passed:82,failed:0,skipped:1},schema32Registered:false,goal:'active'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({changed:changes.length,finalSources:current.files.length,passed:82,failed:0,skipped:1}));
