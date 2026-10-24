import { describe,it,expect } from 'vitest';
import type { CourseSourceSnapshot } from '@study-agent/contracts';
import { compileSourceChunks,chunkSource } from './source-course-chunks';
const source=(text:string,blocks:CourseSourceSnapshot['blocks']=[]):CourseSourceSnapshot=>({key:'src-1-1',materialId:'fixture',page:1,title:'匿名资料',kind:'text',text,blocks,sha256:'raw',version:'version',fingerprint:'page',structureReviewRequired:false});
function preserve(row:CourseSourceSnapshot){const chunks=compileSourceChunks(row);expect(chunks.map(chunk=>chunk.text).join('')).toBe(row.text);let cursor=0;for(const chunk of chunks){expect(chunk.start).toBe(cursor);expect(chunk.end).toBeGreaterThan(cursor);expect(chunk.text).toBe(row.text.slice(cursor,chunk.end));expect(chunkSource(row,chunk).text).toBe(chunk.text);cursor=chunk.end;}expect(cursor).toBe(row.text.length);return chunks;}
describe('lossless long-source chunks and precise original ranges',()=>{
  it('preserves bilingual paragraphs, trailing whitespace, numbers and emoji across long sources',()=>{
    const row=source(('Dr. Lee measured 3.14 cm.\n\n她问：“还有反例吗？” 😀 先保留原文条件。\n').repeat(500)+'  \n');const chunks=preserve(row);expect(chunks.length).toBeGreaterThan(5);expect(chunks.every(chunk=>chunk.characters<=6000)).toBe(true);expect(chunks.some(chunk=>/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u.test(chunk.text))).toBe(false);
  });
  it('keeps code, formulas, Markdown tables and uniquely located structural blocks together',()=>{
    const table='条件 | 人数\n上午 | 3\n下午 | 5\n',formula='\\('+ 'x+1+'.repeat(100)+'2\\)',code='```js\n'+ 'console.log("a.b");\n'.repeat(110)+'```';
    const text='先对照条件。'.repeat(450)+'\n'+table+formula+'\n'+code+'\n最后核对。'.repeat(400),row=source(text,[{id:'t',kind:'table',headers:['条件','人数'],rows:[['上午','3'],['下午','5']],plainText:table,confidence:null,reviewRequired:true}]);const chunks=preserve(row);
    for(const part of [table,formula,code])expect(chunks.filter(chunk=>chunk.text.includes(part))).toHaveLength(1);
  });
  it('locates exact formulas and retains unlocated/ambiguous structures without invented coverage',()=>{
    const row=source('x = 3.14。\n相同段落。相同段落。',[{id:'f',kind:'formula',latex:'x = 3.14',plainText:'x = 3.14',confidence:null,reviewRequired:false},{id:'p',kind:'paragraph',text:'相同段落。',confidence:null,reviewRequired:true}]),chunks=preserve(row);expect(chunks[0].blocks.map(block=>block.id)).toEqual(['f']);expect(chunks[0].warnings.join('')).toContain('无法唯一定位');
  });
  it('retains a giant protected token intact and marks its budget problem instead of dropping the tail',()=>{
    const token='https://example.com/'+ 'abc'.repeat(2500),chunks=preserve(source('Read this address. '+token+' Next sentence.'));expect(chunks.find(chunk=>chunk.text.includes(token))?.warnings.join('')).toContain('不可分结构');expect(chunks.at(-1)?.text).toContain('Next sentence.');
  });
  it('derives repeatable identities from original content, algorithm and source version',()=>{
    const row=source('First condition. '.repeat(1000)),a=preserve(row);expect(compileSourceChunks(row)).toEqual(a);expect(compileSourceChunks({...row,version:'new'})[0].key).not.toBe(a[0].key);expect(()=>chunkSource({...row,text:'changed'},a[0])).toThrow('mismatch');
  });
  it('does not create a fake unit for an empty page',()=>{expect(compileSourceChunks(source(' \n\t'))).toEqual([]);});
});
