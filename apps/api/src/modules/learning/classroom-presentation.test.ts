import { describe,it,expect } from 'vitest';
import { splitClassroomSpeech,classroomReadingMs,classroomSentences } from '@study-agent/contracts';
import { freezeSpeechTrack,verifySpeechTrack } from './classroom-presentation';

function units(text:string){const spans=splitClassroomSpeech(text);let cursor=0;for(const span of spans){expect(span.start).toBeGreaterThanOrEqual(cursor);expect(text.slice(cursor,span.start).trim()).toBe('');expect(span.text).toBe(text.slice(span.start,span.end).replace(/\s+/gu,' ').trim());cursor=span.end;}expect(text.slice(cursor).trim()).toBe('');expect(spans.map(span=>span.text).join('').replace(/\s/gu,'')).toBe(text.replace(/\s/gu,''));return spans.map(span=>span.text);}
describe('frozen classroom speech spans and bilingual sentence boundaries',()=>{
  it('keeps English titles, initials, decimals, percentages, versions and abbreviations intact',()=>{
    expect(units('Dr. Lee measured 3.14 cm. Next, compare 1/2 and 50%. A. Smith uses v1.2.3.')).toEqual(['Dr. Lee measured 3.14 cm.','Next, compare 1/2 and 50%.','A. Smith uses v1.2.3.']);
    expect(units('Use e.g. a U.S. example, i.e. a limited observation. Then verify.')).toEqual(['Use e.g. a U.S. example, i.e. a limited observation.','Then verify.']);
  });
  it('protects URLs, email, inline code and LaTeX while retaining sentence punctuation and closing quotes',()=>{
    const text='Visit https://example.com/a.b. Contact a.b@example.com. Read `x.y();` and \\(x=3.14\\). “Ready?!” Yes.';
    expect(units(text)).toEqual(['Visit https://example.com/a.b.','Contact a.b@example.com.','Read `x.y();` and \\(x=3.14\\).','“Ready?!”','Yes.']);
    expect(units('See https://example.com/Function_(math). Then continue.')).toEqual(['See https://example.com/Function_(math).','Then continue.']);
  });
  it('preserves Chinese question/quote boundaries, mixed language, emoji, paragraphs and normalized whitespace',()=>{
    expect(units('她问：“可以开始吗？！”然后写下第一条要点。\r\n\r\n  Next,   compare 3.14 and 3.1. 😀 Done!')).toEqual(['她问：“可以开始吗？！”','然后写下第一条要点。','Next, compare 3.14 and 3.1.','😀 Done!']);
    expect(splitClassroomSpeech(' \n\t')).toEqual([]);
  });
  it('wraps long explanations by clauses or words without fragmenting a long token or dropping content',()=>{
    const english='Compare the recorded conditions carefully, then identify what additional observation would distinguish a temporary coincidence from an explanation that also holds in a different setting, and retain both confirming evidence and counterexamples.';
    expect(units(english).length).toBeGreaterThan(1);expect(units('先说明当前条件，'+ '然后比较不同情境中的证据与反例，'.repeat(8)+'最后再检验结论。').length).toBeGreaterThan(1);
    const url='https://example.com/'+ 'abcdefgh'.repeat(40);expect(units(url)).toEqual([url]);
    expect(units('Use ```\nconsole.log("first. second.");\n``` as a code sample.')).toHaveLength(1);
  });
  it('freezes stable source-derived identities and rejects changed text, ranges, source or ordering',()=>{
    const text='First sentence. Second sentence.',track=freezeSpeechTrack(text);expect(freezeSpeechTrack(text)).toEqual(track);expect(verifySpeechTrack(text,track)).toEqual(track);
    for(const edit of [(row:any)=>{row.units[0].text='Wrong';},(row:any)=>{row.units[0].start=1;},(row:any)=>{row.units.reverse();},(row:any)=>{row.sourceSha256='wrong';}]){const copy=structuredClone(track);edit(copy);expect(()=>verifySpeechTrack(text,copy)).toThrow();}
  });
  it('retains the exact legacy split and uses words rather than individual letters for new English reading estimates',()=>{
    const text='Dr. Lee measured 3.14 cm. Next, compare the values.';expect(freezeSpeechTrack(text,'legacy-v1').units.map(unit=>unit.text)).toEqual(classroomSentences(text));
    expect(classroomReadingMs(text,'legacy-v1')).toBe(Math.max(1600,text.length*165));expect(classroomReadingMs(text,'speech-v2')).toBeLessThan(classroomReadingMs(text,'legacy-v1'));expect(classroomReadingMs('先统一分数单位。','speech-v2')).toBeGreaterThanOrEqual(1600);
  });
});
