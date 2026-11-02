// Regression: the ancient prose must be readable in the actual teaching body.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),d=JSON.parse(fs.readFileSync(path.join(root,'resources/curriculum/source-lessons/chinese-g3-simaguang-v1.json')));
const expected='群儿戏于庭，一儿登瓮，足跌没水中。众皆弃去，光持石击瓮破之，水迸，儿得活。';
function verify(row){assert(row.content.concept.explanation.includes('《司马光》\n'+expected),'Complete selected-version classical prose must be in the actual reading body');}
verify(d);assert.equal(d.scope.publicDomainClassicalText,expected);
const metadataOnly=structuredClone(d);metadataOnly.content.concept.explanation='只有讲解，古文在scope。';assert.throws(()=>verify(metadataOnly));
const missingEnding=structuredClone(d);missingEnding.content.concept.explanation=missingEnding.content.concept.explanation.replace('水迸，儿得活。','');assert.throws(()=>verify(missingEnding));
assert.equal(d.scope.fullTextDictationAdded,false);assert.equal(d.scope.storyReenactmentRequired,false);
const garden=JSON.parse(fs.readFileSync(path.join(root,'resources/curriculum/source-lessons/chinese-g3-garden-eight-v1.json'))),maxims=[
 ['不迁怒，不贰过。','《论语》'],['爱人若爱其身。','《墨子》'],['仁者爱人，有礼者敬人。','《孟子》'],['与人善言，暖于布帛；伤人以言，深于矛戟。','《荀子》'],
];
function verifyMaxims(row){for(const [text,source]of maxims)assert(row.content.concept.explanation.includes(text+'——'+source),'Complete saying with correct source must be in actual reading body');}
verifyMaxims(garden);let maximNegativeCases=0;
const noBody=structuredClone(garden);noBody.content.concept.explanation='四句只在scope。';assert.throws(()=>verifyMaxims(noBody));maximNegativeCases++;
for(const [text]of maxims){const missing=structuredClone(garden);missing.content.concept.explanation=missing.content.concept.explanation.replace(text,'');assert.throws(()=>verifyMaxims(missing));maximNegativeCases++;}
console.log(JSON.stringify({passed:true,classicalPassages:1,completeSelectedVersionInActualBody:true,metadataOnlyAndMissingEndingRejected:2,ancientMaxims:4,allMaximsAndSourcesInActualBody:true,maximNegativeCasesRejected:maximNegativeCases,extraDictationAdded:false,storyReenactmentRequired:false,scope:'Ancient public-domain prose and sayings reading, not teacher approval or learner practice.'}));
