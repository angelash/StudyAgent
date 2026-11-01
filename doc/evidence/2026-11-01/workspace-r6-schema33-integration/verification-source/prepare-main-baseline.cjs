// Isolated copy of the committed main application for same-day baseline comparison.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),target=path.join(root,'data/qa/main-baseline-20261101'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
if(fs.existsSync(target))throw Error('Fresh baseline directory required');
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();fs.mkdirSync(target);
const archive=path.join(__dirname,'main-baseline-'+head.slice(0,8)+'.tar');execFileSync('git',['archive','--format=tar','-o',archive,'HEAD','apps','packages','scripts','tests','resources','package.json','package-lock.json','playwright.config.ts','tsconfig.base.json'],{cwd:root});
execFileSync('tar',['-xf',archive,'-C',target]);
fs.mkdirSync(path.join(target,'node_modules'));const links=[];
for(const entry of fs.readdirSync(path.join(root,'node_modules'),{withFileTypes:true})){if(entry.name==='@study-agent'||entry.name.startsWith('.')&&entry.name!=='.bin')continue;const source=fs.realpathSync(path.join(root,'node_modules',entry.name));if(!fs.statSync(source).isDirectory())continue;fs.symlinkSync(source,path.join(target,'node_modules',entry.name),'junction');links.push(entry.name);}
fs.mkdirSync(path.join(target,'node_modules/@study-agent'));for(const name of ['config','contracts','ui'])fs.symlinkSync(path.join(target,'packages',name),path.join(target,'node_modules/@study-agent',name),'junction');
const run=(label,args,cwd,env={})=>{const log=fs.openSync(path.join(__dirname,'main-baseline-'+label+'.log'),'wx'),result=spawnSync(process.execPath,args,{cwd,env:{...process.env,...env},windowsHide:true,stdio:['ignore',log,log]});fs.closeSync(log);return{label,status:result.status};};
const results=[];
for(const name of ['config','contracts']){const cwd=path.join(target,'packages',name),pkg=JSON.parse(fs.readFileSync(path.join(cwd,'package.json')));if(pkg.scripts?.build?.includes('tsup'))results.push(run('build-'+name,[path.join(target,'node_modules/tsup/dist/cli-default.js'),'src/index.ts','--format','cjs','--dts','--clean'],cwd));else results.push(run('build-'+name,[path.join(target,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],cwd));}
results.push(run('build-api',[path.join(target,'node_modules/typescript/bin/tsc'),'-p','apps/api/tsconfig.build.json'],target));
results.push(run('build-web',[path.join(target,'node_modules/next/dist/bin/next'),'build','--webpack'],path.join(target,'apps/web'),{NODE_ENV:'production',STUDY_WEB_DIST_DIR:'.next-main-baseline',API_PORT:'4287',NEXT_PUBLIC_API_BASE_URL:'',NEXT_TELEMETRY_DISABLED:'1'}));
const buildId=fs.existsSync(path.join(target,'apps/web/.next-main-baseline/BUILD_ID'))?fs.readFileSync(path.join(target,'apps/web/.next-main-baseline/BUILD_ID'),'utf8').trim():null;
fs.writeFileSync(path.join(__dirname,'main-baseline-preparation.json'),JSON.stringify({at:new Date().toISOString(),head,target:'data/qa/main-baseline-20261101',archiveSha256:sha(fs.readFileSync(archive)),dependencyJunctions:links.length,results,buildId,noMainBuildOutputTouched:true},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({head,results,buildId}));
