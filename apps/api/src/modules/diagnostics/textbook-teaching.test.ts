import { describe, expect, it } from 'vitest';
import { textbookTeachingSaveSchema, type TextbookTeachingCommand } from '@study-agent/contracts';
import { teachingFixture } from './textbook-teaching-fixture';
import { assertTeachingSourceSnapshot, makeTeachingSourceSnapshot, prepareTextbookTeachingPackage, teachingHash, teachingTargetDefinition } from './textbook-teaching-package';
import { teachingClassroomSnapshot, teachingPublicBase, teachingPublicFingerprint } from './textbook-teaching-public';
import { currentTeachingRelease } from './textbook-teaching-release';
import { assertTeachingRecords, prepareTeachingChange, type TextbookTeachingPackageRecord, type TextbookTeachingCommandRecord,
  type TextbookTeachingVersionRecord, type TextbookTeachingSourceRecord } from './textbook-teaching-record';

const authorization = { role: 'teacher' as const, accountVersion: 1, sessionId: 'qa:teacher:session' }, at = '2026-11-01T02:00:00.000Z';
function history() {
  const fixture = teachingFixture(2), versions: TextbookTeachingVersionRecord[] = [], sources: TextbookTeachingSourceRecord[] = [], commands: TextbookTeachingCommandRecord[] = [];
  let header: TextbookTeachingPackageRecord | null = null;
  function apply(input: TextbookTeachingCommand, current = prepareTextbookTeachingPackage(fixture.store, fixture.input, fixture.source)) {
    const saved = input.action === 'save' ? undefined : versions.find(row => row.contentVersion === input.contentVersion),
      base = input.action === 'save' && input.basedOn ? versions.find(row => row.contentVersion === input.basedOn!.contentVersion) : undefined,
      next = prepareTeachingChange({ actorId: 'qa:teacher', authorization, input, at, previous: header, base, prepared: input.action === 'save' ? current : undefined, saved, current });
    header = next.header; if (next.saved) versions.push(next.saved); if (next.source && !sources.some(row => row.id === next.source!.id)) sources.push(next.source); commands.push(next.command);
    assertTeachingRecords(state()); return next;
  }
  function state() { return { textbookTeachingPackages: header ? [header] : [], textbookTeachingVersions: versions, textbookTeachingSources: sources, textbookTeachingCommands: commands }; }
  const saved = apply(fixture.input);
  function publishInput(): TextbookTeachingCommand { const version = versions.at(-1)!; return { packageId: fixture.input.packageId, requestKey: 'qa-teaching-publish-' + (header!.revision + 1),
    expectedRevision: header!.revision, action: 'publish', contentVersion: version.contentVersion, contentFingerprint: version.report.contentFingerprint,
    preflightFingerprint: version.report.fingerprint, reviewed: true, originalTeaching: true, reason: '明确确认当前完整原创教学稿和来源材料版本；工程确认不代表真实教师审核。' }; }
  return { ...fixture, saved, apply, state, versions, sources, commands, header: () => header!, publishInput };
}

