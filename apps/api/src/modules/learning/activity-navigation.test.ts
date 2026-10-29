import { describe, expect, it } from 'vitest';
import { activityNavigationContext } from './activity-navigation';

describe('authorized activity navigation metadata', () => {
  it('keeps independent records independent and uses the actual chemistry course', () => {
    expect(activityNavigationContext(null)).toEqual({ audience: 'independent' });
    expect(activityNavigationContext('child-a', { studentId: 'child-a', subject: 'chemistry' }, '/student/assessment?studentId=child-a&subject=math')).toEqual({ audience: 'student', studentId: 'child-a', subject: 'chemistry' });
  });
  it('does not accept a current course belonging to a different object', () => {
    expect(activityNavigationContext('child-a', { studentId: 'child-b', subject: 'english' }, '/student/assessment?studentId=child-a&subject=math')).toEqual({ audience: 'unavailable' });
    expect(activityNavigationContext(null, { studentId: 'child-a', subject: 'math' })).toEqual({ audience: 'unavailable' });
  });
  it('recovers a matching frozen historical classroom scope without guessing a default', () => {
    expect(activityNavigationContext('child-a', undefined, '/student/assessment?studentId=child-a&subject=english')).toEqual({ audience: 'student', studentId: 'child-a', subject: 'english' });
    expect(activityNavigationContext('child-a')).toEqual({ audience: 'unavailable' });
  });
  it('rejects external, ambiguous, mixed independent or unmatched historical destinations', () => {
    for (const href of ['https://elsewhere.test/student/assessment?studentId=child-a&subject=math', '//elsewhere.test/student/assessment?studentId=child-a&subject=math', '/student/assessment?studentId=child-b&subject=math', '/student/assessment?student=child-a&studentId=child-b&subject=math', '/student/assessment?studentId=child-a&subject=math&subject=chemistry', '/student/assessment?studentId=child-a&subject=math&audience=independent', '/studio?student=child-a&subject=math', '/student/assessment?studentId=child-a&subject=other']) expect(activityNavigationContext('child-a', undefined, href)).toEqual({ audience: 'unavailable' });
  });
});
