import { describe, expect, it } from 'vitest';
import { classroomClockAngles, classroomClockTime, classroomMathFigureSchema, classroomMathDraftFigureSchema,
  classroomMathDrawings, classroomMathModelDescriptions, classroomMathDrawingSvg, classroomMathMarkdown, whiteboardSceneProgress, type StudioWhiteboardScene, type ClassroomMathFigure } from '@study-agent/contracts';

const clock = (hour = 3, minute = 0): ClassroomMathFigure => ({ kind: 'clocks', title: '原创钟面', showDigitalTime: true, showHandLabels: false, clocks: [{ hour, minute, caption: '' }] });
describe('controlled mathematical drawings shared by SVG and recording', () => {
  it.each([[12, 0, 0, 0], [3, 30, 105, 180], [11, 59, 359.5, 354], [12, 59, 29.5, 354], [7, 58, 239, 348]])('places both hands continuously at %s:%s', (hour, minute, h, m) => {
    expect(classroomClockAngles(hour, minute)).toEqual({ hour: h, minute: m });
  });
  it.each([[0, 0], [13, 0], [1, -1], [1, 60], [1.5, 0], [1, 1.5], [NaN, 0]])('rejects invalid clock parameters %s:%s', (hour, minute) => {
    expect(() => classroomClockAngles(hour, minute)).toThrow('invalid_classroom_clock');
    expect(classroomMathFigureSchema.safeParse(clock(hour, minute)).success).toBe(false);
  });
  it('draws 3:00 with a shorter horizontal hour hand and a longer upward minute hand', () => {
    const drawing = classroomMathDrawings(clock())[0], hands = drawing.primitives.filter(p => p.kind === 'line' && p.x1 === 120 && p.y1 === 108);
    expect(hands).toEqual(expect.arrayContaining([expect.objectContaining({ x2: 120, y2: 50, strokeWidth: 3 }), expect.objectContaining({ x2: 160, y2: 108, strokeWidth: 5 })]));
    expect(drawing.primitives.filter(p => p.kind === 'text' && /^\d+$/.test(p.text))).toHaveLength(12);
    expect(classroomClockTime(12, 0)).toBe('12:00');
  });
  it('keeps the digital answer out of the drawing and accessible text when digital display is off', () => {
    const model = clock(7, 58); if (model.kind !== 'clocks') throw Error(); model.showDigitalTime = false;
    expect(classroomMathDrawings(model)[0].primitives.some(p => p.kind === 'text' && p.text.includes(':'))).toBe(false);
    const text = classroomMathModelDescriptions(model)[0]; expect(text).not.toContain('7:58'); expect(text).toContain('短时针在数字7和8之间，靠近8'); expect(text).toContain('长分针在数字11和12之间，靠近12');
  });
  it('preserves all model captions and accepts an incomplete draft title without making it publishable', () => {
    const model = clock(); model.title = ''; if (model.kind !== 'clocks') throw Error(); model.clocks[0].caption = '  原始说明\n下一行 😀  ';
    expect(classroomMathDraftFigureSchema.parse(model)).toEqual(model); expect(classroomMathFigureSchema.safeParse(model).success).toBe(false);
    expect(classroomMathDrawings(model)[0].caption).toBe(model.clocks[0].caption);
  });
  it('uses equal projected edge lengths for a cube and three different lengths for the illustrated cuboid', () => {
    const model: ClassroomMathFigure = { kind: 'solids', title: '原创立体图', showNames: false, solids: [{ shape: 'cube', caption: '' }, { shape: 'cuboid', caption: '' }] };
    const lengths = classroomMathDrawings(model).map(drawing => [...new Set(drawing.primitives.flatMap(part => part.kind === 'polygon' ? part.points.map((p, i) => {
      const q = part.points[(i + 1) % part.points.length]; return Math.round(Math.hypot(p[0] - q[0], p[1] - q[1]) * 100) / 100;
    }) : []))].sort((a, b) => a - b));
    expect(lengths).toEqual([[52], [39, 52, 78]]);
    expect(classroomMathModelDescriptions(model).join('')).not.toMatch(/正方体|长方体/);
  });
  it('represents a cylinder with a curved side and projected circular top, and a sphere with continuous shading', () => {
    const model: ClassroomMathFigure = { kind: 'solids', title: '曲面模型', showNames: true, solids: [{ shape: 'cylinder', caption: '' }, { shape: 'sphere', caption: '' }] }, [cylinder, sphere] = classroomMathDrawings(model);
    expect(cylinder.primitives.some(p => p.kind === 'path')).toBe(true); expect(cylinder.primitives.some(p => p.kind === 'ellipse')).toBe(true);
    expect(sphere.primitives.filter(p => p.kind === 'polygon' || p.kind === 'ellipse')).toEqual([]);
    expect(sphere.primitives).toContainEqual(expect.objectContaining({ kind: 'circle', fill: expect.objectContaining({ kind: 'radial' }) }));
  });
  it('refuses extra executable fields, unsupported shapes and unbounded model arrays', () => {
    expect(classroomMathFigureSchema.safeParse({ ...clock(), svg: '<script />' }).success).toBe(false);
    expect(classroomMathFigureSchema.safeParse({ kind: 'solids', title: 'bad', showNames: true, solids: [{ shape: 'custom-svg', caption: '' }] }).success).toBe(false);
    const model = clock(); if (model.kind !== 'clocks') throw Error(); model.clocks = Array.from({ length: 5 }, () => ({ hour: 1, minute: 0, caption: '' }));
    expect(classroomMathFigureSchema.safeParse(model).success).toBe(false);
  });
  it('exports the actual visible drawing with escaped authored captions and no hidden digital answer', () => {
    const model = clock(7, 58); if (model.kind !== 'clocks') throw Error(); model.showDigitalTime = false; model.clocks[0].caption = '<script>alert("caption")</script>\n完整尾注';
    const svg = classroomMathDrawingSvg(classroomMathDrawings(model)[0]); expect(svg).not.toContain('<script>'); expect(svg).toContain('&lt;script&gt;'); expect(svg).toContain('完整尾注'); expect(svg).not.toContain('7:58');
    expect(classroomMathMarkdown(model)).toContain('data:image/svg+xml,'); expect(classroomMathMarkdown(model)).not.toContain('7:58');
  });
  it('reveals mathematical models only at a valid frozen speech boundary', () => {
    const scene: StudioWhiteboardScene = { id: 'math', kind: 'concept', title: '合成揭示', narration: '先比较。再看钟面。', math: clock(), durationMs: 1,
      reveal: { version: 'whiteboard-reveal-v1', sourceText: '先比较。再看钟面。', bulletEnds: [], exhibits: [], diagramAt: 8 } };
    expect(whiteboardSceneProgress(scene, 4).diagram).toBe(false); expect(whiteboardSceneProgress(scene, 8).diagram).toBe(true);
    delete scene.reveal!.diagramAt; expect(whiteboardSceneProgress(scene, 9).mode).toBe('invalid'); expect(whiteboardSceneProgress(scene, 9).diagram).toBe(false);
  });
});
