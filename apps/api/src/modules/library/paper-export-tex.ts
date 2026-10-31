import katex from 'katex';
import { Parser } from 'htmlparser2';

const fieldLimit = 8 * 1024 * 1024;
const ignored = new Set(['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option', 'math']);
const delimiters = [{ left: '$$', right: '$$', display: true }, { left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }];

function decodeText(value: string) {
  let result = '';
  const parser = new Parser({ ontext(text) { result += text; }, onopentag() { throw Error('Text node required'); } }, { decodeEntities: true });
  parser.end(value); return result;
}

/** Match the workbench's delimiters and brace/escape handling. The original
 * markup stays authoritative: a failed field reaches per-book preflight whole. */
export function paperExportTex(value: string): string {
  if (Buffer.byteLength(value) > fieldLimit || !/\\\(|\\\[|\$\$/.test(value)) return value;
  try {
    const edits: Array<{ start: number; end: number; text: string }> = [], stack: string[] = [];
    let formulaCount = 0, generatedBytes = 0;
    const parser = new Parser({
      onopentag(name) { stack.push(name); },
      onclosetag() { stack.pop(); },
      ontext(raw) {
        if (stack.some(name => ignored.has(name))) return;
        const base = parser.startIndex;
        if (value.slice(base, parser.endIndex + 1) !== raw) throw Error('Exact text positions required');
        let cursor = 0;
        while (cursor < raw.length) {
          const candidates = delimiters.map(delimiter => ({ ...delimiter, start: raw.indexOf(delimiter.left, cursor) })).filter(row => row.start >= 0).sort((a, b) => a.start - b.start);
          if (!candidates.length) break;
          const found = candidates[0], start = found.start + found.left.length;
          let end = start, braces = 0;
          for (; end < raw.length; end++) {
            if (braces <= 0 && raw.startsWith(found.right, end)) break;
            if (raw[end] === '\\') end++;
            else if (raw[end] === '{') { if (++braces > 100) throw Error('Formula depth exceeded'); }
            else if (raw[end] === '}') braces--;
          }
          if (end >= raw.length) break;
          const latex = decodeText(raw.slice(start, end));
          if (!latex.trim() || Buffer.byteLength(latex) > 2000 || ++formulaCount > 256) throw Error('Formula budget exceeded');
          const output = katex.renderToString(latex, { output: 'mathml', displayMode: found.display, trust: false, strict: 'error', throwOnError: true, maxExpand: 200, maxSize: 4 });
          const math = /<math(?:\s|>)[\s\S]*?<\/math>/.exec(output)?.[0];
          if (!math || Buffer.byteLength(math) > 128 * 1024 || (generatedBytes += Buffer.byteLength(math)) > fieldLimit) throw Error('Generated formula budget exceeded');
          edits.push({ start: base + found.start, end: base + end + found.right.length, text: math });
          cursor = end + found.right.length;
        }
      },
    }, { decodeEntities: false, lowerCaseTags: true });
    parser.end(value);
    let previous = 0, result = '';
    for (const edit of edits) {
      if (edit.start < previous || edit.end > value.length) throw Error('Overlapping formula');
      result += value.slice(previous, edit.start) + edit.text; previous = edit.end;
      if (Buffer.byteLength(result) > fieldLimit) throw Error('Field budget exceeded');
    }
    result += value.slice(previous);
    return Buffer.byteLength(result) <= fieldLimit ? result : value;
  } catch { return value; }
}
