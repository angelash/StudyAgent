// Replaces the three gap displays in the main assessment blueprint card with exact, single-match edits.
const fs=require('node:fs'),path=require('node:path');
const f=path.resolve(__dirname,'../../../apps/web/components/assessment-blueprint.tsx');
let s=fs.readFileSync(f,'utf8');
const edits=[
  ["{row.missingReason&&<p>{row.missingReason}</p>}</div><span>{row.selected>=row.required?'已安排':'待核查'}</span></li>","{gapKind(row)&&<p data-gap-kind={gapKind(row)!}>{gapText(row)}</p>}</div><span>{row.selected>=row.required?'已安排':gapKind(row)==='deferred'?'下一组继续':'需补材料'}</span></li>"],
  ["{point.missingReason && <p>{point.missingReason}</p>}</div>","{teaching ? teaching.filter(row => row.atomId === point.atomId && gapKind(row)).map(row => <p key={row.purpose} data-gap-kind={gapKind(row)!}>{gapText(row)}</p>) : point.missingReason && <p>{point.missingReason}</p>}</div>"],
  ["{!!preview.blueprint.warnings.length && <div className=\"blueprint-notices\" role=\"status\">{preview.blueprint.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>}","{!!(gapNotices.length || preview.blueprint.warnings.length) && <div className=\"blueprint-notices\" role=\"status\">{[...gapNotices, ...preview.blueprint.warnings].map(warning => <p key={warning}>{warning}</p>)}</div>}"],
];
for(const[from,to]of edits){const count=s.split(from).length-1;if(count!==1)throw Error('Expected one match, found '+count+': '+from.slice(0,60));s=s.replace(from,to);}
fs.writeFileSync(f,s);console.log('patched '+edits.length+' gap displays');
