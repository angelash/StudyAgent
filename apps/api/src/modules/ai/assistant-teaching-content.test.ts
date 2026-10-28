import { describe, expect, it } from 'vitest';
import type { AtomTeaching, StudioCourse } from '@study-agent/contracts';
import type { SourceCourseRecord } from '../learning/source-course-content';
import { classroomCourse, classroomLesson } from '../learning/classroom-curriculum';
import { describeTeachingContent, freezeTeachingContent, lectureTeachingCatalog, materialLessonTeachingCatalog,
  primaryUnitTeachingCatalog, readTeachingContent, teachingContentReference } from './assistant-teaching-content';

const teaching = (): AtomTeaching => ({ reviewStatus: 'approved', explanation: '先确认所比较的量来自同一个整体，再统一单位。完整讲解尾标。',
  example: { prompt: '比较同一个整体中的两份数量。', steps: ['确认同一个整体', '统一每一份的大小'], conclusion: '单位相同后才能直接比较。' },
  commonErrors: [{ code: 'unit', observation: '只比较数字而没有检查单位。', alternativeExplanations: ['可能未辨清同一整体。'], verification: '换一个整体和数字，再请学习者说明单位关系。' }],
  verification: { understanding: '请说明为什么比较前必须统一单位。', procedure: '请逐步解释一次统一单位的操作。',
    transfer: '换一个新的生活情境检查同一关系。', retention: '间隔一段时间再用独立新题核对。' } });
function primary(): StudioCourse {
  return { id: 'primary', studentId: 'PRIVATE_STUDENT', subject: 'math', grade: 5, term: 'upper', title: '比较数量', description: '单元课程',
    objective: '理解统一单位', status: 'active', source: 'studyagent_curriculum', scopeVersion: 2, textbookVersion: 'book-v1', focusAtomIds: ['unit'],
    units: [{ id: 'unit-1', title: '同一整体', objective: '比较之前先核对整体与单位', lessons: [
      { id: 'learn:unit', atomId: 'unit', title: '统一单位', objective: '解释统一单位的依据', kind: 'learn', state: 'not_started', href: '/PRIVATE_ROUTE',
        teaching: { atomVersion: 3, teaching: teaching() } },
      { id: 'practice:unit', atomId: 'unit', title: 'PRIVATE_PRACTICE', objective: 'PRIVATE_PRACTICE', kind: 'practice', state: 'mastered', href: '/PRIVATE_ROUTE' },
    ] }], materials: [], fingerprint: 'UNRELATED_DRAFT_HASH', createdAt: 'before', updatedAt: 'before' };
}
function material(): SourceCourseRecord {
  return { id: 'material', ownerUserId: 'PRIVATE_OWNER', studentId: null, subject: null, audience: 'adult', targetGoals: [],
    input: { title: 'PRIVATE_PROMPT', goal: 'PRIVATE_PROMPT', language: 'zh-CN', minutesPerSession: 15, modelId: 'fixture', targetAtomIds: [] },
    sources: [{ key: 'page-one', materialId: 'PRIVATE_UPLOAD', page: 3, title: '公开教学资料', kind: 'text', text: 'PRIVATE_FULL_TEXT', blocks: [], sha256: 'source-sha', version: 'source-v1', fingerprint: 'private-original-hash', structureReviewRequired: false }],
    revision: 1, status: 'active', taskId: 'PRIVATE_TASK', fingerprint: 'PRIVATE_GENERATION_HASH', modelName: 'PRIVATE_MODEL', confirmedAt: 'before',
    originalResult: null, edits: [], createdAt: 'before', updatedAt: 'before', requests: [],
    result: { title: '数量的比较', overview: '公开概览', lessons: [{ title: '统一单位', objective: '理解单位的一致性', introduction: '先看两个量是否来自同一整体。',
      concept: '单位表示被分出的每一份有多大。', notes: ['先核对整体', '再核对单位'],
      example: { scenario: '比较同一条纸带的两部分。', steps: ['保持整体不变', '统一每份大小'], board: ['同一整体', '相同单位'], conclusion: '单位一致后再比较数量。' },
      misconception: { claim: '数字较大就一定更多。', correction: '必须先检查单位是否相同。', board: ['核对单位', '说明依据'] },
      transfer: '将关系用于一条新的纸带。', summary: '比较数量之前先统一单位。', takeaways: ['先核对整体', '再解释单位'],
      citations: [{ sourceKey: 'page-one', quote: '比较数量之前先统一单位。' }],
      questions: [{ prompt: 'PRIVATE_QUESTION', options: ['PRIVATE_OPTION', 'B', 'C', 'D'], answer: 0, explanation: 'PRIVATE_ANSWER', hints: ['PRIVATE_HINT', 'PRIVATE_HINT'] }] }] } };
}
const lessonId = 'source:material:1';
const frozenPrimary = () => freezeTeachingContent(primaryUnitTeachingCatalog(primary(), 'unit-1'));

