/** A bounded arithmetic parser. No variables, function calls, property access or JS evaluation. */
export function arithmeticValue(input: unknown): number | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const superscripts = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const source = String(input).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, value => `^{${[...value].map(char => char === '⁺' ? '+' : char === '⁻' ? '-' : superscripts.indexOf(char)).join('')}}`)
    .normalize('NFKC').replace(/\s+/g, '').replace(/\\(?:left|right)/g, '')
    .replace(/\\(?:times|cdot)|[×·]/g, '*').replace(/\\div|÷/g, '/').replace(/[−–]/g, '-');
  if (!source || source.length > 300) return null;
  let cursor = 0, operations = 0, depth = 0;
  const finite = (value: number) => { if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error('arithmetic_range'); return value; };
  const tick = () => { if (++operations > 300) throw new Error('arithmetic_limit'); };
  function primary(): number {
    tick(); if (++depth > 30) throw new Error('arithmetic_depth');
    try {
      if (source.startsWith('\\frac', cursor) || source.startsWith('\\dfrac', cursor) || source.startsWith('\\tfrac', cursor)) {
        cursor += source[cursor + 1] === 'f' ? 5 : 6;
        if (source[cursor] !== '{') throw new Error('fraction_group'); const numerator = primary();
        if (source[cursor] !== '{') throw new Error('fraction_group'); const denominator = primary();
        return finite(numerator / denominator);
      }
      if (source[cursor] === '(' || source[cursor] === '{') {
        const end = source[cursor++] === '(' ? ')' : '}'; const value = sum(); if (source[cursor++] !== end) throw new Error('unclosed_group'); return value;
      }
      const number = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(source.slice(cursor)); if (!number) throw new Error('arithmetic_token'); cursor += number[0].length;
      return finite(Number(number[0]));
    } finally { depth--; }
  }
  function power(): number { const value = primary(); if (source[cursor] !== '^') return value; cursor++; const exponent = unary(); if (!Number.isInteger(exponent) || Math.abs(exponent) > 12) throw new Error('exponent_range'); return finite(value ** exponent); }
  function unary(): number { tick(); if (source[cursor] === '+') { cursor++; return unary(); } if (source[cursor] === '-') { cursor++; return -unary(); } return power(); }
  function product(): number { let value = unary(); while (source[cursor] === '*' || source[cursor] === '/') { tick(); const op = source[cursor++], next = unary(); value = finite(op === '*' ? value * next : value / next); } return value; }
  function sum(): number { let value = product(); while (source[cursor] === '+' || source[cursor] === '-') { tick(); const op = source[cursor++], next = product(); value = finite(op === '+' ? value + next : value - next); } return value; }
  try { const value = finite(sum()); return cursor === source.length ? value : null; } catch { return null; }
}
