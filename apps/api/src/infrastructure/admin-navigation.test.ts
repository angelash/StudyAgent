import { describe, expect, it } from 'vitest';
import { adminWorkspaceEntries,allowedAdminWorkspace } from '../../../web/lib/admin-navigation';
import { workspaceLoginDestination } from '../../../web/lib/workspace-navigation';
describe('admin workspace navigation follows the existing service roles',()=>{
  it('allows exactly the teacher modules and all nine administrator modules',()=>{
    expect(adminWorkspaceEntries.filter(entry=>allowedAdminWorkspace('teacher',entry.path)).map(entry=>entry.id)).toEqual(['curriculum','reviews','measurement','gesp']);
    expect(adminWorkspaceEntries.filter(entry=>allowedAdminWorkspace('admin',entry.path))).toHaveLength(9);
    for(const role of ['parent','student','unknown'])expect(adminWorkspaceEntries.some(entry=>allowedAdminWorkspace(role,entry.path))).toBe(false);
    expect(allowedAdminWorkspace('admin','/admin/unregistered')).toBe(false);
  });
  it('returns login to an existing authorized module only',()=>{
    expect(workspaceLoginDestination('/admin/content?question=original','admin')).toBe('/admin/content?question=original');
    expect(workspaceLoginDestination('/admin/reviews?studentId=child-a','teacher')).toBe('/admin/reviews?studentId=child-a');
    expect(workspaceLoginDestination('/admin/accounts','teacher')).toBe('/studio');
    expect(workspaceLoginDestination('/admin/reviews','parent')).toBe('/studio');
    expect(workspaceLoginDestination('/admin/content?token=secret','admin')).toBe('/studio');
  });
});
