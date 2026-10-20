import type { KnowledgeMaterialCoverage, KnowledgeAtom, MaterialStructureGap } from '@study-agent/contracts';

const gapLabels: Record<MaterialStructureGap, string> = {
  understanding_family_missing: '缺理解结构', procedure_family_missing: '缺执行结构',
  two_basic_families_missing: '基础题族不足2个', two_transfer_families_missing: '迁移题族不足2个',
  four_contrast_families_missing: '跨组不同结构不足4个',
};

export function MaterialCoverageSummary({ coverage, status }: { coverage?: KnowledgeMaterialCoverage; status: KnowledgeAtom['status'] }) {
  if (status !== 'published') return <small className="material-coverage-inactive">发布后再核对有效对照素材</small>;
  if (coverage?.version !== 'verification-materials-v1') return <small className="admin-gap">素材结构待核对，请刷新覆盖</small>;
  const { structure, sample } = coverage;
  return <span className="material-coverage-summary">
    <span className={`material-coverage-badge ${coverage.ready ? 'material-coverage-ready' : 'material-coverage-gap'}`}>{coverage.ready ? '对照素材齐备' : '对照素材待补'}</span>
    <small>基础 {structure.basicFamilies}/2 · 迁移 {structure.transferFamilies}/2 · 不同结构 {structure.contrastFamilies}/4</small>
    {structure.gaps.length > 0 && <small className="admin-gap">{structure.gaps.map(gap => gapLabels[gap] ?? '素材结构需核对').join('；')}</small>}
    {structure.ready && !sample.ready && <small className="admin-gap">结构已齐，四题、600秒的组题样例仍不足，请核对题目时长与可用结构。</small>}
  </span>;
}
