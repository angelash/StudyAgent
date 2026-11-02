import { z } from 'zod';

const authoredText = (max: number, min = 0) => z.string().max(max).refine(value => value.trim().length >= min)
  .refine(value => ![...value].some(char => { const code = char.codePointAt(0)!; return code >= 0xd800 && code <= 0xdfff; }));
const solidShape = z.enum(['cuboid', 'cube', 'cylinder', 'sphere']);
function figureSchema(complete: boolean) {
  const title = authoredText(160, complete ? 1 : 0), caption = authoredText(400);
  return z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('clocks'), title, showDigitalTime: z.boolean(), showHandLabels: z.boolean(),
      clocks: z.array(z.object({ hour: z.number().int().min(1).max(12), minute: z.number().int().min(0).max(59), caption }).strict()).min(1).max(4) }).strict(),
    z.object({ kind: z.literal('solids'), title, showNames: z.boolean(),
      solids: z.array(z.object({ shape: solidShape, caption }).strict()).min(1).max(4) }).strict(),
  ]);
}
export const classroomMathFigureSchema = figureSchema(true);
export const classroomMathDraftFigureSchema = figureSchema(false);
export type ClassroomMathFigure = z.infer<typeof classroomMathFigureSchema>;
export type ClassroomSolidShape = z.infer<typeof solidShape>;
export const classroomSolidNames: Record<ClassroomSolidShape, string> = { cuboid: '长方体', cube: '正方体', cylinder: '圆柱', sphere: '球' };

/** A fixed teaching model, never the device clock or a learner response. */
export function classroomClockAngles(hour: number, minute: number) {
  if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) throw new RangeError('invalid_classroom_clock');
  return { hour: (hour % 12) * 30 + minute * .5, minute: minute * 6 };
}
export const classroomClockTime = (hour: number, minute: number) => { classroomClockAngles(hour, minute); return hour + ':' + String(minute).padStart(2, '0'); };
function handPosition(value: number, hand: string) {
  const floor = Math.floor(value), fraction = value - floor, lower = floor === 0 ? 12 : floor, upper = (floor + 1) % 12 || 12;
  return fraction === 0 ? `${hand}指向数字${lower}` : `${hand}在数字${lower}和${upper}之间${fraction < .5 ? '，靠近' + lower : fraction > .5 ? '，靠近' + upper : ''}`;
}
const solidDescriptions: Record<ClassroomSolidShape, string> = {
  cuboid: '盒状立体模型，显示三个平面，沿三个方向的长度不全相同。',
  cube: '立体模型，沿三个方向的长度相同，显示三个正方形平面的投影。',
  cylinder: '直立模型，上下是同样大小的圆面，中间连接弯曲的侧面。',
  sphere: '光滑圆曲面模型，以明暗显示立体感，没有平面或棱角。',
};
export function classroomMathModelDescriptions(figure: ClassroomMathFigure): string[] {
  if (figure.kind === 'clocks') return figure.clocks.map(clock => {
    const angles = classroomClockAngles(clock.hour, clock.minute);
    return [clock.caption, handPosition(angles.hour / 30, '短时针'), handPosition(angles.minute / 30, '长分针'),
      ...(figure.showDigitalTime ? ['数字表示：' + classroomClockTime(clock.hour, clock.minute)] : [])].filter(Boolean).join('；');
  });
  return figure.solids.map(solid => [figure.showNames ? classroomSolidNames[solid.shape] : '', solidDescriptions[solid.shape], solid.caption].filter(Boolean).join('；'));
}

export type ClassroomMathPaint = string | { kind: 'radial'; x: number; y: number; radius: number; stops: Array<{ offset: number; color: string }> };
type Painted = { fill: ClassroomMathPaint; stroke?: string; strokeWidth?: number };
export type ClassroomMathPrimitive =
  | ({ kind: 'circle'; x: number; y: number; radius: number } & Painted)
  | ({ kind: 'ellipse'; x: number; y: number; rx: number; ry: number } & Painted)
  | ({ kind: 'polygon'; points: Array<[number, number]> } & Painted)
  | ({ kind: 'path'; d: string } & Painted)
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; strokeWidth: number }
  | { kind: 'text'; x: number; y: number; text: string; fill: string; size: number; anchor?: 'start' | 'middle' };
