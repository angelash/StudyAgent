import { mathjax } from '@mathjax/src/cjs/mathjax.js';
import { TeX } from '@mathjax/src/cjs/input/tex.js';
import { SVG } from '@mathjax/src/cjs/output/svg.js';
import { liteAdaptor } from '@mathjax/src/cjs/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/cjs/handlers/html.js';
import { LiteElement, type LiteNode } from '@mathjax/src/cjs/adaptors/lite/Element.js';
import { MathJaxNewcmFont } from '@mathjax/mathjax-newcm-font/cjs/svg.js';
import '@mathjax/src/cjs/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/cjs/input/tex/newcommand/NewcommandConfiguration.js';

export const WHITEBOARD_FORMULA_VERSION = 'mathjax4-svg-v1' as const;
export class WhiteboardFormulaError extends Error {}
export type WhiteboardFormula = { version: typeof WHITEBOARD_FORMULA_VERSION; key: string; latex: string; svg: string; width: number; height: number };
export const whiteboardFormulaKey = (latex: string) => WHITEBOARD_FORMULA_VERSION + ':' + latex;
const adaptor = liteAdaptor(); RegisterHTMLHandler(adaptor);
const cache = new Map<string, WhiteboardFormula>(); let cachedCharacters = 0;
const tags = new Set(['svg', 'g', 'path', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan']);
const numbers = /^[+\-eE0-9.,\s]+$/u, scalar = /^[+\-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+\-]?\d+)?(?:px|em|ex|%)?$/iu;
const transforms = /^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([+\-eE0-9.,\s]+\)\s*)+$/u;
function fail(code: string): never { throw new WhiteboardFormulaError(code); }

