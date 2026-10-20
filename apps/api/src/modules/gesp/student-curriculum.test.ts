import { describe, expect, it } from 'vitest';
import curriculum from '../../../../../resources/gesp/student-curriculum-v2.json';
import knowledge from '../../../../../resources/gesp/knowledge-map.json';

describe('GESP level-one through level-four authored student pilot', () => {
  it('covers every candidate atom from levels one to four exactly once', () => {
    const expected = knowledge.atoms.filter(atom => atom.level >= 1 && atom.level <= 4).map(atom => atom.id);
    expect(curriculum.tasks).toHaveLength(49); expect(new Set(curriculum.tasks.map(task => task.atomId))).toEqual(new Set(expected));
  });

  it('keeps two private probes and at least three distinct hidden tests per point', () => {
    expect(curriculum.tasks.reduce((sum, task) => sum + task.probes.length, 0)).toBe(98);
    expect(curriculum.tasks.reduce((sum, task) => sum + task.tests.length, 0)).toBe(162);
    for (const task of curriculum.tasks) {
      expect(task.probes.map(probe => probe.dimension).sort()).toEqual(['procedure', 'understanding']);
      for (const probe of task.probes) { expect(probe.options.length).toBeGreaterThanOrEqual(3); expect(probe.options).toContain(probe.answer); }
      expect(task.tests.length).toBeGreaterThanOrEqual(3); expect(new Set(task.tests.map(test => test.input)).size).toBe(task.tests.length);
      expect(task.tests.every(test => typeof test.expected === 'string' && test.expected.endsWith(String.fromCharCode(10)))).toBe(true);
    }
  });

  it('uses stable IDs and keeps every task explicitly in an unreviewed original pilot state', () => {
    expect(new Set(curriculum.tasks.map(task => task.id)).size).toBe(49);
    expect(new Set(curriculum.tasks.flatMap(task => task.probes.map(probe => probe.id))).size).toBe(98);
    expect(curriculum.tasks.every(task => task.reviewStatus === 'original_authored_pilot')).toBe(true);
    expect(curriculum.status).toBe('original_authored_pilot');
  });
});