describe('authorized teaching content projections, before HTTP integration', () => {
  it('projects every authored lecture, including actual narration and every teaching step', () => {
    const course = classroomCourse(); let lectures = 0, lessons = 0;
    for (const unit of course.units) for (const lecture of unit.lectures) {
      const catalog = lectureTeachingCatalog(course.id, lecture.id), descriptor = describeTeachingContent(catalog);
      const expected = lecture.lessons.map(l => classroomLesson(l.id)!);
      expect(catalog.targets.map(x => x.id)).toEqual(lecture.lessons.map(x => x.id));
      expect(catalog.parts).toHaveLength(expected.reduce((sum, x) => sum + x.steps.length, 0));
      for (const lesson of expected) for (const step of lesson.steps) expect(JSON.stringify(catalog)).toContain(JSON.stringify(step.narration).slice(1, -1));
      expect(freezeTeachingContent(catalog, descriptor.completeFits ? { mode: 'complete' } : { mode: 'overview' }).protocol).toBe('classroom-lecture-v2');
      expect(JSON.stringify(catalog)).not.toMatch(/questions|answerKeys|hintKeys|privatePrompt/);
      lectures++; lessons += catalog.targets.length;
    }
    expect([lectures, lessons]).toEqual([15, 60]);
  });

  it('preserves code and structured tables while ignoring scoring getters and remote image URLs', () => {
    const course = classroomCourse(), lecture = course.units[0].lectures[0];
    const resolve = (id: string) => {
      const lesson = classroomLesson(id)!;
      Object.defineProperty(lesson, 'questions', { get() { throw Error('must not read questions'); } });
      lesson.steps[0].blocks.push({ id: 'image', kind: 'image', text: '概念示意', image: { src: 'https://PRIVATE_REMOTE', alt: '两个相交的圆', caption: '关系图' } },
        { id: 'table', kind: 'table', text: '比较', table: { headers: ['A', 'B'], rows: [['原始格值', '保持全部行']] } },
        { id: 'code', kind: 'code', text: '代码示例', code: 'console.log("UNMODIFIED_CODE");' });
      return lesson;
    };
    const catalog = lectureTeachingCatalog(course.id, lecture.id, course, resolve), raw = JSON.stringify(catalog);
    expect(raw).toContain('原始格值'); expect(raw).toContain('UNMODIFIED_CODE'); expect(raw).toContain('两个相交的圆');
    expect(raw).not.toMatch(/PRIVATE_REMOTE|questions|answer|hint/);
  });

  it('detects narration changes without a version or goal change and retains the detached old snapshot', () => {
    const course = classroomCourse(), lecture = course.units[1].lectures[0], original = lectureTeachingCatalog(course.id, lecture.id, course);
    const snapshot = freezeTeachingContent(original, { mode: 'detail', partKeys: [original.parts[0].key] });
    const changed = lectureTeachingCatalog(course.id, lecture.id, course, id => {
      const lesson = classroomLesson(id)!; lesson.steps[0].narration += ' 新的教学解释。'; return lesson;
    });
    expect(changed.courseVersion).toBe(original.courseVersion); expect(changed.targets).toEqual(original.targets);
    expect(readTeachingContent(snapshot, teachingContentReference(snapshot), lecture.id, changed, false)).toEqual({ snapshot, current: false });
    expect(() => readTeachingContent(snapshot, teachingContentReference(snapshot), lecture.id, changed, true)).toThrow('课程教学内容已变化');
    expect(readTeachingContent(snapshot, teachingContentReference(snapshot), lecture.id, null, false).current).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain('新的教学解释');
  });

  it('does not use an unrelated or inconsistent lesson as lecture teaching', () => {
    const course = classroomCourse(), lecture = course.units[0].lectures[0];
    expect(() => lectureTeachingCatalog('wrong', lecture.id, course)).toThrow('课程不存在');
    expect(() => lectureTeachingCatalog(course.id, lecture.id, course, () => undefined)).toThrow('目录与教学正文不一致');
    expect(() => lectureTeachingCatalog(course.id, lecture.id, course, id => ({ ...classroomLesson(id)!, lectureId: 'other' }))).toThrow('目录与教学正文不一致');
    course.units[1].lectures.push(lecture);
    expect(() => lectureTeachingCatalog(course.id, lecture.id, course)).toThrow('标识不唯一');
  });

  it('uses only approved learn cards, all misconceptions and verification dimensions, without student states', () => {
    const course = primary(), catalog = primaryUnitTeachingCatalog(course, 'unit-1'), raw = JSON.stringify(catalog);
    expect(catalog.targets).toEqual([{ id: 'learn:unit', title: '统一单位', objective: '解释统一单位的依据', atomId: 'unit', atomVersion: 3 }]);
    expect(catalog.parts.map(x => x.key)).toEqual(['atom-1:concept', 'atom-1:example', 'atom-1:misconception-1',
      'atom-1:verification-understanding', 'atom-1:verification-procedure', 'atom-1:verification-transfer', 'atom-1:verification-retention']);
    expect(raw).toContain('完整讲解尾标'); expect(raw).not.toMatch(/PRIVATE_|mastered|state|studentId|fingerprint/);
    course.units[0].lessons[0].teaching!.teaching.explanation = 'Changed after projection';
    expect(raw).toBe(JSON.stringify(catalog));
  });

  it.each(['missing', 'draft'] as const)('refuses a %s teaching card instead of silently dropping a target', state => {
    const course = primary();
    if (state === 'missing') delete course.units[0].lessons[0].teaching; else course.units[0].lessons[0].teaching!.teaching.reviewStatus = 'draft';
    expect(() => primaryUnitTeachingCatalog(course, 'unit-1')).toThrow('缺已审核教学卡');
  });

  it('does not change teaching identity on progress, draft hash, timestamps or course status changes', () => {
    const course = primary(), original = frozenPrimary();
    course.status = 'completed'; course.fingerprint = 'ANOTHER_DRAFT_HASH'; course.updatedAt = 'after'; course.units[0].lessons[0].state = 'mastered';
    course.learningProgress = { viewedLessonIds: ['learn:unit'], startedLessonIds: [], lastLessonId: 'learn:unit', updatedAt: 'after' };
    expect(freezeTeachingContent(primaryUnitTeachingCatalog(course, 'unit-1')).fingerprint).toBe(original.fingerprint);
    course.units[0].lessons[0].teaching!.atomVersion++;
    expect(freezeTeachingContent(primaryUnitTeachingCatalog(course, 'unit-1')).fingerprint).not.toBe(original.fingerprint);
  });

  it('never reads material questions, the raw upload text, private prompts or generation responses', () => {
    const course = material();
    for (const [object, property] of [[course.result!.lessons[0], 'questions'], [course.sources[0], 'text'], [course, 'input'], [course, 'originalResult']] as const)
      Object.defineProperty(object, property, { get() { throw Error('private field read: ' + property); } });
    const catalog = materialLessonTeachingCatalog(course, lessonId), raw = JSON.stringify(catalog);
    expect(catalog.parts).toHaveLength(6); expect(catalog.sources).toMatchObject([{ sourceKey: 'page-one', page: 3, quote: '比较数量之前先统一单位。' }]);
    expect(raw).toContain('将关系用于一条新的纸带'); expect(raw).not.toMatch(/PRIVATE_|questions|answer|hint|ownerUserId|materialId|generation/);
  });

  it('keeps a published material teaching identity independent of draft creation and reading revisions', () => {
    const course = material(), first = freezeTeachingContent(materialLessonTeachingCatalog(course, lessonId));
    course.revision++; course.updatedAt = 'after'; course.status = 'archived'; course.requests.push({ key: 'private', hash: 'private', kind: 'revise' });
    expect(freezeTeachingContent(materialLessonTeachingCatalog(course, lessonId)).fingerprint).toBe(first.fingerprint);
    course.result!.lessons[0].citations[0].quote += ' 新的短摘。';
    expect(freezeTeachingContent(materialLessonTeachingCatalog(course, lessonId)).fingerprint).not.toBe(first.fingerprint);
    course.sources[0].version = 'source-v2';
    expect(readTeachingContent(first, teachingContentReference(first), lessonId, materialLessonTeachingCatalog(course, lessonId), false).current).toBe(false);
  });

  it('resolves compiled citation ranges using metadata without reopening the original full text', () => {
    const course = material(); course.result!.lessons[0].citations[0].sourceKey = 'chunk-one';
    course.compilation = { manifest: [{ key: 'chunk-one', sourceKey: 'page-one', start: 10, end: 100 }] } as unknown as SourceCourseRecord['compilation'];
    const catalog = materialLessonTeachingCatalog(course, lessonId);
    expect(catalog.sources[0]).toMatchObject({ sourceKey: 'page-one', page: 3, sourceVersion: 'source-v1', range: { start: 10, end: 100 } });
    course.compilation!.manifest[0].end = 5;
    expect(() => materialLessonTeachingCatalog(course, lessonId)).toThrow('条目标识或引用不一致');
  });

  it('refuses missing and ambiguous material citations and lesson identities', () => {
    const course = material(); course.sources = [];
    expect(() => materialLessonTeachingCatalog(course, lessonId)).toThrow('引用原件缺失或不唯一');
    const duplicate = material(); duplicate.result!.lessons.push(structuredClone(duplicate.result!.lessons[0])); duplicate.lessonIds = [lessonId, lessonId];
    expect(() => materialLessonTeachingCatalog(duplicate, lessonId)).toThrow('标识不唯一');
    expect(() => materialLessonTeachingCatalog(material(), 'another')).toThrow('课时不存在');
  });

  it('offers every oversized teaching part and all goals, and never silently clips a card', () => {
    const course = primary(), card = course.units[0].lessons[0];
    card.teaching!.teaching.explanation = '完整讲解'.repeat(700);
    card.teaching!.teaching.commonErrors = Array.from({ length: 12 }, (_, i) => ({ code: 'error-' + i, observation: '误区观察' + i,
      alternativeExplanations: ['可能解释'.repeat(80)], verification: '完整验证要求'.repeat(100) }));
    const catalog = primaryUnitTeachingCatalog(course, 'unit-1'), descriptor = describeTeachingContent(catalog);
    expect(descriptor.completeFits).toBe(false); expect(descriptor.parts).toHaveLength(18);
    expect(() => freezeTeachingContent(catalog)).toThrow('超过本次上下文容量');
    const overview = freezeTeachingContent(catalog, { mode: 'overview' });
    expect(overview.targets).toEqual(catalog.targets); expect(overview.parts).toEqual([]); expect(overview.sources).toEqual([]);
    expect(overview.coverage).toEqual({ totalParts: 18, includedParts: 0, totalTargets: 1, includedTargets: 1, complete: false });
    const selected = freezeTeachingContent(catalog, { mode: 'detail', partKeys: [catalog.parts[0].key] });
    expect(selected.parts[0].blocks[0].text).toBe(card.teaching!.teaching.explanation);
    expect(selected.coverage.includedParts).toBe(1); expect(JSON.stringify(selected).length).toBe(descriptor.parts[0].selectedCharacters);
  });

  it('canonically orders detail choices and rejects unknown or duplicated parts', () => {
    const catalog = primaryUnitTeachingCatalog(primary(), 'unit-1'), keys = catalog.parts.slice(0, 2).map(x => x.key);
    expect(freezeTeachingContent(catalog, { mode: 'detail', partKeys: keys }).fingerprint)
      .toBe(freezeTeachingContent(catalog, { mode: 'detail', partKeys: [...keys].reverse() }).fingerprint);
    expect(() => freezeTeachingContent(catalog, { mode: 'detail', partKeys: [keys[0], keys[0]] })).toThrow('重复或已不存在');
    expect(() => freezeTeachingContent(catalog, { mode: 'detail', partKeys: ['unknown'] })).toThrow('重复或已不存在');
    expect(() => freezeTeachingContent(catalog, { mode: 'detail', partKeys: [] })).toThrow('明确选择');
  });

  it('can select one complete target even when all target goals exceed the context budget', () => {
    const course = primary(), original = course.units[0].lessons[0];
    course.units[0].lessons = Array.from({ length: 30 }, (_, index) => ({ ...structuredClone(original), id: 'learn:' + index,
      atomId: 'atom:' + index, objective: '该知识点的完整目标。'.repeat(80) }));
    const catalog = primaryUnitTeachingCatalog(course, 'unit-1'), descriptor = describeTeachingContent(catalog);
    expect(descriptor.overviewFits).toBe(false); expect(descriptor.targets).toHaveLength(30);
    expect(() => freezeTeachingContent(catalog, { mode: 'overview' })).toThrow('超过本次上下文容量');
    const detail = freezeTeachingContent(catalog, { mode: 'detail', partKeys: [catalog.parts[0].key] });
    expect(detail.targets).toHaveLength(1); expect(detail.targets[0].objective).toBe(course.units[0].lessons[0].objective);
    expect(detail.coverage).toMatchObject({ totalTargets: 30, includedTargets: 1, includedParts: 1, complete: false });
    expect(JSON.stringify(detail).length).toBe(descriptor.parts[0].selectedCharacters);
  });

  it('includes the teaching phase and rejects cross-target reference bindings', () => {
    const course = classroomCourse(), lecture = course.units[0].lectures[0], catalog = lectureTeachingCatalog(course.id, lecture.id, course);
    const first = freezeTeachingContent(catalog, { mode: 'detail', partKeys: [catalog.parts[0].key] });
    catalog.parts[0].phase = catalog.parts[0].phase === 'transfer' ? 'concept' : 'transfer';
    expect(freezeTeachingContent(catalog, { mode: 'detail', partKeys: [catalog.parts[0].key] }).fingerprint).not.toBe(first.fingerprint);
    catalog.sources[0].targetId = catalog.targets[1].id;
    expect(() => freezeTeachingContent(catalog)).toThrow('条目标识或引用不一致');
    expect(() => describeTeachingContent(primaryUnitTeachingCatalog(primary(), 'unit-1'), 18_001)).toThrow('预算不合法');
  });

  it('retains an old detail snapshot when its selected section is removed from the current catalog', () => {
    const catalog = primaryUnitTeachingCatalog(primary(), 'unit-1'), snapshot = freezeTeachingContent(catalog, { mode: 'detail', partKeys: [catalog.parts[0].key] });
    catalog.parts.shift();
    expect(readTeachingContent(snapshot, teachingContentReference(snapshot), snapshot.itemId, catalog, false).current).toBe(false);
    expect(() => readTeachingContent(snapshot, teachingContentReference(snapshot), snapshot.itemId, catalog, true)).toThrow('教学内容已变化');
  });

  it('does not repair a missing, corrupt, over-permissive or mismatched snapshot from a current course', () => {
    const catalog = primaryUnitTeachingCatalog(primary(), 'unit-1'), original = frozenPrimary(), reference = teachingContentReference(original);
    expect(() => readTeachingContent(undefined, reference, original.itemId, catalog, false)).toThrow('快照缺失或损坏');
    expect(() => readTeachingContent({ ...original, privatePrompt: 'PRIVATE' }, reference, original.itemId, catalog, false)).toThrow('快照缺失或损坏');
    const changed = structuredClone(original); changed.parts[0].blocks[0].text += 'tampered';
    expect(() => readTeachingContent(changed, reference, original.itemId, catalog, false)).toThrow('标识与快照不一致');
    expect(() => readTeachingContent(original, reference, 'another', catalog, false)).toThrow('标识与快照不一致');
  });

  it('keeps long course identities intact and measures the exact serialized snapshot including metadata', () => {
    const course = primary(); course.id = 'c'.repeat(180); const catalog = primaryUnitTeachingCatalog(course, 'unit-1');
    const snapshot = freezeTeachingContent(catalog), reference = teachingContentReference(snapshot), size = JSON.stringify(snapshot).length;
    expect(reference).toHaveLength(245); expect(reference.startsWith(course.id + '@')).toBe(true);
    expect(freezeTeachingContent(catalog, { mode: 'complete' }, size)).toEqual(snapshot);
    expect(() => freezeTeachingContent(catalog, { mode: 'complete' }, size - 1)).toThrow('超过本次上下文容量');
    expect(() => freezeTeachingContent(catalog, { mode: 'complete' }, 18_001)).toThrow('预算不合法');
  });
});
