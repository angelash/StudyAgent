import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurriculumRevision, KnowledgeAtom } from '@study-agent/contracts';
import { authoredRelationDefinitionUpdate, authoredRelationRelease, reviewedAuthoredRelationMappings } from './authored-relation-release';
import { atomDefinitionFingerprint, measurementDefinitionMatches } from './measurement-definition';
import { blueprintContentHash } from './assessment-blueprint';
import { buildFoundationCurriculum, foundationQuestionId } from './foundation-curriculum';

const release = authoredRelationRelease;
const oldFingerprint = atomDefinitionFingerprint(release.before), newFingerprint = atomDefinitionFingerprint(release.after);
const revision = (version: number, snapshot: KnowledgeAtom, actorId = 'system:authored-teaching-v1'): CurriculumRevision =>
  ({ id: `revision-${version}`, entityId: release.before.id, kind: 'atom', version, actorId, snapshot, at: '2026-10-20T00:00:00.000Z' });

describe('explicit authored relation release and immutable content review', () => {
  it('adds the missing division prerequisite without changing any of the 5198 original task objects or IDs', () => {
    const definitions = buildFoundationCurriculum(), atom = definitions.find(row => row.atom.id === release.after.id)!.atom;
    expect(atom).toEqual(release.after); expect(newFingerprint).not.toBe(oldFingerprint);
    expect(atom.prerequisiteIds).toEqual(['foundation:math:multiplytable', 'foundation:math:divisiontable', 'core:math:mixed20']);
    expect(release.reviewKind).toBe('agent_authored_relation_review'); expect(release.questions).toHaveLength(60);
    const rows = definitions.flatMap(definition => definition.exercises.map(exercise => ({ atomId: definition.atom.id,
      id: foundationQuestionId(definition.atom.id, exercise), exercise }))).sort((a, b) => a.id.localeCompare(b.id));
    expect(rows).toHaveLength(5198);
    // The historical snapshot uses the preexisting JSON serialization, not canonical object-key ordering.
    const { createHash } = require('node:crypto');
    expect(createHash('sha256').update(JSON.stringify(rows)).digest('hex')).toBe('1495887224bc758a6675235ba6f4c678f3a146a4dd7f5ada6cf4c43706e830ed');
  });

  it('upgrades only exact original v1 definitions, with or without the original teaching card', () => {
    const { teaching: _teaching, ...withoutTeaching } = release.before;
    for (const original of [release.before, withoutTeaching]) expect(authoredRelationDefinitionUpdate(original, [])).toEqual({ atom: release.after, expectedVersion: 1 });
    expect(authoredRelationDefinitionUpdate(release.after, [])).toBeNull();
    const changes: Partial<KnowledgeAtom>[] = [{ name: '用户名称' }, { objective: '用户目标' }, { successCriterion: '用户标准' },
      { prerequisiteIds: [] }, { transferAtomIds: [] }, { parentId: 'foundation:math:multiplytable' }, { status: 'draft' },
      { curriculumVersion: 'user-edition' }, { teaching: { ...release.before.teaching!, reviewStatus: 'draft' } }, { version: 2 }, { version: 3 }];
    for (const change of changes) expect(authoredRelationDefinitionUpdate({ ...release.before, ...change }, [])).toBeNull();
  });

  it('requires the exact known system lineage before upgrading a v2 created by the prior teaching migration', () => {
    const { teaching: _teaching, ...withoutTeaching } = release.before, previous = { ...release.before, version: 2 };
    const history = [revision(1, withoutTeaching), revision(2, previous)];
    expect(authoredRelationDefinitionUpdate(previous, history)).toEqual({ atom: release.after, expectedVersion: 2 });
    expect(authoredRelationDefinitionUpdate(previous, history.slice(1))).toBeNull();
    expect(authoredRelationDefinitionUpdate(previous, [history[0], { ...history[1], actorId: 'teacher' }])).toBeNull();
    expect(authoredRelationDefinitionUpdate(previous, [revision(1, { ...withoutTeaching, name: '曾修改' }), history[1]])).toBeNull();
  });
});

