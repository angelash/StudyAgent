const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process'),{Pool}=require('pg');
const root=path.resolve(__dirname,'../../..'),own=path.join(root,'data/qa/b4pg'),bin=path.join(root,'data/tools/postgresql-17.11-5/pgsql/bin'),data=path.join(own,'cluster');
const privateConfig=path.join(own,'runtime.private.json');
function run(name,args,label){const log=fs.openSync(path.join(own,label+'.private.log'),'wx'),r=spawnSync(path.join(bin,name+'.exe'),args,{windowsHide:true,stdio:['ignore',log,log],timeout:60000});fs.closeSync(log);if(r.status!==0)throw Error(label+' failed; owned private log retained');}
(async()=>{
if(process.argv[2]==='prepare'){
 if(fs.existsSync(own))throw Error('Fresh owned PostgreSQL directory required');
 await new Promise((yes,no)=>{const s=net.createServer();s.once('error',no);s.listen(15456,'127.0.0.1',()=>s.close(yes));});fs.mkdirSync(own);
 const password=crypto.randomBytes(24).toString('base64url'),pwfile=path.join(own,'password.private');fs.writeFileSync(pwfile,password+'\n',{flag:'wx'});
 run('initdb',['-D',data,'--username=study_b4_owner','--pwfile='+pwfile,'--auth-host=scram-sha-256','--auth-local=trust','--encoding=UTF8','--locale=C'],'initdb-first');
 run('pg_ctl',['-D',data,'-l',path.join(own,'server.private.log'),'-o','-p 15456 -h 127.0.0.1 -c max_connections=32 -c shared_buffers=32MB','-w','-t','45','start'],'start-first');
 const url=new URL('postgresql://study_b4_owner@127.0.0.1:15456/postgres');url.password=password;
 const pool=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:5000});try{await pool.query('CREATE DATABASE study_b4_gesp');}finally{await pool.end();}
 url.pathname='/study_b4_gesp';fs.writeFileSync(privateConfig,JSON.stringify({connectionString:url.toString(),data,bin,port:15456}),{flag:'wx'});
 console.log(JSON.stringify({ownedCluster:true,port:15456,ready:true,formalContacted:false}));return;
}
if(['verify','verify35','native35'].includes(process.argv[2])){
 const c=JSON.parse(fs.readFileSync(privateConfig)),url=new URL(c.connectionString);if(c.data!==data||url.hostname!=='127.0.0.1'||url.port!=='15456'||url.pathname!=='/study_b4_gesp')throw Error('Exact isolated cluster required');
 const kind=process.argv[2],label=kind==='verify'?'b4-gesp-postgres':kind==='verify35'?'b4-gesp-postgres35':'b4-reader-postgres35',output=path.join(__dirname,label+'-receipt.json');if(fs.existsSync(output))throw Error('Preserve previous receipt');
 if(kind==='verify35'){const pool=new Pool({connectionString:c.connectionString,max:1});try{await pool.query('CREATE DATABASE study_b4_gesp35');}finally{await pool.end();}url.pathname='/study_b4_gesp35';}
 const args=kind==='native35'?['node_modules/vitest/vitest.mjs','run','src/infrastructure/gesp-evidence-reader.integration.test.ts','--reporter=json','--outputFile='+output]:['scripts/qa/verify-gesp-learning-loop.cjs',output,'postgres'];
 if(kind==='native35')args[0]=path.join(root,'node_modules/vitest/vitest.mjs');
 const log=fs.openSync(path.join(__dirname,label+'.private.log'),'wx'),r=spawnSync(process.execPath,args,{cwd:path.join(root,'data/qa/p187',kind==='native35'?'apps/api':''),env:{...process.env,STUDY_TEST_POSTGRES_URL:url.toString(),...(kind==='native35'?{STUDY_TEST_GESP_EVIDENCE_POSTGRES_URL:c.connectionString}:{}),OPENAI_API_KEY:'',MINIMAX_API_KEY:'',XIAOJIU_CHAT_ENABLED:'false'},windowsHide:true,stdio:['ignore',log,log],timeout:300000});fs.closeSync(log);console.log(JSON.stringify({mode:label,exit:r.status,formalContacted:false}));process.exitCode=r.status??1;return;
}
throw Error('prepare or verify required');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
