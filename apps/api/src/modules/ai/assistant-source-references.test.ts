import 'reflect-metadata';
import type { AssistantSession } from '@study-agent/contracts';
import { describe, expect, it } from 'vitest';
import { classroomCourse } from '../learning/classroom-curriculum';
import { freezeAssistantLecture } from './assistant-lecture-context';
import { freezeTeachingContent, lectureTeachingCatalog } from './assistant-teaching-content';
import { assistantSourcePreview, assistantTeachingSources, trustedAssistantSources, validateAssistantSourceReferences } from './assistant-source-references';

const course = classroomCourse(), meta = course.units[0].lectures[0];
const lecture = (() => {
  const frozen = freezeAssistantLecture(course.id, meta.id);
  if (frozen.protocol !== 'classroom-lecture-v2') throw Error('Expected current teaching protocol');
  return frozen;
})();
const session = { id: 'a session/?&中文', contextRefType: 'classroom_lecture', contextRefId: course.id + '@' + lecture.fingerprint,
  contextItemId: meta.id } as AssistantSession;

describe('frozen teaching source publication and preview boundaries', () => {
  it('revalidates exact reference attributes before publication', () => {
    const refs = trustedAssistantSources(session, lecture.teaching, ['lecture-1-1']);
    expect(validateAssistantSourceReferences(session, lecture.teaching, refs)).toEqual(refs);
    for (const patch of [{ href: 'https://invalid.test' }, { originHref: '/untrusted' }, { page: 100 }, { title: '模型自造标题' },
      { contextFingerprint: 'b'.repeat(64) }, { sourceVersion: 'fake-version' }, { quote: '自造引文' }])
      expect(() => validateAssistantSourceReferences(session, lecture.teaching, [{ ...refs[0], ...patch }])).toThrow();
    expect(() => validateAssistantSourceReferences(session, lecture.teaching, [...refs, ...refs])).toThrow();
    expect(() => validateAssistantSourceReferences(session, lecture.teaching, [{ ...refs[0], html: '<script/>' }])).toThrow();
    expect(validateAssistantSourceReferences(session, lecture.teaching, undefined)).toEqual([]);
  });

  it('does not make omitted or overview-only teaching available through a citation', () => {
    const catalog = lectureTeachingCatalog(course.id, meta.id), detail = freezeTeachingContent(catalog, { mode: 'detail', partKeys: [catalog.parts[0].key] });
    const preview = assistantSourcePreview(session, detail, catalog.sources[0].key, false);
    expect(preview.current).toBe(false); expect(preview.sections).toHaveLength(1); expect(preview.sections[0].key).toBe(catalog.parts[0].key);
    expect(JSON.stringify(preview)).not.toContain(catalog.parts[1].blocks[0].text);
    expect(() => trustedAssistantSources(session, detail, [catalog.sources[1].key])).toThrow();
    expect(() => assistantSourcePreview(session, detail, catalog.sources[1].key, false)).toThrow();
    const overview = freezeTeachingContent(catalog, { mode: 'overview' });
    expect(() => trustedAssistantSources(session, overview, [catalog.sources[0].key])).toThrow();
    expect(() => assistantSourcePreview(session, overview, catalog.sources[0].key, true)).toThrow();
  });

  it('rejects mismatched identities and leaves legacy and uncited messages without invented references', () => {
    expect(assistantTeachingSources({ lecture: { ...lecture, protocol: 'classroom-lecture-v1' } as any })).toBeNull();
    expect(trustedAssistantSources(session, null, undefined)).toEqual([]);
    expect(() => trustedAssistantSources(session, null, ['lecture-1-1'])).toThrow();
    expect(() => assistantSourcePreview(session, null, 'lecture-1-1', false)).toThrow();
    for (const patch of [{ contextItemId: 'other' }, { contextRefType: 'primary_unit' }, { contextRefId: 'other@' + lecture.fingerprint }])
      expect(() => trustedAssistantSources({ ...session, ...patch }, lecture.teaching, ['lecture-1-1'])).toThrow();
  });
});
