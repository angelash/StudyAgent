import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { renderWhiteboardFormula, whiteboardFormulaKey, whiteboardFormulaPages, WhiteboardFormulaError } from '../../../../web/app/studio/whiteboard-formula';

describe('bounded local vector math and complete video pagination', () => {
  it('draws actual fraction bars, radicals, powers and multi-line alignment without external glyph dependencies', async () => {
    for (const latex of ['\\frac{1}{2}+\\frac{1}{3}=\\frac{5}{6}', '\\sqrt{x^2+y^2}=\\sqrt{r^2}',
      '\\left(\\frac{a}{b}\\right)^2+\\sqrt[3]{x}', '\\begin{aligned}a&=b+c\\\\\\frac{d}{e}&=f\\end{aligned}', '\\frac{1}{2}\\text{个整体}']) {
      const formula = renderWhiteboardFormula(latex); expect(formula.latex).toBe(latex); expect(formula.key).toBe(whiteboardFormulaKey(latex));
      expect(formula.svg).toContain('<path'); expect(formula.svg).not.toMatch(/(?:href=|<script|foreignObject|<image|url\()/iu);
      const result = await sharp(Buffer.from(formula.svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect([result.info.width, result.info.height]).toEqual([formula.width, formula.height]);
      let ink = 0; for (let index = 3; index < result.data.length; index += 4) if (result.data[index] > 0) ink++;
      expect(ink).toBeGreaterThan(30);
    }
  });
  it('does not execute links, HTML, unknown macros or recursive definitions and preserves the exact caller source', () => {
    for (const latex of ['\\href{javascript:alert(1)}{x}', '\\includegraphics{https://invalid.test/image.png}', '\\htmlClass{attack}{x}',
      '\\unknownprivate{123}', '\\def\\loop{\\loop}\\loop', 'x'.repeat(601), '\\rule{1000000em}{1em}']) {
      expect(() => renderWhiteboardFormula(latex)).toThrow(WhiteboardFormulaError); expect(latex.length).toBeGreaterThan(0);
    }
  });
  it('keeps macro definitions local to one formula and uses the complete original source in the immutable content identity', () => {
    const first = renderWhiteboardFormula('\\newcommand{\\uniqueprobe}{x}\\uniqueprobe'); expect(first.svg).toContain('<path');
    expect(() => renderWhiteboardFormula('\\uniqueprobe')).toThrow(WhiteboardFormulaError);
    expect(renderWhiteboardFormula('x+1').key).not.toBe(renderWhiteboardFormula('x+2').key);
    expect(Object.isFrozen(first)).toBe(true); expect(renderWhiteboardFormula('x+1')).toBe(renderWhiteboardFormula('x+1'));
  });
  it('pages the full longest permitted line and tall alignment with overlap, readable scale and complete first/last extents', () => {
    for (const [width, height] of [[16964, 32], [800, 4000], [1200, 1400], [180, 74]]) for (const availableWidth of [452, 1104]) {
      const layout = whiteboardFormulaPages(width, height, availableWidth, 320); expect(layout.scale).toBeGreaterThanOrEqual(.8);
      expect(layout.pages[0]).toMatchObject({ x: 0, y: 0 }); const last = layout.pages.at(-1)!;
      expect(last.x + last.width).toBeCloseTo(width, 3); expect(last.y + last.height).toBeCloseTo(height, 3);
      for (const page of layout.pages) { expect(page.width * layout.scale).toBeLessThanOrEqual(availableWidth + .001); expect(page.height * layout.scale).toBeLessThanOrEqual(320 + .001); }
      for (const y of [0, height / 3, height / 2, height - 1]) for (let x = 0; x < width; x += 37)
        expect(layout.pages.some(page => x >= page.x && x <= page.x + page.width && y >= page.y && y <= page.y + page.height)).toBe(true);
    }
  });
});
