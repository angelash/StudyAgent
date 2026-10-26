import { describe, expect, it } from 'vitest';
import { whiteboardTableLayout } from '../../../../web/app/studio/whiteboard-table';

function context() {
  const stub = { font: '18px sans-serif', measureText(text: string) { return { width: [...text].length * Number.parseFloat(this.font) }; } };
  return stub as unknown as CanvasRenderingContext2D;
}
describe('complete whiteboard table pagination', () => {
  it('keeps every bounded long Unicode cell and complete row across pages within the canvas space', () => {
    for (const columns of [2, 3, 5]) {
      const table = { kind: 'table' as const, headers: Array.from({ length: columns }, (_, index) => '表头' + index + '完整标题'.repeat(24)),
        rows: Array.from({ length: 12 }, (_, row) => Array.from({ length: columns }, (_, column) => row + ':' + column + ':' + '完整条件与单位'.repeat(30))) };
      const layout = whiteboardTableLayout(context(), table, 1104, 350), rows = layout.pages.flat();
      expect(rows.map(row => row.index)).toEqual(Array.from({ length: 12 }, (_, index) => index));
      expect(rows.map(row => row.cells.map(lines => lines.join('')))).toEqual(table.rows);
      expect(layout.headerLines.map(lines => lines.join(''))).toEqual(table.headers);
      for (const page of layout.pages) expect(layout.headerHeight + page.reduce((sum, row) => sum + row.height, 0)).toBeLessThanOrEqual(350);
    }
  });
  it('compacts repeated visual whitespace while retaining every word in table cells and the unchanged original source', () => {
    const table = { kind: 'table' as const, headers: ['比较条件', '原观察'], rows: Array.from({ length: 12 }, (_, row) => [String(row), '先核对\n\n'.repeat(35)]) };
    const original = JSON.stringify(table), layout = whiteboardTableLayout(context(), table, 1104, 350);
    expect(layout.pages.flat().map(row => row.cells[1].join(''))).toEqual(table.rows.map(row => row[1].replace(/\s+/gu, ' ').trim()));
    expect(JSON.stringify(table)).toBe(original);
  });
});