describe('authored release runs through real seed and curriculum services', () => {
  let app: any, store: any, seed: any, curriculum: any;
  beforeAll(async () => {
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { FoundationSeedService } = require('../../../dist/apps/api/src/modules/diagnostics/foundation-seed.service.js');
    const { CurriculumService } = require('../../../dist/apps/api/src/modules/diagnostics/curriculum.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); await app.init();
    store = app.get(InMemoryStoreService); seed = app.get(FoundationSeedService); curriculum = app.get(CurriculumService);
  });
  beforeEach(() => {
    store.reset(); seed.seedAuthoredCurriculum();
    Object.assign(store.find('knowledgeAtoms', { id: release.before.id }), structuredClone(release.before));
    for (const mapping of store.select('measurementItems', { atomId: release.before.id })) mapping.atomDefinitionFingerprint = oldFingerprint;
  });
  afterAll(async () => { await app?.close(); });
  const packet = (questionId: string) => ({ question: store.find('questions', { id: questionId }),
    document: store.find('questionDocuments', { questionId }), answerSchema: store.find('questionAnswerSchemas', { questionId }),
    source: store.find('questionSources', { questionId }), mapping: store.find('measurementItems', { id: `measurement:${questionId}` }) });

  it('rebinds only the 51 fully unchanged reviewed packets, preserves nine edited boundaries and records both mapping versions', async () => {
    const ids = release.questions.map(row => row.questionId), modified = ids.slice(0, 9), allOriginalIds = new Set(buildFoundationCurriculum().flatMap(row => row.exercises
      .filter(task => task.identityVersion !== 2).map(task => foundationQuestionId(row.atom.id, task))));
    const protectedOriginals = () => Object.fromEntries(['questions', 'questionDocuments', 'questionAnswerSchemas', 'questionSources', 'measurementItems'].map(collection =>
      [collection, blueprintContentHash(store.inspect(collection).filter((row: any) => allOriginalIds.has(collection === 'questions' ? row.id : row.questionId)))]));
    const originalsBefore = protectedOriginals();
    packet(modified[0]).question.analysis += '用户注释';
    packet(modified[1]).document.blocks[0].text += '用户题面';
    packet(modified[2]).answerSchema.validationRules.required = false;
    packet(modified[3]).source.reviewStatus = 'draft';
    packet(modified[4]).mapping.reviewStatus = 'draft';
    packet(modified[5]).mapping.expectedSeconds++;
    store.append('measurementCandidates', { id: 'owned-candidate', questionId: modified[6] });
    packet(modified[7]).mapping.version = 2;
    packet(modified[8]).mapping.contentFingerprint = 'f'.repeat(64);
    const editedBefore = modified.map(id => blueprintContentHash(packet(id)));
    await store.transaction(() => seed.seedAuthoredCurriculum());
    const atom = store.find('knowledgeAtoms', { id: release.after.id }); expect(atom).toEqual(release.after);
    expect(modified.map(id => blueprintContentHash(packet(id)))).toEqual(editedBefore); expect(protectedOriginals()).toEqual(originalsBefore);
    for (const id of modified) expect(measurementDefinitionMatches(store, packet(id).mapping, atom)).toBe(false);
    for (const id of ids.slice(9)) {
      const mapping = packet(id).mapping; expect(mapping.version).toBe(2); expect(mapping.atomDefinitionFingerprint).toBe(newFingerprint);
      expect(mapping.contentFingerprint).toMatch(/^[a-f0-9]{64}$/); expect(measurementDefinitionMatches(store, mapping, atom)).toBe(true);
      const history = store.select('curriculumRevisions', { kind: 'measurement', entityId: mapping.id });
      expect(history.map((row: any) => row.version)).toEqual([1, 2]); expect(history[0].snapshot.atomDefinitionFingerprint).toBe(oldFingerprint);
      expect(history[1].actorId).toBe(`system:${release.releaseId}`);
    }
    expect(reviewedAuthoredRelationMappings(store)).toHaveLength(0);
    const after = blueprintContentHash({ atoms: store.inspect('knowledgeAtoms'), mappings: store.inspect('measurementItems'), revisions: store.inspect('curriculumRevisions') });
    await store.transaction(() => seed.seedAuthoredCurriculum());
    expect(blueprintContentHash({ atoms: store.inspect('knowledgeAtoms'), mappings: store.inspect('measurementItems'), revisions: store.inspect('curriculumRevisions') })).toBe(after);
  });

  it('rolls back the definition, mapping revisions and events together if a reviewed mapping save fails', async () => {
    const before = blueprintContentHash({ atoms: store.inspect('knowledgeAtoms'), mappings: store.inspect('measurementItems'),
      revisions: store.inspect('curriculumRevisions'), events: store.inspect('events') });
    const save = curriculum.upsertMapping.bind(curriculum); let calls = 0;
    const fault = vi.spyOn(curriculum, 'upsertMapping').mockImplementation((...args: any[]) => { if (++calls === 2) throw new Error('owned release fault'); return save(...args); });
    try { await expect(store.transaction(() => seed.seedAuthoredCurriculum())).rejects.toThrow('owned release fault'); } finally { fault.mockRestore(); }
    expect(blueprintContentHash({ atoms: store.inspect('knowledgeAtoms'), mappings: store.inspect('measurementItems'),
      revisions: store.inspect('curriculumRevisions'), events: store.inspect('events') })).toBe(before);
    await store.transaction(() => seed.seedAuthoredCurriculum());
    expect(store.find('knowledgeAtoms', { id: release.after.id }).version).toBe(2);
    expect(release.questions.every(row => packet(row.questionId).mapping.version === 2)).toBe(true);
  });
});
