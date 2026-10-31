import { describe, expect, it } from 'vitest';
import { rewritePaperExportImages } from './paper-export-document-source';

describe('complete original markup image adapter', () => {
  it('keeps MathML, ruby, tables and unsupported markup for the actual parser to assess', () => {
    const raw = '<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math><ruby>字<rt>zi</rt></ruby><table><tr><td>甲</td></tr></table><script>unsupported()</script>';
    expect(rewritePaperExportImages(raw, () => { throw Error('no images'); })).toBe(raw);
  });
  it('decodes only image attributes and preserves surrounding raw text, entities and full tag attributes', () => {
    const seen: string[] = [], raw = '前🙂&amp;<IMG SRC="https://synthetic.example/a?x=1&amp;y=2" alt="原图&amp;说明" onerror="untrusted()"/>后';
    const result = rewritePaperExportImages(raw, url => { seen.push(url); return 'media/' + 'a'.repeat(64) + '.png'; });
    expect(seen).toEqual(['https://synthetic.example/a?x=1&y=2']);
    expect(result).toBe('前🙂&amp;<img src="media/' + 'a'.repeat(64) + '.png" alt="原图&amp;说明" onerror="untrusted()">后');
  });
  it('rejects duplicate image and non-image attributes instead of hiding ambiguous original content', () => {
    for (const raw of ['<img src="one" SRC="two" alt="图">', '<p title="one" TITLE="two">正文</p>'])
      expect(() => rewritePaperExportImages(raw, url => url)).toThrow('重复属性');
  });
  it('retains all occurrences, order and paper-local URL decisions', () => {
    let index = 0;
    expect(rewritePaperExportImages('<p>甲</p><img src="same" alt="甲"><p>乙</p><img src="same" alt="乙">', () => 'source-' + ++index))
      .toBe('<p>甲</p><img src="source-1" alt="甲"><p>乙</p><img src="source-2" alt="乙">');
  });
});