export type ClassroomMathDrawing = { width: number; height: number; primitives: ClassroomMathPrimitive[]; description: string; caption: string };
const ink = '#344055', outline = '#7f91a9', paper = '#fafbfe';
const pointAt = (x: number, y: number, radius: number, degrees: number): [number, number] => {
  const angle = degrees * Math.PI / 180; return [x + radius * Math.sin(angle), y - radius * Math.cos(angle)];
};
/** Shared geometry for SVG, print and canvas recording: renderer copies cannot
 * move a hand independently or turn a cube into an arbitrary flat box. */
export function classroomMathDrawings(figure: ClassroomMathFigure): ClassroomMathDrawing[] {
  const descriptions = classroomMathModelDescriptions(figure);
  if (figure.kind === 'clocks') return figure.clocks.map((clock, index) => {
    const primitives: ClassroomMathPrimitive[] = [{ kind: 'circle', x: 120, y: 108, radius: 86, fill: paper, stroke: outline, strokeWidth: 2 }];
    for (let tick = 0; tick < 60; tick++) {
      const major = tick % 5 === 0, a = pointAt(120, 108, major ? 75 : 80, tick * 6), b = pointAt(120, 108, 83, tick * 6);
      primitives.push({ kind: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: major ? ink : '#acb8c8', strokeWidth: major ? 2 : 1 });
    }
    for (let number = 1; number <= 12; number++) {
      const [x, y] = pointAt(120, 108, 62, number * 30);
      primitives.push({ kind: 'text', x, y: y + 5, text: String(number), fill: ink, size: 16, anchor: 'middle' });
    }
    const angles = classroomClockAngles(clock.hour, clock.minute), h = pointAt(120, 108, 40, angles.hour), m = pointAt(120, 108, 58, angles.minute);
    primitives.push({ kind: 'line', x1: 120, y1: 108, x2: m[0], y2: m[1], stroke: '#447c9f', strokeWidth: 3 },
      { kind: 'line', x1: 120, y1: 108, x2: h[0], y2: h[1], stroke: ink, strokeWidth: 5 }, { kind: 'circle', x: 120, y: 108, radius: 4, fill: ink });
    if (figure.showDigitalTime) primitives.push({ kind: 'text', x: 120, y: 221, text: classroomClockTime(clock.hour, clock.minute), fill: ink, size: 21, anchor: 'middle' });
    if (figure.showHandLabels) primitives.push({ kind: 'line', x1: 50, y1: 244, x2: 70, y2: 244, stroke: ink, strokeWidth: 5 },
      { kind: 'text', x: 76, y: 249, text: '时针', fill: ink, size: 14 }, { kind: 'line', x1: 139, y1: 244, x2: 162, y2: 244, stroke: '#447c9f', strokeWidth: 3 },
      { kind: 'text', x: 168, y: 249, text: '分针', fill: ink, size: 14 });
    return { width: 240, height: 264, primitives, description: descriptions[index], caption: clock.caption };
  });
  return figure.solids.map((solid, index) => {
    const primitives: ClassroomMathPrimitive[] = [], fill = '#d4dde9';
    if (solid.shape === 'cube' || solid.shape === 'cuboid') {
      const [width, depth, height] = solid.shape === 'cube' ? [1, 1, 1] : [1.5, .75, 1], scale = 52;
      const center = 120 - (width - depth) * scale * Math.sqrt(3) / 4;
      const p = (x: number, y: number, z: number): [number, number] => [center + (x - y) * scale * Math.sqrt(3) / 2, 126 + (x + y) * scale / 2 - z * scale];
      primitives.push({ kind: 'polygon', points: [p(0, depth, 0), p(width, depth, 0), p(width, depth, height), p(0, depth, height)], fill, stroke: outline, strokeWidth: 1.5 },
        { kind: 'polygon', points: [p(width, 0, 0), p(width, depth, 0), p(width, depth, height), p(width, 0, height)], fill: '#bbc9d9', stroke: outline, strokeWidth: 1.5 },
        { kind: 'polygon', points: [p(0, 0, height), p(width, 0, height), p(width, depth, height), p(0, depth, height)], fill: '#f4f1e9', stroke: outline, strokeWidth: 1.5 });
    } else if (solid.shape === 'cylinder') {
      primitives.push({ kind: 'path', d: 'M75 89 L75 167 C75 188 165 188 165 167 L165 89 Z', fill, stroke: outline, strokeWidth: 1.5 },
        { kind: 'ellipse', x: 120, y: 89, rx: 45, ry: 16, fill: '#f4f1e9', stroke: outline, strokeWidth: 1.5 });
    } else {
      primitives.push({ kind: 'circle', x: 120, y: 128, radius: 48,
        fill: { kind: 'radial', x: 103, y: 107, radius: 69, stops: [{ offset: 0, color: '#f9fbff' }, { offset: .5, color: '#e5ebf4' }, { offset: 1, color: '#aebfd3' }] }, stroke: outline, strokeWidth: 1.5 });
    }
    if (figure.showNames) primitives.push({ kind: 'text', x: 120, y: 221, text: classroomSolidNames[solid.shape], fill: ink, size: 19, anchor: 'middle' });
    return { width: 240, height: 240, primitives, description: descriptions[index], caption: solid.caption };
  });
}

