import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ASSISTANT_PRACTICE_CONTENT_PROTOCOL, assistantPracticeContentSchema, type AssistantArtifactOrigin,
  type AssistantPracticeContent, type AssistantPracticeContentInput, type AssistantPracticeTargetScope } from '@study-agent/contracts';
import { assertPreparedAssistantPractice, prepareAssistantTeachingPractice, type PreparedAssistantPractice } from './assistant-practice-source';
import { assistantPracticeContentJsonSchema, assistantPracticeReviewJsonSchema, projectAssistantPracticeForLearner,
  validateAssistantPracticeContent, validateAssistantPracticeReview } from './assistant-practice-content';
import { topicWhiteboardDigest as digest } from './topic-whiteboard-digest';

const model = { id: 'deepseek-v4-flash', label: 'DeepSeek V4.1 Flash' };
function fixture() {
  const origin: AssistantArtifactOrigin = { protocol: 'assistant-artifact-origin-v1', sessionId: 'anonymous-session', studentId: null, subject: null,
    location: { sessionId: 'anonymous-session', pageContext: 'studio', studentId: null, subject: null,
      contextRefType: null, contextRefId: null, contextItemId: null, href: '/studio?view=home' },
    selection: { requestedMessageIds: ['answer-one', 'answer-two'], includeLinkedQuestions: true,
      messageIds: ['question', 'answer-one', 'answer-two'], linkedQuestionIds: ['question'] },
    messages: ['question', 'answer-one', 'answer-two'].map((id, sequence) => {
      const content = sequence ? id + '\n|条件|数量|\n|---|---|\n|相同整体|3|\n$\\frac{1}{2}$\n```js\nconsole.log("完整代码");\n```' : '先核对条件，再解释判断。';
      return { id, sender: sequence ? 'assistant' : 'user', content, contentSha256: createHash('sha256').update(content).digest('hex'),
        createdAt: '2026-10-29T00:00:00.000Z', sequence, inReplyTo: sequence ? 'question' : null, source: sequence ? 'xiaojiu' : null,
        modelId: sequence ? model.id : null, modelName: sequence ? model.label : null,
        sourceReferences: sequence ? [{ key: 'reference-' + sequence, kind: 'classroom_lecture', courseId: 'anonymous-course', itemId: 'anonymous-lecture',
          title: '匿名教学出处', href: '/studio?view=courses', contextFingerprint: 'a'.repeat(64), quote: '条件必须完整核对' }] : [] };
    }) };
  const input: AssistantPracticeContentInput = { selection: { messageIds: ['answer-one', 'answer-two'], includeLinkedQuestions: true },
    objective: '判断问题类型并解释适用条件', audience: { kind: 'adult' }, acknowledgeHistoricalSource: false, acknowledgeAudienceTransfer: false };
  let targetScope: AssistantPracticeTargetScope = { kind: 'adult' };
  return { origin, input, get scope() { return targetScope; },
    student() {
      input.audience = { kind: 'student', studentId: 'anonymous-child', subject: 'math', targetAtomIds: ['atom-one', 'atom-two'] };
      input.acknowledgeAudienceTransfer = true;
      targetScope = { kind: 'student', studentId: 'anonymous-child', subject: 'math', scopeGrade: 5, profileGrade: 4, scopeTerm: 'upper',
        scopeVersion: 2, scopeFingerprint: 'b'.repeat(64), targets: ['atom-one', 'atom-two'].map(atomId => ({ atomId,
          name: '比较条件与整体', objective: '统一条件、整体和单位后解释理由', subject: 'math', grade: 4, term: 'lower', definitionFingerprint: 'c'.repeat(64) })) };
      return targetScope;
    },
    prepare: () => prepareAssistantTeachingPractice(origin, input, targetScope, model, true),
  };
}
function content(): AssistantPracticeContent {
  return { protocol: ASSISTANT_PRACTICE_CONTENT_PROTOCOL, title: '核对条件与判断理由', objective: '结合条件说明判断，并保留不确定性', questions: [
    { id: 'classification-one', kind: 'classification', prompt: '在条件相同的情境里，哪种判断有依据？', reasonPrompt: '说明你使用了哪些条件，以及缺少什么信息。',
      options: [{ id: 'a', label: '先核对整体和单位' }, { id: 'b', label: '直接比较表面数字' }], referenceOptionId: 'a',
      referenceExplanation: '先核对整体和单位，再比较数量。仅有数字不能确定比较条件。', applicableConditions: ['整体和单位均已说明'],
      reasoningCriteria: ['指出比较整体', '说明适用条件和信息缺口'], hints: ['先找出被比较的整体', '再检查使用的单位'],
      contrast: { prompt: '如果两个数字使用不同单位，还能直接比较吗？', referenceExplanation: '应先统一单位，再核对比较条件。' }, targetAtomIds: [],
      sourceMap: { messageIds: ['answer-one'], referenceKeys: ['reference-1'], status: 'sourced', explanation: '对应原回答中明确的整体与条件。' } },
    { id: 'open-two', kind: 'open_response', prompt: '用一个新例子解释为什么相同数字可能代表不同数量。', reasonPrompt: '写出理由，也指出这个例子依赖的条件。',
      options: [], referenceOptionId: null, referenceExplanation: '可用不同整体的一半说明；整体不同，相同分数代表的数量可能不同。',
      applicableConditions: ['整体可辨认且单位明确'], reasoningCriteria: ['例子包含可核对的整体'], hints: ['想一想大小不同的两个整体'],
      contrast: { prompt: '如果整体大小也相同，判断会怎样变化？', referenceExplanation: '在单位和整体相同的条件下，才可以按相同比例比较。' }, targetAtomIds: [],
      sourceMap: { messageIds: [], referenceKeys: [], status: 'supplementary', explanation: '这是新增的对照练习，尚未经实际学习验证。' } },
  ] };
}
function rehash(prepared: PreparedAssistantPractice) {
  const { fingerprint: _old, ...identity } = prepared; prepared.fingerprint = digest(identity); return prepared;
}
function studentContent() { const value = content(); value.questions[0].targetAtomIds = ['atom-one']; value.questions[1].targetAtomIds = ['atom-two']; return value; }

