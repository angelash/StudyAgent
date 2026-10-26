import { renderWhiteboardFormula } from './whiteboard-formula';

/** Only our bounded, local vector output enters this origin-clean drawable. */
export async function decodeWhiteboardFormula(latex: string, signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  let formula;
  try { formula = renderWhiteboardFormula(latex); } catch { return null; }
  const url = URL.createObjectURL(new Blob([formula.svg], { type: 'image/svg+xml' }));
  const image = new Image();
  const close = () => { image.removeAttribute('src'); URL.revokeObjectURL(url); };
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error('公式图像读取超时，请重开白板；完整原式仍可阅读。')); }, 10000);
      const cleanup = () => { clearTimeout(timer); image.onload = null; image.onerror = null; signal.removeEventListener('abort', abort); };
      const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
      image.onload = () => { cleanup(); resolve(); };
      image.onerror = () => { cleanup(); reject(new Error('公式图像无法解码，请重新打开后导出；完整原式仍在笔记中。')); };
      signal.addEventListener('abort', abort, { once: true }); image.src = url;
      if (signal.aborted) abort();
    });
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (image.naturalWidth !== formula.width || image.naturalHeight !== formula.height) throw new Error('公式图像尺寸不符，无法导出。');
    return { key: formula.key, image, close };
  } catch (error) { close(); throw error; }
}
