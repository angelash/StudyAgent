'use client';

import * as React from 'react';
import katex from 'katex';
import type {
  QuestionAnswerMode,
  QuestionAnswerSchema,
  QuestionBlock,
  QuestionRenderPayload,
  StudentAnswerPayload,
} from '@study-agent/contracts';
import { FormulaInput } from './formula-input';

type QuestionRendererProps = {
  renderPayload: QuestionRenderPayload | null;
  answer: StudentAnswerPayload | null;
  onChange: (next: StudentAnswerPayload) => void;
};

export function createEmptyAnswerPayload(renderPayload: QuestionRenderPayload): StudentAnswerPayload {
  return {
    questionId: renderPayload.question.id,
    mode: renderPayload.answerSchema.mode,
    response: buildEmptyResponse(renderPayload.answerSchema),
  };
}

export function QuestionRenderer({ renderPayload, answer, onChange }: QuestionRendererProps) {
  if (!renderPayload || !answer) {
    return null;
  }

  const mode = renderPayload.answerSchema.mode;
  const response = answer.response ?? {};

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gap: 12 }}>
        {renderPayload.document.blocks.map((block) => (
          <QuestionBlockView key={block.id} block={block} />
        ))}
      </div>

      <section
        style={{
          display: 'grid',
          gap: 12,
          padding: 18,
          borderRadius: 18,
          border: '1px solid #dbeafe',
          background: '#f8fbff',
        }}
      >
        <div style={{ fontSize: 14, color: '#475569' }}>
          作答方式：<strong>{mode}</strong>
        </div>
        <AnswerInput
          mode={mode}
          response={response}
          responseShape={renderPayload.answerSchema.responseShape}
          options={renderPayload.answerSchema.options ?? []}
          placeholder={renderPayload.answerSchema.placeholder ?? undefined}
          onChange={(nextResponse) =>
            onChange({
              questionId: renderPayload.question.id,
              mode,
              response: nextResponse,
            })
          }
        />
      </section>
    </div>
  );
}

