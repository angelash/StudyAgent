import { z } from 'zod';
import type { QuestionAnswerMode, QuestionAnswerSchema } from './index';

export type InteractionChoice = { id: string; label: string };
export type HotspotTarget = InteractionChoice & { x: number; y: number; width: number; height: number };
export type DrawingPoint = { x: number; y: number };
export type DrawingStroke = { points: DrawingPoint[] };
export type InputConfiguration = { supported: boolean; reason: string; mode: QuestionAnswerMode; items: InteractionChoice[];
  groups: InteractionChoice[]; left: InteractionChoice[]; right: InteractionChoice[]; rows: InteractionChoice[]; columns: InteractionChoice[];
  targets: HotspotTarget[]; imageUrl: string; imageAlt: string };
const key = z.string().min(1).max(120).refine(value => !['__proto__', 'prototype', 'constructor'].includes(value) && !/[\x00-\x1f]/.test(value));
const choice = z.object({ id: key, label: z.string().min(1).max(500) });
const list = z.array(choice).min(1).max(80).refine(values => new Set(values.map(value => value.id)).size === values.length);
const target = choice.extend({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) })
  .refine(value => value.x + value.width <= 1.000001 && value.y + value.height <= 1.000001);
const targets = z.array(target).min(1).max(80).refine(values => new Set(values.map(value => value.id)).size === values.length);
const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
const drawing = z.object({ strokes: z.array(z.object({ points: z.array(point).min(1).max(1024) }).strict()).max(64), description: z.string().max(4000).default('') }).strict()
  .refine(value => value.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0) <= 1024);
function choices(value: unknown) { const parsed = list.safeParse(value); return parsed.success ? parsed.data : []; }

/** Public configuration contains interaction data only. Scoring keys never enter this contract. */
export function answerInputConfiguration(schema: Pick<QuestionAnswerSchema, 'mode' | 'responseShape' | 'options'>): InputConfiguration {
  const shape = schema.responseShape ?? {}, mode = schema.mode;
  const options = choices(schema.options?.map(option => ({ id: option.value, label: option.content ?? `${option.label} · ${option.value}` })));
  const config: InputConfiguration = { supported: true, reason: '', mode, items: choices(shape.items), groups: choices(shape.groups), left: choices(shape.left), right: choices(shape.right),
    rows: choices(shape.rows), columns: choices(shape.columns), targets: [], imageUrl: typeof shape.imageUrl === 'string' ? shape.imageUrl : '', imageAlt: typeof shape.imageAlt === 'string' ? shape.imageAlt : '选择图中的位置' };
  if (!config.items.length) config.items = options;
  const unsupported = (reason: string) => { config.supported = false; config.reason = reason; };
  if (['single_choice', 'multiple_choice'].includes(mode) && !options.length) unsupported('本题的选项尚未配置完整，请先跳过，并请老师核对题目。');
  if (mode === 'multi_blank') {
    const entries = Array.isArray(shape.entries) ? shape.entries : [];
    if (!entries.length || entries.length > 80 || entries.some(entry => !entry || typeof entry.key !== 'string' || !key.safeParse(entry.key).success) || new Set(entries.map(entry => entry.key)).size !== entries.length)
      unsupported('本题的空位尚未配置完整，请先跳过，并请老师核对题目。');
  }
  if (mode === 'sorting' && config.items.length < 2) unsupported('本题的排序卡片尚未配置完整，请先跳过。');
  if (mode === 'matching' && (!config.left.length || !config.right.length)) unsupported('本题的配对内容尚未配置完整，请先跳过。');
  if (mode === 'drag_drop' && (!config.items.length || !config.groups.length)) unsupported('本题的分类卡片与目标尚未配置完整，请先跳过。');
  if (mode === 'table_fill' && (!config.rows.length || !config.columns.length || config.rows.length * config.columns.length > 160 ||
    new Set(config.rows.flatMap(row => config.columns.map(column => `${row.id}:${column.id}`))).size !== config.rows.length * config.columns.length)) unsupported('本题的表格空位尚未配置完整，请先跳过。');
  if (mode === 'hotspot') {
    const parsed = targets.safeParse(shape.targets); config.targets = parsed.success ? parsed.data : [];
    if (!config.targets.length || !config.imageUrl || !/^(\/(?:api|question-assets)\/(?!\/)|https:\/\/)/.test(config.imageUrl) || /[\\\x00-\x20]/.test(config.imageUrl)) unsupported('本题的图上选点尚未配置完整，请先跳过。');
  }
  if (['image_upload', 'audio_record'].includes(mode) && shape.mediaPolicy !== 'student-media-v1') unsupported('本题尚未配置受控作答上传，请先跳过。');
  return config;
}