describe('source-bound teaching practice pure protocol', () => {
  it('keeps full selected source, code, formula and table separate from the short objective without mutating inputs', () => {
    const f = fixture(); f.origin.messages[1].content += '\n完整原文。'.repeat(500) + 'SOURCE_END_MARKER';
    f.origin.messages[1].contentSha256 = createHash('sha256').update(f.origin.messages[1].content).digest('hex');
    const before = structuredClone({ origin: f.origin, input: f.input }), prepared = f.prepare();
    expect(prepared.context.length).toBeGreaterThan(4000); expect(prepared.context.length).toBeLessThanOrEqual(18000);
    expect(JSON.parse(prepared.context).origin.messages[1].content).toBe(f.origin.messages[1].content);
    expect(prepared.modelId).toBe(model.id); expect(prepared.modelName).toBe(model.label);
    expect(prepared.source.origin).toEqual(f.origin); expect({ origin: f.origin, input: f.input }).toEqual(before);
    expect(() => assertPreparedAssistantPractice(prepared)).not.toThrow();
    prepared.source.origin.messages[1].content += '不修改原数据'; expect(f.origin).toEqual(before.origin);
  });

  it('preserves complete question code, formula, table and newlines in the learner projection', () => {
    const f = fixture(), value = content(), body = '\n|整体|单位|\n|---|---|\n|明确|统一|\n$\\frac{1}{2}$\n```js\nconsole.log("问题正文");\n```';
    value.questions[0].prompt += body;
    expect(projectAssistantPracticeForLearner(f.prepare(), value).questions[0].prompt).toBe(value.questions[0].prompt);
  });

  it('rejects complete source over budget and an unavailable or different fixed model', () => {
    const f = fixture(); expect(() => prepareAssistantTeachingPractice(f.origin, f.input, f.scope, model, false)).toThrow('model_unavailable');
    f.input.modelId = 'different-model'; expect(() => f.prepare()).toThrow('model_mismatch'); delete f.input.modelId;
    f.origin.messages[1].content += '原文必须完整保留。'.repeat(2500);
    f.origin.messages[1].contentSha256 = createHash('sha256').update(f.origin.messages[1].content).digest('hex');
    expect(() => f.prepare()).toThrow('source_budget_exceeded'); expect(f.origin.messages[1].content).toContain('原文必须完整保留。'.repeat(2500));
  });

  it('requires historical-source and adult-to-child confirmations independently of reviewed question coverage', () => {
    const f = fixture(); f.origin.lecture = { courseId: 'anonymous-course', courseVersion: 'old', courseTitle: '原教学课程', unitId: 'anonymous-unit',
      unitTitle: '原单元', unitPosition: 1, lectureId: 'anonymous-lecture', lectureTitle: '原讲座', lecturePosition: 1, fingerprint: 'a'.repeat(64),
      referenceId: 'anonymous-reference', current: false, href: '/studio?view=courses' };
    expect(() => f.prepare()).toThrow('historical_source_confirmation_required'); f.input.acknowledgeHistoricalSource = true;
    expect(f.prepare().source.origin.lecture?.current).toBe(false); f.student(); f.input.acknowledgeAudienceTransfer = false;
    expect(() => f.prepare()).toThrow('audience_transfer_confirmation_required'); f.input.acknowledgeAudienceTransfer = true;
    expect(() => f.prepare()).not.toThrow();
  });

  it('keeps course/scope grade5 and profile grade4 separate, and refuses course/scope mismatch', () => {
    const f = fixture(), scope = f.student(); expect(scope.kind).toBe('student');
    f.origin.studentId = 'anonymous-child'; f.origin.subject = 'math'; f.origin.location.studentId = 'anonymous-child'; f.origin.location.subject = 'math';
    f.origin.teachingScope = { grade: 5, term: 'upper', scopeVersion: 2, textbookVersion: '匿名教材版本', courseVersion: '原版本',
      teachingFingerprint: 'e'.repeat(64), selection: { mode: 'complete' }, coverage: { totalParts: 1, includedParts: 1, totalTargets: 2, includedTargets: 2, complete: true } };
    expect(f.prepare().targetScope).toMatchObject({ scopeGrade: 5, profileGrade: 4 });
    f.origin.teachingScope.grade = 9; expect(() => f.prepare()).toThrow('target_definition_mismatch');
  });

  it('rejects cross-child, cross-subject, adult relabelling and unconfirmed audience scope', () => {
    const f = fixture(); f.student(); f.origin.studentId = 'other-child'; f.origin.location.studentId = 'other-child';
    expect(() => f.prepare()).toThrow('target_scope_mismatch'); f.origin.studentId = null; f.origin.location.studentId = null;
    f.origin.subject = 'chemistry'; f.origin.location.subject = 'chemistry'; expect(() => f.prepare()).toThrow('target_scope_mismatch');
    const g = fixture(); g.origin.studentId = 'anonymous-child'; g.origin.location.studentId = 'anonymous-child';
    expect(() => g.prepare()).toThrow('adult_source_mismatch');
    expect(() => prepareAssistantTeachingPractice(fixture().origin, fixture().input, f.scope, model, true)).toThrow('target_scope_mismatch');
  });

  it('retains a named subject for an adult course without inventing a child or formal targets', () => {
    const f = fixture(); f.origin.subject = 'math'; f.origin.location.subject = 'math';
    f.origin.course = { kind: 'material_lesson', courseId: 'anonymous-adult-course', courseTitle: '成人数学资料课', itemId: 'anonymous-lesson',
      itemTitle: '比较条件', studentId: null, subject: 'math', accessMode: 'published', fingerprint: 'e'.repeat(64), referenceId: 'anonymous-source',
      current: true, href: '/studio?view=courses', selection: { mode: 'complete' },
      coverage: { totalParts: 1, includedParts: 1, totalTargets: 0, includedTargets: 0, complete: true } };
    const prepared = f.prepare(); expect(prepared.targetScope).toEqual({ kind: 'adult' }); expect(prepared.source.origin.subject).toBe('math');
    expect(validateAssistantPracticeContent(prepared, content()).questions.every(question => question.targetAtomIds.length === 0)).toBe(true);
  });

  it('rejects duplicate/withdrawn-like target mismatches and out-of-scope grade or term definitions', () => {
    const f = fixture(), scope = f.student(); if (scope.kind !== 'student') throw Error('fixture');
    scope.targets[1].atomId = 'not-selected'; expect(() => f.prepare()).toThrow('target_definition_mismatch'); scope.targets[1].atomId = 'atom-two';
    scope.targets[1].atomId = 'atom-one'; expect(() => f.prepare()).toThrow('target_definition_mismatch'); scope.targets[1].atomId = 'atom-two';
    scope.targets[1].grade = 6; expect(() => f.prepare()).toThrow('target_definition_mismatch');
    scope.targets[1].grade = 5; scope.targets[1].term = 'lower'; expect(() => f.prepare()).toThrow('target_definition_mismatch');
  });

  it('accepts the existing curriculum contract with a one-character atom name and a both-term target', () => {
    const f = fixture(), scope = f.student(); if (scope.kind !== 'student') throw Error('fixture');
    scope.targets[0].name = '角'; scope.targets[0].term = 'both'; scope.targets[0].grade = scope.scopeGrade;
    expect(f.prepare().targetScope).toMatchObject({ targets: [{ name: '角', term: 'both' }, { atomId: 'atom-two' }] });
    expect(() => validateAssistantPracticeContent(f.prepare(), studentContent())).not.toThrow();
  });

  it.each(['context', 'sourceFingerprint', 'messageHash', 'selection', 'linkedQuestion', 'messageOrder', 'location', 'targetIdentity'])
  ('refuses saved %s inconsistency even after outer digest recomputation', kind => {
    const f = fixture(); if (kind === 'targetIdentity') f.student(); const p = f.prepare();
    if (kind === 'context') p.context += '改写';
    if (kind === 'sourceFingerprint') p.source.sourceFingerprint = '0'.repeat(64);
    if (kind === 'messageHash') p.source.origin.messages[1].content += '改写';
    if (kind === 'selection') p.input.selection.messageIds = ['unknown'];
    if (kind === 'linkedQuestion') p.source.origin.selection.linkedQuestionIds = [];
    if (kind === 'messageOrder') p.source.origin.messages.reverse();
    if (kind === 'location') p.source.origin.location.sessionId = 'other-session';
    if (kind === 'targetIdentity' && p.targetScope.kind === 'student') p.targetScope.targets[1].atomId = 'unknown';
    expect(() => assertPreparedAssistantPractice(rehash(p))).toThrow();
  });

  it('rejects direct digest or protocol edits and invalid auto-linked source messages', () => {
    const f = fixture(), p = f.prepare(); p.modelId = 'other'; expect(() => assertPreparedAssistantPractice(p)).toThrow('prepared_changed');
    const unknown = { ...f.prepare(), version: 'unknown' } as unknown as PreparedAssistantPractice;
    expect(() => assertPreparedAssistantPractice(unknown)).toThrow('prepared_protocol');
    f.origin.messages[1].inReplyTo = 'missing-question'; expect(() => f.prepare()).toThrow('source_link_mismatch');
  });

  it('rejects duplicate source references and conflicting identity for the same reference key', () => {
    const f = fixture(); f.origin.messages[1].sourceReferences.push(structuredClone(f.origin.messages[1].sourceReferences[0]));
    expect(() => f.prepare()).toThrow('source_reference_mismatch'); f.origin.messages[1].sourceReferences.pop();
    f.origin.messages[2].sourceReferences[0].key = 'reference-1'; f.origin.messages[2].sourceReferences[0].quote += '不同来源';
    expect(() => f.prepare()).toThrow('source_reference_mismatch');
  });

  it('validates classification plus reasons and open expression, with a source map per question', () => {
    const f = fixture(); expect(validateAssistantPracticeContent(f.prepare(), content())).toEqual(content());
    f.student(); expect(validateAssistantPracticeContent(f.prepare(), studentContent()).questions.map(question => question.targetAtomIds)).toEqual([['atom-one'], ['atom-two']]);
  });

  it.each(['duplicateId', 'normalizedLabel', 'missingReference', 'openOptions', 'openReference', 'oneOption', 'oneQuestion', 'sevenQuestions'])
  ('rejects malformed question structure: %s', kind => {
    const value = content();
    if (kind === 'duplicateId') value.questions[1].id = value.questions[0].id;
    if (kind === 'normalizedLabel') { value.questions[0].options[0].label = 'Ａ  B'; value.questions[0].options[1].label = ' a\t b '; }
    if (kind === 'missingReference') value.questions[0].referenceOptionId = 'unknown';
    if (kind === 'openOptions') value.questions[1].options = [{ id: 'x', label: '额外选项' }];
    if (kind === 'openReference') value.questions[1].referenceOptionId = 'a';
    if (kind === 'oneOption') value.questions[0].options.pop();
    if (kind === 'oneQuestion') value.questions.pop();
    if (kind === 'sevenQuestions') value.questions = Array.from({ length: 7 }, (_, i) => ({ ...value.questions[0], id: 'q-' + i }));
    expect(assistantPracticeContentSchema.safeParse(value).success).toBe(false);
  });

  it('refuses unknown source messages, references from a different mapped message and supplementary false citations', () => {
    const f = fixture(), value = content(), p = f.prepare(); value.questions[0].sourceMap.messageIds = ['unknown'];
    expect(() => validateAssistantPracticeContent(p, value)).toThrow('unknown_source_message');
    value.questions[0].sourceMap.messageIds = ['answer-two']; expect(() => validateAssistantPracticeContent(p, value)).toThrow('reference_outside_mapped_messages');
    value.questions[0].sourceMap.messageIds = ['answer-one']; value.questions[0].sourceMap.status = 'supplementary';
    expect(() => validateAssistantPracticeContent(p, value)).toThrow();
    value.questions[0].sourceMap.status = 'sourced'; value.questions[0].sourceMap.messageIds = []; expect(() => validateAssistantPracticeContent(p, value)).toThrow();
  });

  it('refuses adult formal targets, unselected student targets and selected targets omitted from all questions', () => {
    const f = fixture(); expect(() => validateAssistantPracticeContent(f.prepare(), studentContent())).toThrow('question_target_mismatch');
    f.student(); const value = studentContent(), p = f.prepare(); value.questions[1].targetAtomIds = ['unknown'];
    expect(() => validateAssistantPracticeContent(p, value)).toThrow('question_target_mismatch');
    value.questions[1].targetAtomIds = ['atom-one']; expect(() => validateAssistantPracticeContent(p, value)).toThrow('uncovered_target');
    value.questions[1].targetAtomIds = []; expect(() => validateAssistantPracticeContent(p, value)).toThrow('question_target_mismatch');
  });

  it.each(['approved', 'score', 'evidenceId', 'figure', 'imageUrl'])('rejects model-invented %s fields', field => {
    const value = content(); Object.assign(value.questions[0], { [field]: 'fabricated' });
    expect(() => validateAssistantPracticeContent(fixture().prepare(), value)).toThrow();
  });

  it('enforces the aggregate complete body budget independently of individually valid field lengths', () => {
    const value = content(); value.questions = Array.from({ length: 6 }, (_, i) => ({ ...structuredClone(value.questions[i % 2]), id: 'question-' + i,
      prompt: '完整题干'.repeat(700), referenceExplanation: '完整解释'.repeat(700) }));
    expect(() => validateAssistantPracticeContent(fixture().prepare(), value)).toThrow('22000');
    expect(value.questions[5].referenceExplanation).toHaveLength(2800);
  });

  it('projects only initial answer controls, with no answers, hints, source map, private source or model context', () => {
    const f = fixture(), value = content(), projected = projectAssistantPracticeForLearner(f.prepare(), value);
    expect(Object.keys(projected).sort()).toEqual(['objective', 'protocol', 'questions', 'title']);
    expect(Object.keys(projected.questions[0]).sort()).toEqual(['id', 'kind', 'options', 'prompt', 'reasonPrompt']);
    const serialized = JSON.stringify(projected);
    for (const hidden of ['referenceOptionId', 'referenceExplanation', 'reasoningCriteria', 'applicableConditions', 'hints', 'contrast', 'sourceMap', 'targetAtomIds',
      value.questions[0].referenceExplanation, f.origin.messages[1].content, 'modelId', 'sourceFingerprint']) expect(serialized).not.toContain(hidden);
    projected.questions[0].options[0].label = '本机改动'; expect(value.questions[0].options[0].label).toBe('先核对整体和单位');
  });

  it('preserves initial content for pass or uncertainty, and validates a complete concrete revision', () => {
    const f = fixture(), p = f.prepare(), initial = content(), before = structuredClone(initial);
    expect(validateAssistantPracticeReview(p, initial, { decision: 'pass', issues: [], revisedContent: null }).content).toEqual(initial);
    expect(validateAssistantPracticeReview(p, initial, { decision: 'uncertain', issues: ['缺少核对单位的原始条件'], revisedContent: null }).content).toEqual(initial);
    const revised = structuredClone(initial); revised.questions[0].referenceExplanation += '还应明确比较对象是否相同。';
    expect(validateAssistantPracticeReview(p, initial, { decision: 'revised', issues: ['原解释未明确比较对象'], revisedContent: revised }).content).toEqual(revised);
    expect(initial).toEqual(before);
  });

  it.each([
    { decision: 'pass', issues: ['仍有缺口'], revisedContent: null },
    { decision: 'revised', issues: [], revisedContent: content() },
    { decision: 'revised', issues: ['条件不完整'], revisedContent: null },
    { decision: 'uncertain', issues: [], revisedContent: null },
    { decision: 'uncertain', issues: ['需要人工核对'], revisedContent: content() },
  ])('rejects inconsistent reviewer decision %#', value => {
    expect(() => validateAssistantPracticeReview(fixture().prepare(), content(), value)).toThrow();
  });

  it('rejects a no-op or source-violating revision rather than silently adopting a partial correction', () => {
    const f = fixture(), initial = content(), p = f.prepare(), review = { decision: 'revised', issues: ['需要核对条件'], revisedContent: structuredClone(initial) };
    expect(() => validateAssistantPracticeReview(p, initial, review)).toThrow('empty_revision');
    review.revisedContent.questions[0].prompt += '补充问题'; review.revisedContent.questions[1].sourceMap.messageIds = ['unknown'];
    expect(() => validateAssistantPracticeReview(p, initial, review)).toThrow('unknown_source_message');
  });

  it('provides strict complete JSON generation and review schemas without formal approval or image fields', () => {
    expect(assistantPracticeContentJsonSchema.additionalProperties).toBe(false); expect(assistantPracticeReviewJsonSchema.additionalProperties).toBe(false);
    expect(assistantPracticeContentJsonSchema.required).toEqual(['protocol', 'title', 'objective', 'questions']);
    const question = assistantPracticeContentJsonSchema.properties.questions.items;
    expect(question.additionalProperties).toBe(false); expect(question.required).toContain('sourceMap');
    expect(Object.keys(question.properties)).not.toContain('approved'); expect(Object.keys(question.properties)).not.toContain('figure');
  });
});
