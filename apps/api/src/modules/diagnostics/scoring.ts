import { BadRequestException } from '@nestjs/common';
import { QuestionAnswerSchema } from '@study-agent/contracts';

const text = (input: unknown) => String(input ?? '').normalize('NFKC').trim().replace(/\s+/g, '').toLowerCase();

export function numericValue(input: unknown): number | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const normalized = text(input).replace('⁄', '/').replace('∕', '/');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\/[+-]?(?:\d+(?:\.\d*)?|\.\d+))?$/.test(normalized)) return null;
  const parts = normalized.split('/').map(Number);
  const value = parts.length === 2 ? parts[0] / parts[1] : parts[0];
  return Number.isFinite(value) ? value : null;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(typeof value === 'string' ? text(value) : value);
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
    const entry = item as { key?: string; value?: unknown };
    return [entry.key ?? `blank_${index + 1}`, entry.value];
  }));
}

export function gradeResponse(schema: QuestionAnswerSchema, expected: unknown, input: unknown) {
  let answer = input;
  if (input && typeof input === 'object' && 'mode' in input) {
    const payload = input as { mode: string; response: Record<string, unknown> };
    if (payload.mode !== schema.mode || !payload.response || typeof payload.response !== 'object') throw new BadRequestException('作答模式不匹配');
    answer = schema.mode === 'multi_blank' ? payload.response.entries :
      ['multiple_choice', 'sorting'].includes(schema.mode) ? payload.response.values :
        schema.mode === 'stepwise' ? payload.response.steps :
          ['matching', 'table_fill', 'drag_drop', 'geometry_draw'].includes(schema.mode) ? payload.response :
            ['audio_record', 'image_upload'].includes(schema.mode) ? payload.response.fileUrl : payload.response.value;
  }
  if (answer === null || answer === undefined || (typeof answer === 'string' && !answer.trim()) ||
    (Array.isArray(answer) && answer.length === 0)) throw new BadRequestException('请填写答案，或选择暂时不会');
  const manual = ['short_answer', 'stepwise', 'geometry_draw', 'image_upload', 'audio_record'].includes(schema.mode);
  if (manual) return { score: null, correct: null, status: 'pending_review' as const, reason: '已保存，等待依据评分量规复核。' };

  const tolerance = typeof schema.gradingConfig.absoluteTolerance === 'number' ? Math.max(0, Math.min(1, schema.gradingConfig.absoluteTolerance)) : 1e-9;
  const equals = (a: unknown, b: unknown) => {
    const x = numericValue(a), y = numericValue(b);
    return x !== null && y !== null ? Math.abs(x - y) <= tolerance : text(a) === text(b);
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
      const actual = [...new Set(answer.map(text))].sort(), standard = [...new Set(expected.map(text))].sort();
      score = canonical(actual) === canonical(standard) ? 1 : 0; break;
    }
    case 'multi_blank': {
      const actual = entries(answer), standard = entries(expected);
      const keys = Object.keys(standard);
      if (!keys.length) return { score: null, correct: null, status: 'pending_review' as const, reason: '多空题评分协议需要复核。' };
      score = keys.filter((key) => key in actual && equals(actual[key], standard[key])).length / keys.length;
      break;
    }
    case 'sorting': case 'matching': case 'table_fill': case 'drag_drop':
      score = canonical(answer) === canonical(expected) ? 1 : 0; break;
    default: {
      const alternatives = Array.isArray(schema.gradingConfig.acceptedAnswers) ? schema.gradingConfig.acceptedAnswers : [];
      score = [expected, ...alternatives].some((candidate) => equals(answer, candidate)) ? 1 : 0;
    }
  }
  return { score, correct: score === 1, status: 'scored' as const, reason: score === 1 ? '按已保存的评分协议判定正确。' : score > 0 ? '部分空位正确，按空位计分。' : '当前响应未达到该题评分标准。' };
}
