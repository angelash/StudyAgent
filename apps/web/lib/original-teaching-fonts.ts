'use client';
import * as React from 'react';
import registry from './original-teaching-fonts.json';

export type OriginalBoardFont = 'handwriting' | 'standard';
export const originalBoardFontFamily = (mode: OriginalBoardFont) => mode === 'handwriting' ? 'Virgil, Xiaolai, sans-serif' : '"Satoshi-Regular", MiSans, sans-serif';
export const originalUiFontFamily = '"Satoshi-Regular", MiSans, sans-serif';
let stylesheet: Promise<void> | null = null;
let retrySequence = 0;

function removeObsoleteCapturedFonts() {
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[data-original-teaching-fonts]')) {
    const fingerprint = link.dataset.originalTeachingFonts ?? '', url = new URL(link.href, location.href);
    if (fingerprint !== registry.sha256 && /^[a-f0-9]{64}$/.test(fingerprint) && url.origin === location.origin && url.pathname.startsWith('/reference/hyperknow/font-faces-')) link.remove();
  }
}

function retryFailedGlyphs() {
  const failed = new Set(Array.from(document.fonts).filter(face => face.status === 'error').map(face => face.family.replace(/^['"]|['"]$/g, '')));
  if (!failed.size) return;
  const link = document.querySelector<HTMLLinkElement>('link[data-original-teaching-fonts="' + registry.sha256 + '"]');
  if (!link?.sheet) return;
  const attempt = String(++retrySequence);
  for (const rule of Array.from(link.sheet.cssRules)) {
    if (!(rule instanceof CSSFontFaceRule) || !failed.has(rule.style.getPropertyValue('font-family').replace(/^['"]|['"]$/g, '').trim())) continue;
    // Failed FontFace objects cannot be loaded again. Updating the captured src
    // creates fresh faces; the query also bypasses cached network failures.
    const source = rule.style.getPropertyValue('src').replace(/url\(\s*(["']?)([^\s"')]+)\1\s*\)/g, (match, _quote: string, value: string) => {
      if (value.startsWith('data:')) return match;
      const url = new URL(value, location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith('/reference/hyperknow/')) throw new Error('板书字体来源不正确，请重新打开白板。');
      url.searchParams.set('font-retry', attempt);
      return 'url("' + url.pathname + url.search + '")';
    });
    rule.style.setProperty('src', source);
  }
}

function registerStylesheet() {
  if (stylesheet) return stylesheet;
  const promise = new Promise<void>((resolve, reject) => {
    const old = document.querySelector<HTMLLinkElement>('link[data-original-teaching-fonts="' + registry.sha256 + '"]');
    if (old?.dataset.ready === 'true') { resolve(); return; }
    if (old) old.remove();
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = registry.stylesheet; link.dataset.originalTeachingFonts = registry.sha256;
    const timer = setTimeout(() => { link.remove(); reject(new Error('板书字体准备超时，请重试。')); }, 15000);
    link.onload = () => { clearTimeout(timer); link.dataset.ready = 'true'; resolve(); };
    link.onerror = () => { clearTimeout(timer); link.remove(); reject(new Error('板书字体暂未读回，请重试。')); };
    document.head.append(link);
  });
  stylesheet = promise;
  void promise.catch(() => { if (stylesheet === promise) stylesheet = null; });
  return promise;
}

function waitFor<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Font preparation cancelled', 'AbortError'));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    work.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}

export async function prepareOriginalTeachingFonts(text: string, mode: OriginalBoardFont, signal: AbortSignal) {
  await waitFor(registerStylesheet(), signal);
  removeObsoleteCapturedFonts();
  const declared = new Set(Array.from(document.fonts).map(face => face.family.replace(/^['"]|['"]$/g, '')));
  const families = ['Satoshi-Regular', 'Satoshi-Medium', 'Satoshi-Bold', 'MiSans', ...(mode === 'handwriting' ? ['Virgil', 'Xiaolai'] : [])];
  for (const family of families) if (!declared.has(family)) throw new Error('板书字体尚未完整登记，请重试。');
  await waitFor(Promise.all(families.map(async family => {
    // A positive check() for an unknown family can merely mean fallback. Require
    // actual registered FontFace objects, and load every relevant frozen glyph.
    const sample = text + (family === 'Xiaolai' || family === 'MiSans' ? '中文板书' : 'Aa Bb 0123456789');
    const faces = await document.fonts.load('20px "' + family + '"', sample);
    if (!faces.length || faces.some(face => face.status !== 'loaded')) throw new Error('板书字形暂未完整读回，请重试。');
  })), signal);
  if (signal.aborted) throw new DOMException('Font preparation cancelled', 'AbortError');
  return { fingerprint: registry.sha256, families };
}

export function useOriginalTeachingFonts(context: string, text: string, mode: OriginalBoardFont = 'handwriting') {
  const [state, setState] = React.useState<{ key: string; ready: boolean; error: string } | null>(null), [attempt, setAttempt] = React.useState(0);
  const key = context + ':' + mode + ':' + text;
  React.useEffect(() => {
    let current = true; const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    setState({ key, ready: false, error: '' });
    void Promise.resolve().then(() => { if (attempt) retryFailedGlyphs(); return prepareOriginalTeachingFonts(text, mode, controller.signal); }).then(() => { if (current) setState({ key, ready: true, error: '' }); })
      .catch(error => { if (current) setState({ key, ready: false, error: error instanceof Error && error.name !== 'AbortError' ? error.message : '板书字体准备超时，请重试。' }); })
      .finally(() => clearTimeout(timer));
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [key, text, mode, attempt]);
  const visible = state?.key === key ? state : null;
  return { ready: visible?.ready ?? false, error: visible?.error ?? '', retry: () => setAttempt(value => value + 1), fingerprint: registry.sha256 };
}
