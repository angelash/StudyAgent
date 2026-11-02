const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const edits={
 'scripts/content/chinese-g1-initial-body-nature.cjs':[['坐如钟在说什么姿态？','读到坐如钟时，这句话在说什么姿态？'],['卧如弓借哪种形状帮助想象？','读到卧如弓时，借哪种形状帮助想象姿态？'],['花对树、鸟对虫应怎样分组？','按本件原句，花对树、鸟对虫应怎样分组？']],
 'scripts/content/chinese-g1-initial-activities.cjs':[['人和天字形有什么具体不同？','把人和天字牌并排看，字形有什么具体不同？'],['口和田同样有框，怎样区分？','口和田同样有框，看完整字形怎样区分？'],['只看外框能分清口田日目吗？','只看外框能分清口田日目吗，还要看哪里？']]
};const report=[];for(const[file,pairs]of Object.entries(edits)){let text=fs.readFileSync(file,'utf8');for(const[from,to]of pairs){assert.equal(text.split(from).length,2);text=text.replace(from,to);report.push({file,from,to});}fs.writeFileSync(file,text);}
fs.writeFileSync('data/qa/b4-chinese-g1-source-first/question-wording-correction.json',JSON.stringify({at:new Date().toISOString(),edits:report,reason:'Six prompts were under the existing 15-character preflight boundary; add concrete reading or comparison context without changing targets, answers, groups or review.'},null,2)+'\n',{flag:'wx'});
