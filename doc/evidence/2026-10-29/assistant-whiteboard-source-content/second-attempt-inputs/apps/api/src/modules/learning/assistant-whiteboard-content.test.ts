import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { assistantWhiteboardContentSchema, topicWhiteboardContentSchema, type AssistantArtifactOrigin,
  type AssistantWhiteboardAudience, type AssistantWhiteboardContent } from '@study-agent/contracts';
import { prepareAssistantTopicWhiteboard, prepareAssistantWhiteboardSource, assertPreparedAssistantWhiteboard,
  type PreparedAssistantWhiteboard } from './assistant-whiteboard-source';
import { validateAssistantWhiteboardContent, validateAssistantWhiteboardReview, assistantWhiteboardJsonSchema,
  assistantWhiteboardReviewJsonSchema } from './assistant-whiteboard-content';
import { topicWhiteboardDigest, topicWhiteboardJsonSchema } from './topic-whiteboard-content';

const model = { id: 'deepseek-v4-flash', label: 'DeepSeek V4.1 Flash' };
function fixture() {
  const selection = { messageIds: ['answer-one', 'answer-two'], includeLinkedQuestions: true };
  const messages: AssistantArtifactOrigin['messages'] = ['question', 'answer-one', 'answer-two'].map((id, sequence) => {
    const content = id === 'question' ? '比较条件和单位，保留完整代码。' : id + '\n|条件|数量|\n|---|---|\n|同一整体|3|\n$\\frac{1}{2}$\n```js\nconsole.log("完整代码");\n```';
    return { id, sender: sequence ? 'assistant' : 'user', content, createdAt: '2026-10-29T00:00:00.000Z', sequence,
      contentSha256: createHash('sha256').update(content).digest('hex'), inReplyTo: sequence ? 'question' : null,
      source: sequence ? 'xiaojiu' : null, modelId: sequence ? model.id : null, modelName: sequence ? model.label : null,
      sourceReferences: sequence ? [{ key: 'reference-' + sequence, kind: 'classroom_lecture', courseId: 'owned-course', itemId: 'owned-lecture',
        title: '匿名教学来源' + sequence, href: '/studio?view=courses&course=owned-course', contextFingerprint: 'a'.repeat(64), quote: '完整原出处' + sequence }] : [] };
  });
  const origin: AssistantArtifactOrigin = { protocol: 'assistant-artifact-origin-v1', sessionId: 'owned-session', studentId: null, subject: null,
    location: { sessionId: 'owned-session', pageContext: 'studio', studentId: null, subject: null,
      contextRefType: null, contextRefId: null, contextItemId: null, href: '/studio?view=home' },
    selection: { requestedMessageIds: selection.messageIds, includeLinkedQuestions: true,
      messageIds: messages.map(message => message.id), linkedQuestionIds: ['question'] }, messages };
  const audience: AssistantWhiteboardAudience = { kind: 'assistant', actorRole: 'parent', studentId: null, subject: null,
    sourceKind: 'independent', courseGrade: null, profileGrade: null };
  const input = { selection, objective: '分清整体、单位与需要验证的条件', modelId: model.id, acknowledgeHistoricalSource: false };
  return { origin, audience, input, prepare: () => prepareAssistantTopicWhiteboard(origin, input, audience, model, true) };
}
function content(): AssistantWhiteboardContent {
  return { title: '核对完整条件', description: '先比较原条件，再用新例子核查。', scenes: [
    { kind: 'title', title: '观察问题', narration: '观察问题，先说清整体与单位。', body: '先说清整体与单位。', bullets: ['观察问题'], targetAtomIds: [], exhibit: null,
      sourceMap: { messageIds: ['question'], referenceKeys: [], status: 'sourced', explanation: '原问题要求比较条件与单位。' } },
    { kind: 'concept', title: '比较条件', narration: '比较条件，先统一整体和单位。\n```js\nconsole.log("完整代码");\n```', body: '先统一整体和单位。', bullets: ['比较条件'], targetAtomIds: [],
      exhibit: { kind: 'table', headers: ['条件', '含义'], rows: [['同一整体', '比较有依据'], ['同一单位', '数量可比较']] },
      sourceMap: { messageIds: ['answer-one'], referenceKeys: ['reference-1'], status: 'sourced', explanation: '对应原回答中的完整条件与原出处。' } },
    { kind: 'check', title: '独立核查', narration: '独立核查，换一个例子检验条件。', body: '换一个例子检验条件。', bullets: ['独立核查'], targetAtomIds: [],
      exhibit: { kind: 'formula', latex: '\\frac{1}{2}', explanation: '分母说明被等分的份数。' },
      sourceMap: { messageIds: [], referenceKeys: [], status: 'supplementary', explanation: '这是新增的核查建议，尚未由原文或实际作答验证。' } },
  ] };
}
function rehash(prepared: PreparedAssistantWhiteboard) { const { fingerprint: _old, ...identity } = prepared; prepared.fingerprint = topicWhiteboardDigest(identity); return prepared; }

