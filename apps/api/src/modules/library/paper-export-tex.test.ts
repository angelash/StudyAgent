import { describe, expect, it } from 'vitest';
import { paperExportTex } from './paper-export-tex';
import { buildPaperExportDocument } from './paper-export-document-source';
import { fixture } from './paper-export-fixture.spec';

describe('source-preserving workbench TeX for native paper books', () => {
  it('converts the three workbench delimiters into native MathML with exact TeX annotations', () => {
    const input = '<p>BEFORE &amp; \\(\\frac{1}{2}+x_1^2\\) BETWEEN \\[\\sqrt[3]{8}\\] AND $$a+b$$ AFTER</p>';
    const result = paperExportTex(input);
    expect(result).toContain('BEFORE &amp; '); expect(result).toContain(' AFTER</p>');
    expect(result.match(/<math\b/g)).toHaveLength(3); expect(result.match(/display="block"/g)).toHaveLength(2);
    expect(result).toContain('<mfrac><mn>1</mn><mn>2</mn></mfrac>'); expect(result).toContain('<msubsup>');
    expect(result).toContain('<mroot><mn>8</mn><mn>3</mn></mroot>');
    expect(result).toContain('<annotation encoding="application/x-tex">\\frac{1}{2}+x_1^2</annotation>');
  });
  it('decodes entities only inside the formula and preserves every nonformula source byte', () => {
    const input = '<DIV data-original="keep &amp; \\(attribute\\)">  RAW &#x41; \\(a &lt; b &amp; \\text{cm}\\) tail &nbsp; </DIV>';
    const result = paperExportTex(input);
    expect(result.startsWith('<DIV data-original="keep &amp; \\(attribute\\)">  RAW &#x41; ')).toBe(true);
    // A raw alignment ampersand is invalid KaTeX: the whole original field wins.
    expect(result).toBe(input);
    const valid = input.replace(' b &amp; ', ' b+');
    expect(paperExportTex(valid)).toContain('<mo>&lt;</mo>');
    expect(paperExportTex(valid).endsWith(' tail &nbsp; </DIV>')).toBe(true);
  });
  it('keeps attributes, ignored elements, comments, unsupported markup and existing MathML intact', () => {
    const ignored = '<code>\\(literal\\)</code><pre>$$literal$$</pre><textarea>\\[literal\\]</textarea><math><mi>x</mi></math><!--original--><video>original</video>';
    const input = '<p title="\\(attribute\\)">\\(x+1\\)</p>' + ignored;
    const result = paperExportTex(input);
    expect(result).toContain('<p title="\\(attribute\\)"><math'); expect(result.endsWith(ignored)).toBe(true);
    expect(paperExportTex(ignored)).toBe(ignored);
  });
  it('retains an entire field on malformed, unmatched, untrusted or over-budget formulas', () => {
    const values = ['\\(x+1\\) then \\(\\notARealCommand{a}\\)', '\\(\\frac{1}{2}\\)', '\\(\\text{' + 'a'.repeat(2001) + '}\\)', '\\(\\def\\a{\\a}\\a\\)', '\\(x\\)'.repeat(257), '<p>\\(a</p><p>b\\)</p>'];
    for (const value of values) {
      if (value === '\\(\\frac{1}{2}\\)') expect(paperExportTex(value)).toContain('<mfrac>');
      else expect(paperExportTex(value)).toBe(value);
    }
    expect(paperExportTex('UNFINISHED \\(x+1')).toBe('UNFINISHED \\(x+1');
    const injected = paperExportTex('\\(\\href{https://untrusted.example}{x}\\)');
    expect(injected).not.toContain('<a '); expect(injected).not.toContain('href=');
  });
  it('does not share macro mutations across formulas or fields', () => {
    paperExportTex('\\(\\gdef\\privateMacro{5}\\privateMacro\\)');
    expect(paperExportTex('\\(\\privateMacro\\)')).toBe('\\(\\privateMacro\\)');
  });
  it('keeps invalid commands inside braces whole and correctly pairs valid escaped braces', () => {
    const invalid = '\\(\\text{inside \\)}+\\{x\\}\\) outside';
    expect(paperExportTex(invalid)).toBe(invalid);
    const value = '\\(\\{x\\}+\\frac{1}{2}\\) outside';
    const result = paperExportTex(value);
    expect(result.endsWith(' outside')).toBe(true); expect(result).toContain('<annotation encoding="application/x-tex">');
    expect(result).toContain('\\{x\\}+\\frac{1}{2}');
  });
  it('reconstructs exact old frozen books with unused TeX before using the new conversion', async () => {
    const f = fixture(), original = { title: '<p>Original without formulas</p>', options: [], answer: '<p>\\(\\frac{1}{2}\\)</p>', details: null };
    const resolved = [{ item: f.items[0], original }] as any;
    const input = { title: 'Original title', layout: f.document.layout, resolved, repo: { media() { throw Error('No image required'); } } };
    const fresh = await buildPaperExportDocument(input);
    expect(fresh.document.items[0].reference!.answerHtml).toContain('<mfrac>');
    const legacy = structuredClone(fresh.document); legacy.items[0].reference!.answerHtml = original.answer;
    expect((await buildPaperExportDocument({ ...input, frozenDocument: legacy })).document).toEqual(legacy);
    expect((await buildPaperExportDocument({ ...input, frozenDocument: fresh.document })).document).toEqual(fresh.document);
    expect(original.answer).toBe('<p>\\(\\frac{1}{2}\\)</p>');
    original.title = '<p>Changed source</p>';
    expect((await buildPaperExportDocument({ ...input, frozenDocument: legacy })).document).not.toEqual(legacy);
  });
});
