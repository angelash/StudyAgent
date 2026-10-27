// Derive only the named composer controls from the already captured reference.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),postcss=require('postcss');
const root=path.resolve(__dirname,'../..'),source='apps/web/public/reference/hyperknow/assets/css/index-CkZwjgwy.css';
const target='apps/web/app/studio/reference-assistant.generated.css',receipt='resources/ui/studio-assistant-style-provenance.json';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),raw=fs.readFileSync(path.join(root,source)),ast=postcss.parse(raw.toString());
const keep=/\.(?:lecture-context-chip(?:[\w-]*)|home-mode-tabs?|input-box|input-area|input-field|button-row|left-button-group|composer-right-group|tools-button(?:[\w-]*)|send-button|action-buttons-(?:section|grid|row)|action-button)(?![\w-])/;
const animations=['lecture-context-chip-in','spin'],output=postcss.root(),rules=[];
output.append(postcss.comment({text:'Generated from captured HyperKnow CSS. Run scripts/assets/extract-studio-assistant-styles.cjs; local layout adapters live separately.'}));
function add(node,parents){let value=node;for(const parent of [...parents].reverse())value=parent.clone({nodes:[value]});output.append(value);}
ast.walkRules(rule=>{
  if(!keep.test(rule.selector))return;
  const parents=[];for(let parent=rule.parent;parent&&parent.type!=='root';parent=parent.parent)if(parent.type==='atrule')parents.unshift(parent);
  if(parents.some(parent=>/keyframes$/.test(parent.name)))return;
  const derived=rule.clone();derived.selector=rule.selector.split(',').map(selector=>'.sa-reference-assistant '+selector.trim()).join(',');
  derived.walkDecls(declaration=>{if(/^animation(?:-name)?$/.test(declaration.prop))for(const name of animations)declaration.value=declaration.value.replace(new RegExp('(^|[\\s,])'+name+'(?=[\\s,]|$)','g'),'$1sa-ref-'+name);});
  add(derived,parents);rules.push({selector:rule.selector,media:parents.map(parent=>'@'+parent.name+' '+parent.params),originalSha256:sha(rule.toString()),derivedSha256:sha(derived.toString())});
});
ast.walkAtRules(rule=>{if(/keyframes$/.test(rule.name)&&animations.includes(rule.params)){const derived=rule.clone();derived.params='sa-ref-'+rule.params;output.append(derived);}});
if(rules.length<20)throw Error('Captured composer rules incomplete');
const css=output.toString()+'\n',evidence=JSON.stringify({version:1,source,sourceSha256:sha(raw),output:target,outputSha256:sha(css),rules,
  transformations:['Every selector is scoped to .sa-reference-assistant.','Animation names are prefixed to avoid global collisions.','Original declarations and responsive media are otherwise retained.'],scope:'Source-backed CSS subset only. Page geometry, model picker and unavailable original assets still require separate visual validation.'},null,2)+'\n';
for(const[file,content]of[[target,css],[receipt,evidence]]){
 const full=path.join(root,file);if(process.argv.includes('--check')){if(!fs.existsSync(full)||fs.readFileSync(full,'utf8')!==content)throw Error('Derived reference asset differs: '+file);}
 else{fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,content);}
}
console.log(JSON.stringify({passed:true,rules:rules.length,sourceSha256:sha(raw),outputSha256:sha(css),check:process.argv.includes('--check')}));