describe('complete textbook teaching package preparation and public classroom', () => {
  it('checks all targets and four actual retention stocks without writing learner or curriculum evidence', () => {
    const f = teachingFixture(2), before = f.stateHash(), result = prepareTextbookTeachingPackage(f.store, f.input, f.source);
    expect(result.report.gaps).toEqual([]); expect(result.report.publishable).toBe(true); expect(result.report.coverage).toHaveLength(2);
    for (const target of result.report.coverage) {
      expect(target.retentionStock.map(row => [row.intervalDays, row.ready, row.questions])).toEqual([[1, true, 4], [3, true, 4], [7, true, 4], [14, true, 4]]);
      const ids = target.retentionStock.flatMap(row => row.measurementIds); expect(new Set(ids).size).toBe(16);
      expect(ids.map(id => f.store.find('measurementItems', { id })!.dimension).filter(dimension => dimension === 'retention')).toHaveLength(8);
    }
    expect(f.stateHash()).toBe(before); expect(f.store.inspect('diagnosticSessions')).toEqual([]); expect(f.store.inspect('reviewTasks')).toEqual([]);
    expect(result).toEqual(prepareTextbookTeachingPackage(f.store, f.input, f.source));
    expect(teachingTargetDefinition(result.body.targets[0])).toEqual(f.atoms[0]);
  });
  it('keeps complete original strings and ordered references; whitespace changes the private content identity', () => {
    const f = teachingFixture(), prepared = prepareTextbookTeachingPackage(f.store, f.input, f.source), changed = structuredClone(f.input);
    changed.content.concept.explanation = ' \n' + changed.content.concept.explanation + '\n ';
    const next = prepareTextbookTeachingPackage(f.store, changed, f.source);
    expect(next.input).toEqual(changed); expect(next.body.content.concept.explanation).toBe(changed.content.concept.explanation);
    expect(next.report.contentFingerprint).not.toBe(prepared.report.contentFingerprint);
  });
  it('rejects missing, changed or out of range complete source pages rather than truncating them', () => {
    const f = teachingFixture(), changed = structuredClone(f.source); changed.pages[0].text += '变更';
    expect(() => assertTeachingSourceSnapshot(changed)).toThrow(); changed.pages.pop(); expect(() => assertTeachingSourceSnapshot(changed)).toThrow();
    const { fingerprint: _fingerprint, protocol: _protocol, ...body } = f.source;
    const text = '甲'.repeat(100001); body.pages = body.pages.map(page => ({ ...page, text, textCharacters: [...text].length, textSha256: teachingHash(text) }));
    expect(() => makeTeachingSourceSnapshot(body)).toThrow(/20万/);
    const input = structuredClone(f.input); input.source.bookVersion = 'wrong-version'; expect(() => prepareTextbookTeachingPackage(f.store, input, f.source)).toThrow(/教材版本/);
  });
  it('allows an incomplete editorial draft while exposing precise source, quotation and content gaps', () => {
    const f = teachingFixture(); f.input.content.summary.synthesis = ''; f.input.sourceReview.confirmedRange = false;
    f.input.content.citations[0].quote = '编造的不在任何原文中的引用';
    const result = prepareTextbookTeachingPackage(f.store, f.input, f.source);
    expect(result.report.publishable).toBe(false); expect(new Set(result.report.gaps.map(row => row.code))).toEqual(new Set(['content_incomplete', 'source_review_pending', 'citation_not_in_source']));
    expect(result.input.content.summary.synthesis).toBe('');
  });
  it('rejects changed target definitions and reports a target outside the exact subject/grade/term', () => {
    const f = teachingFixture(); f.store.find('knowledgeAtoms', { id: f.atoms[0].id })!.objective += '变更';
    expect(() => prepareTextbookTeachingPackage(f.store, f.input, f.source)).toThrow(/目标定义已改变/);
    const another = teachingFixture(); const { fingerprint: _fp, protocol: _p, ...body } = another.source; body.grade = 2;
    const source = makeTeachingSourceSnapshot(body); another.input.sourceFingerprint = source.fingerprint;
    expect(prepareTextbookTeachingPackage(another.store, another.input, source).report.gaps.some(row => row.code === 'target_scope')).toBe(true);
  });
  it.each(['rejected', 'answer', 'input', 'source'] as const)('rechecks actual %s eligibility rather than trusting material references', kind => {
    const f = teachingFixture(), first = f.store.inspect('measurementItems')[0];
    if (kind === 'rejected') f.store.find('measurementItems', { id: first.id })!.reviewStatus = 'rejected';
    if (kind === 'answer') f.store.find('questions', { id: first.questionId })!.answer = 999;
    if (kind === 'input') Object.assign(f.store.find('questionAnswerSchemas', { questionId: first.questionId })!, { mode: 'single_choice', options: [] });
    if (kind === 'source') f.store.find('questionSources', { questionId: first.questionId })!.licenseClass = 'C_PUBLIC_REFERENCE_ONLY';
    const report = prepareTextbookTeachingPackage(f.store, f.input, f.source).report;
    expect(report.publishable).toBe(false); expect(report.gaps.some(row => row.code === 'material_changed_or_ineligible')).toBe(true);
  });
  it('does not count transfer-only stock as delayed retention or overlap as new material', () => {
    const f = teachingFixture(), retention = f.input.content.checks.find(row => row.purpose === 'retention')!;
    retention.materials = f.input.content.checks.filter(row => row.purpose !== 'retention').flatMap(row => row.materials);
    const report = prepareTextbookTeachingPackage(f.store, f.input, f.source).report;
    expect(report.gaps.some(row => row.code === 'retention_material_overlap')).toBe(true); expect(report.coverage[0].retentionStock.every(row => !row.ready)).toBe(true);
  });
  it('excludes immediate questions from every target when checking later retention stock', () => {
    const f = teachingFixture(2), original = f.store.inspect('measurementItems')[0], retentionCheck = f.input.content.checks.find(row => row.atomId === f.atoms[1].id && row.purpose === 'retention')!,
      mapping = { ...structuredClone(original), id: 'qa-cross-target-stock', atomId: f.atoms[1].id, atomDefinitionFingerprint: f.input.targetRefs[1].definitionFingerprint };
    f.store.append('measurementItems', mapping);
    retentionCheck.materials.push({ measurementId: mapping.id, version: mapping.version, questionId: mapping.questionId, questionVersion: mapping.questionVersion,
      definitionFingerprint: mapping.atomDefinitionFingerprint, contentFingerprint: original.contentFingerprint! });
    const prepared = prepareTextbookTeachingPackage(f.store, f.input, f.source);
    expect(prepared.report.gaps.some(row => row.code === 'retention_material_overlap')).toBe(true);
    expect(prepared.report.coverage.flatMap(row => row.retentionStock).flatMap(row => row.measurementIds)).not.toContain(mapping.id);
  });
  it('keeps no-text pages and requires a recorded visual review of every exact physical page', () => {
    const f = teachingFixture(), { fingerprint: _fp, protocol: _p, ...body } = f.source; body.pages[1] = { ...body.pages[1], text: '', textCharacters: 0, textSha256: createEmptyTextHash() };
    function createEmptyTextHash() { return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; }
    const source = makeTeachingSourceSnapshot(body); f.input.sourceFingerprint = source.fingerprint; f.input.sourceReview.pages = f.input.sourceReview.pages.filter(page => page.page !== 3);
    const prepared = prepareTextbookTeachingPackage(f.store, f.input, source);
    expect(prepared.source.pages).toHaveLength(2); expect(prepared.source.pages[1].text).toBe(''); expect(prepared.report.gaps.some(row => row.code === 'source_page_review_pending' && row.message.includes('没有提取文字'))).toBe(true);
    f.input.sourceReview.pages.push({ page: 3, visualChecked: true, statement: '工程合成空页，已核对物理边界和无文字状态；不是实际教材审核。' });
    expect(prepareTextbookTeachingPackage(f.store, f.input, source).report.publishable).toBe(true);
  });
  it('reports actual diagram render limits while preserving all authored nodes and captions', () => {
    const f = teachingFixture(); f.input.content.visuals = [{ kind: 'diagram', diagram: { kind: 'network', title: '完整网络', labels: ['一', '二', '三', '四'], captions: ['完整长说明'.repeat(30)] }, explanation: '保留全部节点和标注，等待真实绘图能力支持之后发布。' }];
    const prepared = prepareTextbookTeachingPackage(f.store, f.input, f.source);
    expect(prepared.body.content.visuals).toEqual(f.input.content.visuals); expect(prepared.report.gaps.some(row => row.code === 'visual_diagram_layout')).toBe(true);
  });
  it('keeps private quotations, original pages, answer hashes and editorial statements out of public packets and hashes', () => {
    const f = teachingFixture(2), prepared = prepareTextbookTeachingPackage(f.store, f.input, f.source), base = teachingPublicBase(f.input.packageId, 1, prepared), serialized = JSON.stringify(base);
    for (const forbidden of [f.privateText, f.input.content.citations[0].quote, f.input.sourceReview.statement, 'contentFingerprint', 'definitionFingerprint":"' + f.input.content.checks[0].materials[0].definitionFingerprint + '","contentFingerprint']) expect(serialized).not.toContain(forbidden);
    expect(serialized).not.toContain(f.input.content.checks[0].materials[0].contentFingerprint);
    const privateChange = structuredClone(prepared); privateChange.body.sourceReview.statement += '私有追加';
    privateChange.body.materials.forEach(row => row.contentFingerprint = 'd'.repeat(64)); privateChange.body.content.checks.forEach(row => row.materials.forEach(ref => ref.contentFingerprint = 'd'.repeat(64)));
    expect(teachingPublicFingerprint(teachingPublicBase(f.input.packageId, 1, privateChange))).toBe(teachingPublicFingerprint(base));
    base.content.concept.explanation += '公开稿修订'; expect(teachingPublicFingerprint(base)).not.toBe(teachingPublicFingerprint(teachingPublicBase(f.input.packageId, 1, prepared)));
  });
  it('projects all targets, example steps, misconceptions, visuals, checks and summary into the actual classroom contract', () => {
    const f = teachingFixture(2), prepared = prepareTextbookTeachingPackage(f.store, f.input, f.source), base = teachingPublicBase(f.input.packageId, 1, prepared),
      snapshot = teachingClassroomSnapshot(base, { courseId: 'qa:course', lessonId: 'qa:lesson', studentId: 'qa:student', verificationHref: '/studio?view=courses&course=qa%3Acourse' });
    const narration = snapshot.lesson.steps.map(step => step.narration).join('\n');
    for (const goal of f.input.content.goals) { expect(narration).toContain(goal.objective); expect(narration).toContain(goal.successCriterion); }
    for (const item of f.input.content.example.steps) expect(narration).toContain(item.explanation);
    expect(snapshot.lesson.steps.filter(row => row.phase === 'check')).toHaveLength(8); expect(narration).toContain(f.input.content.summary.synthesis);
    expect(snapshot.lesson.steps.some(step => step.blocks.some(block => block.kind === 'table'))).toBe(true); expect(snapshot.lesson.questions).toEqual([]);
    expect(snapshot.lesson.practiceVersion).not.toContain(prepared.report.contentFingerprint);
    expect(snapshot.lesson.sourceReferences![0].href).toBe('/studio?view=courses&course=qa%3Acourse&student=qa%3Astudent&subject=math');
    expect(JSON.stringify(snapshot)).not.toContain('/studio/courses/'); expect(JSON.stringify(snapshot)).not.toContain(f.input.content.citations[0].quote);
    expect(() => teachingClassroomSnapshot(base, { courseId: 'c', lessonId: 'l', studentId: 's', verificationHref: '//bad.test/x' })).toThrow(/local_href/);
  });
  it('rejects malformed Unicode while preserving valid supplementary characters and exact whitespace', () => {
    const f = teachingFixture(); f.input.content.title += ' \n🧪 ';
    expect(textbookTeachingSaveSchema.parse(f.input).content.title).toBe(f.input.content.title);
    f.input.content.title += '\ud800'; expect(() => textbookTeachingSaveSchema.parse(f.input)).toThrow(/Unicode/);
  });
});

