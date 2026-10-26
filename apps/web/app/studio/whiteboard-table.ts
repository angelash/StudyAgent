import type { StudioWhiteboardExhibit } from '@study-agent/contracts';
type Table = Extract<StudioWhiteboardExhibit, { kind: 'table' }>;
export function whiteboardTextLines(text: string, width: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const char of paragraph) {
      if (line && measure(line + char) > width) { lines.push(line); line = char; } else line += char;
    }
    lines.push(line);
  }
  return lines;
}
export type WhiteboardTableLayout = { font: number; lineHeight: number; columnWidth: number; headerLines: string[][];
  headerHeight: number; pages: Array<Array<{ index: number; cells: string[][]; height: number }>> };
/** Every cell is retained. Pagination takes place between complete rows only. */
export function whiteboardTableLayout(context: CanvasRenderingContext2D, table: Table, width: number, height: number, family = '"Microsoft YaHei UI", sans-serif'): WhiteboardTableLayout {
  const columnWidth = width / table.headers.length;
  for (const font of [18, 16, 14, 12, 10, 8]) {
    context.font = font + 'px ' + family; const lineHeight = font + 4;
    const lines = (text: string) => whiteboardTextLines(text.replace(/\s+/gu, ' ').trim(), columnWidth - 24, text => context.measureText(text).width);
    const headerLines = table.headers.map(lines), headerHeight = Math.max(...headerLines.map(value => value.length)) * lineHeight + 20;
    const rows = table.rows.map((row, index) => { const cells = row.map(lines); return { index, cells, height: Math.max(...cells.map(value => value.length)) * lineHeight + 20 }; });
    if (rows.some(row => headerHeight + row.height > height)) continue;
    const pages: WhiteboardTableLayout['pages'] = []; let current: typeof rows = [], used = headerHeight;
    for (const row of rows) {
      if (current.length && used + row.height > height) { pages.push(current); current = []; used = headerHeight; }
      current.push(row); used += row.height;
    }
    if (current.length) pages.push(current);
    return { font, lineHeight, columnWidth, headerLines, headerHeight, pages };
  }
  throw new Error('完整表格无法在当前画面排版，请阅读旁边的完整表格。');
}
