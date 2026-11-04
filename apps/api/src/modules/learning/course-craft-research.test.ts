import { describe, expect, it, vi } from 'vitest';
import { CourseCraftResearchService, parseCourseSearch, publicResearchUrl } from './course-craft-research.service';
const html='<div class="vrwrap"><h3><a href="https://example.org/math">分数 &amp; 比</a></h3><p>数学课程包含分数意义、等分和比例关系，按照先备知识逐步学习。</p></div>';
describe('course search evidence comes from returned HTML',()=>{
  it('extracts readable titles and excerpts and refuses dangerous URLs',()=>{expect(parseCourseSearch(html)).toEqual([{title:'分数 & 比',url:'https://example.org/math',content:'数学课程包含分数意义、等分和比例关系，按照先备知识逐步学习。'}]);for(const value of ['javascript:alert(1)','http://127.0.0.1/x','http://169.254.169.254','http://localhost/x','https://user:pass@example.org'])expect(()=>publicResearchUrl(value)).toThrow();});
  it('uses only actual results, sends model-selected keywords and reports failure for empty search',async()=>{
    const chat={structured:vi.fn(async(input,schema,check)=>({...check({queries:['分数 先备知识']}),modelId:input.modelId}))},service=new CourseCraftResearchService(chat as any),fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(html));
    try{const rows=await service.search('我想学分数','selected-model',new AbortController().signal);expect(rows).toHaveLength(1);expect(rows[0].kind).toBe('search_excerpt');expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('query')).toBe('分数 先备知识');fetchMock.mockResolvedValue(new Response('<html>blocked</html>'));await expect(service.search('主题','selected-model',new AbortController().signal)).rejects.toThrow('暂未完成');}finally{fetchMock.mockRestore();}
  });
});
