'use client';
import * as React from 'react';
import type { DrawingPoint, DrawingStroke, InputConfiguration } from '@study-agent/contracts';
import './structured-answer-input.css';
import { questionMediaUrl } from '../lib/media';
type Props = { config: InputConfiguration; response: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void };
const record = (value: unknown): Record<string, string> => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === 'string')) : {};

export function StructuredAnswerInput({ config, response, onChange }: Props) {
  const id = React.useId();
  if (config.mode === 'matching') {
    const pairs = Array.isArray(response.pairs) ? response.pairs.filter(pair => pair && typeof pair.left === 'string' && typeof pair.right === 'string') as Array<{ left: string; right: string }> : [];
    return <div className="answer-matching"><p>为左边的每一项，找到右边合适的伙伴。</p>{config.left.map(left => <label key={left.id}><span>{left.label}</span><span aria-hidden="true">↔</span><select value={pairs.find(pair => pair.left === left.id)?.right ?? ''} onChange={e => onChange({ pairs: [...pairs.filter(pair => pair.left !== left.id), ...(e.target.value ? [{ left: left.id, right: e.target.value }] : [])] })}><option value="">选择配对项</option>{config.right.map(right => <option key={right.id} value={right.id}>{right.label}</option>)}</select></label>)}</div>;
  }
  if (config.mode === 'sorting') {
    const selected = Array.isArray(response.values) ? response.values.map(String) : [];
    function move(index: number, delta: number) { const values = [...selected]; [values[index], values[index + delta]] = [values[index + delta], values[index]]; onChange({ values }); }
    return <div className="answer-sorting"><p id={`${id}-help`}>把卡片逐一加入顺序，可以用按钮上下调整。</p><div className="answer-card-bank" aria-label="尚未使用的卡片">{config.items.filter(item => !selected.includes(item.id)).map(item => <button type="button" key={item.id} onClick={() => onChange({ values: [...selected, item.id] })}>＋ {item.label}</button>)}{selected.length === config.items.length && <span>每张卡片都已加入。</span>}</div><ol aria-describedby={`${id}-help`}>{selected.map((value, index) => <li key={value}><span><b>{index + 1}</b>{config.items.find(item => item.id === value)?.label ?? value}</span><div><button type="button" disabled={!index} aria-label={`将第${index + 1}项上移`} onClick={() => move(index, -1)}>↑</button><button type="button" disabled={index === selected.length - 1} aria-label={`将第${index + 1}项下移`} onClick={() => move(index, 1)}>↓</button><button type="button" aria-label={`移出第${index + 1}项`} onClick={() => onChange({ values: selected.filter(item => item !== value) })}>移出</button></div></li>)}</ol></div>;
  }
  if (config.mode === 'drag_drop') {
    const placements = record(response.placements);
    function place(item: string, group: string) { const next = { ...placements }; if (group) next[item] = group; else delete next[item]; onChange({ placements: next }); }
    return <div className="answer-classification"><p>把每张卡片放到合适的位置。可以拖放，也可以直接选择。</p><div className="answer-classification-cards">{config.items.map(item => <label key={item.id} draggable onDragStart={e => e.dataTransfer.setData('text/plain', item.id)}><strong>{item.label}</strong><select value={placements[item.id] ?? ''} onChange={e => place(item.id, e.target.value)}><option value="">选择位置</option>{config.groups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}</select></label>)}</div><div className="answer-drop-groups">{config.groups.map(group => <section key={group.id} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const item = e.dataTransfer.getData('text/plain'); if (config.items.some(value => value.id === item)) place(item, group.id); }}><h4>{group.label}</h4>{config.items.filter(item => placements[item.id] === group.id).map(item => <span key={item.id}>{item.label}</span>)}</section>)}</div></div>;
  }
  if (config.mode === 'table_fill') {
    const cells = record(response.cells);
    return <div className="answer-table-wrap"><table className="answer-grid-table"><caption>按行与列的提示填写每个空位</caption><thead><tr><th scope="col">项目</th>{config.columns.map(column => <th scope="col" key={column.id}>{column.label}</th>)}</tr></thead><tbody>{config.rows.map(row => <tr key={row.id}><th scope="row">{row.label}</th>{config.columns.map(column => { const key = `${row.id}:${column.id}`; return <td key={column.id}><input aria-label={`${row.label}，${column.label}`} maxLength={3000} value={cells[key] ?? ''} onChange={e => onChange({ cells: { ...cells, [key]: e.target.value } })} /></td>; })}</tr>)}</tbody></table></div>;
  }
  if (config.mode === 'hotspot') return <div className="answer-hotspot"><p>选择图中合适的位置。也可以使用下面的文字按钮。</p><div className="answer-hotspot-image">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={questionMediaUrl(config.imageUrl)} alt={config.imageAlt} />{config.targets.map(target => <button type="button" key={target.id} aria-label={target.label} aria-pressed={response.value === target.id} style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%`, width: `${target.width * 100}%`, height: `${target.height * 100}%` }} onClick={() => onChange({ value: target.id })}><span>{target.label}</span></button>)}</div><div className="answer-hotspot-options">{config.targets.map(target => <button type="button" key={target.id} aria-pressed={response.value === target.id} onClick={() => onChange({ value: target.id })}>{target.label}</button>)}</div></div>;
  if (config.mode === 'geometry_draw') return <DrawingInput response={response} onChange={onChange} />;
  return null;
}

export function StepwiseAnswerInput({ steps, onChange }: { steps: string[]; onChange: (steps: string[]) => void }) {
  const values = steps.length ? steps : [''];
  return <div className="answer-steps"><p>一次写清一个步骤，保留你是怎样想的。</p><ol>{values.map((value, index) => <li key={index}><label><span>第 {index + 1} 步</span><textarea value={value} maxLength={3000} rows={2} onChange={e => onChange(values.map((item, i) => i === index ? e.target.value : item))} /></label><button type="button" disabled={values.length === 1} aria-label={`删除第${index + 1}步`} onClick={() => onChange(values.filter((_item, i) => i !== index))}>移除</button></li>)}</ol><button type="button" disabled={values.length >= 80} onClick={() => onChange([...values, ''])}>＋ 再写一步</button><small>步骤与理由会一起保存，等待按量规复核。</small></div>;
}

function DrawingInput({ response, onChange }: Pick<Props, 'response' | 'onChange'>) {
  const strokes: DrawingStroke[] = [];
  if (Array.isArray(response.strokes)) {
    let total = 0;
    for (const stroke of response.strokes.slice(0, 64)) {
      if (!stroke || !Array.isArray(stroke.points)) continue;
      const points = stroke.points.filter((p: unknown): p is DrawingPoint => !!p && typeof p === 'object' && 'x' in p && 'y' in p &&
        typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1).slice(0, 1024 - total);
      if (points.length) { strokes.push({ points }); total += points.length; }
    }
  }
  const description = typeof response.description === 'string' ? response.description : '';
  const [current, setCurrent] = React.useState<DrawingPoint[]>([]), [notice, setNotice] = React.useState('');
  const active = React.useRef<{ pointer: number; points: DrawingPoint[] } | null>(null);
  const count = strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
  function point(event: React.PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect(), round = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
    return { x: round((event.clientX - box.left) / Math.max(box.width, 1)), y: round((event.clientY - box.top) / Math.max(box.height, 1)) };
  }
  function finish(event: React.PointerEvent<SVGSVGElement>) {
    if (!active.current || active.current.pointer !== event.pointerId) return;
    const points = active.current.points; active.current = null; setCurrent([]);
    if (points.length) onChange({ strokes: [...strokes, { points }], description });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return <div className="answer-drawing"><p>在格子上画出你的思路，也可以用文字说明图形、位置与理由。</p><div className="answer-drawing-tools"><button type="button" disabled={!strokes.length} onClick={() => onChange({ strokes: strokes.slice(0, -1), description })}>撤销上一笔</button><button type="button" disabled={!strokes.length} onClick={() => onChange({ strokes: [], description })}>清空画布</button><span>{count} / 1024 个笔迹点</span></div><svg viewBox="0 0 640 420" className="answer-drawing-canvas" role="img" aria-label="作图画布，可用鼠标或触控笔绘制，下方提供文字表达方式"
    onPointerDown={event => { if (event.button !== 0 || active.current) return; if (count >= 1024 || strokes.length >= 64) { setNotice('画布笔迹已较多，可以撤销一笔，或在下方补充文字说明。'); return; } event.preventDefault(); const first = point(event); active.current = { pointer: event.pointerId, points: [first] }; setCurrent([first]); event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={event => { const stroke = active.current; if (!stroke || stroke.pointer !== event.pointerId || count + stroke.points.length >= 1024) return; const next = point(event), previous = stroke.points.at(-1)!; if (Math.hypot(next.x - previous.x, next.y - previous.y) < 0.003) return; stroke.points.push(next); setCurrent([...stroke.points]); }}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
    <title>你的作图</title><rect width="640" height="420" fill="#fffefa" />{Array.from({ length: 15 }, (_, index) => <line key={`v${index}`} x1={index * 40} y1="0" x2={index * 40} y2="420" stroke="#dce7db" />)}{Array.from({ length: 11 }, (_, index) => <line key={`h${index}`} x1="0" y1={index * 40} x2="640" y2={index * 40} stroke="#dce7db" />)}
    {[...strokes, ...(current.length ? [{ points: current }] : [])].map((stroke, index) => stroke.points.length === 1 ? <circle key={index} cx={stroke.points[0].x * 640} cy={stroke.points[0].y * 420} r="2" fill="#244d40" /> : <polyline key={index} points={stroke.points.map(value => `${value.x * 640},${value.y * 420}`).join(' ')} fill="none" stroke="#244d40" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}
    </svg><label>用文字补充你的图形与理由<textarea rows={3} maxLength={4000} value={description} onChange={event => onChange({ strokes, description: event.target.value })} placeholder="例如：我先画一个长方形，再把它分成……" /></label><small>笔迹与说明均保存为作答证据，图形不会自动判为正确。</small>{notice && <p role="status">{notice}</p>}</div>;
}
