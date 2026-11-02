'use client';
import * as React from 'react';
import type { KnowledgeAtom, TextbookTeachingMaterialCatalog } from '@study-agent/contracts';
import type { TeachingEditorDraft } from '../../../lib/teaching-editor-copy';
import { replaceTeachingVisual, restoreTeachingVisual, removeTeachingDiagramLabel } from '../../../lib/teaching-editor-copy';
import { ClassroomFigure } from '../../studio/classroom/diagram';
import { defaultTeachingMath, TeachingMathFields } from './teaching-math-fields';

type Visual = TeachingEditorDraft['content']['visuals'][number];
type Edit = (recipe: (draft: TeachingEditorDraft) => void) => void;
const purposes = { understanding: '理解', procedure: '执行', transfer: '迁移', retention: '保持储备' };
const names = { diagram: '关系图', math: '数学图示', table: '表格', experiment: '原生演示', not_applicable: '不适用，并说明依据' };
const experimentNames = { 'particle-change': '粒子变化', 'air-mixture': '空气组成', catalysis: '催化作用', 'atom-ion': '原子与离子', filtration: '过滤', 'water-electrolysis': '水的电解', 'mass-conservation': '质量守恒', 'balance-water': '水反应配平', 'co2-test': '二氧化碳检验', combustion: '燃烧条件' };
const visualDefault = (kind: Visual['kind']): Visual => kind === 'diagram' ? { kind, diagram: { kind: 'flow', title: '', labels: ['', ''] }, explanation: '' } :
  kind === 'math' ? { kind, figure: defaultTeachingMath('clocks'), explanation: '' } :
  kind === 'table' ? { kind, title: '', headers: [''], rows: [['']], explanation: '' } : kind === 'not_applicable' ? { kind, rationale: '' } :
    { kind, experiment: { kind: 'particle-change', title: '', prediction: { question: '', options: ['', ''] }, observation: '', explanation: '', limitation: '' } };
