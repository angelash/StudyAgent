import type { DiagnosticObservation, DiagnosticResponse } from '@study-agent/contracts';

/** Reports only observed answers and frozen scoring details; mapping error tags are not step observations. */
export function observedPerformance(response: DiagnosticResponse): DiagnosticObservation {
  const common = { responseId: response.id, atomId: response.atomId };
  if (response.disposition === 'skip' || response.status === 'skipped') return { ...common, kind: 'skipped', details: [], description: '本题被跳过，没有据此评价知识或错误步骤。' };
  if (response.disposition === 'dont_know') return { ...common, kind: 'self_reported', details: [], description: '孩子选择暂时不会；没有提交可供核对的解题过程，不能据此确定卡住的步骤或深层原因。' };
  if (response.status === 'pending_review' || response.score === null) return { ...common, kind: 'awaiting_review', details: [], description: '表达已保存，等待按量规核对，当前不判为错误。' };
  const details = response.scoreDetails ?? [];
  return { ...common, kind: response.correct ? 'meets_standard' : 'below_standard', details,
    description: response.correct ? '当前响应达到本题评分标准；是否能够迁移和保持仍需新证据。' :
      details.length ? '已核对下列空位或量规表现。未达标的位置帮助定位这道题的表现，仍需对照验证原因。' :
      '当前提交的答案未达到本题评分标准；仅凭最终答案，尚不能确定错误发生在哪一步。' };
}