describe('immutable teaching package command and publication history', () => {
  it('records the exact older version copied into a later revision and rejects a forged copy baseline', () => {
    const f = history(), input = structuredClone(f.input); input.requestKey = 'qa-revision-from-original-2'; input.expectedRevision = 1;
    input.basedOn = { contentVersion: 1, contentFingerprint: f.versions[0].report.contentFingerprint }; input.content.title += '第二稿';
    f.apply(input, prepareTextbookTeachingPackage(f.store, input, f.source));
    const older = structuredClone(f.input); older.requestKey = 'qa-revision-from-original-3'; older.expectedRevision = 2; older.basedOn = structuredClone(input.basedOn); older.content.title += '从第一稿重编';
    const revision = f.apply(older, prepareTextbookTeachingPackage(f.store, older, f.source)); expect(revision.saved!.contentVersion).toBe(3); expect(revision.saved!.basedOn).toEqual(input.basedOn);
    const before = teachingHash(f.state()), forged = structuredClone(older); forged.requestKey = 'qa-forged-copy-baseline'; forged.expectedRevision = 3; forged.basedOn!.contentFingerprint = 'f'.repeat(64);
    expect(() => f.apply(forged, prepareTextbookTeachingPackage(f.store, forged, f.source))).toThrow(/exact_revision_base/); expect(teachingHash(f.state())).toBe(before);
  });
  it('keeps the old published release through a new draft, then switches only on explicit publication', () => {
    const f = history(), published = f.apply(f.publishInput()); expect(published.header.published?.contentVersion).toBe(1);
    const oldVersions = structuredClone(f.versions), input = structuredClone(f.input); input.requestKey = 'qa-teaching-save-0002'; input.expectedRevision = f.header().revision;
    input.basedOn = { contentVersion: 1, contentFingerprint: f.versions[0].report.contentFingerprint }; input.content.title += ' · 第二稿';
    const current = prepareTextbookTeachingPackage(f.store, input, f.source), saved = f.apply(input, current);
    expect(saved.header).toMatchObject({ status: 'published', contentVersion: 2, published: { contentVersion: 1 } }); expect(f.sources).toHaveLength(1);
    expect(f.versions.slice(0, 1)).toEqual(oldVersions); const next = f.apply(f.publishInput(), current);
    expect(next.header.published?.contentVersion).toBe(2); expect(next.header.published?.fingerprint).not.toBe(published.header.published?.fingerprint);
    expect(f.commands[0].input).toEqual(f.input); expect(f.saved.command.result).toEqual(f.commands[0].result);
  });
  it('withdraws the actual published version after a later draft and preserves independent old public snapshots', () => {
    const f = history(), current = prepareTextbookTeachingPackage(f.store, f.input, f.source); f.apply(f.publishInput());
    const frozen = teachingClassroomSnapshot(teachingPublicBase(f.input.packageId, 1, current), { courseId: 'qa-course', lessonId: 'qa-lesson', studentId: 'qa-student', verificationHref: '/studio?view=courses' }), before = teachingHash(frozen);
    const input = structuredClone(f.input); input.requestKey = 'qa-save-after-release'; input.expectedRevision = f.header().revision;
    input.basedOn = { contentVersion: 1, contentFingerprint: f.versions[0].report.contentFingerprint }; input.content.title += '新稿'; f.apply(input, prepareTextbookTeachingPackage(f.store, input, f.source));
    const withdrawn = f.apply({ action: 'withdraw', packageId: f.header().id, expectedRevision: f.header().revision, requestKey: 'qa-withdraw-original', contentVersion: 1,
      contentFingerprint: f.versions[0].report.contentFingerprint, reason: '教材依据待复核，明确停止新的课程采用。' });
    expect(withdrawn.header).toMatchObject({ status: 'withdrawn', contentVersion: 2, published: null }); expect(teachingHash(frozen)).toBe(before); expect(f.versions).toHaveLength(2);
  });
  it('rejects stale CAS, wrong ownership and a changed exact lesson', () => {
    const f = history(), current = prepareTextbookTeachingPackage(f.store, f.input, f.source);
    expect(() => prepareTeachingChange({ actorId: 'qa:teacher', authorization, input: f.input, at, previous: f.header(), prepared: current })).toThrow(/revision_conflict/);
    expect(() => prepareTeachingChange({ actorId: 'other', authorization, input: f.publishInput(), at, previous: f.header(), saved: f.versions[0], current })).toThrow(/revision_conflict/);
    const input = structuredClone(f.input); input.expectedRevision = 1; input.requestKey = 'qa-wrong-lesson'; input.source.lessonId = 'other';
    const changed = structuredClone(current); changed.input = input;
    expect(() => f.apply(input, changed)).toThrow();
  });
  it('rechecks readiness at publication and rejects changed approved material without rewriting a saved draft', () => {
    const f = history(), before = teachingHash(f.versions), first = f.store.inspect('measurementItems')[0];
    const row = f.store.find('measurementItems', { id: first.id })!; row.reviewStatus = 'rejected'; row.version++;
    const current = prepareTextbookTeachingPackage(f.store, f.input, f.source);
    expect(() => f.apply(f.publishInput(), current)).toThrow(/publish_baseline_changed/); expect(teachingHash(f.versions)).toBe(before); expect(f.header().status).toBe('draft');
  });
  it('binds publication to the actual preflight rule versions even when the selected material counts match', () => {
    const f = history(), current = prepareTextbookTeachingPackage(f.store, f.input, f.source);
    current.report.rules.diagnosis += '-new-rule'; const { fingerprint: _fingerprint, ...body } = current.report; current.report.fingerprint = teachingHash(body);
    expect(() => f.apply(f.publishInput(), current)).toThrow(/publish_baseline_changed/);
  });
  it.each(['version', 'source', 'command', 'header', 'orphan', 'original_whitespace'] as const)('fails closed on a changed %s record', kind => {
    const f = history(); f.apply(f.publishInput()); const state = structuredClone(f.state());
    if (kind === 'version') state.textbookTeachingVersions[0].body.content.title += '篡改';
    if (kind === 'source') state.textbookTeachingSources[0].snapshot.pages[0].text += '篡改';
    if (kind === 'command') state.textbookTeachingCommands[0].result.revision++;
    if (kind === 'header') state.textbookTeachingPackages[0].published!.contentVersion = 2;
    if (kind === 'orphan') state.textbookTeachingCommands.pop();
    if (kind === 'original_whitespace') { const input = state.textbookTeachingCommands[0].input; if (input.action === 'save') input.content.concept.explanation += ' '; }
    expect(() => assertTeachingRecords(state)).toThrow();
  });
});

