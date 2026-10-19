'use client';
import * as React from 'react';
import renderMathInElement from 'katex/contrib/auto-render';

/** Markup has already been sanitized by the library API. Math never enables trusted TeX. */
export function RichMath({ html }: { html: string }) {
  const element = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (element.current) renderMathInElement(element.current, { throwOnError: false, trust: false, strict: 'ignore', maxExpand: 500,
      delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }],
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'] });
  }, [html]);
  return <div className="library-rich" ref={element} dangerouslySetInnerHTML={{ __html: html }} />;
}