const xml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Standalone notes retain the visible model, including hidden-answer settings.
 * No executable markup or separately revealed digital answer is exported. */
export function classroomMathDrawingSvg(drawing: ClassroomMathDrawing): string {
  const definitions: string[] = [];
  const parts = drawing.primitives.map((part, index) => {
    if (part.kind === 'text') return `<text x="${part.x}" y="${part.y}" font-size="${part.size}" text-anchor="${part.anchor ?? 'start'}" fill="${part.fill}">${xml(part.text)}</text>`;
    if (part.kind === 'line') return `<line x1="${part.x1}" y1="${part.y1}" x2="${part.x2}" y2="${part.y2}" stroke="${part.stroke}" stroke-width="${part.strokeWidth}" stroke-linecap="round"/>`;
    let fill: string;
    if (typeof part.fill === 'string') fill = part.fill;
    else {
      const gradient = part.fill; fill = `url(#paint-${index})`;
      definitions.push(`<radialGradient id="paint-${index}" gradientUnits="userSpaceOnUse" cx="${gradient.x}" cy="${gradient.y}" r="${gradient.radius}">${gradient.stops.map(stop => `<stop offset="${stop.offset}" stop-color="${stop.color}"/>`).join('')}</radialGradient>`);
    }
    const paint = `fill="${fill}"${part.stroke ? ` stroke="${part.stroke}" stroke-width="${part.strokeWidth ?? 1}"` : ''}`;
    if (part.kind === 'circle') return `<circle cx="${part.x}" cy="${part.y}" r="${part.radius}" ${paint}/>`;
    if (part.kind === 'ellipse') return `<ellipse cx="${part.x}" cy="${part.y}" rx="${part.rx}" ry="${part.ry}" ${paint}/>`;
    if (part.kind === 'polygon') return `<polygon points="${part.points.map(point => point.join(',')).join(' ')}" ${paint}/>`;
    return `<path d="${part.d}" ${paint}/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${drawing.width} ${drawing.height}" width="${drawing.width}" height="${drawing.height}" role="img"><title>${xml(drawing.description)}</title><defs>${definitions.join('')}</defs>${parts.join('')}</svg>`;
}
export function classroomMathMarkdown(figure: ClassroomMathFigure) {
  const escape = (value: string) => value.replace(/[\\`*_[\]<>]/g, '\\$&');
  return [escape(figure.title), ...classroomMathDrawings(figure).flatMap(drawing => [
    '![' + escape(drawing.description).replace(/\r?\n/g, ' ') + '](data:image/svg+xml,' + encodeURIComponent(classroomMathDrawingSvg(drawing)) + ')',
    escape(drawing.caption),
  ])].join('\n\n');
}
