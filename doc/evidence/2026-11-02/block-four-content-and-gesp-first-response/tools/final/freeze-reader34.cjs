const fs=require('node:fs'),path=require('node:path');
const original=fs.readFileSync(path.join(__dirname,'freeze-reader33.cjs'),'utf8');
const code=original.replaceAll('schema33-reader','schema34-reader').replaceAll('pre-gesp-evidence33','pre-gesp-feedback34').replaceAll('ready-schema33-exact-edition-v1','ready-schema34-gesp-first-response-v1').replaceAll('schema34-gesp','schema35-gesp');
// Keep the required positive34 check separate from the future35 rejection.
const fixed=code.replace("!code.includes(\"ready-schema35-gesp-first-response-v1\")","!code.includes(\"ready-schema34-gesp-first-response-v1\")");
require('node:vm').runInThisContext('(function(require,__dirname){'+fixed+'})')(require,__dirname);
