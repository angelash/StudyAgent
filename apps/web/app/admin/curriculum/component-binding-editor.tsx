'use client';
import type { ComponentBinding, KnowledgeAtom, QuestionAnswerSchema } from '@study-agent/contracts';

export function ComponentBindingEditor({ value = [], onChange, atom, atoms, schema }: { value?: ComponentBinding[]; onChange: (next: ComponentBinding[]) => void;
  atom: KnowledgeAtom; atoms: KnowledgeAtom[]; schema?: QuestionAnswerSchema }) {
  const children = atoms.filter(child => child.parentId === atom.id && atom.prerequisiteIds.includes(child.id));
  const fields = schema?.mode === 'multi_blank' && Array.isArray(schema.responseShape.entries)
    ? schema.responseShape.entries as Array<{ key: string; label?: string }> : [];
  const change = (index: number, patch: Partial<ComponentBinding>) => onChange(value.map((binding, position) => position === index ? { ...binding, ...patch } : binding));
  return <section className="component-binding-editor wide"><h4>综合题分项与子点观察</h4><p>对应分项只提供核查线索，不增加子点的独立样本。先核对直接子点关系和实际空位，再声明上游条件。</p>
    {!schema && <p>先保存题目映射，再打开复核，即可读取这道题的空位。</p>}
    {schema && !fields.length && <p>当前仅支持可确定评分键的多空题；这道题不能增加分项绑定。</p>}
    {!children.length && <p>先保存直接子点及其先修关系，再关联分项。</p>}
    {value.map((binding, index) => <fieldset key={binding.id}><legend>分项观察 {index + 1}</legend><label>对应子点<select value={binding.atomId} onChange={event => change(index, { atomId: event.target.value })}>
      <option value="">请选择具体步骤</option>{!children.some(child => child.id === binding.atomId) && binding.atomId && <option value={binding.atomId}>原目标已不在可用关系中，请重新选择</option>}
      {children.map(child => <option key={child.id} value={child.id}>{child.name}{child.status !== 'published' ? '（尚未发布）' : ''}</option>)}
    </select></label>{(['scoreKeys', 'requiresKeys'] as const).map((field, groupIndex) => <div key={field}><p>{groupIndex ? '必须先达到标准的上游空位（没有上游条件时可留空）' : '观察这个子点的空位'}</p><div className="admin-checks">{fields.map(entry => <label key={entry.key}><input type="checkbox" checked={binding[field].includes(entry.key)} onChange={event => change(index, { [field]: event.target.checked ? [...binding[field], entry.key] : binding[field].filter(key => key !== entry.key) })} />{entry.label ?? entry.key}</label>)}</div></div>)}
      {!!fields.length && [...binding.scoreKeys, ...binding.requiresKeys].some(key => !fields.some(field => field.key === key)) && <p role="alert">原空位已变化，请移除本条并按当前空位重新核对。</p>}
      <label>关联依据及连带错误边界<textarea rows={3} maxLength={1500} value={binding.rationale} onChange={event => change(index, { rationale: event.target.value })} /></label>
      <button type="button" className="studio-text-button" onClick={() => onChange(value.filter((_, position) => position !== index))}>移除这条观察</button>
    </fieldset>)}
    <button type="button" className="studio-secondary" disabled={!fields.length || !children.length || value.length >= 12} onClick={() => onChange([...value, {
      id: `component:${crypto.randomUUID()}`, atomId: children[0].id, scoreKeys: [], requiresKeys: [], rationale: '',
    }])}>添加一个分项观察</button>
  </section>;
}
