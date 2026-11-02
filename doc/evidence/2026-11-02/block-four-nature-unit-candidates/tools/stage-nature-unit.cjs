const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),evidence='doc/evidence/2026-11-02/block-four-nature-unit-candidates',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function git(args,encoding){const r=spawnSync('git',args,{cwd:root,encoding,maxBuffer:128*1024*1024});assert.equal(r.status,0,'Git command '+args[0]);return r.stdout;}
assert.equal(git(['branch','--show-current'],'utf8').trim(),'main');assert.equal(git(['diff','--cached','--name-only'],'utf8').trim(),'');
const scanSource=path.join(__dirname,'b4-nature-unit-archive-scan.json'),scan=JSON.parse(fs.readFileSync(scanSource));assert.deepEqual(scan.credentialFindings,[]);assert.deepEqual(scan.changedProtectedFiles,[]);assert.equal(scan.docLinks.missing,0);
fs.copyFileSync(scanSource,path.join(root,evidence,'checks/b4-nature-unit-archive-scan.json'),fs.constants.COPYFILE_EXCL);
fs.copyFileSync(__filename,path.join(root,evidence,'tools/stage-nature-unit.cjs'),fs.constants.COPYFILE_EXCL);
const sources=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,evidence,'sources.json.gz')))).files;
const docs=['.gitattributes','doc/product/105-development-plan-status-and-next-milestones.md',
 'doc/product/148-current-work-checkpoint-and-remaining-scope.md','doc/product/150-integrated-delivery-plan-and-work-ledger.md','doc/product/190-mainline-and-five-block-delivery.md',
 'doc/product/206-nature-unit-perspectives-real-opinions-and-expression.md','doc/product/experience/requirements.md'];
const files=[...sources.map(row=>row.path),...docs];
function walk(rel){for(const entry of fs.readdirSync(path.join(root,rel),{withFileTypes:true})){const file=rel+'/'+entry.name;assert(!entry.isSymbolicLink());if(entry.isDirectory())walk(file);else files.push(file);}}walk(evidence);
const normalize=bytes=>Buffer.from(bytes.toString('latin1').replace(/\r\n/g,'\n'),'latin1');
for(const row of sources)assert.equal(sha(fs.readFileSync(path.join(root,row.path))),row.sha256,'Source changed after archive');
const manifest={at:new Date().toISOString(),baseCommit:git(['rev-parse','HEAD'],'utf8').trim(),branch:'main',localBranches:git(['branch','--format=%(refname:short)'],'utf8').trim().split(/\r?\n/),
 worktreeInventory:git(['worktree','list','--porcelain'],'utf8'),manifestExcludedFromOwnHash:true,
 files:files.map(file=>{const bytes=fs.readFileSync(path.join(root,file));return{path:file,bytes:bytes.length,sha256:sha(bytes),gitNormalizedSha256:sha(normalize(bytes))};})};
const manifestPath=evidence+'/staging-manifest.json';fs.writeFileSync(path.join(root,manifestPath),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});files.push(manifestPath);
git(['add','--',...files]);
assert.deepEqual(git(['diff','--cached','--name-only'],'utf8').trim().split(/\r?\n/).sort(),[...files].sort());
for(const file of files){const staged=git(['show',':'+file]),local=fs.readFileSync(path.join(root,file));assert.equal(sha(file.startsWith(evidence+'/')?staged:normalize(staged)),sha(file.startsWith(evidence+'/')?local:normalize(local)),'Staged byte mismatch '+file);}
console.log(JSON.stringify({stagedFiles:files.length,sourceFiles:sources.length,docFiles:docs.length,branch:'main',localBranches:manifest.localBranches,allGitBytesReadBack:true,pushed:false}));
