import { describe,expect,it } from 'vitest';
import { learnerCopySchema,preparationCopySchema,readPracticeLocation,practiceWorkspaceHref } from '../../../web/lib/assistant-practice-workspace';
import { sameWorkspaceActivity } from '../../../web/lib/workspace-exit-guard';

describe('conversation practice complete copies and original activity boundaries',()=>{
 const studentId='student-original',ownerId='learner-original',baseHash='a'.repeat(64);
 it('rejects ambiguous aliases, another learner and incomplete activity links',()=>{
  expect(()=>readPracticeLocation('?student=a&studentId=b')).toThrow();
  expect(()=>readPracticeLocation('?studentId=another&subject=math',studentId)).toThrow();
  expect(()=>readPracticeLocation('?assistantPractice=practice-original&subject=math')).toThrow();
  expect(()=>readPracticeLocation('?studentId='+studentId+'&subject=math&assistantAssignment=a&assistantAssignment=b')).toThrow();
  expect(()=>readPracticeLocation('?studentId='+studentId+'&subject=math&track=gesp')).toThrow();
  const location={studentId,subject:'chemistry' as const,assignmentId:'assignment-original',practiceId:'practice-original',questionId:'question-original'};
  expect(readPracticeLocation(practiceWorkspaceHref(location).split('?')[1],studentId)).toEqual(location);
  const href='https://study.invalid'+practiceWorkspaceHref(location);
  expect(sameWorkspaceActivity(practiceWorkspaceHref({...location,questionId:'next-question'}),href)).toBe(true);
  expect(sameWorkspaceActivity(practiceWorkspaceHref({...location,practiceId:'another-practice'}),href)).toBe(false);
 });
 it('preserves later native inputs independently of the original submitted answer and reason',()=>{
  const answer={questionId:'question-original',mode:'table_fill',response:{cells:{'r:a':'原答案','r:b':'完整第二格'}}};
  const pending={kind:'response',command:{protocol:'assistant-practice-answer-v1',questionId:'question-original',answer,learnerExplanation:'原提交理由',disposition:'answered',elapsedMs:123,requestKey:'original-key',draftFence:{actorId:ownerId,revision:1,baseHash,attempt:0}}};
  const copy={format:'assistant-practice-workspace-copy-v1',phase:'answer',ownerId,studentId,subject:'math',assignmentId:'assignment-original',practiceId:'practice-original',questionId:'question-original',answer:{...answer,response:{cells:{'r:a':'后续编辑','r:b':'完整第二格'}}},learnerExplanation:'后续完整理由',base:{protocol:'answer-draft-v2',actorId:ownerId,revision:1,baseHash,attempt:0,savedAt:null,editable:true,hasSubmission:false},retrying:false,pending};
  const saved=learnerCopySchema.parse(JSON.parse(JSON.stringify(copy)));
  expect(saved.pending).toEqual(pending);expect(saved.answer.response.cells).toEqual({'r:a':'后续编辑','r:b':'完整第二格'});expect(saved.learnerExplanation).toBe('后续完整理由');
  expect(()=>learnerCopySchema.parse({...copy,questionId:'another-question'})).toThrow();
  expect(()=>learnerCopySchema.parse({...copy,ownerId:'another-owner'})).toThrow();
 });
 it('rejects a restored original arrangement command aimed at a different child',()=>{
  const copy={format:'assistant-practice-workspace-copy-v1',phase:'prepare',ownerId:'parent-original',sourceSessionId:'source-original',form:{messageIds:['message-original'],includeLinkedQuestions:true,studentId,subject:'math',atomIds:['atom-original'],objective:'完整教学目标',acknowledgeHistoricalSource:false,acknowledgeAudienceTransfer:false},title:'教学标题',instructions:'完整教学说明',artifactId:'artifact-original',artifactRevision:1,artifactFingerprint:baseHash,assignmentId:null,pending:{kind:'assign',artifactId:'artifact-original',command:{studentId:'another-student',expectedRevision:1,contentFingerprint:baseHash,acknowledgePreview:true,requestKey:'original-assignment'}}};
  expect(()=>preparationCopySchema.parse(copy)).toThrow();
  expect(preparationCopySchema.parse({...copy,pending:{...copy.pending,command:{...copy.pending.command,studentId}}}).instructions).toBe(copy.instructions);
 });
});
