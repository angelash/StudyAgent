import { describe, expect, it } from 'vitest';
import { buildChemistryCurriculum } from '../diagnostics/chemistry-curriculum';
import { buildChemistryCourse } from '../learning/chemistry-course';
import { curriculumClassroomLesson } from '../learning/classroom-curriculum';
import { assistantDigest } from './assistant-turn-record';
import { primaryUnitTeachingCatalog, projectTeachingContent } from './assistant-teaching-content';
import { previewControlledTeachingFigure } from './assistant-controlled-figure';

describe('actual versioned chemistry teaching in assistant sources', () => {
  const course = () => buildChemistryCourse('anonymous-source-owner', buildChemistryCurriculum().map(definition => definition.atom));
  it('projects all28 real figures and13 bounded model definitions with the actual supplemental narration', () => {
    const actualCourse = course(); let images = 0, models = 0;
    for (const unit of actualCourse.units) {
      const catalog = primaryUnitTeachingCatalog(actualCourse, unit.id), serialized = JSON.stringify(catalog);
      expect(catalog.courseVersion).toContain(actualCourse.teachingVersion!);
      const figures = catalog.parts.flatMap(part => part.blocks).flatMap(block => block.figure ? [block.figure] : []);
      images += figures.length;
      for (const figure of figures) expect(previewControlledTeachingFigure(figure.asset!).status).toBe('verified');
      for (const source of unit.lessons.filter(lesson => lesson.kind === 'learn')) {
        const actual = curriculumClassroomLesson(actualCourse, source)!;
        const concept = actual.steps.find(step => step.phase === 'concept')!;
        expect(catalog.parts.find(part => part.targetId === source.id && part.key.endsWith(':classroom-tutorial'))!.blocks[0].text).toBe(concept.narration);
        for (const block of actual.steps.flatMap(step => step.blocks)) {
          if (block.kind === 'image' && block.image) { expect(serialized).toContain(block.image.alt); expect(serialized).toContain(block.image.caption); }
          if (block.kind === 'experiment' && block.experiment) {
            models++; for (const text of [block.experiment.prediction.question, ...block.experiment.prediction.options, block.experiment.observation,
              block.experiment.explanation, block.experiment.limitation]) expect(serialized).toContain(text);
          }
        }
        for (const question of actual.questions) expect(serialized).not.toContain(question.id);
      }
      expect(serialized).not.toMatch(/"questions"|"answers"|"hintKeys"|"correctAnswer"|"studentId"/);
      expect(JSON.stringify(projectTeachingContent(catalog, { mode: 'complete' })).length).toBeLessThan(18000);
    }
    expect(images).toBe(28); expect(models).toBe(13);
  });
  it('changes the teaching fingerprint on a tutorial upgrade and preserves the old original projection', () => {
    const current = course(), old = structuredClone(current); delete old.teachingVersion;
    const legacy = primaryUnitTeachingCatalog(old, old.units[0].id), before = JSON.stringify(legacy);
    const updated = primaryUnitTeachingCatalog(current, current.units[0].id);
    expect(legacy.courseVersion).toBe('primary-teaching-v1'); expect(assistantDigest(updated)).not.toBe(assistantDigest(legacy));
    expect(JSON.stringify(legacy)).toBe(before); expect(legacy.parts.flatMap(part => part.blocks).some(block => block.figure)).toBe(false);
    expect(updated.sources.some(source => source.page && source.quote?.includes('版次'))).toBe(true);
  });
  it('keeps complete/detail/overview explicit and rejects an unknown chemistry tutorial version', () => {
    const current = course(), catalog = primaryUnitTeachingCatalog(current, current.units[0].id);
    const part = catalog.parts.find(part => part.key.endsWith(':classroom-tutorial'))!;
    const detail = projectTeachingContent(catalog, { mode: 'detail', partKeys: [part.key] });
    expect(detail.parts.map(part => part.key)).toEqual([part.key]); expect(detail.coverage.complete).toBe(false);
    expect(detail.parts[0].blocks.some(block => block.figure)).toBe(true); expect(projectTeachingContent(catalog, { mode: 'overview' }).parts).toEqual([]);
    current.teachingVersion = 'unavailable-future-tutorial'; expect(() => primaryUnitTeachingCatalog(current, current.units[0].id)).toThrow('课堂补充');
  });
});
