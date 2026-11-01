const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),candidate=path.join(root,'data/qa/p184'),[label,buildLabel]=process.argv.slice(2),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
if(![label,buildLabel].every(value=>/^[a-z0-9-]+$/.test(value||'')))throw Error('Exact fresh source seal labels required');
const target=path.join(__dirname,label);if(fs.existsSync(target))throw Error('Preserve previous source seal');
const build=JSON.parse(fs.readFileSync(path.join(__dirname,buildLabel+'.json'))),inputs=JSON.parse(fs.readFileSync(path.join(__dirname,buildLabel+'-inputs.json'))).inputs;
if(build.status!==0)throw Error('Successful exact build required');
const prepared=[],reconstructed=[];
for(const file of inputs){let bytes=fs.readFileSync(path.join(candidate,file.path));
 if(sha(bytes)!==file.sha256&&buildLabel==='upgrade-workspace-production-first'){
  let value=bytes.toString('utf8');
  if(file.path==='apps/web/app/studio/course-workspace.tsx')value=value.replace(" enrollmentPreview?: boolean;",'').replace("  if (props.enrollmentPreview) return props.children(props.course, null, false);\n",'');
  else if(file.path==='apps/web/app/studio/studio.tsx')value=value.replace(' enrollmentPreview={Boolean(chemistry?.course?.id===active.id&&!chemistry.courseId)}','');
  bytes=Buffer.from(value);if(sha(bytes)===file.sha256)reconstructed.push({path:file.path,method:'Exact removal of the two later enrollment-preview edits, independently matched to original pre-build SHA256'});
 }
 if(sha(bytes)!==file.sha256)throw Error('Cannot prove exact build input: '+file.path);prepared.push({file,bytes});
}
fs.mkdirSync(target);const copied=[];
for(const{file,bytes}of prepared){const original=path.join(root,file.path);if(fs.existsSync(original)&&sha(fs.readFileSync(original))===file.sha256)continue;const next=path.join(target,'source',file.path);fs.mkdirSync(path.dirname(next),{recursive:true});fs.writeFileSync(next,bytes,{flag:'wx'});if(sha(fs.readFileSync(next))!==file.sha256)throw Error('Exact source readback failed');copied.push(file);}
fs.writeFileSync(path.join(target,'receipt.json'),JSON.stringify({at:new Date().toISOString(),buildLabel,buildId:build.buildId,checked:inputs.length,copied,reconstructed,allReadBack:true}),{flag:'wx'});
console.log(JSON.stringify({buildId:build.buildId,checked:inputs.length,copied:copied.length,reconstructed:reconstructed.length}));
