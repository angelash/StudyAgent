'use client';
import { whiteboardTaughtTableRows, type StudioWhiteboardScene, type WhiteboardSpeechUnit } from '@study-agent/contracts';
import { originalBoardFontFamily, originalUiFontFamily, type OriginalBoardFont } from '../../lib/original-teaching-fonts';
import { whiteboardTextLines } from './whiteboard-table';
import { renderWhiteboardFormula, whiteboardFormulaKey, whiteboardFormulaPages, type FormulaPage } from './whiteboard-formula';

export type BoardCamera = { zoom: number; x: number; y: number; follow: boolean };
type Part = { id: string; y: number; height: number; bullet?: number; row?: number; page?: { index: number; count: number } } & (
  { kind: 'text'; lines: string[]; font: number; title?: boolean } |
  { kind: 'table'; cells: string[][]; header: boolean; font: number } |
  { kind: 'image'; key: string; label: string; crop?: FormulaPage & { scale: number } } |
  { kind: 'fraction'; visual: NonNullable<StudioWhiteboardScene['visual']>; scale: number }
);
export type TeachingBlock = { id: string; scene: StudioWhiteboardScene; x: number; y: number; width: number; height: number; parts: Part[] };
const gutter = 64, margin = 72;
// Weak keys release private manuscript layouts when their original board is gone.
const layouts = new WeakMap<StudioWhiteboardScene[], Map<string, TeachingBlock[]>>();

/** Full frozen blocks determine placement, so revealing another item never moves old notes. */
export function layoutTeachingBlocks(context: CanvasRenderingContext2D, scenes: StudioWhiteboardScene[], font: OriginalBoardFont, narrow = false) {
  const key = font + ':' + narrow, cached = layouts.get(scenes)?.get(key); if (cached) return cached;
  const family = originalBoardFontFamily(font), columns = narrow ? [40] : [40, 40], columnWidth = narrow ? 1104 : 536, fontScale = narrow ? 2 : 1;
  const blocks = scenes.map(scene => {
    const column = narrow || columns[0] <= columns[1] ? 0 : 1, parts: Part[] = []; let y = 0;
    function text(id: string, value: string, size = 30, extras: { title?: boolean; bullet?: number } = {}) {
      if (!value.trim()) return;
      size *= fontScale;
      context.font = size + 'px ' + family;
      const lines = whiteboardTextLines(value, columnWidth - (extras.bullet === undefined ? 0 : 28), line => context.measureText(line).width), lineHeight = size * 1.5;
      parts.push({ id: scene.id + ':' + id, kind: 'text', lines, y, height: lines.length * lineHeight, font: size, ...extras }); y += lines.length * lineHeight + 14;
    }
    text('title', scene.title, 34, { title: true });
    if (scene.body) text('body', scene.body);
    for (const [index, bullet] of (scene.bullets ?? []).entries()) text('bullet:' + index, bullet, 30, { bullet: index });
    if (scene.exhibit?.kind === 'table') {
      const table = scene.exhibit, cellWidth = columnWidth / table.headers.length, size = 26 * fontScale, lineHeight = size * 1.4;
      context.font = size + 'px ' + family;
      for (const [index, row] of [table.headers, ...table.rows].entries()) {
        const cells = row.map(cell => whiteboardTextLines(cell, Math.max(1, cellWidth - 20), value => context.measureText(value).width)), rowHeight = Math.max(...cells.map(cell => cell.length)) * lineHeight + 16;
        parts.push({ id: scene.id + ':row:' + index, kind: 'table', cells, font: size, header: index === 0, row: index - 1, y, height: rowHeight }); y += rowHeight;
      }
      y += 20;
    } else if (scene.exhibit?.kind === 'formula') {
      try {
        const formula = renderWhiteboardFormula(scene.exhibit.latex), layout = whiteboardFormulaPages(formula.width, formula.height, columnWidth / fontScale, 180);
        for (const [index, page] of layout.pages.entries()) {
          const height = Math.max(64, page.height * layout.scale) * fontScale;
          parts.push({ id: scene.id + ':formula:' + index, kind: 'image', key: whiteboardFormulaKey(scene.exhibit.latex), label: scene.exhibit.latex,
            crop: { ...page, scale: layout.scale * fontScale }, page: { index, count: layout.pages.length }, y, height }); y += height + 16;
        }
      } catch {
        text('formula-source-label', '原式阅读（暂未统一排版）', 18); text('formula-source', scene.exhibit.latex, 22);
      }
      text('explanation', scene.exhibit.explanation, 22);
    }
    if (scene.figure) {
      parts.push({ id: scene.id + ':figure', kind: 'image', key: scene.figure.snapshotId, label: scene.figure.alt, y, height: 320 * fontScale }); y += 336 * fontScale;
      if (scene.figure.caption) text('caption', scene.figure.caption, 18);
    }
    if (scene.kind === 'pdf_page' && scene.source) {
      parts.push({ id: scene.id + ':source-image', kind: 'image', key: scene.source.materialId + ':' + scene.source.page, label: scene.source.label, y, height: 340 * fontScale }); y += 356 * fontScale;
    }
    if (scene.visual) {
      parts.push({ id: scene.id + ':visual', kind: 'fraction', visual: scene.visual, scale: fontScale, y, height: 188 * fontScale }); y += 202 * fontScale;
      text('visual-note', scene.visual.note, 22);
    }
    const block = { id: scene.id, scene, x: margin + column * (columnWidth + gutter), y: columns[column], width: columnWidth, height: y, parts };
    columns[column] += y + 44;
    return block;
  });
  const byFont = layouts.get(scenes) ?? new Map<string, TeachingBlock[]>(); byFont.set(key, blocks); layouts.set(scenes, byFont);
  return blocks;
}

