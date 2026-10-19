import { DiagnosticHypothesis, DiagnosticResponse, KnowledgeAtom, MeasurementItem, Subject } from '@study-agent/contracts';
import { createHash } from 'node:crypto';
import { atomDefinitionFingerprint } from './measurement-definition';

const ids = (evidence: DiagnosticResponse[]) => evidence.map((item) => item.id);
const families = (evidence: DiagnosticResponse[]) => new Set(evidence.map((item) => item.family)).size;
export const DIAGNOSIS_VERSION = 'diagnosis-rules-v3';

export function deriveHypotheses(studentId: string, subject: Subject, atoms: KnowledgeAtom[],
  responses: DiagnosticResponse[], mappings: Map<string, MeasurementItem>, previous: DiagnosticHypothesis[], at: string): DiagnosticHypothesis[] {
  const eligible = responses.filter((item) => item.studentId === studentId && item.status === 'scored' && !item.priorExposure && item.hintLevel === 0 &&
    (mappings.get(`${item.itemId}@${item.mappingVersion}`) ?? mappings.get(item.itemId))?.reviewStatus === 'approved');
  const valid = eligible.filter(item => item.disposition === 'answered');
  const results: DiagnosticHypothesis[] = [];
  for (const atom of atoms) {
    const local = valid.filter((item) => item.atomId === atom.id);
    const failed = local.filter((item) => item.score !== null && item.score < 1);
    const reported = eligible.filter(item => item.atomId === atom.id && item.disposition === 'dont_know');
    if (!failed.length && !reported.length) continue;
    const lastFailure = failed.reduce((latest, item) => item.submittedAt > latest ? item.submittedAt : latest, '');
    const recentSuccess = local.filter((item) => item.correct && item.submittedAt > lastFailure);
    const procedure = local.filter((item) => ['procedure', 'understanding'].includes(item.dimension));
    const procedurePass = procedure.filter((item) => item.correct);
    const procedureFail = procedure.filter((item) => !item.correct);
    const transferFail = failed.filter((item) => item.dimension === 'transfer');
    const transferPass = local.filter((item) => item.dimension === 'transfer' && item.correct);
    const retentionFail = failed.filter((item) => item.dimension === 'retention' && (item.retentionDelayDays ?? 0) >= 1);
    const retentionPass = local.filter((item) => item.dimension === 'retention' && (item.retentionDelayDays ?? 0) >= 1 && item.correct);
    const prerequisites = valid.filter((item) => atom.prerequisiteIds.includes(item.atomId));
    const failingPrerequisite = atom.prerequisiteIds.find((id) => families(prerequisites.filter((item) => item.atomId === id && !item.correct)) >= 2);
    const allPrerequisitesPassed = atom.prerequisiteIds.length > 0 && atom.prerequisiteIds.every((id) =>
      families(prerequisites.filter((item) => item.atomId === id && item.correct)) >= 2);

    const proposals: Array<{ cause: DiagnosticHypothesis['cause']; title: string; supporting: DiagnosticResponse[];
      counter: DiagnosticResponse[]; supported: boolean; contradicted: boolean; probes: string[]; explanation: string; action: string }> = [
      { cause: 'procedure_gap', title: '当前知识点的理解或执行需要核查', supporting: procedureFail, counter: procedurePass,
        supported: families(procedureFail) >= 2, contradicted: families(procedurePass) >= 2,
        probes: [atom.id], explanation: '基础题表现可以定位到当前行为，尚不能单独解释产生问题的原因。',
        action: '用两个不同题族的基础题，分别检查概念理解和关键步骤。' },
    ];
    if (atom.prerequisiteIds.length && failed.length) proposals.push({ cause: 'prerequisite_gap', title: '前置知识可能影响当前学习',
      supporting: [...failed, ...prerequisites.filter((item) => !item.correct)], counter: prerequisites.filter((item) => item.correct),
      supported: Boolean(failingPrerequisite) && families(failed) >= 2,
      contradicted: allPrerequisitesPassed,
      probes: failingPrerequisite ? [failingPrerequisite] : atom.prerequisiteIds,
      explanation: '综合题出错只提出前置知识假设，需要独立前置题检验，不能直接认定。', action: '先单独测前置知识，再用新题验证当前知识点。' });
    if (transferFail.length) proposals.push({ cause: 'representation_gap', title: '表示转换或迁移环节可能受阻',
      supporting: [...procedurePass, ...transferFail], counter: transferPass,
      supported: families(procedurePass) >= 2 && families(transferFail) >= 2, contradicted: families(transferPass) >= 2,
      probes: [atom.id], explanation: '只有直接题成功而变式题持续失败的对照模式，才支持迁移环节需要干预。', action: '对照直接题、图示题和文字变式，核对哪次表示转换开始出错。' });
    if (retentionFail.length) proposals.push({ cause: 'retention_gap', title: '延迟保持需要进一步巩固',
      supporting: [...procedurePass, ...retentionFail], counter: retentionPass,
      supported: families(procedurePass) >= 2 && families(retentionFail) >= 2, contradicted: families(retentionPass) >= 2,
      probes: [atom.id], explanation: '即时成功与至少间隔一天后的独立新题表现共同用于核查保持，不能从当天重复题判断。', action: '减少同题重复，安排间隔后的新题检验。' });

    for (const proposal of proposals) {
      if (!proposal.supporting.length && !proposal.counter.length && !(proposal.cause === 'procedure_gap' && reported.length)) continue;
      const fingerprint = atomDefinitionFingerprint(atom);
      const id = `hypothesis:${createHash('sha256').update(JSON.stringify([studentId, atom.id, proposal.cause, fingerprint])).digest('hex')}`;
      const old = previous.find((item) => item.id === id);
      let status: DiagnosticHypothesis['status'] = proposal.supported && proposal.contradicted ? 'inconclusive' :
        proposal.contradicted ? 'contradicted' : proposal.supported ? 'supported' : 'proposed';
      if (old?.status === 'testing' && status === 'proposed') status = 'testing';
      const corrected = proposal.cause === 'prerequisite_gap' ? allPrerequisitesPassed && families(recentSuccess) >= 2 :
        proposal.cause === 'representation_gap' ? families(transferPass.filter((item) => item.submittedAt > lastFailure)) >= 2 :
          proposal.cause === 'retention_gap' ? families(retentionPass.filter((item) => item.submittedAt > lastFailure)) >= 2 : families(recentSuccess) >= 2;
      if (old && ['supported', 'monitoring', 'reopened', 'resolved'].includes(old.status) && corrected) status = 'resolved';
      if (old?.status === 'resolved' && !corrected && failed.some((item) => item.submittedAt > old.updatedAt)) status = 'reopened';
      const history = [...(old?.history ?? [])];
      if (!old || old.status !== status) history.push({ at, status, reason: '依据独立题族、支持证据及反证重新核查' });
      results.push({ id, studentId, subject, atomId: atom.id, cause: proposal.cause, status, title: proposal.title,
        observation: `在“${atom.name}”的 ${new Set(failed.map((item) => item.questionId)).size} 道不同题目中观察到未达标作答。${reported.length ? `另有 ${reported.length} 次选择暂时不会，尚无过程可以核对。` : ''}`,
        explanation: proposal.explanation, alternatives: ['题意或评分可能需要复核', '作答环境、误触和当日状态尚未测量', '其他知识或策略因素仍待排查'],
        supportingEvidenceIds: ids(proposal.supporting), counterEvidenceIds: ids(proposal.counter),
        reportedEvidenceIds: proposal.cause === 'procedure_gap' ? ids(reported) : [],
        verification: verificationConditions(proposal.cause, atom, proposal.probes),
        probeAtomIds: proposal.probes, nextAction: proposal.action, confidence: proposal.supported ? 'medium' : 'low',
        ruleVersion: DIAGNOSIS_VERSION, atomDefinitionFingerprint: fingerprint, updatedAt: at, history });
    }
  }
  return results;
}

