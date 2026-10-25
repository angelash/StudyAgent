'use client';

import * as React from 'react';
import katex from 'katex';
import type {
  QuestionAnswerMode,
  QuestionAnswerSchema,
  QuestionBlock,
  QuestionRenderPayload,
  StudentAnswerPayload,
  StudentMediaTarget,
} from '@study-agent/contracts';
import { FormulaInput } from './formula-input';
import { answerInputConfiguration } from '@study-agent/contracts';
import { StepwiseAnswerInput, StructuredAnswerInput } from './structured-answer-input';
import { MediaAnswerInput } from './media-answer-input';
import { questionMediaUrl } from '../lib/media';

type QuestionRendererProps = {
  renderPayload: QuestionRenderPayload | null;
  answer: StudentAnswerPayload | null;
  onChange: (next: StudentAnswerPayload) => void;
  mediaTarget?: StudentMediaTarget;
  onPendingChange?: (pending: boolean) => void;
  onDisplayIssueChange?: (blocked: boolean) => void;
  disabled?: boolean;
};

export function createEmptyAnswerPayload(renderPayload: QuestionRenderPayload): StudentAnswerPayload {
  return {
    questionId: renderPayload.question.id,
    mode: renderPayload.answerSchema.mode,
    response: buildEmptyResponse(renderPayload.answerSchema),
  };
}

