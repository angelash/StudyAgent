import { describe,expect,it } from 'vitest';
import { decodeGespCopy,readGespLocation,gespLocationHref } from '../../../web/lib/gesp-workspace';
import { workspaceHref } from '../../../web/lib/workspace-navigation';

describe('GESP certification location and original command recovery boundaries',()=>{
  const studentId='student_11111111-1111-1111-1111-111111111111',taskId='gesp-student-cpp-sum-two';
  it('keeps actual certification levels outside academic subject and grade',()=>{
    const location=readGespLocation('?studentId='+studentId+'&level=3');expect(location).toMatchObject({studentId,level:3});
    const track={kind:'gesp' as const,mode:'manage' as const,studentId,level:3};expect(workspaceHref('courses',undefined,track)).toBe('/parent/gesp?studentId='+studentId+'&level=3');expect(workspaceHref('tasks',{subject:'math'},track)).toBe('/studio/tasks?studentId='+studentId);expect(gespLocationHref('learn',{taskId,level:2})).toBe('/student/gesp?level=2&task='+taskId);
  });
  it('rejects ambiguous aliases, mixed subjects, other learners and malformed original task links',()=>{
    for(const search of ['?student='+studentId+'&studentId=student_22222222-2222-2222-2222-222222222222','?level=2&level=4','?level=5','?subject=math','?grade=4','?task=another-task','?reviewTask=gesp_review_11111111-1111-1111-1111-111111111111'])expect(()=>readGespLocation(search)).toThrow();
    expect(()=>readGespLocation('?studentId=student_22222222-2222-2222-2222-222222222222',studentId)).toThrow();
  });
  it('retains complete code and the original pending command separately and rejects another scope',()=>{
    const scope={ownerId:'actor-a',studentId,taskId,atomId:'gesp-cpp.l1.io'},command={studentId,atomId:scope.atomId,source:'int main(){return 0;}',requestKey:'original-command-1'};
    const value={format:'gesp-workspace-copy-v1',...scope,scopeVersion:1,taskFingerprint:'a'.repeat(64),reviewTaskId:null,source:'// 后续完整修改\n'.repeat(1500),probeAnswers:{},pending:{kind:'code',command}};
    expect(decodeGespCopy(value,scope)).toEqual(value);expect(()=>decodeGespCopy(value,{...scope,ownerId:'actor-b'})).toThrow();expect(()=>decodeGespCopy({...value,pending:{kind:'code',command:{...command,atomId:'gesp-cpp.l1.loop'}}},scope)).toThrow();
  });
});
