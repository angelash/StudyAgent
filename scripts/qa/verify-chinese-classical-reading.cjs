// Regression: the ancient prose must be readable in the actual teaching body.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),d=JSON.parse(fs.readFileSync(path.join(root,'resources/curriculum/source-lessons/chinese-g3-simaguang-v1.json')));
const expected='群儿戏于庭，一儿登瓮，足跌没水中。众皆弃去，光持石击瓮破之，水迸，儿得活。';
function verify(row){assert(row.content.concept.explanation.includes('《司马光》\n'+expected),'Complete selected-version classical prose must be in the actual reading body');}
verify(d);assert.equal(d.scope.publicDomainClassicalText,expected);
const metadataOnly=structuredClone(d);metadataOnly.content.concept.explanation='只有讲解，古文在scope。';assert.throws(()=>verify(metadataOnly));
const missingEnding=structuredClone(d);missingEnding.content.concept.explanation=missingEnding.content.concept.explanation.replace('水迸，儿得活。','');assert.throws(()=>verify(missingEnding));
assert.equal(d.scope.fullTextDictationAdded,false);assert.equal(d.scope.storyReenactmentRequired,false);
console.log(JSON.stringify({passed:true,classicalPassages:1,completeSelectedVersionInActualBody:true,metadataOnlyAndMissingEndingRejected:2,extraDictationAdded:false,storyReenactmentRequired:false,scope:'Ancient public-domain prose reading, not teacher approval or learner recall.'}));