function verificationConditions(cause: DiagnosticHypothesis['cause'], atom: KnowledgeAtom, probes: string[]): NonNullable<DiagnosticHypothesis['verification']> {
  const group = (atomIds: string[], dimensions: NonNullable<DiagnosticHypothesis['verification']>['groups'][number]['dimensions'], purpose: string) =>
    ({ atomIds, dimensions, minIndependentFamilies: 2, purpose });
  const undecidedCondition = '单题、同题重复、提示或曝光后的表现，以及暂时不会、未评分表达，不能满足独立验证条件；支持与反证并存时保留未定。缺题时显示缺口。';
  if (cause === 'prerequisite_gap') return { undecidedCondition,
    supportCondition: '当前点至少两个独立题族未达标，同时至少一个直接先修点也在两个独立题族中未达标，才支持继续优先核查该先修点。',
    counterCondition: '每个直接先修点都在至少两个独立题族中达标，构成反证；随后仍须回到当前点验证。',
    groups: [group([atom.id], ['understanding', 'procedure', 'transfer'], '保留当前点的未达标表现'), group(probes, ['understanding', 'procedure'], '分别独立核查先修，避免从综合题代推')] };
  if (cause === 'representation_gap') return { undecidedCondition,
    supportCondition: '基础理解或操作至少两个独立题族达标，而迁移至少两个独立题族未达标，形成可重复的对照模式。',
    counterCondition: '迁移任务至少两个独立新题族达标，构成反证；若与既有失败并存，继续核查时间和条件差异。',
    groups: [group([atom.id], ['understanding', 'procedure'], '减少阅读或表示负担，核查基础行为'), group([atom.id], ['transfer'], '换表示与情境观察迁移')] };
  if (cause === 'retention_gap') return { undecidedCondition,
    supportCondition: '基础独立表现与真实间隔至少一天后的独立新题共同核查，至少两个保持题族未达标才支持保持需要巩固。当天换题不作为保持证据。',
    counterCondition: '真实间隔后的保持任务至少两个独立新题族达标，构成反证；失败后的持续成功才可关闭问题。',
    groups: [group([atom.id], ['understanding', 'procedure'], '核对即时基础表现'), group([atom.id], ['retention'], '经复测队列安排真实间隔后的新题')] };
  return { undecidedCondition,
    supportCondition: '基础理解或操作在至少两个独立题族中未达标，支持当前行为需要进一步核查；仍不能单独确定产生问题的原因。',
    counterCondition: '基础理解或操作在至少两个独立新题族中达标，构成反证；与失败并存时保持未定。',
    groups: [group([atom.id], ['understanding', 'procedure'], '分别核查理解与操作，观察卡住的位置')] };
}
