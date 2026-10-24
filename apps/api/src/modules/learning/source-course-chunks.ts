import { createHash } from 'node:crypto';
import { splitClassroomSpeech, sourceCompilationLimits, sourceCompilationVersion } from '@study-agent/contracts';
import type { CourseSourceSnapshot, SourceChunkSummary } from '@study-agent/contracts';

export type SourceChunk = SourceChunkSummary & { text: string; blocks: CourseSourceSnapshot['blocks'] };
export const chunkDigest = (value: string) => createHash('sha256').update(value).digest('hex');
type Protected = { start:number;end:number;atomic?:boolean;block?:CourseSourceSnapshot['blocks'][number] };

/** Exact matching only; ambiguous structures remain available on their source page, without invented ranges. */
function structures(source: CourseSourceSnapshot) {
  const protectedText:Protected[]=[],warnings:string[]=[];
  const add=(pattern:RegExp)=>{for(const match of source.text.matchAll(pattern))protectedText.push({start:match.index!,end:match.index!+match[0].length});};
  add(/```[\s\S]*?(?:```|$)|`[^`\n]+`/gu);
  add(/\$\$[\s\S]*?\$\$|\$(?:\\.|[^$\n])+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/gu);
  add(/(?:^[^\n]*\|[^\n]*(?:\r?\n|$)){2,}/gmu);
  for(const block of source.blocks){
    const value=block.kind==='paragraph'?block.text:block.plainText||(block.kind==='formula'?block.latex:[...block.headers,...block.rows.flat()].join(' '));
    if(!value.trim())continue;
    const pattern=value.trim().split(/\s+/u).map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+');
    const matches=[...source.text.matchAll(new RegExp(pattern,'gu'))];
    if(matches.length!==1){warnings.push('部分结构无法唯一定位；请对照原页核对。');continue;}
    const match=matches[0];protectedText.push({start:match.index!,end:match.index!+match[0].length,atomic:block.kind!=='paragraph',block});
  }
  return{protectedText,warnings:[...new Set(warnings)]};
}

/** Chunks retain every source character. Algorithms and offsets are independent of the model. */
export function compileSourceChunks(source:CourseSourceSnapshot):SourceChunk[]{
  if(!source.text.trim())return[];
  const{protectedText,warnings}=structures(source),inside=(offset:number)=>protectedText.some(part=>part.atomic!==false&&part.start<offset&&offset<part.end);
  const boundaries=new Set([source.text.length]);
  for(const span of splitClassroomSpeech(source.text))if(!inside(span.end))boundaries.add(span.end);
  for(const match of source.text.matchAll(/\r?\n\s*\r?\n/gu)){const end=match.index!+match[0].length;if(!inside(end))boundaries.add(end);}
  const ends=[...boundaries].sort((a,b)=>a-b),result:SourceChunk[]=[];let start=0;
  while(start<source.text.length){
    const candidates=ends.filter(end=>end>start&&end<=start+sourceCompilationLimits.chunkMaximum);
    let end=candidates.filter(end=>end<=start+sourceCompilationLimits.chunkTarget).at(-1)??candidates[0];
    if(!end)end=ends.find(end=>end>start)!;
    // Include the final whitespace rather than creating a meaningless whitespace-only chunk.
    if(!source.text.slice(end).trim())end=source.text.length;
    const text=source.text.slice(start,end),sha256=chunkDigest(text),key='chunk_'+chunkDigest(JSON.stringify([sourceCompilationVersion,source.key,source.version,source.fingerprint,start,end,sha256]));
    result.push({key,sourceKey:source.key,start,end,characters:text.length,sha256,text,
      blocks:protectedText.filter(part=>part.block&&part.start>=start&&part.end<=end).map(part=>structuredClone(part.block!)),
      warnings:[...warnings,...(text.length>sourceCompilationLimits.chunkMaximum?['单个不可分结构超过分块预算，请缩小范围或人工处理。']:[])]});start=end;
  }
  if(result.map(chunk=>chunk.text).join('')!==source.text)throw new Error('source_chunk_content_lost');
  return result;
}
export function chunkSource(source:CourseSourceSnapshot,chunk:SourceChunk):CourseSourceSnapshot{
  if(chunk.sourceKey!==source.key||source.text.slice(chunk.start,chunk.end)!==chunk.text||chunkDigest(chunk.text)!==chunk.sha256)throw new Error('source_chunk_mismatch');
  return{...source,key:chunk.key,text:chunk.text,blocks:structuredClone(chunk.blocks),fingerprint:chunk.sha256,range:{sourceKey:source.key,start:chunk.start,end:chunk.end}};
}
