import type { StudioPdfTableCell } from './studio';

/** A complete non-overlapping tiling; blank text alone never implies a merge. */
export function validStudioPdfTableCells(headers: string[], rows: string[][], input: unknown): input is StudioPdfTableCell[] {
  const grid = [headers, ...rows], width = headers.length, height = grid.length;
  if (!width || width > 256 || height > 2048 || height * width > 32768 ||
      grid.some(row => row.length !== width) || !Array.isArray(input) || !input.length || input.length > height * width) return false;
  const occupied = new Set<number>();
  for (const cell of input) {
    if (!cell || typeof cell !== 'object' || ![cell.row, cell.column, cell.rowSpan, cell.columnSpan].every(Number.isSafeInteger) ||
        cell.row < 0 || cell.column < 0 || cell.rowSpan < 1 || cell.columnSpan < 1 ||
        cell.row + cell.rowSpan > height || cell.column + cell.columnSpan > width || cell.text !== grid[cell.row][cell.column]) return false;
    for (let r = cell.row; r < cell.row + cell.rowSpan; r++) for (let c = cell.column; c < cell.column + cell.columnSpan; c++) {
      const index = r * width + c;
      if (occupied.has(index) || ((r !== cell.row || c !== cell.column) && grid[r][c] !== '')) return false;
      occupied.add(index);
    }
  }
  return occupied.size === height * width;
}
