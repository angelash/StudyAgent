'use client';
import { questionDocumentSchema, type TeachingToolSnapshot } from '@study-agent/contracts';
import { QuestionBlockView } from '../../../components/question-renderer';
import { questionMediaUrl } from '../../../lib/media';

export function TeachingValue({ value }: { value: unknown }) {
  if (value === null) return <p className="tt-unknown">明确未知 · 需要补充依据</p>;
  return typeof value === 'string' ? <p className="tt-complete-text">{value}</p> : <pre className="tt-json">{JSON.stringify(value, null, 2)}</pre>;
}
export function TeachingQuestionPreview({ snapshot }: { snapshot: TeachingToolSnapshot }) {
  const parsed = questionDocumentSchema.safeParse(snapshot.question.originalDocument), source = snapshot.source;
  return <section className="tt-question-preview" aria-label="完整题目与待发送输入">
    <div className="tt-source"><b>{source.kind === 'question_bank' ? '题库原题' : '临时题 · 尚未入库'}</b>
      <span>{source.kind === 'question_bank' ? source.questionId : source.title}</span>{parsed.success && <span>原文版本 {parsed.data.version}</span>}</div>
    <h3>题干</h3><p className="tt-complete-text">{snapshot.question.stem}</p>
    {parsed.success && <div className="tt-original-document">{parsed.data.blocks.map(block => <QuestionBlockView key={block.id} block={block}/>)}
      {parsed.data.attachments.filter(file => !parsed.data.blocks.some(block => block.url === file.url)).map(file => file.kind === 'file'
        ? <a href={questionMediaUrl(file.url)} key={file.id} target="_blank" rel="noopener noreferrer">{file.alt || '打开原题附件'}</a>
        : <QuestionBlockView key={file.id} block={{ id: file.id, type: file.kind, url: file.url, alt: file.alt || '原题附件' }}/>)}</div>}
    {snapshot.question.originalDocument !== undefined && !parsed.success && <p role="status">原题结构暂未能完整预览，请核对下方完整原文。</p>}
    {snapshot.question.mediaNotice && <p className="tt-caution">{snapshot.question.mediaNotice}</p>}
    <details><summary>参考答案与解析</summary><TeachingValue value={snapshot.question.referenceAnswer}/><TeachingValue value={snapshot.question.referenceAnalysis}/></details>
    {snapshot.purpose === 'assessment_analysis' ? <><h3>本次待核对作答</h3><TeachingValue value={snapshot.answer}/></> : <p>本次帮助层级：{snapshot.hintLevel} · 提示草稿需人工核对后使用。</p>}
    <details><summary>查看完整输入原文</summary><pre className="tt-json">{JSON.stringify(snapshot, null, 2)}</pre></details>
  </section>;
}
