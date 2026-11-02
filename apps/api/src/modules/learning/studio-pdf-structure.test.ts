import { describe, expect, it } from 'vitest';
import { mergeStudioPdfPages, RawStudioPdfPage } from './studio-pdf-structure';
import { validStudioPdfTableCells } from '@study-agent/contracts';

function page(pageNumber: number, method: RawStudioPdfPage['method'] = 'pdf_text'): RawStudioPdfPage {
  return { pageNumber, method, text: '1/2 + 1/3 = 5/6', lines: [
    { text: '1/2 + 1/3 = 5/6', confidence: 0.9 },
  ], blocks: [], tables: [], formulas: [{ id: 'raw-formula', kind: 'formula', latex: '1/2+1/3=5/6',
    plainText: '1/2 + 1/3 = 5/6', confidence: 0.9, reviewRequired: true }], confidence: 0.9,
    warnings: ['formula_structure_requires_review'], imagePath: '/page.png' };
}

describe('mergeStudioPdfPages', () => {
  const merged = () => ({ id: 'original-table', kind: 'table' as const, headers: ['Group', '', 'Total'], rows: [['Shared', '10', '20'], ['', '30', '40']],
    plainText: 'Original source', confidence: 1, reviewRequired: true, cells: [
      { row: 0, column: 0, rowSpan: 1, columnSpan: 2, text: 'Group' }, { row: 0, column: 2, rowSpan: 1, columnSpan: 1, text: 'Total' },
      { row: 1, column: 0, rowSpan: 2, columnSpan: 1, text: 'Shared' }, { row: 1, column: 1, rowSpan: 1, columnSpan: 1, text: '10' },
      { row: 1, column: 2, rowSpan: 1, columnSpan: 1, text: '20' }, { row: 2, column: 1, rowSpan: 1, columnSpan: 1, text: '30' },
      { row: 2, column: 2, rowSpan: 1, columnSpan: 1, text: '40' },
    ] });
  it('keeps original merged geometry when a model offers a flattened or missing table', () => {
    const original = page(1); original.tables = [merged(), { ...merged(), id: 'second-table' }];
    const result = mergeStudioPdfPages([original], { pages: [{ pageNumber: 1, paragraphs: [], formulas: [],
      tables: [{ headers: ['Changed', 'Total'], rows: [['Shared', '40']], confidence: 0.99 }], warnings: [] }] });
    expect(result.pages[0].blocks?.filter(block => block.kind === 'table')).toEqual(original.tables);
    expect(result.pages[0].warnings).toContain('model_table_geometry_retained');
    expect(result.structure.reviewRequired).toBe(true);
  });
  it('rejects overlapping, missing, out of bounds or text-hiding cell geometry', () => {
    const table = merged(); expect(validStudioPdfTableCells(table.headers, table.rows, table.cells)).toBe(true);
    const invalid = [table.cells.slice(1), [...table.cells, table.cells[0]], table.cells.map((cell, index) => index === 0 ? { ...cell, rowSpan: 4 } : cell),
      table.cells.map((cell, index) => index === 0 ? { ...cell, column: 1.5 } : cell), table.cells.map((cell, index) => index === 0 ? { ...cell, text: 'Another text' } : cell)];
    for (const cells of invalid) {
      const original = page(1); original.tables = [{ ...table, cells }];
      expect(() => mergeStudioPdfPages([original], null)).toThrow('invalid_processor_output');
    }
    expect(validStudioPdfTableCells(table.headers, [['Shared', '10', '20'], ['Hidden condition', '30', '40']], table.cells)).toBe(false);
  });
  it('keeps legacy plain grids unchanged and does not infer a merge from empty text', () => {
    const { cells: _cells, ...table } = merged(), original = page(1); original.tables = [table];
    expect(mergeStudioPdfPages([original], null).pages[0].blocks?.find(block => block.kind === 'table')).toEqual(table);
  });
  it('uses model page structure without inventing pages that were not reviewed', () => {
    const result = mergeStudioPdfPages([page(1, 'ocr'), page(2, 'ocr')], { pages: [{
      pageNumber: 1, paragraphs: [{ text: '分数加法', confidence: 0.92 }],
      formulas: [{ latex: '\\frac{1}{2}+\\frac{1}{3}=\\frac{5}{6}', plainText: '1/2 + 1/3 = 5/6', confidence: 0.9 }],
      tables: [], warnings: [],
    }] }, { modelAttempted: true });
    expect(result.pages[0].blocks?.some(block => block.kind === 'formula')).toBe(true);
    expect(result.pages[1].blocks?.[0].id).toBe('raw-formula');
    expect(result.structure.modelSource).toBe('xiaojiu_cli');
    expect(result.structure.warnings).toContain('model_review_page_limit');
    expect(result.pages[0].text).toBe(page(1).text);
    expect(result.pages[0].blocks?.some(block=>block.kind==='paragraph'&&block.text==='分数加法')).toBe(true);
    expect(result.pages[0].warnings).toContain('model_paragraphs_require_original_review');
  });

  it('keeps local structure explicit when model review was not requested', () => {
    const result = mergeStudioPdfPages([page(1)], null, { modelAttempted: false });
    expect(result.structure.modelSource).toBeNull();
    expect(result.structure.reviewRequired).toBe(true);
    expect(result.structure.warnings).not.toContain('model_structure_review_unavailable');
  });
});
