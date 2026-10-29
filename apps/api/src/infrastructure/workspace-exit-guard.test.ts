import { describe, expect, it } from 'vitest';
import { sameWorkspaceActivity } from '../../../web/lib/workspace-exit-guard';

describe('workspace activity exit boundaries', () => {
  const current='https://study.invalid/studio/projects?project=original&sourceCourseId=source-a&studentId=child-a&subject=chemistry&stage=first&step=intro';
  it('keeps stage, step and presentation changes inside the same authorized activity', () => {
    expect(sameWorkspaceActivity(current.replace('stage=first&step=intro','stage=second&step=reflection&view=complete'), current)).toBe(true);
  });
  it('treats another object, subject, course, project or route as leaving', () => {
    for(const next of [current.replace('child-a','child-b'),current.replace('chemistry','math'),current.replace('source-a','source-b'),current.replace('project=original','project=other'),current.replace('/studio/projects','/studio/tasks'),current.replace('https://study.invalid','https://elsewhere.test'),current+'&subject=math'])expect(sameWorkspaceActivity(next,current)).toBe(false);
  });
  it('keeps an answer-item change in one session but protects switching the original session', () => {
    const current='https://study.invalid/library/practice?session=first&item=a';
    expect(sameWorkspaceActivity('/library/practice?session=first&item=b',current)).toBe(true);
    expect(sameWorkspaceActivity('/library/practice?session=second&item=a',current)).toBe(false);
  });
});
