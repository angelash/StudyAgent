// Single-line replacements: compact per-point gap lines in the main card, then align the response runner.
const fs=require('node:fs'),path=require('node:path');
function edit(file,edits){let s=fs.readFileSync(file,'utf8');for(const[from,to]of edits){const count=s.split(from).length-1;if(count!==1)throw Error(path.basename(file)+': expected one match, found '+count+': '+from.slice(0,70));s=s.replace(from,to);}fs.writeFileSync(file,s);console.log('patched '+edits.length+' in '+path.basename(file));}
edit(path.resolve(__dirname,'../../../apps/web/components/assessment-blueprint.tsx'),[
  ["{teaching ? teaching.filter(row => row.atomId === point.atomId && gapKind(row)).map(row => <p key={row.purpose} data-gap-kind={gapKind(row)!}>{gapText(row)}</p>) : point.missingReason && <p>{point.missingReason}</p>}","{teaching ? pointGaps(teaching, point.atomId).map(gap => <p key={gap.kind} data-gap-kind={gap.kind}>{gap.text}</p>) : point.missingReason && <p>{point.missingReason}</p>}"],
]);
edit(path.join(__dirname,'inspect-original-responses.cjs'),[
  ["toContainText(exhausted.length+' 项检查目的的未接触原材料不够');else await expect(notices).not.toContainText('未接触原材料不够');","toContainText(exhausted.length+' 项检查目的没接触过的原材料不够本组要求');else await expect(notices).not.toContainText('原材料不够本组要求');"],
  ["await expect(studentPage.locator('div.blueprint-coverage [data-gap-kind='+kind+']')).toHaveCount(list.length);","await expect(studentPage.locator('div.blueprint-coverage [data-gap-kind='+kind+']')).toHaveCount(new Set(list.map(row=>row.atomId)).size);"],
]);