function Text({ label, value, onChange, max = 2000, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; max?: number; rows?: number }) {
  return <label className="wide teaching-package-field">{label}<textarea aria-label={label} rows={rows} maxLength={max} value={value} onChange={event => onChange(event.target.value)} /></label>;
}
function Lines({ label, values, onChange, max, minimum = 0, textMax = 1000, onRemove }: { label: string; values: string[]; onChange: (values: string[]) => void; max: number; minimum?: number; textMax?: number; onRemove?: (index: number) => void }) {
  return <div className="wide teaching-package-lines"><strong>{label}</strong>{values.map((value, index) => <div key={index}><label><span className="sr-only">{label} · 第{index + 1}条</span><textarea aria-label={`${label} · 第${index + 1}条`} rows={2} maxLength={textMax} value={value} onChange={event => onChange(values.map((item, current) => current === index ? event.target.value : item))} /></label>
    <button type="button" className="studio-text-button" aria-label={`移除${label}第${index + 1}条`} disabled={values.length <= minimum} onClick={() => onRemove ? onRemove(index) : onChange(values.filter((_, current) => current !== index))}>移除</button></div>)}
    <button type="button" className="studio-text-button" disabled={values.length >= max} onClick={() => onChange([...values, ''])}>增加{label}</button></div>;
}
export function TeachingPackageContent({ copy, atoms, catalogs, locked, onEdit: edit, onTarget, onMaterialPage, onError }: {
  copy: TeachingEditorDraft; atoms: KnowledgeAtom[]; catalogs: Record<string, TextbookTeachingMaterialCatalog>; locked: boolean; onEdit: Edit;
  onTarget: (atomId: string, selected: boolean) => void; onMaterialPage: (atomId: string, page: number) => void; onError: (message: string) => void;
}) {
  const content = copy.content, section = copy.editor.section, atomName = (id: string) => atoms.find(atom => atom.id === id)?.name ?? '保留的原目标';
  return <fieldset className="teaching-package-content" disabled={locked}>
    {section === 'goals' && <><legend>目标、成功标准与先修</legend><p>明确本课要教什么，并为每个目标保留理解、执行、迁移和保持材料。取消选择会保留已写的目标与检查文字，可逐项核对后移除。</p>
      <div className="admin-checks">{atoms.map(atom => <label key={atom.id}><input type="checkbox" checked={copy.targetRefs.some(ref => ref.atomId === atom.id)} disabled={!copy.targetRefs.some(ref => ref.atomId === atom.id) && copy.targetRefs.length >= 8}
        onChange={event => onTarget(atom.id, event.target.checked)} /><span>{atom.grade}年级 · {atom.name}<small>{atom.objective}</small></span></label>)}</div>
      {copy.targetRefs.some(ref => !atoms.some(atom => atom.id === ref.atomId)) && <p className="studio-error">原稿含当前列表之外的目标。原引用仍保留，请核对当前教材与定义版本。</p>}
      {content.goals.map((goal, index) => <fieldset key={goal.id}><legend>目标 {index + 1} · {atomName(goal.atomId)}{!copy.targetRefs.some(ref => ref.atomId === goal.atomId) && ' · 原选择已取消'}</legend>
        <Text label="可观察的学习目标" value={goal.objective} max={1000} onChange={value => edit(draft => { draft.content.goals[index].objective = value; })} />
        <Text label="怎样判断达到目标" value={goal.successCriterion} max={1000} onChange={value => edit(draft => { draft.content.goals[index].successCriterion = value; })} />
        <button type="button" className="studio-text-button" onClick={() => edit(draft => { draft.content.goals.splice(index, 1); })}>移除此目标文字</button></fieldset>)}
      <h4>先修回顾</h4>{content.prerequisites.map((item, index) => <fieldset key={item.atomId}><legend>{atomName(item.atomId)}</legend><Text label="为什么需要先回顾，以及怎样回顾" value={item.rationale} max={1000} onChange={value => edit(draft => { draft.content.prerequisites[index].rationale = value; })} />
        <button type="button" className="studio-text-button" onClick={() => edit(draft => { draft.content.prerequisites.splice(index, 1); })}>移除此先修安排</button></fieldset>)}
      <label>增加一个先修点<select value="" disabled={content.prerequisites.length >= 20} onChange={event => { const id = event.target.value; if (id) edit(draft => { draft.content.prerequisites.push({ atomId: id, rationale: '' }); }); }}><option value="">选择当前定义</option>{atoms.filter(atom => !content.prerequisites.some(item => item.atomId === atom.id)).map(atom => <option key={atom.id} value={atom.id}>{atom.name}</option>)}</select></label>
    </>}
    {section === 'explanation' && <><legend>激活、概念与分步例题</legend><div className="admin-form">
      <Text label="本课标题" value={content.title} max={180} rows={2} onChange={value => edit(draft => { draft.content.title = value; })} />
      <Text label="开始时先观察或思考什么" value={content.activation.prompt} max={1500} onChange={value => edit(draft => { draft.content.activation.prompt = value; })} />
      <Text label="预期观察到什么" value={content.activation.expectedObservation} max={1500} onChange={value => edit(draft => { draft.content.activation.expectedObservation = value; })} />
      <Text label="怎样联系到本课目标" value={content.activation.bridge} max={1500} onChange={value => edit(draft => { draft.content.activation.bridge = value; })} />
      <Text label="完整概念讲解" value={content.concept.explanation} max={8000} rows={9} onChange={value => edit(draft => { draft.content.concept.explanation = value; })} />
      <Lines label="关键关系" values={content.concept.points} max={12} textMax={400} onChange={value => edit(draft => { draft.content.concept.points = value; })} />
      <Text label="例题情境与已知条件" value={content.example.situation} max={2500} rows={4} onChange={value => edit(draft => { draft.content.example.situation = value; })} /></div>
      {content.example.steps.map((step, index) => <fieldset key={index}><legend>例题 · 第{index + 1}步</legend><Text label="这一小步怎样解释" value={step.explanation} max={1500} onChange={value => edit(draft => { draft.content.example.steps[index].explanation = value; })} />
        <Lines label="同步板书" values={step.board} max={8} textMax={300} onChange={value => edit(draft => { draft.content.example.steps[index].board = value; })} />
        <button type="button" className="studio-text-button" onClick={() => edit(draft => { draft.content.example.steps.splice(index, 1); })}>移除此步骤</button></fieldset>)}
      <button type="button" className="studio-secondary" disabled={content.example.steps.length >= 12} onClick={() => edit(draft => { draft.content.example.steps.push({ explanation: '', board: [''] }); })}>增加例题步骤</button>
      <Text label="例题结论与适用条件" value={content.example.conclusion} max={1500} onChange={value => edit(draft => { draft.content.example.conclusion = value; })} />
      <h4>错因、替代解释与核查</h4>{content.misconceptions.map((item, index) => <fieldset key={index}><legend>观察 {index + 1}</legend>
        <Text label="可观察到的表现" value={item.observation} max={800} onChange={value => edit(draft => { draft.content.misconceptions[index].observation = value; })} />
        <Lines label="可能的替代解释" values={item.alternatives} max={5} textMax={800} onChange={value => edit(draft => { draft.content.misconceptions[index].alternatives = value; })} />
        <Text label="用什么对照任务区分" value={item.verification} max={1800} onChange={value => edit(draft => { draft.content.misconceptions[index].verification = value; })} />
        <Text label="怎样给出纠正反馈" value={item.correctiveFeedback} max={1800} onChange={value => edit(draft => { draft.content.misconceptions[index].correctiveFeedback = value; })} />
        <button type="button" className="studio-text-button" onClick={() => edit(draft => { draft.content.misconceptions.splice(index, 1); })}>移除此观察</button></fieldset>)}
      <button type="button" className="studio-secondary" disabled={content.misconceptions.length >= 8} onClick={() => edit(draft => { draft.content.misconceptions.push({ observation: '', alternatives: [''], verification: '', correctiveFeedback: '' }); })}>增加一种表现</button>
    </>}
    {section === 'visuals' && <><legend>帮助理解的图示与演示</legend><p>选择能够表达本课关系的表征。预检会指出当前课堂的布局限制，未完成的标注与数值仍保留在本机稿中。</p>
      {content.visuals.map((visual, index) => <fieldset key={index}><legend>表征 {index + 1}</legend><label>呈现方式<select value={visual.kind} onChange={event => {
        const kind = event.target.value as Visual['kind']; if (copy.visualHistory.length >= 20) { onError('旧表征已达到本机保留上限，请先下载完整副本并另开本机稿。'); return; }
        edit(draft => replaceTeachingVisual(draft, index, visualDefault(kind)));
      }}>{Object.entries(names).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {visual.kind === 'not_applicable' && <Text label="为何不适用，以及采用了什么解释方式" value={visual.rationale} max={1500} onChange={value => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'not_applicable') item.rationale = value; })} />}
        {visual.kind === 'math' && <TeachingMathFields copy={copy} index={index} edit={edit} onKind={kind => {
          if (copy.visualHistory.length >= 20) { onError('请先下载当前完整稿再调整旧表征。'); return; }
          edit(draft => replaceTeachingVisual(draft, index, { kind: 'math', figure: defaultTeachingMath(kind), explanation: visual.explanation }));
        }} />}
        {visual.kind === 'diagram' && <><label>图形类型<select value={visual.diagram.kind} onChange={event => {
          if (copy.visualHistory.length >= 20) { onError('请先下载当前完整稿再调整旧表征。'); return; }
          const kind = event.target.value as typeof visual.diagram.kind;
          edit(draft => replaceTeachingVisual(draft, index, { kind: 'diagram', explanation: visual.explanation, diagram: { kind, title: visual.diagram.title, labels: [...visual.diagram.labels], ...(kind === 'bars' ? { values: visual.diagram.labels.map(() => 10) } : {}) } }));
        }}>{[['flow', '过程关系'], ['venn', '集合与交集'], ['bars', '示意比例'], ['network', '网络关系']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <Text label="图形标题" value={visual.diagram.title} max={160} onChange={value => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'diagram') item.diagram.title = value; })} />
          <Lines label="完整标注" values={visual.diagram.labels} minimum={2} max={16} textMax={120} onRemove={position => {
            if (copy.visualHistory.length >= 20) { onError('请先下载当前完整稿再调整旧表征。'); return; }
            edit(draft => removeTeachingDiagramLabel(draft, index, position));
          }} onChange={value => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'diagram') item.diagram.labels = value; })} />
          {visual.diagram.kind === 'bars' && visual.diagram.labels.map((label, position) => <label key={position}>{label || `第${position + 1}项`}的示意数值<input inputMode="decimal" value={copy.rawInputs[`visual:${index}:value:${position}`] ?? visual.diagram.values?.[position]?.toString() ?? ''} maxLength={100}
            onChange={event => { const raw = event.target.value; edit(draft => { draft.rawInputs[`visual:${index}:value:${position}`] = raw; const item = draft.content.visuals[index]; if (item.kind === 'diagram' && raw.trim() && Number.isFinite(Number(raw))) { const values = item.diagram.labels.map((_, current) => item.diagram.values?.[current] ?? 0); values[position] = Number(raw); item.diagram.values = values; } }); }} /></label>)}
          {visual.diagram.kind === 'venn' && <Lines label="集合补充说明" values={visual.diagram.captions ?? []} max={2} textMax={200} onChange={value => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'diagram') item.diagram.captions = value; })} />}
          <Text label="这幅图怎样帮助理解" value={visual.explanation} max={1500} onChange={value => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'diagram') item.explanation = value; })} />
          <div className="teaching-package-figure"><strong>当前课堂图形预览</strong><ClassroomFigure diagram={visual.diagram} interactive={false} /></div>
        </>}
        {visual.kind === 'table' && <><Text label="表格标题" value={visual.title} max={160} onChange={value => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'table') item.title = value; })} />
          <div className="teaching-package-table" role="group" aria-label={`表征${index + 1}的表格`}><div>{visual.headers.map((cell, column) => <label key={column}>第{column + 1}列表头<input maxLength={200} value={cell} onChange={event => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'table') item.headers[column] = event.target.value; })} /><button type="button" className="studio-text-button" disabled={visual.headers.length <= 1} onClick={() => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'table') { item.headers.splice(column, 1); item.rows.forEach(row => row.splice(column, 1)); } })}>移除第{column + 1}列</button></label>)}</div>
            {visual.rows.map((row, position) => <div key={position}>{row.map((cell, column) => <label key={column}><span className="sr-only">第{position + 1}行第{column + 1}列</span><textarea rows={2} maxLength={1000} value={cell} onChange={event => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'table') item.rows[position][column] = event.target.value; })} /></label>)}<button type="button" className="studio-text-button" disabled={visual.rows.length <= 1} onClick={() => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'table') item.rows.splice(position, 1); })}>移除第{position + 1}行</button></div>)}</div>
          <div className="admin-toolbar"><button type="button" className="studio-text-button" disabled={visual.headers.length >= 8} onClick={() => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'table') { item.headers.push(''); item.rows.forEach(row => row.push('')); } })}>增加一列</button>
            <button type="button" className="studio-text-button" disabled={visual.rows.length >= 40} onClick={() => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'table') item.rows.push(item.headers.map(() => '')); })}>增加一行</button></div>
          <Text label="这张表怎样帮助理解" value={visual.explanation} max={1500} onChange={value => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'table') item.explanation = value; })} />
        </>}
        {visual.kind === 'experiment' && <><label>演示模型<select value={visual.experiment.kind} onChange={event => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'experiment') item.experiment.kind = event.target.value as typeof item.experiment.kind; })}>{Object.entries(experimentNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <Text label="演示标题" value={visual.experiment.title} max={160} onChange={value => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'experiment') item.experiment.title = value; })} />
          <Text label="先预测什么" value={visual.experiment.prediction.question} max={1000} onChange={value => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'experiment') item.experiment.prediction.question = value; })} />
          <Lines label="预测选项" values={visual.experiment.prediction.options} minimum={2} max={4} textMax={300} onChange={value => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'experiment') item.experiment.prediction.options = value; })} />
          {(['observation', 'explanation', 'limitation'] as const).map(field => <Text key={field} label={{ observation: '观察到什么', explanation: '怎样解释', limitation: '模型条件、简化与限制' }[field]} value={visual.experiment[field]} max={field === 'explanation' ? 2000 : 1500} onChange={value => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'experiment') item.experiment[field] = value; })} />)}
        </>}
        <button type="button" className="studio-text-button" onClick={() => { if (copy.visualHistory.length >= 20) { onError('请先下载当前完整稿再调整旧表征。'); return; } edit(draft => replaceTeachingVisual(draft, index)); }}>移除并保留此表征</button>
      </fieldset>)}
      <button type="button" className="studio-secondary" disabled={content.visuals.length >= 4} onClick={() => edit(draft => { draft.content.visuals.push(visualDefault('table')); })}>增加一种表征</button>
      {copy.visualHistory.length > 0 && <details><summary>保留的原表征 · {copy.visualHistory.length}份</summary><p>切换呈现方式前的完整表征与原数值文字仍随本机副本保留。</p>{copy.visualHistory.map((item, index) => <div key={index}><span>{names[item.visual.kind]} · 原表征{item.index + 1}</span><button type="button" className="studio-text-button" disabled={content.visuals.length >= 4} onClick={() => edit(draft => restoreTeachingVisual(draft, index))}>复制回当前稿</button></div>)}</details>}
    </>}
    {section === 'checks' && <><legend>理解、执行、迁移与保持材料</legend><p>只引用当前审核通过、作答配置可用的材料。保持材料是后续真实到期时的新题储备，未在这里形成学生结果。</p>
      <button type="button" className="studio-secondary" onClick={() => edit(draft => { for (const target of draft.targetRefs) for (const purpose of Object.keys(purposes) as Array<keyof typeof purposes>) if (!draft.content.checks.some(check => check.atomId === target.atomId && check.purpose === purpose)) draft.content.checks.push({ id: 'check-' + crypto.randomUUID(), atomId: target.atomId, purpose, instructions: '', materials: [] }); })}>补齐所选目标的检查框架</button>
      {content.checks.map((check, index) => { const catalog = catalogs[check.atomId], options = catalog?.items.filter(item => check.purpose === 'retention' || item.dimension === check.purpose) ?? [], offPage = check.materials.filter(ref => !options.some(option => option.reference.measurementId === ref.measurementId));
        return <details key={check.id}><summary>{atomName(check.atomId)} · {purposes[check.purpose]} · 已选{check.materials.length}项{!copy.targetRefs.some(ref => ref.atomId === check.atomId) && ' · 原选择已取消'}</summary>
          <Text label="学生如何完成这组检查" value={check.instructions} max={2000} onChange={value => edit(draft => { draft.content.checks[index].instructions = value; })} />
          {!catalog && <button type="button" className="studio-secondary" onClick={() => onMaterialPage(check.atomId, 1)}>核对当前可用材料</button>}
          {catalog && <><p>当前目标共{catalog.total}项可用材料，本页按用途列出{options.length}项。</p><div className="teaching-package-materials">{options.map(item => <label key={item.reference.measurementId}><input type="checkbox" checked={check.materials.some(ref => ref.measurementId === item.reference.measurementId)} disabled={!check.materials.some(ref => ref.measurementId === item.reference.measurementId) && check.materials.length >= 40}
            onChange={event => edit(draft => { const group = draft.content.checks[index]; group.materials = event.target.checked ? [...group.materials, structuredClone(item.reference)] : group.materials.filter(ref => ref.measurementId !== item.reference.measurementId); })} /><span>{item.stem}<small>{purposes[item.dimension]} · 预计{item.expectedSeconds}秒 · 审核版本{item.reference.version}</small></span></label>)}</div>
            <div className="admin-toolbar"><button type="button" className="studio-text-button" disabled={catalog.page <= 1} onClick={() => onMaterialPage(check.atomId, catalog.page - 1)}>上一页材料</button><span>{catalog.page} / {Math.max(1, Math.ceil(catalog.total / catalog.pageSize))}</span><button type="button" className="studio-text-button" disabled={catalog.page * catalog.pageSize >= catalog.total} onClick={() => onMaterialPage(check.atomId, catalog.page + 1)}>下一页材料</button></div></>}
          {offPage.length > 0 && <details><summary>本页之外保留的原材料 · {offPage.length}项</summary>{offPage.map(ref => <div key={ref.measurementId}><span>原题版本{ref.questionVersion} · 审核版本{ref.version}</span><details><summary>核对准确引用</summary><code>{ref.questionId}</code><code>{ref.measurementId}</code></details><button type="button" className="studio-text-button" onClick={() => edit(draft => { draft.content.checks[index].materials = draft.content.checks[index].materials.filter(item => item.measurementId !== ref.measurementId); })}>移除此原引用</button></div>)}</details>}
          <button type="button" className="studio-text-button" onClick={() => edit(draft => { draft.content.checks.splice(index, 1); })}>移除此检查组</button>
        </details>; })}
    </>}
    {section === 'summary' && <><legend>迁移、总结与保持安排</legend><Text label="迁移到什么新情境" value={content.transfer.scenario} max={2000} onChange={value => edit(draft => { draft.content.transfer.scenario = value; })} />
      <Text label="学生需要解决什么任务" value={content.transfer.prompt} max={2000} onChange={value => edit(draft => { draft.content.transfer.prompt = value; })} />
      <Text label="怎样核对迁移策略" value={content.transfer.expectedStrategy} max={2000} onChange={value => edit(draft => { draft.content.transfer.expectedStrategy = value; })} />
      <Text label="本课总结" value={content.summary.synthesis} max={2000} onChange={value => edit(draft => { draft.content.summary.synthesis = value; })} />
      <Lines label="带走的关键关系" values={content.summary.takeaways} max={8} textMax={400} onChange={value => edit(draft => { draft.content.summary.takeaways = value; })} />
      <Text label="后续如何用新题核查" value={content.retention.instructions} max={2000} onChange={value => edit(draft => { draft.content.retention.instructions = value; })} />
      <p>保持核查在最后一次相关教学或帮助后的第1、3、7、14日到期。本页显示材料与安排，实际表现会单独记录。</p>
    </>}
  </fieldset>;
}
