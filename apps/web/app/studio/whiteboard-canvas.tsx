'use client';

import * as React from 'react';
import type { StudioWhiteboardScene } from '@study-agent/contracts';
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
  context.textAlign = 'right'; context.fillText('EVIDENCE GROUNDED', 1216, 66); context.textAlign = 'left';
  context.fillStyle = '#dbe4da'; context.fillRect(88, 88, 1104, 1);
  context.fillStyle = '#243229'; context.fillRect(88, 120, 52, 2);
  context.fillStyle = '#718474'; context.fillRect(145, 120, 96 * progress, 2);
  context.font = '500 47px Georgia, "Microsoft YaHei UI", serif'; context.fillStyle = '#111712';
  const titleBottom = wrap(context, scene.title, 88, 194, 1020, 58, 2);
  const sourceImage = scene.source ? pageImages?.get(scene.source.materialId + ':' + scene.source.page) : undefined;
  if (scene.source) {
    context.font = '600 14px Arial, "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#516857';
    context.fillText('来源页 · ' + scene.source.page, 92, titleBottom + 18);
    context.font = '13px Arial, "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#778179';
    context.fillText(scene.source.label, 198, titleBottom + 18);
  }
  let contentBottom = titleBottom + (scene.source ? 38 : 16);
  if (scene.kind === 'pdf_page' && sourceImage?.complete && sourceImage.naturalWidth) {
    const box = { x: 88, y: 276, width: 430, height: 318 }, scale = Math.min(box.width / sourceImage.naturalWidth,
      box.height / sourceImage.naturalHeight), drawWidth = sourceImage.naturalWidth * scale, drawHeight = sourceImage.naturalHeight * scale;
    context.fillStyle = '#fff'; context.fillRect(box.x, box.y, box.width, box.height);
    context.strokeStyle = '#d9dfd7'; context.lineWidth = 1; context.strokeRect(box.x, box.y, box.width, box.height);
    context.drawImage(sourceImage, box.x + (box.width - drawWidth) / 2, box.y + (box.height - drawHeight) / 2, drawWidth, drawHeight);
    context.font = '22px Arial, "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#354038';
    if (scene.body) contentBottom = wrap(context, scene.body, 552, 320, 618, 37, 6);
    contentBottom = Math.max(contentBottom, 500);
  } else {
    context.font = '23px Arial, "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#354038';
    if (scene.body) contentBottom = wrap(context, scene.body, 92, contentBottom + 27, 1014, 36, 3);
  }
  const bulletsTop = scene.visual ? 500 : Math.max(350, contentBottom + 34);
  if (scene.bullets?.length) {
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