/** Local TeX only. A fresh parser prevents one author's macro from leaking into another formula. */
export function renderWhiteboardFormula(latex: string): WhiteboardFormula {
  if (typeof latex !== 'string' || !latex.trim() || latex.length > 600) fail('formula_source_budget');
  const key = whiteboardFormulaKey(latex), cached = cache.get(key); if (cached) return cached;
  try {
    const input = new TeX({ packages: ['base', 'ams', 'newcommand'], maxBuffer: 2000, maxMacros: 200,
      formatError: () => fail('formula_parse_failed') });
    const output = new SVG({ fontData: MathJaxNewcmFont, fontCache: 'none' });
    const document = mathjax.document('', { InputJax: input, OutputJax: output });
    const container = document.convert(latex, { display: true, em: 32, ex: 16, containerWidth: 1104 });
    const first = adaptor.firstChild(container);
    if (!(first instanceof LiteElement) || adaptor.kind(first) !== 'svg') fail('formula_svg_missing');
    const svg = first;
    const box: number[] = String(adaptor.getAttribute(svg, 'viewBox') ?? '').trim().split(/\s+/).map(Number);
    if (box.length !== 4 || box.some(value => !Number.isFinite(value)) || box[2] <= 0 || box[3] <= 0) fail('formula_viewbox_invalid');
    const width = Math.ceil(box[2] * .032) + 8, height = Math.ceil(box[3] * .032) + 8;
    if (width > 32760 || height > 32760 || width * height > 8 * 1024 * 1024) fail('formula_pixel_budget');
    let nodes = 0;
    function inspect(node: LiteNode) {
      if (++nodes > 16000) fail('formula_node_budget');
      const kind = adaptor.kind(node); if (kind === '#text') return;
      if (!(node instanceof LiteElement) || !tags.has(kind) || adaptor.getAttribute(node, 'data-mml-node') === 'merror') fail('formula_svg_element');
      for (const attribute of adaptor.allAttributes(node)) {
        const { name, value } = attribute;
        if (name === 'style') {
          if (node !== svg || !/^vertical-align:\s*[+\-\d.]+ex;?$/u.test(value)) fail('formula_svg_style');
          adaptor.removeAttribute(node, name); continue;
        }
        if (/^(?:data|aria)-[a-zA-Z0-9_-]+$/u.test(name)) continue;
        if (name === 'xmlns' && value === 'http://www.w3.org/2000/svg' || name === 'role' && value === 'img' || name === 'focusable' && value === 'false') continue;
        if (name === 'viewBox' && numbers.test(value) || name === 'transform' && transforms.test(value)) continue;
        if (name === 'd' && /^[MmZzLlHhVvCcSsQqTtAaEe0-9\s+.,-]+$/u.test(value)) continue;
        if (['fill', 'stroke', 'color'].includes(name) && /^(?:currentColor|none|black|#[a-fA-F0-9]{3,8})$/u.test(value)) continue;
        if (['width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'rx', 'ry', 'stroke-width', 'font-size'].includes(name) && scalar.test(value)) continue;
        if (name === 'font-family' && /^(?:serif|sans-serif|monospace)$/u.test(value) || name === 'font-style' && /^(?:normal|italic)$/u.test(value) ||
          name === 'font-weight' && /^(?:normal|bold|[1-9]00)$/u.test(value)) continue;
        fail('formula_svg_attribute');
      }
      for (const child of adaptor.childNodes(node)) inspect(child);
    }
    inspect(svg);
    adaptor.setAttribute(svg, 'viewBox', [box[0] - 125, box[1] - 125, box[2] + 250, box[3] + 250].join(' '));
    adaptor.setAttribute(svg, 'width', String(width)); adaptor.setAttribute(svg, 'height', String(height));
    adaptor.setAttribute(svg, 'color', '#26382b'); adaptor.setAttribute(svg, 'role', 'img');
    adaptor.setAttribute(svg, 'aria-label', '公式：' + latex);
    const markup = adaptor.outerHTML(svg);
    if (new TextEncoder().encode(markup).length > 2 * 1024 * 1024) fail('formula_svg_budget');
    const result: WhiteboardFormula = Object.freeze({ version: WHITEBOARD_FORMULA_VERSION, key, latex, svg: markup, width, height });
    while (cache.size && (cache.size >= 24 || cachedCharacters + markup.length > 8 * 1024 * 1024)) {
      const oldest = cache.keys().next().value!; cachedCharacters -= cache.get(oldest)!.svg.length; cache.delete(oldest);
    }
    cache.set(key, result); cachedCharacters += markup.length; return result;
  } catch (error) {
    // The core has no loader installed. Unsupported dynamic glyphs fail closed; do not start a network loader.
    const retry = (error as { retry?: Promise<unknown> }).retry; retry?.catch(() => {});
    if (error instanceof WhiteboardFormulaError) throw error; return fail('formula_render_unavailable');
  }
}

export type FormulaPage = { x: number; y: number; width: number; height: number };
/** Page the complete drawable bounds with overlap; the final page always includes the last symbol. */
export function whiteboardFormulaPages(width: number, height: number, availableWidth: number, availableHeight: number) {
  if ([width, height, availableWidth, availableHeight].some(value => !Number.isFinite(value) || value <= 0) || width * height > 8 * 1024 * 1024)
    fail('formula_layout_invalid');
  const scale = Math.min(1, Math.max(.8, Math.min(availableWidth / width, availableHeight / height)));
  const pageWidth = Math.min(width, availableWidth / scale), pageHeight = Math.min(height, availableHeight / scale);
  function offsets(total: number, size: number) {
    const values = [0], step = size - Math.min(24 / scale, size / 5);
    while (values.at(-1)! + size < total - .001) { if (values.length >= 128) fail('formula_page_budget'); values.push(Math.min(total - size, values.at(-1)! + step)); }
    return values;
  }
  const pages: FormulaPage[] = [];
  for (const y of offsets(height, pageHeight)) for (const x of offsets(width, pageWidth)) {
    if (pages.length >= 128) fail('formula_page_budget'); pages.push({ x, y, width: pageWidth, height: pageHeight });
  }
  return { scale, pages };
}
