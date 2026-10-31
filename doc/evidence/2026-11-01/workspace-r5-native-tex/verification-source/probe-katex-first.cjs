const katex = require('katex');
for (const latex of ['\\frac{1}{2}+x^2=3', '\\sqrt[3]{8}', '\\left(\\frac{a}{b}\\right)', '\\frac{a+b}{c-d}', '\\alpha+\\beta\\leq 2', '\\mathrm{kg}', '\\text{cm}', '\\dfrac{1}{2}', '\\sin x', 'x_1^2', '\\begin{matrix}1&2\\\\3&4\\end{matrix}', '\\overline{AB}']) {
  const result = katex.renderToString(latex, { output: 'mathml', trust: false, strict: 'error', throwOnError: true, maxExpand: 200, maxSize: 4 });
  console.log(JSON.stringify({ latex, result }));
}
