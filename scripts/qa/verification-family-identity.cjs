// Controlled legacy-row compatibility in the caller's isolated SQLite/PostgreSQL QA store.
// All questions are actual authored tasks. Fixture injection is explicit, never real student history.
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { FAMILY_IDENTITY_VERSION } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/family-identity.js');
const { blueprintContentHash } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/assessment-blueprint.js');
const { QuestionWorkspaceService } = require('../../apps/api/dist/apps/api/src/modules/question-workspace/question-workspace.service.js');

module.exports.verifyFamilyIdentityUpgrade = async function ({ call, getStore, getApp, tokens }) {
  const atomId = 'core:math:brackets', actor = 'identity-parent', learner = 'identity-learner';
  tokens[actor] = (await call('POST', '/auth/register', { principal: 'qa-family-identity-parent', credential: randomBytes(24).toString('hex') }, 'anonymous')).token;
  const studentId = (await call('POST', '/students', { nickname: '合成题族升级核查', grade: 4, preferredSessionMinutes: 15,
    defaultVersionMap: { math: 'original', chinese: '', english: '' } }, actor)).profile.id;
  const access = await call('POST', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0,
    requestKey: randomUUID(), reason: '正式学生身份核对旧题族升级与原始证据保留' }, actor);
  const code = await call('POST', `/students/${studentId}/learning-access/codes`, { expectedVersion: access.version, requestKey: randomUUID() }, actor);
  tokens[learner] = (await call('POST', '/auth/learning-code', { code: code.code }, 'anonymous')).token;
  await call('PUT', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 4, term: 'upper', textbookVolumeId: null,
    textbookVersion: '原创能力路径', learnedAtomIds: [atomId], currentAtomId: atomId, minutesPerSession: 15 }, actor);
  const statuses = await getStore().transaction(() => {
    const store = getStore(), originals = store.select('measurementItems', { atomId }).map(row => ({ id: row.id, reviewStatus: row.reviewStatus }));
    for (const row of store.select('measurementItems', { atomId })) {
      const schema = store.find('questionAnswerSchemas', { questionId: row.questionId });
      if (![`${atomId}:bracket-left`, `${atomId}:bracket-right`].includes(row.family) || schema?.mode !== 'numeric_blank') row.reviewStatus = 'draft';
    }
    return structuredClone(originals);
  });
  const started = await call('POST', '/diagnostics/sessions', { studentId, subject: 'math', intent: 'baseline', targetAtomIds: [atomId],
    includePrerequisites: false, maxItems: 8 }, learner);
  assert.equal(started.items.length, 1); assert.match(started.coverage[0].missingReason, /不同题族不足/);
  const sessionId = started.id, route = `/diagnostics/sessions/${encodeURIComponent(sessionId)}`;
  const frozen = await getStore().transaction(() => {
    const store = getStore(), raw = store.find('diagnosticSessions', { id: sessionId });
    const other = store.select('measurementItems', { atomId, reviewStatus: 'approved' }).find(row => row.family !== raw.itemSnapshots[0].family);
    assert(other); const question = store.find('questions', { id: other.questionId });
    const payload = getApp().get(QuestionWorkspaceService).buildRenderPayload(question.id);
    raw.itemSnapshots.push(structuredClone(other)); raw.itemIds.push(other.id);
    raw.questionSnapshots.push(structuredClone({ id: question.id, stem: question.stem, answer: question.answer, analysis: question.analysis,
      document: payload.document, answerSchema: payload.answerSchema, renderPayload: payload, questionType: question.type }));
    raw.coverage[0].selected = 2; delete raw.coverage[0].missingReason;
    delete raw.blueprint.familyIdentityVersion; raw.blueprint.version = 'verification-blueprint-v1'; raw.algorithmVersion = raw.blueprint.version;
    raw.blueprint.verification = { hypothesisId: 'controlled-legacy-fixture', title: '受控旧标签核查', cause: 'procedure_gap',
      ruleVersion: 'diagnosis-rules-v4', sourceRuleVersion: 'diagnosis-rules-v4', basisFingerprint: 'controlled-legacy-basis',
      supportCondition: '旧规则的两个标签', counterCondition: '旧规则的两个标签', undecidedCondition: '保留未知', fullyCovered: true,
      groups: [{ id: 'legacy-basic', atomId, dimensions: ['procedure', 'understanding'], purpose: '受控历史兼容夹具', minIndependentFamilies: 2,
        availableFamilies: 2, selectedFamilies: raw.itemSnapshots.map(row => row.family), itemIds: [...raw.itemIds] }] };
    // Restore all eligibility immediately after freezing this controlled legacy group.
    for (const row of statuses) store.find('measurementItems', { id: row.id }).reviewStatus = row.reviewStatus;
    return structuredClone({ blueprint: raw.blueprint, items: raw.itemSnapshots, questions: raw.questionSnapshots });
  });
  for (const mapping of frozen.items) {
    const expected = frozen.questions.find(row => row.id === mapping.questionId).answer;
    await call('POST', route + '/responses', { itemId: mapping.id, answer: Number(expected) + 1, elapsedMs: 1000 }, learner);
  }
  const current = await call('POST', route + '/complete', {}, learner);
  assert.equal(current.verification.groups[0].independentFamilies, 1); assert.equal(current.verification.independentObservationsComplete, false);
  const plan = await call('POST', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: sessionId, minutesPerDay: 5, useAi: false }, actor);
  const originals = await getStore().transaction(() => {
    const store = getStore(), saved = store.select('diagnosticReports', { sessionId })[0];
    delete saved.report.familyIdentityVersion; delete saved.report.verification.familyIdentityVersion;
    delete saved.report.verification.distinctFamilyRequirementsMet; saved.report.verification.independentObservationsComplete = true;
    saved.report.verification.groups[0].independentFamilies = 2; saved.report.verification.groups[0].belowStandardFamilies = 2;
    for (const estimate of saved.report.estimates.filter(row => row.atomId === atomId)) {
      delete estimate.familyIdentityVersion; estimate.algorithmVersion = 'rule-estimate-v1'; estimate.independentFamilies = 2; estimate.effectiveSamples = 2;
      estimate.mastery = 25; estimate.lower = Number(((1 - Math.pow(0.975, 1 / 3)) * 100).toFixed(1));
      estimate.upper = Number(((1 - Math.pow(0.025, 1 / 3)) * 100).toFixed(1));
      estimate.dimensions.find(row => row.dimension === 'procedure').samples = 2;
    }
    for (const hypothesis of [...saved.report.hypotheses, ...store.select('diagnosticHypotheses', { studentId })]) {
      delete hypothesis.familyIdentityVersion; hypothesis.ruleVersion = 'diagnosis-rules-v4'; hypothesis.status = 'supported';
      hypothesis.history.forEach(entry => { entry.ruleVersion = 'diagnosis-rules-v4'; entry.status = 'supported'; });
    }
    return structuredClone({ report: saved, responses: store.select('diagnosticResponses', { sessionId }) });
  });
  assert.equal((await call('GET', route + '/analysis-status', undefined, learner)).requiresReanalysis, true);
  const oldReport = await call('GET', route + '/report', undefined, learner);
  const affectedPlan = await call('GET', `/diagnostics/plans/${plan.id}`, undefined, actor);
  assert(affectedPlan.impact.needsReview && affectedPlan.impact.measurementRulesChanged);
  await call('PATCH', `/diagnostics/plans/${plan.id}`, { expectedRevision: plan.revision, requestKey: randomUUID(), status: 'active' }, actor, 409);
  const command = { requestKey: randomUUID(), expectedReportVersion: 1, reason: '受控历史夹具核查题族归并后的原始证据' };
  await call('POST', route + '/reanalyze', command, learner, 403);
  await call('POST', route + '/reanalyze', command, 'outsider', 403);
  const [refreshed, concurrentReplay] = await Promise.all([
    call('POST', route + '/reanalyze', command, actor), call('POST', route + '/reanalyze', command, actor),
  ]);
  assert.deepEqual(concurrentReplay, refreshed);
  assert.equal(refreshed.version, 2); assert.equal(refreshed.familyIdentityVersion, FAMILY_IDENTITY_VERSION);
  assert.equal(refreshed.estimates.find(row => row.atomId === atomId).independentFamilies, 1);
  assert.equal(refreshed.hypotheses.find(row => row.cause === 'procedure_gap').status, 'proposed');
  assert.deepEqual(await call('POST', route + '/reanalyze', command, actor), refreshed);
  await call('POST', route + '/reanalyze', { ...command, reason: '同一个请求键不能用于不同输入' }, actor, 409);
  await call('POST', route + '/reanalyze', { ...command, requestKey: randomUUID() }, actor, 409);
  assert.deepEqual((await call('GET', route + '/report-history', undefined, learner)).at(-1), oldReport);
  const revised = await call('POST', `/diagnostics/plans/${plan.id}/adjust`, { expectedRevision: plan.revision, requestKey: randomUUID(),
    acknowledgeReportVersion: 2, minutesPerDay: 5, reason: '按原作答重新分析后重新核对指导活动',
    actions: plan.actions.map(action => ({ actionId: action.id, minutes: action.minutes, activity: action.activity })) }, actor);
  assert.equal(revised.impact.needsReview, false);
  const retrospective = await call('GET', `/diagnostics/plans/${plan.id}/retrospective`, undefined, actor);
  assert.equal(retrospective.measurementContext.familyIdentityVersion, FAMILY_IDENTITY_VERSION);
  assert(retrospective.comparisons.every(row => row.outcome === 'awaiting_retest'));
  return {
    receipt: { fixtureKind: 'explicit controlled legacy rows with real authored questions; not recovered student history or an old-binary deployment',
      newSelectionCollapsesAliases: true, legacyFrozenBlueprintStillTwoLabels: true, actualIndependentFamilies: 1,
      rawQuestionsResponsesAndMappingsRetained: true, legacyReportPreserved: true, reanalysisVersion: 2, ruleUpdateNotLearningImprovement: true,
      learnerAndOutsiderCannotReanalyze: true, idempotentReplayAndConflictChecks: true, concurrentReanalysisSingleReport: true,
      legacyGuidanceHeldThenAcknowledged: true,
      retrospectiveRecomputesBothSidesUnderCurrentRules: true, eligibilityRestored: true },
    verifyAfterRestart: async () => {
      assert.deepEqual(await call('GET', route + '/report', undefined, learner), refreshed);
      assert.deepEqual((await call('GET', route + '/report-history', undefined, learner)).at(-1), oldReport);
      assert.deepEqual(await call('POST', route + '/reanalyze', command, actor), refreshed);
      assert.equal((await call('GET', route + '/analysis-status', undefined, learner)).requiresReanalysis, false);
      await getStore().transaction(() => {
        const store = getStore();
        assert.equal(blueprintContentHash(store.find('diagnosticReports', { id: originals.report.id })), blueprintContentHash(originals.report));
        const byId = (a, b) => a.id.localeCompare(b.id);
        assert.equal(blueprintContentHash(store.select('diagnosticResponses', { sessionId }).sort(byId)), blueprintContentHash([...originals.responses].sort(byId)));
        assert.equal(blueprintContentHash(store.find('diagnosticSessions', { id: sessionId }).blueprint), blueprintContentHash(frozen.blueprint));
        for (const row of statuses) assert.equal(store.find('measurementItems', { id: row.id }).reviewStatus, row.reviewStatus);
      });
      return { reportBlueprintOriginalResponsesAndReplaySurviveRestart: true };
    },
  };
};