function revealed(part: Part, block: TeachingBlock, unit: WhiteboardSpeechUnit | undefined, complete: boolean, progress: number) {
  if (complete || !unit) return true;
  if (part.bullet !== undefined) return unit.visibleBulletIndices.includes(part.bullet);
  if (part.page) return part.page.index <= Math.min(part.page.count - 1, Math.floor((unit.start + (unit.end - unit.start) * progress) / Math.max(1, block.scene.narration.length) * part.page.count));
  if (part.row !== undefined && part.row >= 0 && block.scene.exhibit?.kind === 'table') {
    // Whole rows enter on sentence boundaries, never character-by-character.
    return part.row < whiteboardTaughtTableRows(block.scene, unit);
  }
  return true;
}

/** Playback and video call this same layout/draw path. No learning records are produced. */
export function drawTeachingFrame(context: CanvasRenderingContext2D, scenes: StudioWhiteboardScene[], units: WhiteboardSpeechUnit[], current: WhiteboardSpeechUnit,
  images: Map<string, HTMLImageElement>, options: { font?: OriginalBoardFont; camera?: BoardCamera; dots?: boolean; captions?: boolean; narrow?: boolean; pixelScale?: number; progress?: number } = {}) {
  const width = context.canvas.width, height = context.canvas.height, pixelScale = options.pixelScale ?? 1;
  const font = options.font ?? 'handwriting', family = originalBoardFontFamily(font), blocks = layoutTeachingBlocks(context, scenes, font, options.narrow);
  const index = units.findIndex(item => item.id === current.id), prefix = units.slice(0, Math.max(0, index) + 1), lastByScene = new Map(prefix.map(item => [item.sceneId, item]));
  const shown = blocks.filter(block => lastByScene.has(block.id)), active = shown.find(block => block.id === current.sceneId);
  const progress = Math.max(0, Math.min(1, options.progress ?? 0)), sceneProgress = Math.min(1, (current.start + (current.end - current.start) * progress) / Math.max(1, active?.scene.narration.length ?? 1));
  const requested = options.camera ?? { zoom: 1, x: 0, y: 0, follow: true }, readingHeight = (height - (options.captions === false ? 40 : 110)) / requested.zoom;
  const automaticY = Math.max(0, (active?.y ?? 40) - 40 / requested.zoom + Math.max(0, (active?.height ?? 0) + 80 / requested.zoom - readingHeight) * sceneProgress);
  const camera = { ...requested, y: requested.follow ? automaticY : requested.y };
  const visiblePartIds: string[] = [], visibleSceneIds = shown.map(block => block.id);
  context.save(); context.clearRect(0, 0, width, height); context.fillStyle = '#fafafa'; context.fillRect(0, 0, width, height);
  if (options.dots !== false) {
    context.fillStyle = '#e0e0e0';
    const spacing = 20 * pixelScale * camera.zoom, offsetX = ((-camera.x * camera.zoom) % spacing + spacing) % spacing, offsetY = ((-camera.y * camera.zoom) % spacing + spacing) % spacing;
    for (let x = offsetX; x < width; x += spacing) for (let y = offsetY; y < height; y += spacing) { context.beginPath(); context.arc(x, y, .85 * pixelScale, 0, Math.PI * 2); context.fill(); }
  }
  context.save(); context.scale(camera.zoom, camera.zoom); context.translate(-camera.x, -camera.y);
  for (const block of shown) for (const part of block.parts) {
    if (!revealed(part, block, lastByScene.get(block.id), block.id !== current.sceneId, progress)) continue;
    visiblePartIds.push(part.id); const x = block.x, y = block.y + part.y;
    context.font = (part.kind === 'text' || part.kind === 'table' ? part.font : 22) + 'px ' + family; context.textAlign = 'left'; context.textBaseline = 'alphabetic';
    if (part.kind === 'text') {
      const indent = part.bullet === undefined ? 0 : 28;
      if (part.title) {
        context.fillStyle = '#fff6b8';
        for (const [line, value] of part.lines.entries()) context.fillRect(x - 4, y + line * part.font * 1.5 + part.font * .4, Math.min(block.width + 8, context.measureText(value).width + 8), part.font * .85);
      }
      context.fillStyle = part.title ? '#7950ff' : '#262626';
      if (part.bullet !== undefined) context.fillText('•', x + 3, y + part.font);
      for (const [line, value] of part.lines.entries()) context.fillText(value, x + indent, y + part.font + line * part.font * 1.5);
    } else if (part.kind === 'table') {
      const cellWidth = block.width / part.cells.length;
      part.cells.forEach((lines, column) => {
        context.strokeStyle = '#999'; context.lineWidth = 1; context.strokeRect(x + column * cellWidth, y, cellWidth, part.height);
        context.fillStyle = '#262626'; context.font = (part.header ? '600 ' : '') + part.font + 'px ' + family;
        lines.forEach((line, row) => context.fillText(line, x + column * cellWidth + 10, y + 8 + part.font + row * part.font * 1.4));
      });
    } else if (part.kind === 'image') {
      const image = images.get(part.key);
      if (image?.complete && image.naturalWidth) {
        if (part.crop) {
          const crop = part.crop, targetWidth = crop.width * crop.scale, targetHeight = crop.height * crop.scale;
          context.drawImage(image, crop.x, crop.y, crop.width, crop.height, x + (block.width - targetWidth) / 2, y + (part.height - targetHeight) / 2, targetWidth, targetHeight);
        } else {
          const scale = Math.min(block.width / image.naturalWidth, part.height / image.naturalHeight);
          context.drawImage(image, x + (block.width - image.naturalWidth * scale) / 2, y, image.naturalWidth * scale, image.naturalHeight * scale);
        }
      } else {
        context.fillStyle = '#737373'; context.font = '20px ' + family;
        context.fillText('图片尚未就绪，请在完整讲稿中核对来源。', x, y + 30);
      }
    } else if (part.visual.kind === 'fraction_bars') {
      const scale = part.scale; context.font = 30 * scale + 'px ' + family;
      part.visual.terms.slice(0, 2).forEach((term, row) => {
        const top = y + row * 96 * scale; context.fillStyle = '#262626'; context.fillText(term.label + '  ' + term.numerator + '/' + term.denominator, x, top + 30 * scale);
        for (let cell = 0; cell < term.denominator; cell++) {
          const cellX = x + cell * block.width / term.denominator;
          context.fillStyle = cell < term.numerator ? (row ? '#e8e4ff' : '#dbeafe') : '#fafafa'; context.fillRect(cellX, top + 44 * scale, block.width / term.denominator, 32 * scale);
          context.strokeStyle = '#777'; context.strokeRect(cellX, top + 44 * scale, block.width / term.denominator, 32 * scale);
        }
      });
    }
  }
  context.restore();
  if (options.captions !== false) {
    context.font = '20px ' + originalUiFontFamily;
    const lines = whiteboardTextLines(current.text, width - 144, value => context.measureText(value).width), lineHeight = 26, boxHeight = lines.length * lineHeight + 20;
    context.fillStyle = '#fafafaf5'; context.fillRect(48, height - boxHeight - 12, width - 96, boxHeight);
    context.fillStyle = '#262626'; context.textAlign = 'center'; lines.forEach((line, row) => context.fillText(line, width / 2, height - boxHeight + 13 + row * lineHeight));
  }
  context.restore();
  return { camera, visibleSceneIds, visiblePartIds, worldHeight: Math.max(720, ...blocks.map(block => block.y + block.height + 40)), blocks };
}
