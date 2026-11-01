const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),candidate=path.join(root,'data/qa/p184'),[label,buildLabel]=process.argv.slice(2),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
if(![label,buildLabel].every(value=>/^[a-z0-9-]+$/.test(value||'')))throw Error('Exact fresh labels required');
const target=path.join(__dirname,label);if(fs.existsSync(target))throw Error('Previous source seal must remain');
const build=JSON.parse(fs.readFileSync(path.join(__dirname,buildLabel+'.json'))),inputs=JSON.parse(fs.readFileSync(path.join(__dirname,buildLabel+'-inputs.json'))).inputs;
if(build.status!==0)throw Error('Successful original build required');
for(const file of inputs)if(sha(fs.readFileSync(path.join(candidate,file.path)))!==file.sha256)throw Error('Build input already changed: '+file.path);
fs.mkdirSync(target);const copied=[];
for(const file of inputs){const original=path.join(root,file.path),bytes=fs.readFileSync(path.join(candidate,file.path));if(fs.existsSync(original)&&sha(fs.readFileSync(original))===file.sha256)continue;
 const next=path.join(target,'source',file.path);fs.mkdirSync(path.dirname(next),{recursive:true});fs.writeFileSync(next,bytes,{flag:'wx'});if(sha(fs.readFileSync(next))!==file.sha256)throw Error('Source readback failed');copied.push(file);
}
fs.writeFileSync(path.join(target,'receipt.json'),JSON.stringify({at:new Date().toISOString(),buildLabel,buildId:build.buildId,checked:inputs.length,copied,allReadBack:true}),{flag:'wx'});
console.log(JSON.stringify({buildId:build.buildId,checked:inputs.length,copied:copied.length}));
