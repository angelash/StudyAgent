'use client';
import type { QuestionRenderPayload } from '@study-agent/contracts';
import { answerInputConfiguration } from '@study-agent/contracts';
import { QuestionBlockView } from './question-renderer';
import { questionMediaUrl } from '../lib/media';
import './question-face-view.css';

/** The complete frozen question, with readable task materials rather than empty answer controls. */
export function QuestionFaceView({ payload, stem }: { payload: QuestionRenderPayload | null; stem: string }) {
  if (!payload) return <p style={{ whiteSpace: 'pre-wrap' }}>{stem}</p>;
  const config = answerInputConfiguration(payload.answerSchema), mode = payload.answerSchema.mode;
  return <div className="question-face notebook-question-face" aria-label="原题题面与作答形式">
    {payload.document.blocks.map(block => <QuestionBlockView key={block.id} block={block} />)}
    {payload.document.attachments.filter(attachment => !payload.document.blocks.some(block => block.url === attachment.url)).map(attachment => attachment.kind === 'file' ? <a key={attachment.id} href={questionMediaUrl(attachment.url)} target="_blank" rel="noopener noreferrer">打开题目附件 ↗</a> : <QuestionBlockView key={attachment.id} block={{ id: attachment.id, type: attachment.kind, url: attachment.url, alt: attachment.alt ?? '题目附件' }} />)}
    {!!payload.answerSchema.options?.length && <ul className="question-face-options">{payload.answerSchema.options.map(option => <li key={option.id}>{option.label}. {option.content ?? option.value}</li>)}</ul>}
    {mode === 'matching' && <div className="question-face-match"><ul>{config.left.map(item => <li key={item.id}>{item.label}</li>)}</ul><ul>{config.right.map(item => <li key={item.id}>{item.label}</li>)}</ul></div>}
    {['sorting', 'drag_drop'].includes(mode) && <><p>备选卡片：{config.items.map(item => item.label).join('；')}</p>{mode === 'drag_drop' && <p>分类位置：{config.groups.map(group => group.label).join('；')}</p>}</>}
    {mode === 'table_fill' && <div className="question-face-table"><table><caption>按行与列的提示填写空位</caption><thead><tr><th scope="col">项目</th>{config.columns.map(column => <th scope="col" key={column.id}>{column.label}</th>)}</tr></thead><tbody>{config.rows.map(item => <tr key={item.id}><th scope="row">{item.label}</th>{config.columns.map(column => <td key={column.id}>＿＿</td>)}</tr>)}</tbody></table></div>}
    {mode === 'hotspot' && <><div className="question-face-hotspot"><QuestionBlockView block={{ id: 'position-figure', type: 'image', url: config.imageUrl, alt: config.imageAlt }} />{config.targets.map(target => <span key={target.id} style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%`, width: `${target.width * 100}%`, height: `${target.height * 100}%` }}>{target.label}</span>)}</div><p>选择位置：{config.targets.map(target => target.label).join('；')}</p></>}
    {mode === 'geometry_draw' && <div className="question-face-drawing" aria-label="原题作图区域">在这里画出思路</div>}
    {mode === 'image_upload' && <p>本题通过图片展示思考过程，原始图片保留在作答记录中。</p>}
    {mode === 'audio_record' && <p>本题通过录音展示表达，原始音频可播放并按量规核查。</p>}
  </div>;
}
