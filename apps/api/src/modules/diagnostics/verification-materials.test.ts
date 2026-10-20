import { describe, expect, it } from 'vitest';
import type { KnowledgeAtom, MeasurementDimension, MeasurementItem } from '@study-agent/contracts';
import { buildFoundationCurriculum } from './foundation-curriculum';
import { blueprintContentHash } from './assessment-blueprint';
import { knowledgeMaterialCoverage, materialStructureCoverage } from './verification-materials';

const atom: KnowledgeAtom = { id: 'qa:materials', subject: 'math', grade: 3, term: 'both', name: '素材核查', strand: '数与运算',
  objective: '根据数量关系独立完成对应任务', successCriterion: '基础与迁移均有独立证据', prerequisiteIds: [], curriculumVersion: 'qa', status: 'published', version: 1 };
const item = (family: string, dimension: MeasurementDimension, extra: Partial<MeasurementItem> = {}): MeasurementItem => ({
  id: `item:${dimension}:${family}`, questionId: `secret_question:${dimension}:${family}`, questionVersion: 1, atomId: atom.id,
  family, dimension, expectedSeconds: 90, difficulty: 1, probeRole: 'anchor', mappingWeight: 1, reviewStatus: 'approved', observationCode: 'response_mismatch', version: 1, ...extra });
const complete = () => [item('u', 'understanding'), item('p', 'procedure'), item('t1', 'transfer'), item('t2', 'transfer')];

describe('read-only material structure coverage and real selector examples', () => {
  it('requires understanding, procedure and four distinct contrast structures and assembles an unexposed example', () => {
    const result = knowledgeMaterialCoverage(atom, complete());
    expect(result.ready).toBe(true); expect(result.structure).toMatchObject({ ready: true, understandingFamilies: 1, procedureFamilies: 1,
      basicFamilies: 2, transferFamilies: 2, contrastFamilies: 4, gaps: [] });
    expect(result.sample).toMatchObject({ ready: true, items: 4, itemLimit: 4, secondsLimit: 600, expectedSeconds: 360 });
    expect(result.sample.groups.every(group => group.selectedFamilies === group.requiredFamilies && group.requiredFamilies === 2)).toBe(true);
  });
  it('does not turn many repeated questions or dimension labels into multiple independent families', () => {
    const tasks = Array.from({ length: 120 }, (_, n) => item('same', ['understanding', 'procedure', 'transfer'][n % 3] as MeasurementDimension, { id: `repeat-${n}`, questionId: `repeat-q-${n}` }));
    const result = knowledgeMaterialCoverage(atom, tasks);
    expect(result.ready).toBe(false); expect(result.structure).toMatchObject({ families: 1, basicFamilies: 1, transferFamilies: 1, contrastFamilies: 1 });
    expect(result.sample.ready).toBe(false); expect(result.sample.items).toBe(1);
  });
  it('merges reviewed bracket aliases across dimensions without modifying raw records', () => {
    const id = 'core:math:brackets', tasks = [item(`${id}:bracket-left`, 'understanding', { atomId: id }), item('bracket-right', 'procedure', { atomId: id }),
      item('transfer-a', 'transfer', { atomId: id }), item('transfer-b', 'transfer', { atomId: id })];
    const before = blueprintContentHash(tasks), result = knowledgeMaterialCoverage({ ...atom, id }, tasks);
    expect(result.structure).toMatchObject({ families: 3, basicFamilies: 1, transferFamilies: 2, contrastFamilies: 3, ready: false });
    expect(result.sample.ready).toBe(false); expect(blueprintContentHash(tasks)).toBe(before);
  });
  it('cannot fill immediate contrasts using retention-only structures', () => {
    const result = materialStructureCoverage(atom.id, Array.from({ length: 8 }, (_, n) => item(`retention-${n}`, 'retention')));
    expect(result).toMatchObject({ families: 8, basicFamilies: 0, transferFamilies: 0, contrastFamilies: 0, ready: false }); expect(result.gaps).toHaveLength(5);
  });
  it.each(['understanding', 'procedure'] as const)('retains a missing %s material warning even if one particular contrast sample can be assembled', dimension => {
    const remaining = dimension === 'understanding' ? 'procedure' : 'understanding';
    const result = knowledgeMaterialCoverage(atom, [item('b1', remaining), item('b2', remaining), item('t1', 'transfer'), item('t2', 'transfer')]);
    expect(result.sample.ready).toBe(true); expect(result.structure.gaps).toContain(`${dimension}_family_missing`); expect(result.ready).toBe(false);
  });
  it('does not let an unrelated retention family hide a structure shared by basic and transfer groups', () => {
    const result = knowledgeMaterialCoverage(atom, [item('shared', 'understanding'), item('shared', 'transfer'), item('p', 'procedure'), item('t', 'transfer'), item('r', 'retention')]);
    expect(result.structure).toMatchObject({ families: 4, basicFamilies: 2, transferFamilies: 2, contrastFamilies: 3, ready: false });
    expect(result.structure.gaps).toEqual(['four_contrast_families_missing']); expect(result.sample.ready).toBe(false);
  });
  it('distinguishes complete material structure from a four-item example that exceeds the real time budget', () => {
    const result = knowledgeMaterialCoverage(atom, complete().map(row => ({ ...row, expectedSeconds: 180 })));
    expect(result.structure.ready).toBe(true); expect(result.ready).toBe(false); expect(result.sample.ready).toBe(false);
    expect(result.sample.items).toBe(3); expect(result.sample.expectedSeconds).toBe(540); expect(result.sample.groups.some(group => group.gap)).toBe(true);
  });
  it.each(['draft', 'retired'] as const)('does not label a %s definition as having available published materials', status => {
    const result = knowledgeMaterialCoverage({ ...atom, status }, complete());
    expect(result.ready).toBe(false); expect(result.sample.items).toBe(0); expect(result.structure.families).toBe(0);
  });
  it('ignores foreign atoms and does not return question IDs or create diagnostic data', () => {
    const tasks = complete(), before = blueprintContentHash({ atom, tasks });
    expect(knowledgeMaterialCoverage(atom, tasks.map(row => ({ ...row, atomId: 'another-atom' }))).structure.families).toBe(0);
    const result = knowledgeMaterialCoverage(atom, tasks); expect(JSON.stringify(result)).not.toContain('secret_question:');
    expect(blueprintContentHash({ atom, tasks })).toBe(before); expect(knowledgeMaterialCoverage(atom, tasks)).toEqual(result);
  });
  it('preserves the complete authored material range rather than classifying question count as coverage', () => {
    const definitions = buildFoundationCurriculum(), results = definitions.map(row => materialStructureCoverage(row.atom.id,
      row.exercises.map(task => ({ atomId: row.atom.id, family: task.family, dimension: task.dimension })),
      row.atom.strand === '口语表达' ? 'oral-production-v1' : 'written-contrast-v1'));
    expect(definitions).toHaveLength(258); expect(results.filter(row => row.ready)).toHaveLength(101); expect(results.filter(row => !row.ready)).toHaveLength(157);
    for (const [index, result] of results.entries()) {
      const source = definitions[index], byDimension = (dimension: MeasurementDimension) => new Set(source.exercises.filter(task => task.dimension === dimension).map(task => task.family));
      if (result.ready) {
        if (source.atom.strand === '口语表达') expect(byDimension('understanding').size).toBe(0);
        else expect(byDimension('understanding').size).toBeGreaterThan(0);
        expect(byDimension('procedure').size).toBeGreaterThanOrEqual(source.atom.strand === '口语表达' ? 2 : 1);
        expect(byDimension('transfer').size).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
