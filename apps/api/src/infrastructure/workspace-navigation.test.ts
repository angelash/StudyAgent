import { afterEach, describe, expect, it, vi } from 'vitest';
import { learningContextIssue, readLearningContext, saveLearningContext } from '../../../web/lib/learning-context';
import { legacyWorkspaceHref, workspaceArea, workspaceHref, workspaceLoginDestination } from '../../../web/lib/workspace-navigation';

describe('workspace learning object and legacy navigation boundaries',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('rejects contradictory aliases, mixed adult/child intent and unsupported subjects',()=>{
    expect(learningContextIssue('?student=child-a&studentId=child-b')).toContain('不一致');
    expect(learningContextIssue('?student=child-a&studentId=child-a')).toBeNull();
    expect(learningContextIssue('?student=child-a&courseScope=adult')).toContain('同时选择');
    expect(learningContextIssue('?audience=independent&studentId=child-a')).toContain('同时选择');
    expect(learningContextIssue('?subject=unsupported')).toContain('学科');
    expect(learningContextIssue('?student=child-a&student=child-b')).toContain('重复');
  });
  it('adapts old home and report URLs explicitly and rejects unsafe login destinations',()=>{
    expect(legacyWorkspaceHref('home',{student:'child-a',subject:'english',token:'private'})).toBe('/studio?student=child-a&subject=english');
    expect(legacyWorkspaceHref('reports',{student:'child-a',studentId:'child-b',subject:'math'})).toBe('/studio/reports?student=child-a&studentId=child-b&subject=math&tab=knowledge');
    expect(workspaceLoginDestination('/studio/classroom?session=original&lesson=lesson-a','parent')).toBe('/studio/classroom?session=original&lesson=lesson-a');
    for(const value of ['https://elsewhere.test','//elsewhere.test','/\\elsewhere.test','/parent/login','/studio?token=secret','/studio?returnTo=//elsewhere.test','/studio\n'])expect(workspaceLoginDestination(value,'parent')).toBe('/studio');
    expect(workspaceLoginDestination('/parent/access?studentId=child-a','student')).toBe('/studio');
  });
  it('does not restore a child into explicit or saved self learning, or another actor',()=>{
    const values=new Map<string,string>();vi.stubGlobal('sessionStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
    saveLearningContext('parent-a',{studentId:'child-a',subject:'english'});
    expect(readLearningContext('parent-a','?courseScope=adult')).toEqual({studentId:undefined,subject:'english',audience:'self'});
    expect(readLearningContext('parent-b','').studentId).toBeUndefined();
    saveLearningContext('parent-a',{studentId:'stale-child',subject:'math',audience:'self'});
    expect(readLearningContext('parent-a','').audience).toBe('self');expect(readLearningContext('parent-a','').studentId).toBeUndefined();
    expect(readLearningContext('parent-a','?student=child-b').studentId).toBe('child-b');
  });
  it('preserves object intent when navigating and adapts historical areas',()=>{
    expect(workspaceHref('tasks',{studentId:'child-a',subject:'english'})).toBe('/studio/tasks?studentId=child-a&subject=english');
    expect(workspaceHref('courses',{studentId:'stale-child',subject:'math',audience:'self'})).toBe('/studio?view=courses&courseScope=adult');
    expect(workspaceHref('tasks',{subject:'math',audience:'self'})).toBe('/studio/tasks?audience=independent');
    expect(workspaceArea('/library/practice/review','')).toBe('materials');
    expect(workspaceArea('/student/assessment','?view=plan')).toBe('tasks');
    expect(workspaceArea('/student/assessment','?session=old','reports')).toBe('reports');
    expect(workspaceArea('/admin/imports','')).toBe('admin');
  });
});
