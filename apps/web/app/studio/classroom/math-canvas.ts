import type { ClassroomMathDrawing } from '@study-agent/contracts';

/** Same geometry as classroom SVG. Canvas is also the PNG/WebM renderer. */
export function drawClassroomMath(context: CanvasRenderingContext2D, drawing: ClassroomMathDrawing, x: number, y: number, scale: number, family: string) {
  context.save(); context.translate(x, y); context.scale(scale, scale); context.lineCap = 'round'; context.lineJoin = 'round';
  for (const part of drawing.primitives) {
    if (part.kind === 'line') {
      context.beginPath(); context.moveTo(part.x1, part.y1); context.lineTo(part.x2, part.y2); context.strokeStyle = part.stroke; context.lineWidth = part.strokeWidth; context.stroke(); continue;
    }
    if (part.kind === 'text') {
      context.font = part.size + 'px ' + family; context.fillStyle = part.fill; context.textAlign = part.anchor === 'middle' ? 'center' : 'left'; context.textBaseline = 'alphabetic'; context.fillText(part.text, part.x, part.y); continue;
    }
    let shape: Path2D | undefined;
    context.beginPath();
    if (part.kind === 'circle') context.arc(part.x, part.y, part.radius, 0, Math.PI * 2);
    else if (part.kind === 'ellipse') context.ellipse(part.x, part.y, part.rx, part.ry, 0, 0, Math.PI * 2);
    else if (part.kind === 'polygon') { part.points.forEach(([px, py], index) => index ? context.lineTo(px, py) : context.moveTo(px, py)); context.closePath(); }
    else shape = new Path2D(part.d);
    if (typeof part.fill === 'string') context.fillStyle = part.fill;
    else {
      const fill = part.fill, gradient = context.createRadialGradient(fill.x, fill.y, 0, fill.x, fill.y, fill.radius);
      fill.stops.forEach(stop => gradient.addColorStop(stop.offset, stop.color)); context.fillStyle = gradient;
    }
    if (shape) context.fill(shape); else context.fill();
    if (part.stroke) { context.strokeStyle = part.stroke; context.lineWidth = part.strokeWidth ?? 1; if (shape) context.stroke(shape); else context.stroke(); }
  }
  context.restore();
}