export function QuestionRenderer({ renderPayload, answer, onChange, mediaTarget, onPendingChange, onDisplayIssueChange, disabled = false }: QuestionRendererProps) {
  const [failedResources, setFailedResources] = React.useState<Record<string, string[]>>({});
  const questionId = renderPayload?.question.id ?? '', blocked = !!failedResources[questionId]?.length;
  React.useEffect(() => { onDisplayIssueChange?.(blocked); return () => onDisplayIssueChange?.(false); }, [blocked, onDisplayIssueChange]);
  function resourceStatus(event: React.SyntheticEvent, failed: boolean) {
    const target = event.target as HTMLImageElement | HTMLMediaElement;
    if (!['IMG', 'AUDIO', 'VIDEO'].includes(target.tagName)) return;
    if (target.closest('.media-answer-input')) return;
    const url = target.currentSrc || target.src;
    setFailedResources(previous => ({ ...previous, [questionId]: failed ? [...new Set([...(previous[questionId] ?? []), url])] : (previous[questionId] ?? []).filter(value => value !== url) }));
  }
  if (!renderPayload || !answer) {
    return null;
  }

  const mode = renderPayload.answerSchema.mode;
  const response = answer.response ?? {};

  return (
    <div style={{ display: 'grid', gap: 18 }} aria-disabled={disabled || undefined} onPointerDownCapture={event => { if (disabled) { event.preventDefault(); event.stopPropagation(); } }} onErrorCapture={event => resourceStatus(event, true)} onLoadCapture={event => resourceStatus(event, false)} onLoadedMetadataCapture={event => resourceStatus(event, false)}>
      {blocked && <p role="alert">题目中的图片、音视频未能完整打开，暂不能提交或记为“不会”。可以刷新后重试，或先跳过并反馈给老师。</p>}
      <div style={{ display: 'grid', gap: 12 }}>
        {renderPayload.document.blocks.map((block) => (
          <QuestionBlockView key={block.id} block={block} />
        ))}
        {renderPayload.document.attachments.filter(attachment => !renderPayload.document.blocks.some(block => block.url === attachment.url)).map(attachment => (
          attachment.kind === 'file' ? <a key={attachment.id} href={questionMediaUrl(attachment.url)} target="_blank" rel="noopener noreferrer">打开题目附件</a> :
            <QuestionBlockView key={attachment.id} block={{ id: attachment.id, type: attachment.kind, url: attachment.url, alt: attachment.alt ?? '题目附件' }} />
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
          <strong>{({ single_choice: '选择一项', multiple_choice: '选择所有符合的项', boolean: '选择你的判断', text_blank: '填入答案',
            numeric_blank: '输入数字或分数', formula_blank: '输入算式', multi_blank: '填写各个空位', table_fill: '填写表格', matching: '完成配对',
            sorting: '排列顺序', drag_drop: '放到合适位置', hotspot: '选择位置', geometry_draw: '画出你的思路', stepwise: '按步骤表达',
            image_upload: '上传你的作答', short_answer: '写出你的想法', audio_record: '录下你的回答' } as Record<QuestionAnswerMode, string>)[mode]}</strong>
        </div>
        {renderPayload.inputAvailability?.supported === false ? <p role="status">{renderPayload.inputAvailability.reason}</p> : <AnswerInput
          mode={mode}
          questionId={renderPayload.question.id}
          response={response}
          responseShape={renderPayload.answerSchema.responseShape}
          options={renderPayload.answerSchema.options ?? []}
          placeholder={renderPayload.answerSchema.placeholder ?? undefined}
          mediaTarget={mediaTarget}
          onPendingChange={onPendingChange}
          disabled={disabled}
          onChange={(nextResponse) =>
            !disabled && onChange({
              questionId: renderPayload.question.id,
              mode,
              response: nextResponse,
            })
          }
        />}
      </section>
    </div>
  );
}

export function QuestionBlockView({ block }: { block: QuestionBlock }) {
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
            src={questionMediaUrl(block.url)}
            alt={block.alt ?? '题目图片'}
            style={{ maxWidth: '100%', borderRadius: 16, border: '1px solid #e2e8f0' }}
          />
          {block.caption ? <figcaption style={{ color: '#64748b', fontSize: 14 }}>{block.caption}</figcaption> : null}
        </figure>
      );
    case 'audio':
      return <figure style={{ margin: 0 }}><audio controls preload="metadata" src={questionMediaUrl(block.url)} style={{ width: '100%' }} aria-label={block.alt ?? '题目音频'} />{(block.caption || block.text) && <figcaption>{block.caption ?? block.text}</figcaption>}</figure>;
    case 'video':
      return <figure style={{ margin: 0 }}><video controls playsInline preload="metadata" src={questionMediaUrl(block.url)} style={{ maxWidth: '100%' }} aria-label={block.alt ?? '题目视频'} />{(block.caption || block.text) && <figcaption>{block.caption ?? block.text}</figcaption>}</figure>;
    case 'geometry_canvas':
      return <QuestionGeometryView block={block} />;
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
          这部分题目暂时无法显示，请先跳过，并反馈给老师核对。
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
        trust: false,
        maxExpand: 1000,
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
  questionId,
  response,
  responseShape,
  options,
  placeholder,
  mediaTarget,
  onPendingChange,
  disabled,
  onChange,
}: {
  mode: QuestionAnswerMode;
  questionId: string;
  response: Record<string, unknown>;
  responseShape: Record<string, unknown>;
  options: Array<{ id: string; label: string; value: string; content?: string | null }>;
  placeholder?: string;
  mediaTarget?: StudentMediaTarget;
  onPendingChange?: (pending: boolean) => void;
  disabled?: boolean;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const radioName = React.useId();
  const config = answerInputConfiguration({ mode, questionId, responseShape, options } as QuestionAnswerSchema);
  if (!config.supported) return <p className="answer-unsupported" role="status">{config.reason}</p>;
  if (mode === 'image_upload' || mode === 'audio_record') return mediaTarget ? <MediaAnswerInput key={`${mediaTarget.kind}:${mediaTarget.sessionId}:${mediaTarget.itemId}`} target={mediaTarget} mode={mode} response={response} onChange={onChange} onPendingChange={onPendingChange} /> : <p>图片与录音作答将在进入具体学习活动后开放。</p>;
  if (['sorting', 'matching', 'drag_drop', 'table_fill', 'hotspot', 'geometry_draw'].includes(mode)) return <StructuredAnswerInput config={config} response={response} onChange={onChange} />;
  if (mode === 'boolean' && !options.length) options = [{ id: 'true', label: 'A', value: 'true', content: '正确' }, { id: 'false', label: 'B', value: 'false', content: '错误' }];
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
                name={radioName}
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
    case 'text_blank':
      return <input type="text" aria-label="文字填空答案" value={response.value?.toString() ?? ''} maxLength={3000} readOnly={disabled} onChange={event => onChange({ value: event.target.value })} placeholder={placeholder ?? '填入你的答案'} style={inputStyle} />;
    case 'numeric_blank':
      return (
        <input
          type="text"
          inputMode="decimal"
          aria-label="数字或分数答案"
          value={typeof response.value === 'number' ? response.value : response.value?.toString() ?? ''}
          onChange={(event) => onChange({ value: event.target.value })}
          placeholder={placeholder ?? '请输入数字或分数，例如 0.5 或 1/2'}
          style={inputStyle}
        />
      );
    case 'formula_blank':
      return (
        <FormulaInput
          readOnly={disabled}
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
      return <StepwiseAnswerInput steps={Array.isArray(response.steps) ? response.steps.map(String) : []} onChange={steps => onChange({ steps })} />;
    case 'short_answer':
      return (
        <textarea
          aria-label="文字作答"
          value={response.value?.toString() ?? ''}
          onChange={(event) => onChange({ value: event.target.value })}
          placeholder={placeholder ?? '请输入答案'}
          rows={5}
          style={textareaStyle}
        />
      );
    default:
      return <p role="status">本题的作答入口暂时不可用，请先跳过。</p>;
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
      return { mediaIds: [], description: '' };
    case 'matching': return { pairs: [] };
    case 'drag_drop': return { placements: {} };
    case 'table_fill': return { cells: {} };
    case 'geometry_draw': return { strokes: [], description: '' };
    default:
      return { value: '' };
  }
}

function QuestionGeometryView({ block }: { block: QuestionBlock }) {
  const shapes = Array.isArray(block.meta?.shapes) ? block.meta.shapes.filter((shape: unknown) => !!shape && typeof shape === 'object') as Array<Record<string, unknown>> : [];
  const valid = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  const drawn = shapes.slice(0, 100).flatMap((shape, index) => {
    if (shape.type === 'line' && [shape.x1, shape.y1, shape.x2, shape.y2].every(valid)) return [<line key={index} x1={Number(shape.x1) * 640} y1={Number(shape.y1) * 420} x2={Number(shape.x2) * 640} y2={Number(shape.y2) * 420} stroke="#254b3c" strokeWidth="3" />];
    if (shape.type === 'rectangle' && [shape.x, shape.y, shape.width, shape.height].every(valid)) return [<rect key={index} x={Number(shape.x) * 640} y={Number(shape.y) * 420} width={Number(shape.width) * 640} height={Number(shape.height) * 420} stroke="#254b3c" strokeWidth="3" fill="none" />];
    if (shape.type === 'circle' && [shape.x, shape.y, shape.radius].every(valid)) return [<circle key={index} cx={Number(shape.x) * 640} cy={Number(shape.y) * 420} r={Number(shape.radius) * 420} stroke="#254b3c" strokeWidth="3" fill="none" />];
    return [];
  });
  return <figure style={{ margin: 0 }}>{drawn.length > 0 ? <svg viewBox="0 0 640 420" role="img" aria-label={block.alt ?? '题目图形'} style={{ display: 'block', width: '100%', border: '1px solid #d1deca', background: '#fffefa' }}><title>{block.alt ?? '题目图形'}</title>{drawn}</svg> : null}<figcaption>{block.prompt ?? block.text ?? (drawn.length ? '观察图形，再表达你的思路。' : '图形资料暂时无法显示，请先跳过，并反馈给老师核对。')}</figcaption></figure>;
}

function resolveMultiBlankEntries(response: Record<string, unknown>, responseShape: Record<string, unknown>) {
  const templates = resolveMultiBlankTemplates(responseShape);
  const rawEntries = Array.isArray(response.entries) ? response.entries : [];

  return templates.map(template => {
    const entry = rawEntries.find(item => item && typeof item === 'object' && item.key === template.key) as Record<string, unknown> | undefined;
    return { ...template, value: typeof entry?.value === 'string' || typeof entry?.value === 'number' ? String(entry.value) : '' };
  });
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
