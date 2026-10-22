import type { StudioMaterialStructure, StudioPdfStructureBlock, StudioSourcePage } from '@study-agent/contracts';
import type { PdfStructureModelResult } from '../ai/codex-pdf-structure.service';

export type RawStudioPdfPage = {
  pageNumber: number;
  method: 'pdf_text' | 'ocr' | 'hybrid' | 'unreadable';
  text: string;
  lines: Array<{ text: string; confidence: number | null; bbox?: [number, number, number, number] }>;
  blocks: StudioPdfStructureBlock[];
  tables: Array<StudioPdfStructureBlock & { kind: 'table' }>;
  formulas: Array<StudioPdfStructureBlock & { kind: 'formula' }>;
  confidence: number | null;
  warnings: string[];
  imagePath: string;
};

function average(values: Array<number | null>) {
  const known = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return known.length ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length * 10_000) / 10_000 : null;
}

export function mergeStudioPdfPages(raw: RawStudioPdfPage[], model: PdfStructureModelResult | null,
  options: { modelAttempted?: boolean; modelId?: string | null } = {}) {
  const modeled = new Map((model?.pages ?? []).map(page => [page.pageNumber, page]));
  const unmodeledReviewPages = model ? raw.filter(page => (page.method === 'ocr' || page.method === 'hybrid' ||
    page.tables.length > 0 || page.formulas.length > 0) && !modeled.has(page.pageNumber)).length : 0;
  const pages: StudioSourcePage[] = raw.map(page => {
    const next = modeled.get(page.pageNumber);
    const tables = next?.tables.length ? next.tables.map((table, index) => ({
      id: 'page-' + page.pageNumber + '-table-' + (index + 1), kind: 'table' as const,
      headers: table.headers, rows: table.rows, plainText: [table.headers, ...table.rows].map(row => row.join('\t')).join('\n'),
      bbox: page.tables[index]?.bbox, confidence: table.confidence, reviewRequired: true,
    })) : page.tables;
    const formulas = next?.formulas.length ? next.formulas.map((formula, index) => ({
      id: 'page-' + page.pageNumber + '-formula-' + (index + 1), kind: 'formula' as const,
      latex: formula.latex, plainText: formula.plainText, bbox: page.formulas[index]?.bbox,
      confidence: formula.confidence, reviewRequired: true,
    })) : page.formulas;
    const paragraphs = next?.paragraphs.length ? next.paragraphs.map((paragraph, index) => ({
      id: 'page-' + page.pageNumber + '-paragraph-' + (index + 1), kind: 'paragraph' as const,
      text: paragraph.text, confidence: paragraph.confidence, reviewRequired: page.method !== 'pdf_text' ||
        (paragraph.confidence !== null && paragraph.confidence < 0.95),
    })) : page.blocks.filter(block => block.kind === 'paragraph');
    const blocks = [...paragraphs, ...formulas, ...tables];
    const text = next?.paragraphs.length ? next.paragraphs.map(paragraph => paragraph.text).join('\n') : page.text;
    return { page: page.pageNumber, text, method: page.method,
      confidence: next ? average([...next.paragraphs, ...next.formulas, ...next.tables].map(item => item.confidence)) : page.confidence,
      blocks, warnings: [...new Set([...page.warnings, ...(next?.warnings ?? [])])] };
  });
  const warnings = [...new Set([...pages.flatMap(page => page.warnings ?? []),
    ...(unmodeledReviewPages ? ['model_review_page_limit'] : [])])];
  const structure: StudioMaterialStructure = {
    method: pages.some(page => page.method === 'hybrid') ? 'hybrid' :
      pages.some(page => page.method === 'ocr') ? 'ocr' :
      pages.some(page => page.method === 'pdf_text') ? 'native_text' : 'unreadable',
    ocrPageCount: pages.filter(page => page.method === 'ocr' || page.method === 'hybrid').length,
    tableCount: pages.reduce((sum, page) => sum + (page.blocks ?? []).filter(block => block.kind === 'table').length, 0),
    formulaCount: pages.reduce((sum, page) => sum + (page.blocks ?? []).filter(block => block.kind === 'formula').length, 0),
    confidence: average(pages.map(page => page.confidence ?? null)),
    reviewRequired: warnings.length > 0,
    modelAssisted: Boolean(model),
    modelSource: model ? 'xiaojiu_cli' : options.modelAttempted === false ? null : 'local_fallback',
    modelId: options.modelId ?? null,
    warnings: options.modelAttempted === false ? warnings : model ? warnings : [...warnings, 'model_structure_review_unavailable'],
  };
  return { pages, structure };
}