/** Bounds all saved answers, including partial drafts; never executes submitted expressions. */
export function answerProtocolIssue(schema: QuestionAnswerSchema, input: unknown, partial = false): string | null {
  let bytes: number;
  try { bytes = JSON.stringify(input ?? null).length; } catch { return '无法保存此作答结构'; }
  if (bytes > 90_000) return '作答内容过长，请减少重复笔迹或文字后保存';
  if (!input || typeof input !== 'object' || !('mode' in input)) return null; // Historical scalar protocol.
  const payload = input as { questionId?: unknown; mode: unknown; response?: any };
  if (payload.mode !== schema.mode || payload.questionId !== schema.questionId || !payload.response || typeof payload.response !== 'object' || Array.isArray(payload.response)) return '作答题目或模式不匹配';
  const response = payload.response, config = answerInputConfiguration(schema), mode = schema.mode;
  const allowed = (values: unknown, allowedIds: string[], requireAll: boolean) => Array.isArray(values) && values.length <= 80 &&
    values.every(value => typeof value === 'string' && allowedIds.includes(value)) && new Set(values).size === values.length && (partial || !requireAll || values.length === allowedIds.length);
  if (mode === 'geometry_draw') {
    const parsed = drawing.safeParse(response);
    if (!parsed.success || (!partial && !parsed.data.strokes.length && !parsed.data.description.trim())) return '请保留作图笔迹，或用文字说明图形与理由';
  }
  if (['image_upload', 'audio_record'].includes(mode)) {
    if (!config.supported) return partial ? null : config.reason;
    if (!Array.isArray(response.mediaIds) || response.mediaIds.length > (mode === 'image_upload' ? 3 : 1) ||
      response.mediaIds.some((id: unknown) => typeof id !== 'string' || !/^student_media_[a-f0-9-]{36}$/.test(id)) || new Set(response.mediaIds).size !== response.mediaIds.length ||
      typeof response.description !== 'string' || response.description.length > 4000 || (!partial && !response.mediaIds.length)) return mode === 'image_upload' ? '请上传清晰的作答图片后提交' : '请录音或上传音频后提交';
  }
  if (mode === 'numeric_blank' && !(typeof response.value === 'string' && response.value.length <= 500 || typeof response.value === 'number' && Number.isFinite(response.value))) return '请输入有效数字或分数';
  if (mode === 'boolean' && !(typeof response.value === 'boolean' || typeof response.value === 'number' && [0, 1].includes(response.value) || typeof response.value === 'string' && response.value.length <= 20)) return '请选择正确或错误';
  if (['text_blank', 'formula_blank', 'short_answer'].includes(mode) && (typeof response.value !== 'string' || response.value.length > 10000 || (!partial && !response.value.trim()))) return '请填写有效的文字或算式';
  if (mode === 'stepwise' && (!Array.isArray(response.steps) || response.steps.length > 80 || response.steps.some((step: unknown) => typeof step !== 'string' || step.length > 3000) || (!partial && !response.steps.some((step: string) => step.trim())))) return '请按顺序填写解题步骤';
  if (['single_choice', 'multiple_choice', 'sorting', 'table_fill', 'matching', 'drag_drop', 'hotspot', 'multi_blank'].includes(mode) && !config.supported) return partial ? null : config.reason;
  if (['single_choice', 'hotspot'].includes(mode)) {
    const allowedIds = mode === 'hotspot' ? config.targets.map(value => value.id) : (schema.options ?? []).map(value => value.value);
    if (!(partial && response.value === '') && (typeof response.value !== 'string' || !allowedIds.includes(response.value))) return '请选择题目中提供的一项';
  }
  if (mode === 'multiple_choice' && (!allowed(response.values, (schema.options ?? []).map(value => value.value), false) || !partial && !response.values.length)) return '请选择题目中提供的选项，不能重复';
  if (mode === 'sorting' && !allowed(response.values, config.items.map(value => value.id), true)) return '请将每张卡片各使用一次，排成完整顺序';
  if (mode === 'matching') {
    if (!Array.isArray(response.pairs) || response.pairs.length > 80 || response.pairs.some((pair: any) => !pair || !config.left.some(value => value.id === pair.left) || !config.right.some(value => value.id === pair.right)) ||
      new Set(response.pairs.map((pair: any) => pair.left)).size !== response.pairs.length || (!partial && response.pairs.length !== config.left.length) ||
      (schema.validationRules.allowDuplicateTargets !== true && new Set(response.pairs.map((pair: any) => pair.right)).size !== response.pairs.length)) return '请为每一项完成有效配对，不能重复使用同一项';
  }
  if (['drag_drop', 'table_fill'].includes(mode)) {
    const values = mode === 'drag_drop' ? response.placements : response.cells;
    const expectedKeys = mode === 'drag_drop' ? config.items.map(value => value.id) : config.rows.flatMap(row => config.columns.map(column => `${row.id}:${column.id}`));
    if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).some(value => !expectedKeys.includes(value)) ||
      Object.values(values).some(value => typeof value !== 'string' || value.length > 3000 || (mode === 'drag_drop' && !config.groups.some(group => group.id === value))) ||
      (!partial && expectedKeys.some(value => typeof values[value] !== 'string' || !values[value].trim()))) return mode === 'drag_drop' ? '请为每张卡片选择目标位置' : '请按标记填写表格空位';
  }
  if (mode === 'multi_blank') {
    const keys = (schema.responseShape.entries as Array<{ key: string }>).map(entry => entry.key);
    if (!Array.isArray(response.entries) || response.entries.length > 80 || response.entries.some((entry: any) => !entry || !keys.includes(entry.key) || typeof entry.value !== 'string' || entry.value.length > 3000) ||
      new Set(response.entries.map((entry: any) => entry.key)).size !== response.entries.length || (!partial && !response.entries.some((entry: any) => entry.value.trim()))) return '请按标记填写空位，不能重复或增加空位';
  }
  return null;
}
