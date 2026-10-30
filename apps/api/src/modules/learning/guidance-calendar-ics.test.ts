import { describe,it,expect } from 'vitest';
import { renderIcs } from './ics-calendar';

describe('original guidance calendar ICS identity and public return',()=>{
 const event={uid:'studyagent:actual-guidance-event',title:'核对条件与独立新题',description:'完成日程不代表掌握；真实复测仍从原任务开始。',startsAt:'2026-11-02T10:00:00.000Z',endsAt:'2026-11-02T10:15:00.000Z',sequence:3,status:'CONFIRMED' as const,url:'https://owned-qa.example/studio/tasks?studentId=owned-child&subject=math&view=plan&planId=original-plan'};
 const unfolded=(value:string)=>value.replace(/\r\n[ \t]/g,'');
 it('keeps the stable original UID, real UTC times and sequence across repeated exports',()=>{
  const first=unfolded(renderIcs('学习日历',[event])),second=unfolded(renderIcs('学习日历',[event]));for(const valueof of [first,second]){expect(valueof).toContain('UID:'+event.uid+'\r\n');expect(valueof).toContain('SEQUENCE:3\r\n');expect(valueof).toContain('DTSTART:20261102T100000Z\r\n');expect(valueof).toContain('URL:'+event.url+'\r\n');}expect(first.match(/UID:/g)).toHaveLength(1);
 });
 it('exports a cancellation with the same real identity and next sequence',()=>{
  const output=unfolded(renderIcs('学习日历',[{...event,sequence:4,status:'CANCELLED'}]));expect(output).toContain('UID:'+event.uid+'\r\n');expect(output).toContain('SEQUENCE:4\r\n');expect(output).toContain('STATUS:CANCELLED\r\n');
 });
 it('refuses active or credential-bearing return URLs and cannot inject additional ICS properties through text',()=>{
  for(const url of ['javascript:alert(1)','https://user:private@owned-qa.example/','https://owned-qa.example/\r\nPRIVATE:secret','/relative-without-known-origin'])expect(unfolded(renderIcs('学习日历',[{...event,url}]))).not.toContain('\r\nURL:');
  const output=unfolded(renderIcs('学习日历',[{...event,title:'原标题\nATTENDEE:forged',description:'保留正文\nPRIVATE:still-text'}]));expect(output).not.toContain('\r\nATTENDEE:');expect(output).not.toContain('\r\nPRIVATE:');expect(output).toContain('SUMMARY:原标题\\nATTENDEE:forged');
 });
});
