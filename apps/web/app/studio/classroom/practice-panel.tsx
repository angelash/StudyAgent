'use client';
import * as React from 'react';
import type { ClassroomQuestion, ClassroomAnswerReceipt, ClassroomHintReceipt, ClassroomLesson, ClassroomSessionView } from '@study-agent/contracts';
import { classroomPracticeSummary } from '@study-agent/contracts';
import { ClassroomFigure } from './diagram';
import './practice-review.css';

export function PracticePanel({ questions, answers, questionIndex, selected, hinted, hintReceipts = [], busy, standalone, lessonId, assessment,
  contentStatus, notice, onDismiss, onCurrent, onLearn, onIndex, onSelect, onHint, onAnswer, onClose, onAssistant }: {
  questions: ClassroomQuestion[]; answers: ClassroomAnswerReceipt[]; questionIndex: number;
  selected: Record<string, number>; hinted: string[]; busy: boolean; standalone: boolean; lessonId: string;
  hintReceipts?: ClassroomHintReceipt[];
  notice?: string; onDismiss?: () => void;
  assessment?: ClassroomLesson['assessment']; contentStatus?: ClassroomSessionView['contentStatus'];
  onCurrent?: () => void; onLearn?: (lessonId: string) => void;
  onIndex: (index: number) => void; onSelect: (id: string, index: number) => void; onHint: (id: string, level: number) => void;
  onAnswer: (index: number | null, disposition?: 'skip' | 'dont_know') => void; onClose: () => void; onAssistant: () => void;
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
  React.useEffect(() => {
    if (!standalone || !item || showSummary) return;
    function keyboard(event: KeyboardEvent) {
      if ((event.target as HTMLElement)?.closest('input,textarea,select,button,[contenteditable]')) return;
      const digit = Number(event.key) - 1;
      if (!receipt && !busy && digit >= 0 && digit < item.options.length) { event.preventDefault(); onSelect(item.id, digit); }
      if (event.key === 'Enter' && !receipt && !busy && selected[item.id] !== undefined) { event.preventDefault(); onAnswer(selected[item.id]); }
    }
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, [standalone, item, receipt, busy, selected, onSelect, onAnswer, showSummary]);
  if (!item) return <div className="cl-empty">本节请使用独立测量入口核查理解。</div>;
  const heading = standalone ? <header className="cl-practice-top"><button aria-label="关闭独立练习" onClick={onClose}>×</button>
    <nav className="cl-practice-progress" aria-label="题目进度">{questions.map((question, index) => <button key={question.id}
      aria-label={'第' + (index + 1) + '题'} aria-current={!showSummary && index === questionIndex ? 'step' : undefined}
      disabled={busy} data-answered={answers.some(answer => answer.questionId === question.id)} onClick={() => selectQuestion(index)}/>)}</nav>
    <span className="cl-practice-score">已答 {summary.answered}/{summary.total}</span><button className="cl-assistant-toggle" onClick={onAssistant}>☏ Assistant</button></header> :
    <nav className="cl-inline-practice-progress" aria-label="课堂练习进度">{questions.map((question, index) => <button key={question.id} disabled={busy}
      aria-label={'第' + (index + 1) + '题'} aria-current={!showSummary && index === questionIndex ? 'step' : undefined}
      data-answered={answers.some(answer => answer.questionId === question.id)} onClick={() => selectQuestion(index)}>{index + 1}</button>)}
      {summary.complete && <button onClick={() => setShowSummary(true)}>本次复盘</button>}</nav>;
  const version = contentStatus && contentStatus !== 'current' && <aside className="cl-content-version" role="note"><strong>这是一份保留的旧版学习记录</strong>
    <span>题目、首次作答和评分仍按当时的内容保存。</span>{contentStatus === 'archived' && onCurrent && <button onClick={onCurrent}>打开新版内容</button>}</aside>;
  const message = notice && <aside className="cl-practice-notice" role="alert"><span>{notice}</span>{onDismiss && <button aria-label="关闭练习提示" onClick={onDismiss}>×</button>}</aside>;
  if (showSummary && summary.complete) return <section ref={panelRef} className={'cl-practice-layout' + (standalone ? ' cl-practice-full' : '')} aria-label="课堂练习复盘" data-many={questions.length > 8}>
    {heading}{message}{version}<div className="cl-practice-card cl-review-card"><span className="cl-review-eyebrow">{assessment ? 'UNIT CHECK' : 'PRACTICE'} / 本次记录</span>
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
  return <section ref={panelRef} className={'cl-practice-layout' + (standalone ? ' cl-practice-full' : '')} aria-label="课堂练习题目" data-many={questions.length > 8}>
    {heading}{message}{version}<div className="cl-practice-card">
      {assessment && <p className="cl-unit-check-note">12个新情境 · 覆盖本单元各个主题 · 首次作答、提示与跳过分别记录</p>}
      <div className="cl-practice-body"><div className="cl-practice-prompt"><small>SINGLE CHOICE · {questionIndex + 1} / {questions.length}{item.topic ? ' · ' + item.topic.title : ''}</small><h2>{item.prompt}</h2>
      {lessonId === 'soc-1-1-1' && questionIndex < 5 && <figure className="cl-practice-image"><img src={questionIndex === 2 ? '/classroom/agency-river-c7a9e2.webp' : '/classroom/venn-d8b3f1.webp'}
        alt={questionIndex === 2 ? '划船、河流与共同改善航道的概念插图' : '个人传记与历史结构相交的韦恩图'}/></figure>}
      {item.table && <figure className="cl-practice-data"><figcaption>{item.table.caption}</figcaption><div role="region" aria-label={'题目数据：' + item.table.caption} tabIndex={0}><table><thead><tr>{item.table.headers.map((header,index) => <th key={index} scope="col">{header}</th>)}</tr></thead><tbody>{item.table.rows.map((cells,index) => <tr key={index}>{cells.map((cell,index) => <td key={index}>{cell}</td>)}</tr>)}</tbody></table></div></figure>}
      {item.diagram && <ClassroomFigure diagram={item.diagram}/>}</div>
      <fieldset className="cl-practice-options" disabled={busy || Boolean(receipt)}><legend className="sr-only">答案选项</legend>{item.options.map((option, index) => <label key={index}
        data-selected={receipt ? receipt.selectedIndex === index : selected[item.id] === index}>
        <input type="radio" name={item.id} checked={receipt ? receipt.selectedIndex === index : selected[item.id] === index} onChange={() => onSelect(item.id, index)}/>
        <span className="cl-option-shape" data-shape={index % 4} aria-hidden="true">{['▲', '◆', '●', '■'][index % 4]}</span><span>{option}</span><b>{index + 1}</b>
      </label>)}</fieldset></div>
      <div className="cl-practice-support">{receipt ? <div className="cl-answer-feedback" data-correct={receipt.correct} role="status">
        <b>{receipt.disposition === 'dont_know' ? '已记录不会，回到概念再核查' : receipt.skipped ? '已跳过，保留待复习' : receipt.correct ? '这次区分正确' : '对照概念，再看一次'}</b><p>{receipt.explanation}</p><small>{receipt.answerExposure==='authorship'?'你曾打开这份教学稿的答案，作答保留为已接触答案的学习记录，不计独立成功。':receipt.hintUsed ? receipt.hintLevel ? `本题使用过提示，已读${receipt.hintLevel}级提示，记为辅助作答。` : '本题使用过帮助，记为辅助作答。' : '已保留首次作答。'}</small>
      </div> : <><button className="cl-hint-button" disabled={busy || helpLevel >= helpCount} onClick={() => onHint(item.id, helpLevel + 1)}>{helpLevel >= helpCount ? '提示已读完' : helpLevel ? '再给我一个提示' : '先给我一个提示'}</button>
        {help.map(hint => <div className="cl-hint" key={hint.level}><small>第{hint.level}级 · {hint.level === 1 ? '判断方向' : '关键线索'}</small><p>{hint.text}</p></div>)}
        {hinted.includes(item.id) && !help.length && <p className="cl-legacy-help">此前使用过帮助，仍可逐级查看本题提示。</p>}</>}</div>
      <footer className="cl-practice-actions">{!receipt ? <><button className="cl-check" disabled={busy || selected[item.id] === undefined} onClick={() => onAnswer(selected[item.id])}>Check →</button>
        <button className="cl-skip" disabled={busy} onClick={() => onAnswer(null, 'skip')}>Skip</button><button className="cl-dont-know" disabled={busy} onClick={() => onAnswer(null, 'dont_know')}>这题我不会</button></> : summary.complete ? <button className="cl-check" onClick={() => setShowSummary(true)}>查看本次复盘 →</button>
        : questionIndex + 1 < questions.length ? <button className="cl-check" disabled={busy} onClick={() => selectQuestion(questionIndex + 1)}>下一题 →</button>
          : <button className="cl-check" disabled={busy} onClick={() => selectQuestion(summary.nextQuestionIndex)}>继续未答的第{summary.nextQuestionIndex + 1}题 →</button>}</footer>
    </div>
  </section>;
}
