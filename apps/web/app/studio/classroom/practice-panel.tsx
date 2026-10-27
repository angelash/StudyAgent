'use client';
import * as React from 'react';
import type { ClassroomQuestion, ClassroomAnswerReceipt, ClassroomHintReceipt, ClassroomLesson, ClassroomSessionView } from '@study-agent/contracts';
import { classroomPracticeSummary, classroomReceiptSelection } from '@study-agent/contracts';
import { ClassroomFigure } from './diagram';
import { ClassroomImage } from './board-step';
import { ClassroomIcon } from './icons';
import './practice-review.css';

export function PracticePanel({ questions, answers, questionIndex, selected, hinted, hintReceipts = [], busy, standalone, lessonId, assessment,
  contentStatus, notice, recovery, onDismiss, onCurrent, onLearn, onIndex, onSelect, onHint, onAnswer, onClose, onAssistant,onSource,
  assistantOpen = false, assistantButtonRef, inactive = false }: {
  questions: ClassroomQuestion[]; answers: ClassroomAnswerReceipt[]; questionIndex: number;
  selected: Record<string, number[]>; hinted: string[]; busy: boolean; standalone: boolean; lessonId: string;
  hintReceipts?: ClassroomHintReceipt[];
  notice?: string; onDismiss?: () => void;
  recovery?: React.ReactNode;
  onSource?: (key:string)=>void;
  assistantOpen?: boolean; assistantButtonRef?: React.RefObject<HTMLButtonElement | null>; inactive?: boolean;
  assessment?: ClassroomLesson['assessment']; contentStatus?: ClassroomSessionView['contentStatus'];
  onCurrent?: () => void; onLearn?: (lessonId: string) => void;
  onIndex: (index: number) => void; onSelect: (id: string, index: number) => void; onHint: (id: string, level: number) => void;
  onAnswer: (disposition?: 'skip' | 'dont_know') => void; onClose: () => void; onAssistant: () => void;
}) {
  const summary = classroomPracticeSummary(questions, answers);
  const panelRef = React.useRef<HTMLElement | null>(null);
  const [showSummary, setShowSummary] = React.useState(summary.complete);
  const item = questions[questionIndex], receipt = answers.find(answer => answer.questionId === item?.id);
  const help = hintReceipts.filter(hint => hint.questionId === item?.id).sort((a,b) => a.level - b.level);
  const helpLevel = Math.max(0, ...help.map(hint => hint.level)), helpCount = item?.hintCount ?? 1;
  React.useEffect(() => { if (summary.complete) setShowSummary(true); }, [summary.complete]);
  React.useEffect(() => { if (showSummary) panelRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); }, [showSummary]);
  function selectQuestion(index: number) { setShowSummary(false); onIndex(index); panelRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); }
  function keyboard(event: React.KeyboardEvent<HTMLElement>) {
    if (!item || showSummary || receipt || busy || event.altKey || event.ctrlKey || event.metaKey || event.repeat ||
      (event.target as HTMLElement)?.closest('input,textarea,select,button,[contenteditable],[role=dialog]')) return;
    if (/^[1-8]$/.test(event.key) && Number(event.key) <= item.options.length) { event.preventDefault(); onSelect(item.id, Number(event.key) - 1); }
    if (event.key === 'Enter' && selected[item.id]?.length) { event.preventDefault(); onAnswer(); }
  }
  if (!item) return <div className="cl-empty">本节请使用独立测量入口核查理解。</div>;
  const heading = standalone ? <header className="cl-practice-top"><button aria-label="关闭独立练习" onClick={onClose}><ClassroomIcon name="close"/></button>
    <nav className="cl-practice-progress" aria-label="题目进度">{questions.map((question, index) => <button key={question.id}
      aria-label={'第' + (index + 1) + '题'} aria-current={!showSummary && index === questionIndex ? 'step' : undefined}
      aria-description={answers.find(answer => answer.questionId === question.id)?.disposition === 'dont_know' ? '已记录不会' : answers.find(answer => answer.questionId === question.id)?.skipped ? '已跳过' : answers.some(answer => answer.questionId === question.id) ? '已回答' : '未回答'}
      disabled={busy} data-answered={answers.some(answer => answer.questionId === question.id)} onClick={() => selectQuestion(index)}/>)}</nav>
    <span className="cl-practice-score" aria-label={'已记录' + summary.answered + '题，共' + summary.total + '题'}>已答 <b>{summary.answered}/{summary.total}</b></span><button ref={assistantButtonRef} className={'cl-assistant-toggle practice-assistant-toggle' + (assistantOpen ? ' practice-assistant-toggle--active' : '')} aria-label="☏ Assistant" aria-expanded={assistantOpen} aria-controls="classroom-assistant-panel" onClick={onAssistant}><img src="/reference/hyperknow-controls/chat.svg" alt=""/>Assistant</button></header> :
    <nav className="cl-inline-practice-progress" aria-label="课堂练习进度">{questions.map((question, index) => <button key={question.id} disabled={busy}
      aria-label={'第' + (index + 1) + '题'} aria-current={!showSummary && index === questionIndex ? 'step' : undefined}
      data-answered={answers.some(answer => answer.questionId === question.id)} onClick={() => selectQuestion(index)}>{index + 1}</button>)}
      {summary.complete && <button onClick={() => setShowSummary(true)}>本次复盘</button>}</nav>;
  const version = contentStatus && contentStatus !== 'current' && <aside className="cl-content-version" role="note"><strong>这是一份保留的旧版学习记录</strong>
    <span>题目、首次作答和评分仍按当时的内容保存。</span>{contentStatus === 'archived' && onCurrent && <button onClick={onCurrent}>打开新版内容</button>}</aside>;
  const message = notice && <aside className="cl-practice-notice" role="alert"><span>{notice}</span>{onDismiss && <button aria-label="关闭练习提示" onClick={onDismiss}>×</button>}</aside>;
  if (showSummary && summary.complete) return <section ref={panelRef} inert={inactive} className={'cl-practice-layout' + (standalone ? ' cl-practice-full' : '')} aria-label="课堂练习复盘" data-many={questions.length > 8}>
    {heading}{message}{recovery}{version}<div className="cl-practice-card cl-review-card"><span className="cl-review-eyebrow">{assessment ? 'UNIT CHECK' : 'PRACTICE'} / 本次记录</span>
      <h2>先看清这次，再决定下一步。</h2><p>{assessment?.notice ?? '以下只汇总本组首次作答。提示、跳过和答错分别保留，不由正确率直接判断稳定掌握。'}</p>
      <dl className="cl-review-counts"><div><dt>已记录</dt><dd>{summary.answered}/{summary.total}</dd></div><div><dt>独立答对</dt><dd>{summary.independentCorrect}</dd></div><div><dt>答错</dt><dd>{summary.incorrect}</dd></div><div><dt>跳过</dt><dd>{summary.skipped}</dd></div><div><dt>不会</dt><dd>{summary.dontKnow}</dd></div><div><dt>使用帮助</dt><dd>{summary.assisted}</dd></div></dl>
      <p className="cl-review-note">“使用帮助”可能与答对、答错、跳过或不会重合。回看和重新选择不会覆盖首次提交。</p>
      <h3>{summary.reviewQuestionIds.length ? '先复盘这些题' : '本组没有答错、跳过、不会或辅助作答'}</h3>
      <ol className="cl-review-items">{summary.reviewQuestionIds.map(id => {
        const question = questions.find(question => question.id === id)!, answer = answers.find(answer => answer.questionId === id)!;
        const index = questions.findIndex(question => question.id === id);
        return <li key={id}><div><span>第{index + 1}题 · {answer.disposition === 'dont_know' ? '不会' : answer.skipped ? '跳过' : answer.correct ? '辅助答对' : '答错'}{answer.hintUsed && !answer.correct ? ' · 使用过帮助' : ''}</span>
          <h4>{question.topic?.title ?? question.prompt}</h4><p>{answer.explanation}</p></div><div className="cl-review-item-actions"><button onClick={() => selectQuestion(index)}>回看第{index + 1}题</button>
            {question.topic && onLearn && <button onClick={() => onLearn(question.topic!.lessonId)}>回到相关微课</button>}</div></li>;
      })}</ol>
      <footer className="cl-review-actions"><button className="cl-review-primary" onClick={onClose}>返回课程，安排下一步</button><button onClick={() => selectQuestion(0)}>回看全部题目</button></footer>
    </div>
  </section>;
  const chosen = receipt ? classroomReceiptSelection(receipt) : selected[item.id] ?? [], multiple = item.selectionMode === 'multiple';
  function feedbackAt(index: number) {
    if (!receipt?.correctIndices) return '';
    const selected = chosen.includes(index), correct = receipt.correctIndices.includes(index), attempted = !receipt.skipped;
    const label = correct ? selected ? '✓ 选对' : attempted ? '○ 漏选' : '✓ 正确项' : selected ? '× 误选' : '不符合';
    return label + (receipt.optionExplanations?.[index] ? ' · ' + receipt.optionExplanations[index] : '');
  }
  return <section ref={panelRef} inert={inactive} className={'cl-practice-layout' + (standalone ? ' cl-practice-full' : '')} aria-label="课堂练习题目" data-many={questions.length > 8}>
    {heading}{message}{recovery}{version}<div className="cl-practice-card" data-state={receipt ? receipt.skipped ? 'skipped' : 'answered' : 'question'} data-multiple={multiple}>
      {assessment && <p className="cl-unit-check-note">{questions.length}个新情境 · 核查所选目标 · 首次作答、提示与跳过分别记录</p>}
      <div className={'cl-practice-body' + (multiple ? ' practice-question-shell--multiple' : '')} data-multiple={multiple} data-has-image={Boolean(item.image)} tabIndex={0} aria-label="题目作答区域，数字键选择，回车提交" onKeyDown={keyboard}><div className="cl-practice-prompt"><small className={'cl-practice-kind practice-question-kicker' + (multiple ? ' practice-question-kicker--multiple' : '')}>{multiple ? 'MULTIPLE CHOICE' : 'SINGLE CHOICE'}</small><span className="sr-only">第{questionIndex + 1}题，共{questions.length}题{item.topic ? ' · ' + item.topic.title : ''}</span><h2 className="practice-question-title">{item.prompt}</h2>
      <p className={'cl-choice-instruction' + (standalone ? ' sr-only' : '')}>{multiple ? '选择所有符合项。本题须选全且不多选。' : '选择一个最合适的选项。'}</p>
      <p className={'cl-choice-selection' + (standalone ? ' sr-only' : '')} role="status">{receipt ? '首次提交已锁定' : '当前选择'}：{chosen.length ? chosen.map(index => index + 1).join('、') : '未选'}{multiple && !receipt ? ' · 再次选择可取消' : ''}</p>
      {item.image && <ClassroomImage key={item.id + ':' + item.image.src} image={item.image}/>}
      {item.table && <figure className="cl-practice-data"><figcaption>{item.table.caption}</figcaption><div role="region" aria-label={'题目数据：' + item.table.caption} tabIndex={0}><table><thead><tr>{item.table.headers.map((header,index) => <th key={index} scope="col">{header}</th>)}</tr></thead><tbody>{item.table.rows.map((cells,index) => <tr key={index}>{cells.map((cell,index) => <td key={index}>{cell}</td>)}</tr>)}</tbody></table></div></figure>}
      {item.diagram && <ClassroomFigure diagram={item.diagram}/>}</div>
      <fieldset className={'cl-practice-options practice-options-grid' + (multiple ? '' : ' practice-options-grid--stacked')} data-multiple={multiple} disabled={busy || Boolean(receipt)}><legend className="sr-only">{multiple ? '选择所有符合项' : '选择一个选项'}{receipt ? '，首次作答已锁定' : ''}</legend>{item.options.map((option, index) => {
        const selected = chosen.includes(index), correct = receipt?.correctIndices?.includes(index);
        const feedback = feedbackAt(index);
        return <label key={index} className={'practice-option-card' + (selected ? ' practice-option-card--selected' : '') + (receipt ? ' practice-option-card--readonly' : '') + (receipt?.correctIndices ? correct ? ' practice-option-card--correct' : selected ? ' practice-option-card--incorrect' : '' : '')} data-selected={selected} data-feedback={receipt?.correctIndices ? correct ? 'correct' : selected ? 'incorrect' : 'neutral' : undefined}>
        <input type={multiple ? 'checkbox' : 'radio'} name={item.id} checked={selected} aria-describedby={feedback ? item.id + '-feedback-' + index : undefined} onChange={() => onSelect(item.id, index)}/>
        <span className="cl-option-shape practice-option-shape" data-shape={index % 4} aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12">{index % 4 === 0 ? <path d="M6 1 12 11H0Z"/> : index % 4 === 1 ? <path d="m6 0 6 6-6 6-6-6Z"/> : index % 4 === 2 ? <circle cx="6" cy="6" r="5.5"/> : <rect x="1" y="1" width="10" height="10" rx="1"/>}</svg></span><span className="cl-option-content practice-option-text">{option}
          {feedback && !standalone && <small id={item.id + '-feedback-' + index} className="cl-option-feedback">{feedback}</small>}</span><b aria-hidden="true">{index + 1}</b>
          {multiple && <span className={'cl-option-checkbox practice-option-checkbox checkbox' + (selected ? ' checked' : '')} aria-hidden="true">{selected ? '✓' : ''}</span>}
      </label>; })}</fieldset></div>
      <div className="cl-practice-support">{receipt ? <div className="cl-answer-feedback" data-correct={receipt.correct} role="status">
        <b>{receipt.disposition === 'dont_know' ? '已记录不会，回到概念再核查' : receipt.skipped ? '已跳过，保留待复习' : receipt.correct ? '这次区分正确' : '对照概念，再看一次'}</b><p>{receipt.explanation}</p><small>{receipt.answerExposure==='authorship'?'你曾打开这份教学稿的答案，作答保留为已接触答案的学习记录，不计独立成功。':receipt.hintUsed ? receipt.hintLevel ? `本题使用过提示，已读${receipt.hintLevel}级提示，记为辅助作答。` : '本题使用过帮助，记为辅助作答。' : '已保留首次作答。'}</small>
        {standalone && receipt.correctIndices && <details className="cl-feedback-details"><summary>逐项对照选择与解释</summary><ol>{item.options.map((option,index)=><li key={index}><span>{index + 1}. {option}</span><small id={item.id + '-feedback-' + index} className="cl-option-feedback">{feedbackAt(index)}</small></li>)}</ol></details>}
        {receipt.sourceReferences?.map((source,index)=><article className="cl-check-citation" key={index}><p>{source.quote}</p>{onSource&&<button onClick={()=>onSource(source.sourceKey)}>核对本题原文 {index+1} ↗</button>}</article>)}
      </div> : <><button className="cl-hint-button" disabled={busy || helpLevel >= helpCount} onClick={() => onHint(item.id, helpLevel + 1)}>{helpLevel >= helpCount ? '提示已读完' : helpLevel ? '再给我一个提示' : '先给我一个提示'}</button>
        {help.map(hint => <div className="cl-hint" key={hint.level}><small>第{hint.level}级 · {hint.level === 1 ? '判断方向' : '关键线索'}</small><p>{hint.text}</p></div>)}
        {hinted.includes(item.id) && !help.length && <p className="cl-legacy-help">此前使用过帮助，仍可逐级查看本题提示。</p>}</>}</div>
      <footer className="cl-practice-actions">{questionIndex > 0 && <button className="cl-practice-previous" aria-label="上一题" disabled={busy} onClick={()=>selectQuestion(questionIndex-1)}><span aria-hidden="true">←</span></button>}{!receipt ? <><button className="cl-check practice-check-btn" disabled={busy || !chosen.length} onClick={() => onAnswer()}>Check →</button>
        <button className="cl-skip practice-skip-btn" disabled={busy} onClick={() => onAnswer('skip')}>Skip</button><button className="cl-dont-know" disabled={busy} onClick={() => onAnswer('dont_know')}>这题我不会</button></> : summary.complete ? <button className="cl-check practice-check-btn practice-check-btn--next" onClick={() => setShowSummary(true)}>查看本次复盘 →</button>
        : questionIndex + 1 < questions.length ? <button className="cl-check practice-check-btn practice-check-btn--next" disabled={busy} onClick={() => selectQuestion(questionIndex + 1)}>下一题 →</button>
          : <button className="cl-check practice-check-btn practice-check-btn--next" disabled={busy} onClick={() => selectQuestion(summary.nextQuestionIndex)}>继续未答的第{summary.nextQuestionIndex + 1}题 →</button>}</footer>
    </div>
  </section>;
}
