'use client';

import * as React from 'react';
import type { StudioWhiteboardScene } from '@study-agent/contracts';
import { whiteboardTableLayout, whiteboardTextLines } from './whiteboard-table';
import { splitClassroomSpeech } from '@study-agent/contracts';
import type { WhiteboardSpeechUnit } from '@study-agent/contracts';



function wrap(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number,
  lineHeight: number, maxLines = 5) {
  const chars = [...text], lines: string[] = [];
  let line = '';
  for (const char of chars) {
    const next = line + char;
    if (context.measureText(next).width > maxWidth && line) {
      lines.push(line); line = char;
      if (lines.length === maxLines) break;
    } else line = next;
  }
  if (line && lines.length < maxLines) lines.push(line);
  lines.forEach((item, index) => context.fillText(item, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function subtitleLines(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const chars = [...text], lines: string[] = [];
  let line = '';
  for (const char of chars) {
    const next = line + char;
    if (context.measureText(next).width > maxWidth && line) { lines.push(line); line = char; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export function drawWhiteboardScene(context: CanvasRenderingContext2D, scene: StudioWhiteboardScene, progress: number,
  pageImages?: Map<string, HTMLImageElement>, unit?: WhiteboardSpeechUnit) {
  const width = 1280, height = 720;
  context.clearRect(0, 0, width, height);
  const paper = context.createLinearGradient(0, 0, width, height);
  paper.addColorStop(0, '#fbfcf8'); paper.addColorStop(1, '#f5f7f2');
  context.fillStyle = paper; context.fillRect(0, 0, width, height);
  context.fillStyle = 'rgba(65, 79, 66, .045)';
  for (let x = 40; x < width; x += 40) for (let y = 40; y < height; y += 40) context.fillRect(x, y, 1, 1);
  context.fillStyle = '#152019'; context.fillRect(64, 57, 74, 4);
  context.font = '600 13px Arial'; context.fillStyle = '#738074';
  context.fillText('STUDYAGENT / LEARNING BOARD', 154, 66);
  context.textAlign = 'right'; context.fillText(scene.targetAtomIds ? 'AI GENERATED / CHECK CONTENT' : 'EVIDENCE GROUNDED', 1216, 66); context.textAlign = 'left';
  context.fillStyle = '#dbe4da'; context.fillRect(88, 88, 1104, 1);
  context.fillStyle = '#243229'; context.fillRect(88, 120, 52, 2);
  context.fillStyle = '#718474'; context.fillRect(145, 120, 96 * progress, 2);
  const compact = Boolean(scene.exhibit || scene.figure);
  context.font = compact ? '500 32px Georgia, "Microsoft YaHei UI", serif' : '500 47px Georgia, "Microsoft YaHei UI", serif'; context.fillStyle = '#111712';
  const titleBottom = wrap(context, scene.title, 88, compact ? 154 : 194, 1020, compact ? 42 : 58, 2);
  const sourceImage = scene.source ? pageImages?.get(scene.source.materialId + ':' + scene.source.page) : undefined;
  if (scene.source) {
    context.font = '600 14px Arial, "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#516857';
    context.fillText('来源页 · ' + scene.source.page, 92, titleBottom + 18);
    context.font = '13px Arial, "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#778179';
    context.fillText(scene.source.label, 198, titleBottom + 18);
  }
  let contentBottom = titleBottom + (scene.source ? 38 : 16);
  if (scene.figure) {
    const image = pageImages?.get(scene.figure.snapshotId), box = { x: 88, y: Math.max(206, titleBottom + 6), width: 610, height: 360 };
    context.fillStyle = '#fff'; context.fillRect(box.x, box.y, box.width, box.height); context.strokeStyle = '#d9dfd7'; context.strokeRect(box.x, box.y, box.width, box.height);
    if (image?.complete && image.naturalWidth) {
      const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight), width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      context.drawImage(image, box.x + (box.width - width) / 2, box.y + (box.height - height) / 2, width, height);
    } else { context.fillStyle = '#657268'; context.font = '18px "Microsoft YaHei UI", sans-serif'; context.fillText('原图片尚未完整读取，文字稿仍可阅读。', box.x + 18, box.y + 48); }
    context.font = '12px "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#657268';
    const lines = whiteboardTextLines(scene.figure.caption || scene.figure.alt, box.width, text => context.measureText(text).width), pages = Math.max(1, Math.ceil(lines.length / 3));
    const ratio = unit && scene.narration.length ? (unit.start + (unit.end - unit.start) * progress) / scene.narration.length : progress;
    const page = Math.min(pages - 1, Math.max(0, Math.floor(ratio * pages)));
    lines.slice(page * 3, page * 3 + 3).forEach((line, index) => context.fillText(line, box.x, 579 + index * 14));
  }
  if (scene.exhibit) {
    const top = titleBottom + 6, available = 594 - top, exhibitX = scene.figure ? 740 : 88, exhibitWidth = scene.figure ? 452 : 1104;
    if (scene.exhibit.kind === 'table') {
      try {
        const table = scene.exhibit, layout = whiteboardTableLayout(context, table, exhibitWidth, available);
        const ratio = unit && scene.narration.length ? (unit.start + (unit.end - unit.start) * progress) / scene.narration.length : progress;
        const pageIndex = Math.min(layout.pages.length - 1, Math.max(0, Math.floor(ratio * layout.pages.length))), rows = layout.pages[pageIndex];
        const drawRow = (cells: string[][], y: number, rowHeight: number, header = false) => {
          context.fillStyle = header ? '#e8ede6' : '#fff'; context.fillRect(exhibitX, y, exhibitWidth, rowHeight);
          cells.forEach((lines, column) => {
            context.strokeStyle = '#d9e1d5'; context.strokeRect(exhibitX + column * layout.columnWidth, y, layout.columnWidth, rowHeight);
            context.fillStyle = '#26382b'; context.font = (header ? '600 ' : '') + layout.font + 'px "Microsoft YaHei UI", sans-serif';
            lines.forEach((line, index) => context.fillText(line, exhibitX + 12 + column * layout.columnWidth, y + 10 + layout.font + index * layout.lineHeight));
          });
        };
        drawRow(layout.headerLines, top, layout.headerHeight, true); let y = top + layout.headerHeight;
        for (const row of rows) { drawRow(row.cells, y, row.height); y += row.height; }
        context.font = '12px "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#657268';
        context.fillText('对照表 ' + (pageIndex + 1) + ' / ' + layout.pages.length + ' · 第' + (rows[0].index + 1) + '—' + (rows.at(-1)!.index + 1) + '行 · 完整表格见讲稿', exhibitX + 4, 612);
      } catch {
        context.font = '20px "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#26382b'; context.fillText('请在完整讲稿中核对这张表格。', exhibitX + 4, top + 40);
      }
    } else {
      const exhibit = scene.exhibit;
      for (const font of [27, 23, 19, 15, 11, 9]) {
        context.font = font + 'px "Microsoft YaHei UI", sans-serif';
        const lines = whiteboardTextLines(exhibit.latex.replace(/\s+/gu, ' ').trim() + '\n\n' + exhibit.explanation.replace(/\s+/gu, ' ').trim(), exhibitWidth - 32, text => context.measureText(text).width);
        if (lines.length * (font + 8) > available && font !== 9) continue;
        context.fillStyle = '#26382b'; lines.forEach((line, index) => context.fillText(line, exhibitX + 10, top + font + index * (font + 8))); break;
      }
    }
  } else if (scene.kind === 'pdf_page' && sourceImage?.complete && sourceImage.naturalWidth) {
    const box = { x: 88, y: 276, width: 430, height: 318 }, scale = Math.min(box.width / sourceImage.naturalWidth,
      box.height / sourceImage.naturalHeight), drawWidth = sourceImage.naturalWidth * scale, drawHeight = sourceImage.naturalHeight * scale;
    context.fillStyle = '#fff'; context.fillRect(box.x, box.y, box.width, box.height);
    context.strokeStyle = '#d9dfd7'; context.lineWidth = 1; context.strokeRect(box.x, box.y, box.width, box.height);
    context.drawImage(sourceImage, box.x + (box.width - drawWidth) / 2, box.y + (box.height - drawHeight) / 2, drawWidth, drawHeight);
    context.font = '22px Arial, "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#354038';
    if (scene.body) contentBottom = wrap(context, scene.body, 552, 320, 618, 37, 6);
    contentBottom = Math.max(contentBottom, 500);
  } else if (scene.figure) {
    context.font = '19px "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#354038';
    if (scene.body) wrap(context, scene.body, 740, titleBottom + 42, 452, 28, 6);
    const indices = unit?.visibleBulletIndices ?? scene.bullets?.map((_, index) => index) ?? [];
    indices.slice(-3).forEach((index, row) => { context.fillStyle = '#66826c'; context.beginPath(); context.arc(748, 430 + row * 54, 4, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#303a32'; context.font = '16px "Microsoft YaHei UI", sans-serif'; wrap(context, scene.bullets![index], 765, 436 + row * 54, 420, 22, 2); });
  } else {
    context.font = '23px Arial, "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#354038';
    if (scene.body) contentBottom = wrap(context, scene.body, 92, contentBottom + 27, 1014, 36, 3);
  }
  const bulletsTop = scene.visual ? 500 : Math.max(350, contentBottom + 34);
  if (!scene.exhibit && !scene.figure && scene.bullets?.length) {
    const indices = unit?.visibleBulletIndices ?? scene.bullets.map((_, index) => index);
    const shown = indices.slice(-3);
    shown.forEach((index, row) => {
      const y = Math.min(bulletsTop, 390) + row * 62;
      context.fillStyle = '#66826c'; context.beginPath(); context.arc(104, y, 5, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#303a32'; context.font = '19px "Microsoft YaHei UI", sans-serif';
      wrap(context, scene.bullets![index], 126, y + 7, 980, 24, 2);
    });
    context.font = '13px "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#657268';
    context.fillText('完整要点与原文见讲稿 · ' + indices.length + ' / ' + scene.bullets.length, 92, 602);
  }
  const visual = scene.visual;
  if (visual?.kind === 'fraction_bars') {
    const barX = 252, barWidth = 748, top = 302;
    visual.terms.slice(0, 2).forEach((term, row) => {
      const y = top + row * 98;
      context.font = '21px Arial, "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#263029';
      context.fillText(term.label + '  ' + term.numerator + '/' + term.denominator, 90, y - 14);
      for (let part = 0; part < term.denominator; part += 1) {
        const px = barX + part * (barWidth / term.denominator);
        context.strokeStyle = '#6f7b71'; context.lineWidth = 1.5;
        context.strokeRect(px, y, barWidth / term.denominator, 48);
        if (part < term.numerator && progress > part / term.denominator) {
          context.fillStyle = row === 0 ? '#66846c' : '#8da38e';
          context.fillRect(px + 1, y + 1, barWidth / term.denominator - 2, 46);
        }
      }
    });
    context.font = '29px Georgia, serif'; context.fillStyle = '#202a21';
    context.fillText(visual.terms.map(term => term.numerator + '/' + term.denominator).join(' ' + visual.operator + ' ') +
      ' = ' + visual.result.numerator + '/' + visual.result.denominator, 252, 525);
  }
  context.fillStyle = 'rgba(248, 249, 245, .96)'; context.fillRect(74, 622, 1132, 72);
  context.strokeStyle = '#dbe1d9'; context.lineWidth = 1; context.strokeRect(74, 622, 1132, 72);
  context.font = '18px Arial, "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#4d5a50';
  subtitleLines(context, unit?.text ?? splitClassroomSpeech(scene.narration)[0]?.text ?? '', 1070).forEach((line, index, lines) => {
    context.fillText(line, 96, 643 + index * Math.min(24, 48 / Math.max(1, lines.length)));
  });
  context.fillStyle = '#dfe5dc'; context.fillRect(88, 700, 1104, 2);
  context.fillStyle = '#65806b'; context.fillRect(88, 700, 1104 * progress, 2);
}

export function WhiteboardScenePreview({ scene }: { scene: StudioWhiteboardScene }) {
  const canvas = React.useRef<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (context) drawWhiteboardScene(context, scene, .72);
  }, [scene]);
  return <canvas className="sa-whiteboard-preview-canvas" ref={canvas} width={1280} height={720}
    aria-label={scene.title} />;
}
