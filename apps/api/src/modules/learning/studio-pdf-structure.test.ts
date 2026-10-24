import { describe, expect, it } from 'vitest';
import { mergeStudioPdfPages, RawStudioPdfPage } from './studio-pdf-structure';

function page(pageNumber: number, method: RawStudioPdfPage['method'] = 'pdf_text'): RawStudioPdfPage {
  return { pageNumber, method, text: '1/2 + 1/3 = 5/6', lines: [
    { text: '1/2 + 1/3 = 5/6', confidence: 0.9 },
  ], blocks: [], tables: [], formulas: [{ id: 'raw-formula', kind: 'formula', latex: '1/2+1/3=5/6',
    plainText: '1/2 + 1/3 = 5/6', confidence: 0.9, reviewRequired: true }], confidence: 0.9,
    warnings: ['formula_structure_requires_review'], imagePath: '/page.png' };
}

describe('mergeStudioPdfPages', () => {
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
