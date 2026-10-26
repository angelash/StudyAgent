const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),postcss=require('postcss');
function main(){
const root=path.resolve(__dirname,'../..'),publicRoot=path.join(root,'apps/web/public'),manifest=JSON.parse(fs.readFileSync(path.join(publicRoot,'reference/hyperknow/asset-manifest.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex'),sources=manifest.files.filter(file=>/\/(?:WhiteboardPage-|VoiceSettingsModal-)[^/]+\.css$/.test(file.publicPath));
if(sources.length!==3)throw Error('Expected three frozen original board/settings styles');
const documents=sources.map(source=>{const bytes=fs.readFileSync(path.join(publicRoot,source.publicPath));if(sha(bytes)!==source.sha256)throw Error('Captured style changed: '+source.publicPath);return postcss.parse(bytes.toString('utf8'),{from:source.publicPath});});
const keyframes=new Map(),properties=new Map();for(const document of documents)document.walkAtRules(rule=>{if(/keyframes$/i.test(rule.name))keyframes.set(rule.params,'hk-original-'+rule.params);if(rule.name==='property')properties.set(rule.params,'--hk-original-'+rule.params.slice(2));if(['import','namespace'].includes(rule.name.toLowerCase()))throw Error('Unsupported global style directive: '+rule.name);});
function selectors(value){const result=[];let start=0,depth=0,quote='',escaped=false;for(let i=0;i<value.length;i++){const c=value[i];if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(quote){if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='('||c==='[')depth++;else if(c===')'||c===']')depth--;else if(c===','&&depth===0){result.push(value.slice(start,i).trim());start=i+1;}if(depth<0)throw Error('Unbalanced selector');}if(depth||quote)throw Error('Unclosed selector');result.push(value.slice(start).trim());return result;}
let rules=0,scopedSelectors=0;
for(const document of documents){
 document.walkAtRules(rule=>{if(/keyframes$/i.test(rule.name))rule.params=keyframes.get(rule.params);if(rule.name==='property')rule.params=properties.get(rule.params);if(rule.name==='font-face')rule.remove();});
 document.walkRules(rule=>{
  let parent=rule.parent;while(parent){if(parent.type==='atrule'&&/keyframes$/i.test(parent.name))return;parent=parent.parent;}
  rule.selector=selectors(rule.selector).map(selector=>{scopedSelectors++;if(selector.startsWith('.whiteboard-root'))return selector.replace(/^\.whiteboard-root/,'.hk-teaching.whiteboard-root');if(/^(?::root|html|body)(?=$|[\s.:#\[])/.test(selector))return selector.replace(/^(?::root|html|body)/,'.hk-teaching');return '.hk-teaching '+selector;}).join(',');rules++;
 });
 document.walkDecls(declaration=>{if(/^(?:-webkit-)?animation(?:-name)?$/.test(declaration.prop))for(const [old,name]of keyframes)declaration.value=declaration.value.replace(new RegExp('(?<![\\w-])'+old.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\w-])','g'),name);for(const[old,name]of properties){if(declaration.prop===old)declaration.prop=name;declaration.value=declaration.value.replaceAll(old,name);}if(declaration.prop==='font-family'||declaration.prop==='font')declaration.value=declaration.value.replace(/\bKaTeX_/g,'HKOriginal-KaTeX_');});
}
const css=Buffer.from('/* Captured original teaching styles. Only root selectors and animation names are scoped; original sources and notices remain in the mirrored assets. */\n'+documents.map(document=>document.toString().trimEnd()).join('\n')+'\n'),output='apps/web/app/studio/original-teaching-shell.generated.css',metadata='apps/web/lib/original-teaching-styles.json';
const receipt=Buffer.from(JSON.stringify({version:1,sourceFiles:sources.map(({publicPath,sha256})=>({publicPath,sha256})),output,sha256:sha(css),bytes:css.length,rules,scopedSelectors,keyframes:Object.fromEntries(keyframes),registeredProperties:Object.fromEntries(properties)},null,2)+'\n');
for(const [file,bytes]of [[output,css],[metadata,receipt]]){const target=path.join(root,file);if(process.argv.includes('--verify')){if(!fs.existsSync(target)||!fs.readFileSync(target).equals(bytes))throw Error('Teaching style output differs: '+file);}else fs.writeFileSync(target,bytes);}
console.log(JSON.stringify({status:process.argv.includes('--verify')?'verified':'generated',sources:sources.length,rules,scopedSelectors,keyframes:keyframes.size,bytes:css.length,output}));
}
try{main();}catch(error){console.error(error.message);process.exitCode=1;}
