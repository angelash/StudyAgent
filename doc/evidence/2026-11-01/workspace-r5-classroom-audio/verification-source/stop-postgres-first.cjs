const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'postgres-runtime.private.json'),'utf8')),expected=path.join(__dirname,'postgres/cluster');
if(path.resolve(config.data)!==expected||config.port!==15450||new URL(config.connectionString).pathname!=='/study_agent_qa')throw Error('Exact generated cluster required');
const log=fs.openSync(path.join(__dirname,'postgres-stop-first.log'),'wx'),binary=path.join(config.bin,'pg_ctl.exe');
const result=spawnSync(binary,['stop','-D',expected,'-m','fast','-w','-t','30'],{windowsHide:true,stdio:['ignore',log,log],timeout:45000});
const status=spawnSync(binary,['status','-D',expected],{windowsHide:true,stdio:['ignore',log,log],timeout:10000});fs.closeSync(log);
const report={at:new Date().toISOString(),exactQaClusterOnly:true,port:15450,stopExit:result.status,statusExit:status.status,stopped:result.status===0&&status.status===3,otherServicesTouched:false};
fs.writeFileSync(path.join(__dirname,'postgres-stop-first.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));if(!report.stopped)process.exitCode=1;
