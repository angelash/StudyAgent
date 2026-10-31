const path=require('node:path'),candidate=path.resolve(__dirname,'../p178'),{defineConfig}=require(path.join(candidate,'node_modules/@playwright/test'));
module.exports=defineConfig({testDir:path.join(candidate,'tests/e2e'),testMatch:'**/workspace-materials.spec.ts',
 grep:/workspace materials: (adult documents|explicit object|a lost text|unavailable storage|original-paper first|student learning|existing-style|a late catalog)/,
 fullyParallel:false,workers:1,retries:0,timeout:60000,expect:{timeout:15000},
 reporter:[['json',{outputFile:path.join(__dirname,'legacy-compat-second-result.json')}]],outputDir:path.resolve(__dirname,'../l178b'),
 use:{baseURL:'http://localhost:13178',browserName:'chromium',channel:'chromium',actionTimeout:15000,screenshot:'only-on-failure',trace:'retain-on-failure'}});