function QuestionBlockView({ block }: { block: QuestionBlock }) {
  switch (block.type) {
    case 'text':
    case 'reading_material':
    case 'annotation':
      return <div style={{ lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{block.text}</div>;
    case 'math_inline':
      return <MathBlock latex={block.latex ?? ''} displayMode={false} />;
    case 'math_display':
      return <MathBlock latex={block.latex ?? ''} displayMode />;
    case 'image':
      return (
        <figure style={{ margin: 0, display: 'grid', gap: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.url}
            alt={block.alt ?? '题目图片'}
            style={{ maxWidth: '100%', borderRadius: 16, border: '1px solid #e2e8f0' }}
          />
          {block.caption ? <figcaption style={{ color: '#64748b', fontSize: 14 }}>{block.caption}</figcaption> : null}
        </figure>
      );
    case 'table':
      return (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 320, width: '100%' }}>
            {block.headers?.length ? (
              <thead>
                <tr>
                  {block.headers.map((header, index) => (
                    <th key={`${block.id}_header_${index}`} style={tableCellStyle(true)}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {(block.rows ?? []).map((row, rowIndex) => (
                <tr key={`${block.id}_row_${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${block.id}_cell_${rowIndex}_${cellIndex}`} style={tableCellStyle(false)}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'sub_question_group':
      return (
        <section
          style={{
            display: 'grid',
            gap: 12,
            padding: 16,
            borderRadius: 16,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
          }}
        >
          {block.prompt ? <div style={{ fontWeight: 700 }}>{block.prompt}</div> : null}
          {(block.children ?? []).map((child) => {
            const childBlock = child as QuestionBlock;
            return <QuestionBlockView key={childBlock.id} block={childBlock} />;
          })}
        </section>
      );
    case 'divider':
      return <hr style={{ border: 0, borderTop: '1px dashed #cbd5e1', margin: 0 }} />;
    default:
      return (
        <div style={{ padding: 12, borderRadius: 12, background: '#fff7ed', color: '#9a3412' }}>
          当前题块类型 <code>{block.type}</code> 已建模，前端交互将在下一轮继续增强。
        </div>
      );
  }
}

function MathBlock({ latex, displayMode }: { latex: string; displayMode: boolean }) {
  const html = React.useMemo(
    () =>
      katex.renderToString(latex || '\\square', {
        throwOnError: false,
        displayMode,
      }),
    [displayMode, latex],
  );

  return (
    <div
      style={{
        padding: displayMode ? '12px 16px' : 0,
        borderRadius: displayMode ? 14 : 0,
        background: displayMode ? '#f8fafc' : 'transparent',
        border: displayMode ? '1px solid #e2e8f0' : 'none',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function AnswerInput({
  mode,
  response,
  responseShape,
  options,
  placeholder,
  onChange,
}: {
  mode: QuestionAnswerMode;
  response: Record<string, unknown>;
  responseShape: Record<string, unknown>;
  options: Array<{ id: string; label: string; value: string; content?: string | null }>;
  placeholder?: string;
  onChange: (next: Record<string, unknown>) => void;
}) {
  switch (mode) {
    case 'single_choice':
    case 'boolean':
      return (
        <div style={{ display: 'grid', gap: 10 }}>
          {options.map((option) => (
            <label
              key={option.id}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid #dbeafe',
                background: response.value === option.value ? '#eff6ff' : '#ffffff',
              }}
            >
              <input
                type="radio"
                name="question-choice"
                checked={response.value === option.value}
                onChange={() => onChange({ value: option.value })}
              />
              <span>
                {option.label}. {option.content ?? option.value}
              </span>
            </label>
          ))}
        </div>
      );
    case 'multiple_choice': {
      const values = Array.isArray(response.values) ? response.values.map(String) : [];
      return (
        <div style={{ display: 'grid', gap: 10 }}>
          {options.map((option) => {
            const checked = values.includes(option.value);
            return (
              <label
                key={option.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #dbeafe',
                  background: checked ? '#eff6ff' : '#ffffff',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    const nextValues = event.target.checked
                      ? [...values, option.value]
                      : values.filter((item) => item !== option.value);
                    onChange({ values: nextValues });
                  }}
                />
                <span>
                  {option.label}. {option.content ?? option.value}
                </span>
              </label>
            );
          })}
        </div>
      );
    }
    case 'numeric_blank':
      return (
        <input
          type="number"
          value={typeof response.value === 'number' ? response.value : response.value?.toString() ?? ''}
          onChange={(event) => onChange({ value: event.target.value })}
          placeholder={placeholder ?? '请输入数字'}
          style={inputStyle}
        />
      );
    case 'formula_blank':
      return (
        <FormulaInput
          value={response.value?.toString() ?? ''}
          onChange={(nextValue) => onChange({ value: nextValue })}
          placeholder={placeholder ?? '请输入 LaTeX 公式，例如 \\frac{1}{2}'}
          minHeight={88}
        />
      );
    case 'multi_blank': {
      const entries = resolveMultiBlankEntries(response, responseShape);
      return (
        <div style={{ display: 'grid', gap: 12 }}>
          {entries.map((entry, index) => (
            <label key={entry.key} style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#475569', fontWeight: 600 }}>{entry.label || `第 ${index + 1} 空`}</span>
              <input
                value={entry.value}
                onChange={(event) =>
                  onChange({
                    entries: entries.map((item) =>
                      item.key === entry.key
                        ? {
                            ...item,
                            value: event.target.value,
                          }
                        : item,
                    ),
                  })
                }
                placeholder={placeholder ?? `请输入${entry.label || `第 ${index + 1} 空`}答案`}
                style={inputStyle}
              />
            </label>
          ))}
        </div>
      );
    }
    case 'stepwise':
      return (
        <textarea
          value={Array.isArray(response.steps) ? response.steps.join('\n') : ''}
          onChange={(event) =>
            onChange({
              steps: event.target.value
                .split('\n')
                .map((item) => item.trim())
                .filter((item) => item.length > 0),
            })
          }
          placeholder={placeholder ?? '每行填写一个步骤'}
          rows={6}
          style={textareaStyle}
        />
      );
    case 'short_answer':
      return (
        <textarea
          value={response.value?.toString() ?? ''}
          onChange={(event) => onChange({ value: event.target.value })}
          placeholder={placeholder ?? '请输入答案'}
          rows={5}
          style={textareaStyle}
        />
      );
    default:
      return (
        <input
          value={response.value?.toString() ?? ''}
          onChange={(event) => onChange({ value: event.target.value })}
          placeholder={placeholder ?? '请输入答案'}
          style={inputStyle}
        />
      );
  }
}

function buildEmptyResponse(answerSchema: Pick<QuestionAnswerSchema, 'mode' | 'responseShape'>): Record<string, unknown> {
  switch (answerSchema.mode) {
    case 'multiple_choice':
    case 'sorting':
      return { values: [] };
    case 'multi_blank': {
      const templates = resolveMultiBlankTemplates(answerSchema.responseShape);
      return {
        entries: templates.map((item) => ({
          ...item,
          value: '',
        })),
      };
    }
    case 'stepwise':
      return { steps: [] };
    case 'image_upload':
    case 'audio_record':
      return { fileUrl: '' };
    default:
      return { value: '' };
  }
}

function resolveMultiBlankEntries(response: Record<string, unknown>, responseShape: Record<string, unknown>) {
  const templates = resolveMultiBlankTemplates(responseShape);
  const rawEntries = Array.isArray(response.entries) ? response.entries : [];

  if (rawEntries.length > 0) {
    return rawEntries.map((item, index) => {
      const template = templates[index];
      const entry = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        key:
          typeof entry.key === 'string' && entry.key.trim().length > 0
            ? entry.key.trim()
            : template?.key ?? `blank_${index + 1}`,
        label:
          typeof entry.label === 'string' && entry.label.trim().length > 0
            ? entry.label.trim()
            : template?.label ?? `第 ${index + 1} 空`,
        value: typeof entry.value === 'string' ? entry.value : entry.value?.toString() ?? '',
      };
    });
  }

  return resolveMultiBlankTemplates(responseShape).map((item) => ({
    ...item,
    value: '',
  }));
}

function resolveMultiBlankTemplates(responseShape: Record<string, unknown>) {
  const rawEntries = Array.isArray(responseShape.entries) ? responseShape.entries : [];
  if (rawEntries.length === 0) {
    return [
      {
        key: 'blank_1',
        label: '第 1 空',
      },
    ];
  }

  return rawEntries.map((item, index) => {
    const entry = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    return {
      key:
        typeof entry.key === 'string' && entry.key.trim().length > 0
          ? entry.key.trim()
          : `blank_${index + 1}`,
      label:
        typeof entry.label === 'string' && entry.label.trim().length > 0
          ? entry.label.trim()
          : `第 ${index + 1} 空`,
    };
  });
}

function tableCellStyle(isHeader: boolean): React.CSSProperties {
  return {
    padding: '10px 12px',
    border: '1px solid #cbd5e1',
    background: isHeader ? '#e0f2fe' : '#ffffff',
    textAlign: 'left',
  };
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid #cbd5e1',
  background: '#ffffff',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
};
