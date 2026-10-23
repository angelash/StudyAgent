'use client';
import * as React from 'react';
import type { ClassroomQuestion, ClassroomAnswerReceipt } from '@study-agent/contracts';

export function PracticePanel({ questions, answers, questionIndex, selected, hinted, busy, standalone, lessonId,
  onIndex, onSelect, onHint, onAnswer, onClose, onAssistant }: {
  questions: ClassroomQuestion[]; answers: ClassroomAnswerReceipt[]; questionIndex: number;
  selected: Record<string, number>; hinted: string[]; busy: boolean; standalone: boolean; lessonId: string;
  onIndex: (index: number) => void; onSelect: (id: string, index: number) => void; onHint: (id: string) => void;
  onAnswer: (index: number | null) => void; onClose: () => void; onAssistant: () => void;
}) {
  const item = questions[questionIndex], receipt = answers.find(answer => answer.questionId === item?.id);
  React.useEffect(() => {
    if (!standalone || !item) return;
    function keyboard(event: KeyboardEvent) {
      if ((event.target as HTMLElement)?.closest('input,textarea,select,button,[contenteditable]')) return;
      const digit = Number(event.key) - 1;
      if (!receipt && !busy && digit >= 0 && digit < item.options.length) { event.preventDefault(); onSelect(item.id, digit); }
      if (event.key === 'Enter' && !receipt && !busy && selected[item.id] !== undefined) { event.preventDefault(); onAnswer(selected[item.id]); }
    }
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, [standalone, item, receipt, busy, selected, onSelect, onAnswer]);
  if (!item) return <div className="cl-empty">本节请使用独立测量入口核查理解。</div>;
  return <section className={'cl-practice-layout' + (standalone ? ' cl-practice-full' : '')} aria-label="课堂练习题目">
    {standalone && <header className="cl-practice-top"><button aria-label="关闭独立练习" onClick={onClose}>×</button>
      <nav className="cl-practice-progress" aria-label="题目进度">{questions.map((question, index) => <button key={question.id}
        aria-label={'第' + (index + 1) + '题'} aria-current={index === questionIndex ? 'step' : undefined}
        data-answered={answers.some(answer => answer.questionId === question.id)} onClick={() => onIndex(index)}/>)}</nav>
      <span className="cl-practice-score">答对 {answers.filter(answer => answer.correct).length}</span><button className="cl-assistant-toggle" onClick={onAssistant}>☏ Assistant</button></header>}
    <div className="cl-practice-card"><div className="cl-practice-body"><div className="cl-practice-prompt"><small>SINGLE CHOICE · {questionIndex + 1} / {questions.length}</small><h2>{item.prompt}</h2>
      {lessonId === 'soc-1-1-1' && <figure className="cl-practice-image"><img src={questionIndex === 2 ? '/classroom/agency-river-c7a9e2.webp' : '/classroom/venn-d8b3f1.webp'}
        alt={questionIndex === 2 ? '划船、河流与共同改善航道的概念插图' : '个人传记与历史结构相交的韦恩图'}/></figure>}</div>
      <fieldset className="cl-practice-options" disabled={busy || Boolean(receipt)}><legend className="sr-only">答案选项</legend>{item.options.map((option, index) => <label key={index}
        data-selected={receipt ? receipt.selectedIndex === index : selected[item.id] === index}>
        <input type="radio" name={item.id} checked={receipt ? receipt.selectedIndex === index : selected[item.id] === index} onChange={() => onSelect(item.id, index)}/>
        <span className="cl-option-shape" data-shape={index % 4} aria-hidden="true">{['▲', '◆', '●', '■'][index % 4]}</span><span>{option}</span><b>{index + 1}</b>
      </label>)}</fieldset></div>
      <div className="cl-practice-support">{receipt ? <div className="cl-answer-feedback" data-correct={receipt.correct} role="status">
        <b>{receipt.skipped ? '已跳过，保留待复习' : receipt.correct ? '这次区分正确' : '对照概念，再看一次'}</b><p>{receipt.explanation}</p><small>{receipt.hintUsed ? '本题使用过提示，记为辅助作答。' : '已保留首次作答。'}</small>
      </div> : <><button className="cl-hint-button" onClick={() => onHint(item.id)}>先给我一个提示</button>{hinted.includes(item.id) && <p className="cl-hint">{item.hint}</p>}</>}</div>
      <footer className="cl-practice-actions">{!receipt ? <><button className="cl-check" disabled={busy || selected[item.id] === undefined} onClick={() => onAnswer(selected[item.id])}>Check →</button>
        <button className="cl-skip" disabled={busy} onClick={() => onAnswer(null)}>Skip</button></> : questionIndex + 1 < questions.length
        ? <button className="cl-check" onClick={() => onIndex(questionIndex + 1)}>下一题 →</button>
        : <p className="cl-practice-result">本组已记录 {answers.length} / {questions.length} 题 · 答对 {answers.filter(answer => answer.correct).length} 题</p>}</footer>
    </div>
  </section>;
}
