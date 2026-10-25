import katex from 'katex';

/** MathML remains self-contained offline; raw model strings never become HTML. */
export function formulaMathMl(latex: string) {
  return katex.renderToString(latex, { output: 'mathml', displayMode: true, trust: false, throwOnError: false, strict: 'ignore', maxExpand: 200, maxSize: 4 });
}
