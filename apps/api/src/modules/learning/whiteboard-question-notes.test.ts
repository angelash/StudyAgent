import { describe, expect, it } from 'vitest';
import type { WhiteboardTeachingNotes } from '@study-agent/contracts';
import { whiteboardQuestionNotesMarkdown } from '../../../../web/app/studio/whiteboard-question-notes';

describe('complete readable whiteboard teaching notes', () => {
  it('retains every original line, complete table/formula and all twelve questions beyond one history page', () => {
    const notes: WhiteboardTeachingNotes = { format:'studyagent-whiteboard-notes-v1', exportedAt:'2026-10-27', ownerId:'owner', boardKind:'guidance', boardId:'original', definitionHash:'a'.repeat(64), notices:['原讲解与AI补充分开'],
      original:{ id:'original',studentId:'synthetic-child',subject:'math',atomId:'unit',title:'原讲解',prompt:'匿名问题',fingerprint:'a'.repeat(64),width:1280,height:720,durationMs:1000,createdAt:'2026-10-27',updatedAt:'2026-10-27',
        scenes:[{id:'source',kind:'concept',title:'完整条件',narration:'原讲稿首行。\n原讲稿尾行。',durationMs:1000,bullets:['提炼要点'],
          exhibits:[{kind:'table',headers:['范围','条件'],rows:[['首行','完整首部'],['尾行','完整尾部']]},{kind:'formula',latex:'\\sqrt{9}+z',explanation:'完整原式末尾保留z'}]}]},
      turns:Array.from({length:12},(_,index)=>({id:'turn-'+index,boardKind:'guidance',boardId:'original',requestKey:'request-'+index,message:'原问题 '+index+'\n```不要打断外层代码段```',intent:'question',modelId:'deepseek-v4-flash',modelName:'DeepSeek V4.1 Flash',
        position:{presentationVersion:'whiteboard-speech-v1',fingerprint:'a'.repeat(64),sceneId:'source',unitId:'unit',sentenceText:'原句保持。'},revision:1,createdAt:'2026-10-27',updatedAt:'2026-10-27',status:index===11?'failed':'completed',
        reply:index===11?null:{text:'原回答 '+index,anchors:[],modelId:'deepseek-v4-flash',modelName:'DeepSeek V4.1 Flash',createdAt:'2026-10-27'},task:null,originalStatus:index===0?'archived':'current'})) };
    const before=structuredClone(notes), result=whiteboardQuestionNotesMarkdown(notes);
    expect(result).toContain('原讲稿首行。\n原讲稿尾行。');expect(result).toContain('| 尾行 | 完整尾部 |');expect(result).toContain('\\sqrt{9}+z');
    expect(result).toContain('### 提问 12');expect(result).toContain('原问题 11');expect(result).toContain('状态：回答未完成');expect(result).toContain('原稿状态：历史版本');
    expect(result).toContain('````text\n原问题 0\n```不要打断外层代码段```\n````');expect(result).not.toContain('原回答 11');expect(notes).toEqual(before);
  });
});
