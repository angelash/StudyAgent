'use client';
import * as React from 'react';
import { classroomMathDrawings, type ClassroomMathDrawing, type ClassroomMathFigure, type ClassroomMathPaint } from '@study-agent/contracts';
import { FigureReader } from './figure-reader';
import './math-figure.css';

function MathDrawing({ drawing }: { drawing: ClassroomMathDrawing }) {
  const id = React.useId().replace(/:/g, ''), paint = (value: ClassroomMathPaint, index: number) => typeof value === 'string' ? value : `url(#${id}-${index})`;
  return <svg viewBox={`0 0 ${drawing.width} ${drawing.height}`} role="img" aria-label={drawing.description} focusable="false">
    <title>{drawing.description}</title>
    <defs>{drawing.primitives.map((part, index) => 'fill' in part && typeof part.fill !== 'string' ? <radialGradient key={index} id={`${id}-${index}`} gradientUnits="userSpaceOnUse"
      cx={part.fill.x} cy={part.fill.y} r={part.fill.radius}>{part.fill.stops.map(stop => <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />)}</radialGradient> : null)}</defs>
    {drawing.primitives.map((part, index) => {
      if (part.kind === 'line') return <line key={index} x1={part.x1} y1={part.y1} x2={part.x2} y2={part.y2} stroke={part.stroke} strokeWidth={part.strokeWidth} strokeLinecap="round" />;
      if (part.kind === 'text') return <text key={index} x={part.x} y={part.y} fontSize={part.size} textAnchor={part.anchor ?? 'start'} fill={part.fill}>{part.text}</text>;
      const style = { fill: paint(part.fill, index), stroke: part.stroke, strokeWidth: part.strokeWidth, strokeLinejoin: 'round' as const };
      if (part.kind === 'circle') return <circle key={index} cx={part.x} cy={part.y} r={part.radius} {...style} />;
      if (part.kind === 'ellipse') return <ellipse key={index} cx={part.x} cy={part.y} rx={part.rx} ry={part.ry} {...style} />;
      if (part.kind === 'polygon') return <polygon key={index} points={part.points.map(point => point.join(',')).join(' ')} {...style} />;
      return <path key={index} d={part.d} {...style} />;
    })}
  </svg>;
}

function MathModels({ figure }: { figure: ClassroomMathFigure }) {
  return <div className="cl-math-models" data-math-kind={figure.kind}>
    {classroomMathDrawings(figure).map((drawing, index) => <div className="cl-math-model" key={index} data-model-index={index}>
      <MathDrawing drawing={drawing} />{drawing.caption && <p className="cl-math-caption">{drawing.caption}</p>}
    </div>)}
  </div>;
}

export function ClassroomMathFigureView({ figure, interactive = true, onOpen }: { figure: ClassroomMathFigure; interactive?: boolean; onOpen?: () => void }) {
  const [expanded, setExpanded] = React.useState(false), title = figure.title.trim() || (figure.kind === 'clocks' ? '钟面' : '立体形状');
  return <><figure className="cl-figure cl-math-figure" aria-label={title}>
    <MathModels figure={figure} /><figcaption>{title}</figcaption>
    {interactive && <button type="button" className="cl-figure-open" aria-label={'放大数学图示：' + title} onClick={() => { onOpen?.(); setExpanded(true); }}>↗</button>}
  </figure>{expanded && <FigureReader title={title} onClose={() => setExpanded(false)}><MathModels figure={figure} /></FigureReader>}</>;
}
