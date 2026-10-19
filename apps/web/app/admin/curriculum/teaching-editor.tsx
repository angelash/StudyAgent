'use client';

import type { AtomTeaching } from '@study-agent/contracts';

const emptyTeaching = (): AtomTeaching => ({ reviewStatus: 'draft', explanation: '', example: { prompt: '', steps: [''], conclusion: '' },
  commonErrors: [{ code: 'observation-1', observation: '', alternativeExplanations: [''], verification: '' }],
  verification: { understanding: '', procedure: '', transfer: '', retention: '' } });
const dimensions = { understanding: '理解：能否说明关系与理由', procedure: '执行：能否独立完成步骤',
  transfer: '迁移：更换情境与表示后能否应用', retention: '保持：间隔后能否独立完成新题' };

export function TeachingEditor({ value, onChange }: { value: AtomTeaching | undefined; onChange: (value?: AtomTeaching) => void }) {
  const update = (next: AtomTeaching) => onChange({ ...next, reviewStatus: 'draft' });
  return <section className="curriculum-teaching-editor">
    <h3>把知识讲清楚，再约定怎样验证</h3>
    <p>讲解、示例和观察方法与定义一同保存版本。修改内容会回到待审核；确认后选择审核通过，新的指导计划才会采用。</p>
    <label className="curriculum-inline-check"><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked ? emptyTeaching() : undefined)} />为本点配置教学资料</label>
    {value && <>
      <div className="admin-form">
        <label className="wide">核心讲解<textarea rows={4} maxLength={3000} value={value.explanation} onChange={e => update({ ...value, explanation: e.target.value })} /></label>
        <label className="wide">示例问题<textarea rows={2} maxLength={1500} value={value.example.prompt} onChange={e => update({ ...value, example: { ...value.example, prompt: e.target.value } })} /></label>
        <label className="wide">示范步骤（每行一步，最多12步）<textarea rows={5} value={value.example.steps.join('\n')} onChange={e => update({ ...value, example: { ...value.example, steps: e.target.value.split('\n').slice(0, 12) } })} /></label>
        <label className="wide">示例结论<textarea rows={2} maxLength={800} value={value.example.conclusion} onChange={e => update({ ...value, example: { ...value.example, conclusion: e.target.value } })} /></label>
      </div>
      <h4>可观察表现与替代解释</h4><p>描述实际能看到的表现，并给出区分方法。这里的常见解释不能自动成为某个孩子的诊断结论。</p>
      {value.commonErrors.map((error, i) => {
        const edit = (change: Partial<AtomTeaching['commonErrors'][number]>) => update({ ...value, commonErrors: value.commonErrors.map((item, j) => i === j ? { ...item, ...change } : item) });
        return <fieldset key={i}><legend>观察 {i + 1}</legend><div className="admin-form">
          <label>稳定观察编码<input maxLength={100} value={error.code} onChange={e => edit({ code: e.target.value })} /></label>
          <label className="wide">具体表现<textarea rows={2} maxLength={600} value={error.observation} onChange={e => edit({ observation: e.target.value })} /></label>
          <label className="wide">可能的替代解释（每行一条，最多5条）<textarea rows={3} value={error.alternativeExplanations.join('\n')} onChange={e => edit({ alternativeExplanations: e.target.value.split('\n').slice(0, 5) })} /></label>
          <label className="wide">怎样用对照任务区分<textarea rows={3} maxLength={1000} value={error.verification} onChange={e => edit({ verification: e.target.value })} /></label>
        </div>{value.commonErrors.length > 1 && <button type="button" className="studio-text-button" onClick={() => update({ ...value, commonErrors: value.commonErrors.filter((_, j) => j !== i) })}>移除此观察</button>}</fieldset>;
      })}
      {value.commonErrors.length < 12 && <button type="button" className="studio-text-button" onClick={() => update({ ...value, commonErrors: [...value.commonErrors, { code: `observation-${crypto.randomUUID().slice(0, 8)}`, observation: '', alternativeExplanations: [''], verification: '' }] })}>增加一种表现</button>}
      <h4>四个维度分别怎样验证</h4><div className="admin-form">{Object.entries(dimensions).map(([dimension, label]) => <label className="wide" key={dimension}>{label}<textarea rows={3} maxLength={1000} value={value.verification[dimension as keyof typeof dimensions]} onChange={e => update({ ...value, verification: { ...value.verification, [dimension]: e.target.value } })} /></label>)}</div>
      <label>教学资料审核<select value={value.reviewStatus} onChange={e => onChange({ ...value, reviewStatus: e.target.value as AtomTeaching['reviewStatus'] })}><option value="draft">待审核，仅教研可见</option><option value="approved">审核通过，可用于新计划</option></select></label>
    </>}
  </section>;
}
