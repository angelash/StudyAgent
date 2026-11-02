'use client';
import { classroomSolidNames, type ClassroomMathFigure, type ClassroomSolidShape } from '@study-agent/contracts';
import { teachingClockInput, removeTeachingClock, type TeachingEditorDraft } from '../../../lib/teaching-editor-copy';
import { ClassroomMathFigureView } from '../../studio/classroom/math-figure';

type Edit = (recipe: (draft: TeachingEditorDraft) => void) => void;
export const defaultTeachingMath = (kind: ClassroomMathFigure['kind']): ClassroomMathFigure => kind === 'clocks' ?
  { kind, title: '', showDigitalTime: false, showHandLabels: true, clocks: [{ hour: 3, minute: 0, caption: '' }] } :
  { kind, title: '', showNames: true, solids: [{ shape: 'cuboid', caption: '' }, { shape: 'cube', caption: '' }, { shape: 'cylinder', caption: '' }, { shape: 'sphere', caption: '' }] };
export function TeachingMathFields({ copy, index, edit, onKind }: { copy: TeachingEditorDraft; index: number; edit: Edit; onKind: (kind: ClassroomMathFigure['kind']) => void }) {
  const visual = copy.content.visuals[index]; if (visual.kind !== 'math') return null;
  const figure = visual.figure;
  const change = (recipe: (value: ClassroomMathFigure) => void) => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'math') recipe(item.figure); });
  return <><label>数学模型<select value={figure.kind} onChange={event => onKind(event.target.value as ClassroomMathFigure['kind'])}><option value="clocks">钟面</option><option value="solids">立体形状</option></select></label>
    <label className="wide teaching-package-field">数学图示标题<textarea rows={2} maxLength={160} value={figure.title} onChange={event => change(value => { value.title = event.target.value; })} /></label>
    {figure.kind === 'clocks' ? <><label><input type="checkbox" checked={figure.showDigitalTime} onChange={event => change(value => { if (value.kind === 'clocks') value.showDigitalTime = event.target.checked; })} />显示数字时间</label>
      <label><input type="checkbox" checked={figure.showHandLabels} onChange={event => change(value => { if (value.kind === 'clocks') value.showHandLabels = event.target.checked; })} />显示时针和分针图例</label>
      <p>短时针随分钟连续移动。小时填1～12，分钟填0～59；未完成的输入会保留，预览显示最后有效数值。</p>
      {figure.clocks.map((clock, position) => <fieldset key={position}><legend>钟面 {position + 1}</legend>
        {(['hour', 'minute'] as const).map(field => { const key = `visual:${index}:${field}:${position}`, raw = copy.rawInputs[key] ?? String(clock[field]), invalid = teachingClockInput(raw, field) === null;
          return <label key={field}>第{position + 1}个钟面的{field === 'hour' ? '小时' : '分钟'}<input type="text" inputMode="numeric" maxLength={100} value={raw} aria-invalid={invalid}
            onChange={event => { const text = event.target.value; edit(draft => { draft.rawInputs[key] = text; const item = draft.content.visuals[index], numeric = teachingClockInput(text, field);
              if (item.kind === 'math' && item.figure.kind === 'clocks' && numeric !== null) item.figure.clocks[position][field] = numeric; }); }} />{invalid && <span role="status">请填写{field === 'hour' ? '1～12' : '0～59'}的整数后保存。</span>}</label>; })}
        <label className="wide teaching-package-field">第{position + 1}个钟面的图注<textarea rows={2} maxLength={400} value={clock.caption} onChange={event => change(value => { if (value.kind === 'clocks') value.clocks[position].caption = event.target.value; })} /></label>
        <button type="button" className="studio-text-button" disabled={figure.clocks.length <= 1 || copy.visualHistory.length >= 20} onClick={() => edit(draft => removeTeachingClock(draft, index, position))}>移除此钟面并保留原表征</button></fieldset>)}
      <button type="button" className="studio-text-button" disabled={figure.clocks.length >= 4} onClick={() => change(value => { if (value.kind === 'clocks') value.clocks.push({ hour: 12, minute: 0, caption: '' }); })}>增加一个钟面</button>
    </> : <><label><input type="checkbox" checked={figure.showNames} onChange={event => change(value => { if (value.kind === 'solids') value.showNames = event.target.checked; })} />显示形状名称</label>
      <p>图中是理想形状的投影；日常物品仅在外形上近似。实际摆搭、滚动和稳固程度需要本人观察。</p>
      {figure.solids.map((solid, position) => <fieldset key={position}><legend>立体模型 {position + 1}</legend><label>形状<select value={solid.shape} onChange={event => change(value => { if (value.kind === 'solids') value.solids[position].shape = event.target.value as ClassroomSolidShape; })}>
        {Object.entries(classroomSolidNames).map(([shape, name]) => <option key={shape} value={shape}>{name}</option>)}</select></label>
        <label className="wide teaching-package-field">第{position + 1}个模型的图注<textarea rows={2} maxLength={400} value={solid.caption} onChange={event => change(value => { if (value.kind === 'solids') value.solids[position].caption = event.target.value; })} /></label>
        <button type="button" className="studio-text-button" disabled={figure.solids.length <= 1} onClick={() => change(value => { if (value.kind === 'solids') value.solids.splice(position, 1); })}>移除此模型</button></fieldset>)}
      <button type="button" className="studio-text-button" disabled={figure.solids.length >= 4} onClick={() => change(value => { if (value.kind === 'solids') value.solids.push({ shape: 'cube', caption: '' }); })}>增加一个立体模型</button></>}
    <label className="wide teaching-package-field">数学图示怎样帮助理解<textarea rows={3} maxLength={1500} value={visual.explanation} onChange={event => edit(draft => { const item = draft.content.visuals[index]; if (item.kind === 'math') item.explanation = event.target.value; })} /></label>
    <div className="teaching-package-figure"><strong>当前课堂数学图示预览</strong><ClassroomMathFigureView figure={figure} interactive={false} /></div></>;
}
