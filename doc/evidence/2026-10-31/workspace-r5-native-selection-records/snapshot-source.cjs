const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const label=process.argv[2];if(!/^[a-z0-9-]+$/.test(label??''))throw Error('Label required');
const base=path.resolve(__dirname,'../p168'),paths=['packages/contracts/src/index.ts','packages/contracts/src/paper-selection.ts','packages/contracts/src/paper-source-read.ts',
 'apps/api/src/modules/library/paper-selection-record.ts','apps/api/src/modules/library/paper-selection-native.ts','apps/api/src/modules/library/paper-source-exposure-record.ts','apps/api/src/modules/library/paper-selection-record.test.ts',
 'apps/api/src/modules/library/library.repository.ts','apps/api/src/modules/library/paper-selection-source.ts','apps/api/src/modules/library/paper-selection-source.test.ts'];
const files=paths.map(file=>{const bytes=fs.readFileSync(path.join(base,file));return{path:file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),utf8:bytes.toString('utf8')};});
fs.writeFileSync(path.join(__dirname,'source-'+label+'.json.gz'),zlib.gzipSync(JSON.stringify({at:new Date().toISOString(),files})),{flag:'wx'});
console.log(JSON.stringify({label,files:files.length}));
