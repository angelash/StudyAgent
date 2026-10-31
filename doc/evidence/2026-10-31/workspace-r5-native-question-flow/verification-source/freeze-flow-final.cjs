const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{spawn}=require('node:child_process');
const qa=__dirname,root=path.resolve(qa,'../../..'),candidate=path.join(root,'data/qa/p168'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const names=['scripts/processing/paper_export_document.py','scripts/processing/paper_export_protocol.py','scripts/processing/test_paper_export.py'];
const load=base=>names.map(file=>{const bytes=fs.readFileSync(path.join(base,file));return{path:file,bytes:bytes.length,sha256:sha(bytes),utf8:bytes.toString('utf8')};});
const final=load(candidate),before=load(root);
for(const[label,files]of[['final',final],['before-main',before]])fs.writeFileSync(path.join(qa,'flow-source-'+label+'.json.gz'),zlib.gzipSync(JSON.stringify({files})),{flag:'wx'});
const log=fs.openSync(path.join(qa,'flow-unit-final.txt'),'wx'),child=spawn(path.join(root,'data/qa/er2/python/Scripts/python.exe'),['-E','-s','-B','-X','utf8','-m','unittest','test_paper_export','-v'],{cwd:path.join(candidate,'scripts/processing'),windowsHide:true,stdio:['ignore',log,log]});
child.once('error',()=>{fs.closeSync(log);process.exitCode=1;});
child.once('exit',code=>{
 fs.closeSync(log);if(code!==0){process.exitCode=code??1;return;}
 const text=fs.readFileSync(path.join(qa,'flow-unit-final.txt'),'utf8');if(!/Ran 24 tests/.test(text)||!text.includes('\nOK'))throw Error('Exact final unit result required');
 for(const row of final)if(sha(fs.readFileSync(path.join(candidate,row.path)))!==row.sha256)throw Error('Source changed while verifying');
 const result={exit:code,passed:24,failed:0,skipped:0,source:final.map(({utf8,...row})=>row)};fs.writeFileSync(path.join(qa,'flow-unit-final.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({exit:code,passed:24,failed:0,sourceFiles:final.length}));
});
