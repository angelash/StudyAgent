const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const render=JSON.parse(fs.readFileSync(path.join(__dirname,'source-render-first.json'))),pages=[...Array.from({length:24},(_,i)=>i+1),120,121,122,123,124,125,126,127],sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const reviewed=pages.map(page=>{const row=render.pages.find(row=>row.physicalPage===page);assert.equal(sha(fs.readFileSync(path.join(__dirname,row.image))),row.imageSha256);return{...row,visuallyReviewed:true};});
const result={at:new Date().toISOString(),sourceId:render.sourceId,sourceSha256:render.sourceSha256,extractedSha256:render.extractedSha256,totalPages:127,pagesVisuallyReviewed:pages.length,allPagesVisuallyReviewed:false,reviewed,
 edition:{publisher:'人民教育出版社',organization:'教育部组织编写',approvalYear:2016,editorPostscriptDate:'2016-07',publicationYear:null,curriculumStandardYear:null,reason:'封面审定2016与后记编者2016年7月分别保留；物理3页没有明确出版版次或印次年月，不以这些年份替代。'},
 directory:{tocPages:[4,5,6],instructionalEntries:51,referenceEntries:4,completeDirectoryRead:true,allEntryStartPagesReviewed:false,orientationRemainsOneEntry:true},
 firstContent:{physicalRange:[7,24],printedRange:[2,19],orientationAndFirstLiteracyGroupFullyRead:true,characterRecognitionCountInBook:300,characterWritingCountInBook:100,recognitionAndWritingNotInterchangeable:true,originalTextImagesAndLyricsLocalOnly:true},
 sourceRenderingToolFailurePreserved:true,teacherReviewed:false,registeredOrPublished:false,formalDatabaseWritten:false};
fs.writeFileSync(path.join(__dirname,'source-visual-first.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({pages:reviewed.length,allSourceRead:false,firstTeachingPagesRead:18,publicationYear:null}));
