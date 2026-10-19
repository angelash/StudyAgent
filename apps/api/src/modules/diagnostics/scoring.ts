import { BadRequestException } from '@nestjs/common';
import { QuestionAnswerSchema, answerProtocolIssue } from '@study-agent/contracts';
import { arithmeticValue } from './arithmetic-expression';

const text = (input: unknown) => String(input ?? '').normalize('NFKC').trim().replace(/\s+/g, '').toLowerCase();

export function numericValue(input: unknown): number | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  if (/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]/.test(String(input))) return null;
  const normalized = text(input).replace('⁄', '/').replace('∕', '/');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\/[+-]?(?:\d+(?:\.\d*)?|\.\d+))?$/.test(normalized)) return null;
  const parts = normalized.split('/').map(Number);
  const value = parts.length === 2 ? parts[0] / parts[1] : parts[0];
  return Number.isFinite(value) && parts.every(part => Math.abs(part) <= Number.MAX_SAFE_INTEGER) ? value : null;
}

function bool(input: unknown) {
  if (['true', '正确', '对', '√', '1'].includes(text(input))) return true;
  if (['false', '错误', '错', '×', '0'].includes(text(input))) return false;
  return null;
}

function entries(input: unknown): Record<string, unknown> {
  const list = Array.isArray(input) ? input : (input as { entries?: unknown[] } | null)?.entries;
  if (!Array.isArray(list)) return {};
  return Object.fromEntries(list.map((item, index) => {
    const entry = item && typeof item === 'object' ? item as { key?: string; value?: unknown } : {};
    return [entry.key ?? `blank_${index + 1}`, entry.value];
  }));
}