describe('current release permission and historical restore boundary', () => {
  function released() {
    const f = history(), result = f.apply(f.publishInput());
    f.store.append('users', { id: 'qa:teacher', role: 'teacher', version: 1, status: 'active', principal: 'generated-owner', passwordHash: 'generated-unused', displayName: '合成教研' });
    f.store.append('textbookTeachingPackages', ...f.state().textbookTeachingPackages); f.store.append('textbookTeachingVersions', ...f.state().textbookTeachingVersions);
    f.store.append('textbookTeachingSources', ...f.state().textbookTeachingSources); f.store.append('textbookTeachingCommands', ...f.state().textbookTeachingCommands);
    return { ...f, result };
  }
  it('keeps valid publication permission through an unissued draft while rejecting current author or source changes', () => {
    const f = released(), read = () => currentTeachingRelease(f.store, f.result.header, () => {});
    expect(read().availability.code).toBe('available'); f.store.find('users', { id: 'qa:teacher' })!.role = 'parent'; expect(read().availability.code).toBe('author_unavailable');
    f.store.find('users', { id: 'qa:teacher' })!.role = 'teacher'; expect(currentTeachingRelease(f.store, f.result.header, () => { throw Error('source changed'); }).availability.code).toBe('source_or_material_changed');
  });
  it('suspends restored old release permission until an actual new explicit publish while preserving the old teaching snapshot', () => {
    const f = released(), original = currentTeachingRelease(f.store, f.result.header, () => {}), frozen = structuredClone(original.publicBase);
    f.store.append('events', { eventId: 'qa-synthetic-restore', eventName: 'operations.restored', eventVersion: 1, occurredAt: at, payload: { backupId: 'qa-only' } });
    expect(currentTeachingRelease(f.store, f.result.header, () => {}).availability.code).toBe('restore_confirmation_required');
    const prepared = prepareTextbookTeachingPackage(f.store, f.input, f.source), next = prepareTeachingChange({ actorId: 'qa:teacher', authorization,
      input: f.publishInput(), at: new Date(Date.parse(at) + 1).toISOString(), previous: f.result.header, saved: f.versions[0], current: prepared });
    f.store.append('textbookTeachingCommands', next.command); Object.assign(f.store.find('textbookTeachingPackages', { id: next.header.id })!, next.header);
    const resumed = currentTeachingRelease(f.store, next.header, () => {}); expect(resumed.availability.code).toBe('available'); expect(resumed.publicBase).toEqual(frozen); expect(original.publicBase).toEqual(frozen);
  });
});