describe('assistant whiteboard complete source and scene mapping boundary', () => {
  it('freezes complete multi-thousand-character original code, tables and formulas outside the short display prompt', () => {
    const f = fixture(); f.origin.messages[1].content += '\n原文逐行保留。'.repeat(420) + '完整末尾_MARKER';
    f.origin.messages[1].contentSha256 = createHash('sha256').update(f.origin.messages[1].content).digest('hex');
    const before = structuredClone(f.origin), prepared = f.prepare();
    expect(prepared.version).toBe('assistant-topic-whiteboard-v1'); expect(prepared.input.prompt).toBe(f.input.objective);
    expect(prepared.input.prompt.length).toBeLessThan(2000); expect(prepared.source.origin).toEqual(before);
    expect(JSON.parse(prepared.context).origin.messages[1].content).toBe(before.messages[1].content);
    expect(prepared.context.length).toBeGreaterThan(2000); expect(prepared.context.length).toBeLessThanOrEqual(18000);
    expect(prepared.targets).toEqual([]); expect(f.origin).toEqual(before); expect(() => assertPreparedAssistantWhiteboard(prepared)).not.toThrow();
  });
  it('keeps original grade9 chemistry separate from the current grade4 learner and never creates formal atom targets', () => {
    const f = fixture(); Object.assign(f.origin, { studentId: 'owned-child', subject: 'chemistry',
      course: { kind: 'primary_unit', courseId: 'owned-chemistry', courseTitle: '九年级化学', itemId: 'original-unit', itemTitle: '原课题', studentId: 'owned-child',
        subject: 'chemistry', accessMode: 'published', fingerprint: 'b'.repeat(64), referenceId: 'original-reference', current: true, href: '/studio?view=courses',
        selection: { mode: 'complete' }, coverage: { totalParts: 32, includedParts: 32, totalTargets: 3, includedTargets: 3, complete: true } },
      teachingScope: { grade: 9, term: 'upper', scopeVersion: 1, textbookVersion: '原教材版本', courseVersion: '原课程版本', teachingFingerprint: 'b'.repeat(64),
        selection: { mode: 'complete' }, coverage: { totalParts: 32, includedParts: 32, totalTargets: 3, includedTargets: 3, complete: true } } });
    Object.assign(f.audience, { studentId: 'owned-child', subject: 'chemistry', sourceKind: 'primary_unit', courseGrade: 9, profileGrade: 4 });
    const prepared = f.prepare(); expect(prepared.grade).toBe(9); expect(prepared.input.audience.profileGrade).toBe(4);
    expect(prepared.targets).toEqual([]); expect(validateAssistantWhiteboardContent(prepared, content()).scenes.every(scene => !scene.targetAtomIds.length)).toBe(true);
    const forged = structuredClone(prepared); forged.grade = 4; expect(() => assertPreparedAssistantWhiteboard(rehash(forged))).toThrow('source_mismatch');
  });
  it('requires historical confirmation, refuses unavailable models and preserves the entire over-budget source preflight', () => {
    const f = fixture(); f.origin.lecture = { courseId: 'owned-course', courseVersion: 'old-version', courseTitle: '原课程', unitId: 'owned-unit', unitTitle: '原单元', unitPosition: 1,
      lectureId: 'owned-lecture', lectureTitle: '原讲座', lecturePosition: 1, fingerprint: 'a'.repeat(64), referenceId: 'owned-ref', current: false, href: '/studio?view=courses' };
    f.audience.sourceKind = 'classroom_lecture'; expect(() => f.prepare()).toThrow('historical_source_confirmation_required');
    f.input.acknowledgeHistoricalSource = true; expect(f.prepare().source.origin.lecture?.current).toBe(false);
    expect(() => prepareAssistantTopicWhiteboard(f.origin, f.input, f.audience, model, false)).toThrow('model_unavailable');
    f.origin.messages[1].content += '完整来源不能截断。'.repeat(2400);
    const view = prepareAssistantWhiteboardSource(f.origin, f.input, f.audience, model, true).view;
    expect(view.fits).toBe(false); expect(view.origin.messages[1].content).toBe(f.origin.messages[1].content);
    expect(() => f.prepare()).toThrow('source_budget_exceeded');
  });
  it('rejects a changed frozen origin, context, protocol or source selection even if a caller recomputes its outer digest', () => {
    const f = fixture(), prepared = f.prepare();
    for (const mutate of [(p: any) => p.source.origin.messages[1].content += '被改写', (p: any) => p.context += 'extra',
      (p: any) => p.source.selection.messageIds = ['question'], (p: any) => p.input.audience.sourceKind = 'material_lesson']) {
      const forged = structuredClone(prepared); mutate(forged); expect(() => assertPreparedAssistantWhiteboard(rehash(forged))).toThrow();
    }
    const protocol = { ...prepared, version: 'topic-whiteboard-v1' } as unknown as PreparedAssistantWhiteboard;
    expect(() => assertPreparedAssistantWhiteboard(protocol)).toThrow('prepared_protocol');
  });
  it('accepts complete mapped content and exposes a separate strict model schema without changing ordinaryv1', () => {
    const f = fixture(), value = content(); expect(validateAssistantWhiteboardContent(f.prepare(), value)).toEqual(value);
    expect(() => topicWhiteboardContentSchema.parse(value)).toThrow();
    const schema: any = assistantWhiteboardJsonSchema, old: any = topicWhiteboardJsonSchema;
    expect(schema.properties.scenes.items.required).toContain('sourceMap'); expect(old.properties.scenes.items.properties).not.toHaveProperty('sourceMap');
    expect((assistantWhiteboardReviewJsonSchema as any).properties.revisedContent.anyOf[0]).toEqual(schema);
  });
  it.each(['unknown-message', 'borrowed-reference', 'unknown-reference', 'duplicate-message', 'duplicate-reference', 'missing-map', 'forged-field'])(
    'rejects invalid scene mapping: %s', kind => {
      const f = fixture(), value: any = content(), map = value.scenes[1].sourceMap;
      if (kind === 'unknown-message') map.messageIds = ['unselected'];
      if (kind === 'borrowed-reference') map.referenceKeys = ['reference-2'];
      if (kind === 'unknown-reference') map.referenceKeys = ['unverified-private-url'];
      if (kind === 'duplicate-message') map.messageIds.push('answer-one');
      if (kind === 'duplicate-reference') map.referenceKeys.push('reference-1');
      if (kind === 'missing-map') delete value.scenes[1].sourceMap;
      if (kind === 'forged-field') map.sourceUrl = 'https://unverified.example/';
      expect(() => validateAssistantWhiteboardContent(f.prepare(), value)).toThrow();
    });
  it('requires a source for sourced scenes and keeps supplementary explanation distinct from original references', () => {
    const f = fixture(), value = content(); value.scenes[2].sourceMap.status = 'sourced';
    expect(() => validateAssistantWhiteboardContent(f.prepare(), value)).toThrow();
    value.scenes[2].sourceMap = { messageIds: ['answer-two'], referenceKeys: ['reference-2'], status: 'sourced', explanation: '对应第二条原回答。' };
    expect(validateAssistantWhiteboardContent(f.prepare(), value)).toEqual(value);
    value.scenes[2].sourceMap.status = 'supplementary'; expect(() => validateAssistantWhiteboardContent(f.prepare(), value)).toThrow();
  });
  it('retains inherited full-content limits, rectangular tables and spoken notes', () => {
    const f = fixture(), value = content(); (value.scenes[1].exhibit as { rows: string[][] }).rows[0].pop();
    expect(() => validateAssistantWhiteboardContent(f.prepare(), value)).toThrow();
    const unspoken = content(); unspoken.scenes[0].bullets = ['没有在完整讲述中出现的要点']; expect(() => validateAssistantWhiteboardContent(f.prepare(), unspoken)).toThrow();
    const full = content(); full.scenes = Array.from({ length: 8 }, () => ({ ...structuredClone(full.scenes[1]), body: '完整正文'.repeat(200), narration: '完整讲述'.repeat(400), bullets: [] }));
    expect(JSON.stringify(full).length).toBeGreaterThan(22000); expect(() => assistantWhiteboardContentSchema.parse(full)).toThrow();
  });
  it('rejects invented formal atoms and model-supplied figures while allowing an explicit later real-image validation mode', () => {
    const f = fixture(), value = content(); value.scenes[0].targetAtomIds = ['forged-atom'];
    expect(() => validateAssistantWhiteboardContent(f.prepare(), value)).toThrow('formal_target_forbidden');
    value.scenes[0].targetAtomIds = []; value.scenes[0].figure = { visualId: 'topic_whiteboard_visual_11111111-1111-4111-a111-111111111111', alt: '原始图示的完整说明', caption: '原图用于说明条件。' };
    expect(() => validateAssistantWhiteboardContent(f.prepare(), value)).toThrow('model_figure_forbidden');
    expect(validateAssistantWhiteboardContent(f.prepare(), value, { allowFigures: true })).toEqual(value);
  });
  it('retains uncertain originals, requires a concrete changed revision and validates mappings in the revised content too', () => {
    const f = fixture(), prepared = f.prepare(), original = content(), before = structuredClone(original);
    const uncertain = validateAssistantWhiteboardReview(prepared, original, { decision: 'uncertain', issues: ['需要教师核对新增解释。'], revisedContent: null });
    expect(uncertain.content).toEqual(original); expect(uncertain.decision).toBe('uncertain'); expect(original).toEqual(before);
    expect(() => validateAssistantWhiteboardReview(prepared, original, { decision: 'pass', issues: ['仍有问题'], revisedContent: null })).toThrow();
    expect(() => validateAssistantWhiteboardReview(prepared, original, { decision: 'revised', issues: ['说明'], revisedContent: original })).toThrow('empty_revision');
    const revised = content(); revised.description = '补足适用条件，新增核查仍需实际作答。';
    expect(validateAssistantWhiteboardReview(prepared, original, { decision: 'revised', issues: ['补足条件'], revisedContent: revised }).content).toEqual(revised);
    revised.scenes[1].sourceMap.referenceKeys = ['reference-2'];
    expect(() => validateAssistantWhiteboardReview(prepared, original, { decision: 'revised', issues: ['修改引用'], revisedContent: revised })).toThrow('outside_mapped_messages');
  });
});
