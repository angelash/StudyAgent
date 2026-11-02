import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { gespTeachingBundleSchema } from '@study-agent/contracts';
import bundle from '../../../../../resources/gesp/teaching-candidates-v1.json';
import curriculum from '../../../../../resources/gesp/student-curriculum-v2.json';
import { InMemoryStoreService, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { GespService } from './gesp.service';

const actor = (role: InMemoryUserAccount['role']) => ({ id: 'editorial-test', principal: 'editorial-test', passwordHash: '',
  displayName: '工程合成教研', status: 'active', role }) as InMemoryUserAccount;
const create = () => new GespService(new InMemoryStoreService(), {} as any);
describe('GESP teacher-only original teaching candidates', () => {
  it('keeps all 49 original task identities and exposes the separate, unapproved pack to reviewers', () => {
    expect(gespTeachingBundleSchema.safeParse(bundle).success).toBe(true);
    const service = create(), view = service.teachingCandidates(actor('teacher'), {});
    expect(view.lessons.map(row => row.atomId).sort()).toEqual(curriculum.tasks.map(row => row.atomId).sort());
    expect(view).toMatchObject({ automaticPublication: false, teacherReviewed: false });
    expect(view.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    for (const level of [1, 2, 3, 4]) {
      const filtered = service.teachingCandidates(actor('admin'), { level: String(level) });
      expect(filtered.lessons.map(row => row.atomId)).toEqual(view.lessons.filter(row => row.level === level).map(row => row.atomId));
    }
    expect(service.teachingCandidates(actor('teacher'), { level: '5' }).lessons).toEqual([]);
  });
  it('rejects student and parent access before reading any reference answers', () => {
    for (const role of ['student', 'parent'] as const) expect(() => create().teachingCandidates(actor(role), {})).toThrow('教研权限');
  });
  it('rejects mismatched task provenance rather than silently adopting old teaching links', () => {
    const service = create(), changed = structuredClone(curriculum);
    changed.tasks[0].title += '后续版本'; (service as any).pilot = changed;
    expect(() => service.teachingCandidates(actor('teacher'), {})).toThrow('候选包');
    expect(curriculum.tasks[0].title).not.toContain('后续版本');
  });
});
