import { DiagnosticHypothesis, DiagnosticResponse, KnowledgeAtom, MeasurementItem, Subject } from '@study-agent/contracts';
import { createHash } from 'node:crypto';
import { atomDefinitionFingerprint } from './measurement-definition';

const ids = (evidence: DiagnosticResponse[]) => evidence.map((item) => item.id);
const families = (evidence: DiagnosticResponse[]) => new Set(evidence.map((item) => item.family)).size;

export function deriveHypotheses(studentId: string, subject: Subject, atoms: KnowledgeAtom[],
  responses: DiagnosticResponse[], mappings: Map<string, MeasurementItem>, previous: DiagnosticHypothesis[], at: string): DiagnosticHypothesis[] {
  const valid = responses.filter((item) => item.studentId === studentId && item.status === 'scored' && !item.priorExposure && item.hintLevel === 0 &&
    (mappings.get(`${item.itemId}@${item.mappingVersion}`) ?? mappings.get(item.itemId))?.reviewStatus === 'approved');
  const results: DiagnosticHypothesis[] = [];
  for (const atom of atoms) {
    const local = valid.filter((item) => item.atomId === atom.id);
    const failed = local.filter((item) => item.score !== null && item.score < 1);
    if (!failed.length) continue;
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
    if (atom.prerequisiteIds.length) proposals.push({ cause: 'prerequisite_gap', title: '前置知识可能影响当前学习',
      supporting: prerequisites.filter((item) => !item.correct), counter: prerequisites.filter((item) => item.correct),
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
      if (!proposal.supporting.length && !proposal.counter.length) continue;
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
        observation: `在“${atom.name}”的 ${new Set(failed.map((item) => item.questionId)).size} 道不同题目中观察到未达标响应。`,
        explanation: proposal.explanation, alternatives: ['题意或评分可能需要复核', '作答环境、误触和当日状态尚未测量', '其他知识或策略因素仍待排查'],
        supportingEvidenceIds: ids(proposal.supporting), counterEvidenceIds: ids(proposal.counter),
        probeAtomIds: proposal.probes, nextAction: proposal.action, confidence: proposal.supported ? 'medium' : 'low',
        ruleVersion: 'diagnosis-rules-v2', atomDefinitionFingerprint: fingerprint, updatedAt: at, history });
    }
  }
  return results;
}
