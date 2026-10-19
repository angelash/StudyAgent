'use client';
import type { DiagnosticVerificationBlueprint, DiagnosticVerificationResult } from '@study-agent/contracts';
import { DiagnosticEvidenceReferences } from './diagnostic-evidence';
import './verification-observations.css';

const dimensions = { understanding: '理解', procedure: '执行', transfer: '迁移', retention: '保持' };
export function VerificationObservationPlan({ verification, names }: { verification?: DiagnosticVerificationBlueprint; names: Map<string, string> }) {
  if (!verification) return null;
  return <section className="verification-observations" aria-label="原因核查的对照观察"><p className="studio-eyebrow">这组题怎样帮助核查</p><h3>{verification.title}</h3>
    <p>分别观察下面的行为。不同题族表示任务结构有差异，同一道题重复作答不能代替对照。</p>
    <ul>{verification.groups.map(group => <li key={group.id} data-gap={!!group.gap}><div><strong>{group.atomName ?? names.get(group.atomId) ?? '待核查知识点'}</strong>
      <small>{group.dimensions.map(dimension => dimensions[dimension]).join(' / ')}</small><p>{group.purpose}</p></div>
      <p>已安排{group.itemIds.length}题，覆盖{group.selectedFamilies.length}种任务结构；本组需要至少{group.minIndependentFamilies}种。</p>{group.gap && <p className="verification-gap">{group.gap}</p>}</li>)}</ul>
    <p role="status">{verification.fullyCovered ? '所需的观察任务已安排。作答是否独立、表现是否一致，仍需结束后核对。' : '对照观察尚未完整安排，可以先收集已有表现，原因继续保留待核查。'}</p>
    <details><summary>查看支持、反证与未定条件</summary><dl><dt>支持继续核查</dt><dd>{verification.supportCondition}</dd><dt>需要核对的反证</dt><dd>{verification.counterCondition}</dd><dt>仍不能下结论</dt><dd>{verification.undecidedCondition}</dd></dl></details>
  </section>;
}

export function VerificationObservationReport({ result, names, studentId }: { result?: DiagnosticVerificationResult; names: Map<string, string>; studentId: string }) {
  if (!result) return null;
  return <section className="verification-observations" aria-label="本组对照证据"><p className="studio-eyebrow">核查之后 / 先看实际证据</p><h3>哪些观察已经收集到</h3><p>{result.notice}</p>
    <p role="status">{result.independentObservationsComplete ? '本组各类观察已有足够的独立作答，可结合下方假设的支持与反证继续核对。' : '本组仍缺部分独立观察，暂不能把题组完成理解为原因验证完成。'}</p>
    <ul>{result.blueprint.groups.map(group => {
      const observed = result.groups.find(row => row.groupId === group.id)!;
      return <li key={group.id} data-gap={observed.independentFamilies < group.minIndependentFamilies}><strong>{group.atomName ?? names.get(group.atomId) ?? '待核查知识点'} · {group.dimensions.map(dimension => dimensions[dimension]).join(' / ')}</strong><p>{group.purpose}</p>
        <p>独立观察{observed.independentFamilies}种任务结构；本组需要至少{group.minIndependentFamilies}种。达到标准{observed.passedFamilies}种，未达标{observed.belowStandardFamilies}种。</p>
        {!!observed.awaitingReview && <p>{observed.awaitingReview}题等待按量规复核。</p>}{!!observed.assistedOrExposed && <p>{observed.assistedOrExposed}题有提示或曾出现，单独保留表现。</p>}
        {!!observed.selfReportedOrSkipped && <p>{observed.selfReportedOrSkipped}题选择暂时不会或跳过，没有作为独立错误过程。</p>}
        {group.gap && <p className="verification-gap">开始前的覆盖缺口：{group.gap}</p>}
        <DiagnosticEvidenceReferences studentId={studentId} ids={observed.evidenceIds} title="本组实际作答" />
      </li>;
    })}</ul>
  </section>;
}