export function gradeResponse(schema: QuestionAnswerSchema, expected: unknown, input: unknown) {
  const wrap = (value: unknown, standard = false) => {
    if (value && typeof value === 'object' && 'mode' in value) return value;
    let response: unknown;
    if (['sorting', 'multiple_choice'].includes(schema.mode)) response = { values: value };
    else if (schema.mode === 'multi_blank') response = Array.isArray(value) ? { entries: value } : value;
    else if (schema.mode === 'stepwise') response = Array.isArray(value) ? { steps: value } : value;
    else if (schema.mode === 'matching') response = Array.isArray(value) ? { pairs: value } : value;
    else if (['table_fill', 'drag_drop', 'geometry_draw'].includes(schema.mode)) response = value;
    else response = value && typeof value === 'object' && 'value' in value ? value : { value };
    if (standard && schema.mode === 'multi_blank' && response && typeof response === 'object' && 'entries' in response && Array.isArray(response.entries)) {
      response = { entries: response.entries.map(entry => entry && typeof entry === 'object' ? { ...entry, value: String(entry.value ?? '') } : entry) };
    }
    if (standard && schema.mode === 'table_fill' && value && typeof value === 'object' && 'cells' in value && value.cells && typeof value.cells === 'object' && !Array.isArray(value.cells)) {
      response = { cells: Object.fromEntries(Object.entries(value.cells).map(([key, value]) => [key, String(value ?? '')])) };
    }
    return { questionId: schema.questionId, mode: schema.mode, response };
  };
  const submitted = wrap(input);
  const issue = answerProtocolIssue(schema, submitted); if (issue) throw new BadRequestException(issue);
  if (['image_upload', 'audio_record'].includes(schema.mode)) throw new BadRequestException('请使用受控的作答上传入口；当前题目应先跳过');
  const unwrap = (envelope: unknown) => {
    const payload = envelope as { mode: string; response: Record<string, unknown> };
    return schema.mode === 'multi_blank' ? payload.response.entries :
      ['multiple_choice', 'sorting'].includes(schema.mode) ? payload.response.values :
        schema.mode === 'stepwise' ? payload.response.steps :
          ['matching', 'table_fill', 'drag_drop', 'geometry_draw'].includes(schema.mode) ? payload.response :
            payload.response.value;
  };
  const answer = unwrap(submitted);
  if (answer === null || answer === undefined || (typeof answer === 'string' && !answer.trim()) ||
    (Array.isArray(answer) && answer.length === 0)) throw new BadRequestException('请填写答案，或选择暂时不会');
  const manual = ['short_answer', 'stepwise', 'geometry_draw', 'image_upload', 'audio_record'].includes(schema.mode);
  if (manual) return { score: null, correct: null, status: 'pending_review' as const, reason: '已保存，等待依据评分量规复核。' };
  const standardEnvelope = wrap(expected, true);
  if (answerProtocolIssue(schema, standardEnvelope)) return { score: null, correct: null, status: 'pending_review' as const, reason: '冻结标准答案与作答协议不一致，需要内容复核。' };
  expected = unwrap(standardEnvelope);
  if (schema.mode === 'multi_blank' && Object.keys(entries(expected)).length !== (schema.responseShape.entries as unknown[]).length) {
    return { score: null, correct: null, status: 'pending_review' as const, reason: '多空题标准答案未覆盖全部空位，需要内容复核。' };
  }

  const tolerance = typeof schema.gradingConfig.absoluteTolerance === 'number' ? Math.max(0, Math.min(1, schema.gradingConfig.absoluteTolerance)) : 1e-9;
  const equals = (a: unknown, b: unknown) => {
    const x = numericValue(a), y = numericValue(b);
    const normalize = (value: unknown) => schema.gradingConfig.caseSensitive === true ? String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, '') : text(value);
    return x !== null && y !== null ? Math.abs(x - y) <= tolerance : normalize(a) === normalize(b);
  };
  let score = 0;
  switch (schema.mode) {
    case 'numeric_blank': {
      const actual = numericValue(answer), standard = numericValue(expected);
      if (actual === null) throw new BadRequestException('请输入有效数字或分数');
      if (standard === null) return { score: null, correct: null, status: 'pending_review' as const, reason: '标准答案不符合数字协议，需要复核。' };
      score = Math.abs(actual - standard) <= tolerance ? 1 : 0;
      break;
    }
    case 'boolean': {
      const actual = bool(answer), standard = bool(expected);
      if (actual === null) throw new BadRequestException('请选择正确或错误');
      if (standard === null) return { score: null, correct: null, status: 'pending_review' as const, reason: '判断题标准答案需要复核。' };
      score = actual === standard ? 1 : 0; break;
    }
    case 'multiple_choice': {
      if (!Array.isArray(answer) || !Array.isArray(expected)) throw new BadRequestException('多选答案需要选项数组');
      const actual = [...new Set(answer.map(String))].sort(), standard = [...new Set(expected.map(String))].sort();
      score = JSON.stringify(actual) === JSON.stringify(standard) ? 1 : 0; break;
    }
    case 'multi_blank': {
      const actual = entries(answer), standard = entries(expected);
      const keys = Object.keys(standard);
      if (!keys.length) return { score: null, correct: null, status: 'pending_review' as const, reason: '多空题评分协议需要复核。' };
      score = keys.filter((key) => key in actual && equals(actual[key], standard[key])).length / keys.length;
      break;
    }
    case 'single_choice': case 'hotspot': score = String(answer) === String(expected) ? 1 : 0; break;
    case 'formula_blank': {
      const actual = arithmeticValue(answer);
      const alternatives = Array.isArray(schema.gradingConfig.acceptedAnswers) ? schema.gradingConfig.acceptedAnswers : [];
      score = Number([expected, ...alternatives].some(value => { const standard = arithmeticValue(value); return actual !== null && standard !== null ? Math.abs(actual - standard) <= tolerance : equals(answer, value); })); break;
    }
    case 'sorting': score = JSON.stringify(answer) === JSON.stringify(expected) ? 1 : 0; break;
    case 'matching': {
      const pairs = (value: unknown) => {
        const input = Array.isArray(value) ? value : (value as { pairs?: unknown } | null)?.pairs;
        if (!Array.isArray(input) || !input.length || input.some(pair => !pair || typeof pair.left !== 'string' || typeof pair.right !== 'string')) return null;
        return input.map(pair => [pair.left, pair.right]).sort(([a], [b]) => a.localeCompare(b));
      };
      const standard = pairs(expected), actual = pairs(answer);
      if (!standard) return { score: null, correct: null, status: 'pending_review' as const, reason: '配对标准答案协议需要复核。' };
      score = JSON.stringify(actual) === JSON.stringify(standard) ? 1 : 0; break;
    }
    case 'table_fill': case 'drag_drop': {
      const field = schema.mode === 'table_fill' ? 'cells' : 'placements';
      const standard = (expected as Record<string, Record<string, unknown>> | null)?.[field], actual = (answer as Record<string, Record<string, unknown>> | null)?.[field];
      if (!standard || typeof standard !== 'object' || Array.isArray(standard) || !Object.keys(standard).length) return { score: null, correct: null, status: 'pending_review' as const, reason: '表格或分类标准答案协议需要复核。' };
      const keys = Object.keys(standard);
      score = actual ? keys.filter(key => key in actual && (schema.mode === 'table_fill' ? equals(actual[key], standard[key]) : actual[key] === standard[key])).length / keys.length : 0;
      if (actual && Object.keys(actual).some(key => !keys.includes(key))) score = 0;
      break;
    }
    default: {
      const alternatives = Array.isArray(schema.gradingConfig.acceptedAnswers) ? schema.gradingConfig.acceptedAnswers : [];
      score = [expected, ...alternatives].some((candidate) => equals(answer, candidate)) ? 1 : 0;
    }
  }
  return { score, correct: score === 1, status: 'scored' as const, reason: score === 1 ? '按已保存的评分协议判定正确。' : score > 0 ? '部分空位正确，按空位计分。' : '当前响应未达到该题评分标准。' };
}
