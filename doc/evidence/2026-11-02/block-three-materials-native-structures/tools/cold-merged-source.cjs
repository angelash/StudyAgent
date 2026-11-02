const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),candidate=path.join(root,'data/qa/p187'),database=path.join(candidate,'data/qa/b3-merged-browser-first/study-agent.sqlite3'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!database.startsWith(path.join(candidate,'data/qa')+path.sep))throw Error('Only generated QA database allowed');
const {DomainDatabase}=require(path.join(candidate,'apps/api/dist/apps/api/src/infrastructure/domain-database.js'));
(async()=>{const db=new DomainDatabase(database);await db.open();let state;try{state=await db.read();}finally{await db.close();}
const materials=state.state.studioSourceMaterials.filter(row=>row.filename==='合并单元格讲义.pdf');if(materials.length!==1)throw Error('Expected generated source material');
const table=materials[0].pages[0].blocks.find(row=>row.kind==='table');
if(table.cells.length!==7||table.cells[0].columnSpan!==2||table.cells[2].rowSpan!==2)throw Error('Persisted merged geometry changed');
const report={at:new Date().toISOString(),source:'generated PDF only',coldDatabaseOpenPassed:true,revision:state.revision,materialId:materials[0].id,sourceSha256:materials[0].sha256,contentVersion:materials[0].contentVersion,table,tableSha256:sha(Buffer.from(JSON.stringify(table))),database:path.relative(root,database),formalDatabaseUntouched:true,notFullAssetRestore:true};
fs.writeFileSync(path.join(__dirname,'cold-merged-source-first.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({coldOpen:true,cells:table.cells.length,spanTypes:['rows','columns']}));})();
