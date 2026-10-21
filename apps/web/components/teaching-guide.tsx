'use client';

import { useId } from 'react';
import type { GuidanceAction, TeachingVisual } from '@study-agent/contracts';
import './teaching-guide.css';

function FractionBars({ visual }: { visual: TeachingVisual }) {
  const titleId = useId();
  if (visual.kind !== 'fraction_bars') return null;
  const scale = (numerator: number, denominator: number) => numerator * (visual.commonDenominator / denominator);
  const fractionText = (numerator: number, denominator: number) => `${numerator}/${denominator}`;
  return <figure className="teaching-visual" aria-labelledby={titleId}>
    <div className="teaching-visual-heading"><span>图形讲解</span><h3 id={titleId}>{visual.title}</h3></div>
    <ol className="teaching-visual-steps">
      <li><span className="teaching-visual-step">1 · 先看同一个整体</span>
        <div className="fraction-bar-list">{visual.terms.map((term, index) => <div className="fraction-bar-row" key={`${term.label}-${index}`}>
          <span className="fraction-bar-label">{term.label} <b>{fractionText(term.numerator, term.denominator)}</b></span>
          <div className="fraction-bar" role="img" aria-label={`${term.label}：${term.denominator}等份中的${term.numerator}份`}>
            {Array.from({ length: term.denominator }, (_, part) => <i key={part} data-filled={part < term.numerator} />)}
          </div>
        </div>)}</div>
      </li>
      <li><span className="teaching-visual-step">2 · 再改成同样大小的份</span>
        <div className="fraction-bar-list">{visual.terms.map((term, index) => <div className="fraction-bar-row" key={`common-${term.label}-${index}`}>
          <span className="fraction-bar-label">{fractionText(term.numerator, term.denominator)} = <b>{fractionText(scale(term.numerator, term.denominator), visual.commonDenominator)}</b></span>
          <div className="fraction-bar common" role="img" aria-label={`${visual.commonDenominator}等份中的${scale(term.numerator, term.denominator)}份`}>
            {Array.from({ length: visual.commonDenominator }, (_, part) => <i key={part} data-filled={part < scale(term.numerator, term.denominator)} />)}
          </div>
        </div>)}</div>
      </li>
      <li><span className="teaching-visual-step">3 · 现在数一数同大小的份</span>
        <div className="fraction-equation" aria-label="分数变换算式">
          {visual.terms.map((term, index) => <span key={`${term.label}-equation-${index}`}>
            {index > 0 && <em>{visual.operator}</em>}<b>{fractionText(scale(term.numerator, term.denominator), visual.commonDenominator)}</b>
          </span>)}
          <em>{visual.operator === '=' ? '=' : '→'}</em><strong>{fractionText(visual.result.numerator, visual.result.denominator)}</strong>
        </div>
      </li>
    </ol>
    <figcaption>{visual.note}<small>图只解释已审核的示例；看过图不等于掌握。收起讲解后，用不同数值的新题和延迟复测再核查。</small></figcaption>
  </figure>;
}

export function TeachingGuide({ snapshot, showObservation = false }: {
  snapshot: GuidanceAction['teachingSnapshot']; showObservation?: boolean;
}) {
  if (!snapshot || snapshot.teaching.reviewStatus !== 'approved') return null;
  const { teaching } = snapshot;
  return <div className="teaching-guide">
    <details><summary>先看讲解和示例</summary>
      <p>{teaching.explanation}</p>
      {!!snapshot.sourceCitations?.length && <aside className="teaching-source-list" aria-label="当前活动的教材来源">
        <strong>这次讲解对应到哪里</strong>
        {snapshot.sourceCitations.map(source => <div key={source.id}>
          <span>{source.title} · {source.edition}</span>
          <b>{source.chapterName} / {source.lessonName}</b>
          <small>{source.pageStart === null ? '页码定位待补' : `第 ${source.pageStart}${source.pageEnd && source.pageEnd !== source.pageStart ? `–${source.pageEnd}` : ''} 页候选`}
            {source.locatorStatus === 'candidate_needs_review' ? ' · 待教研逐页确认' : ''}</small>
          <p>{source.note}</p>
        </div>)}
      </aside>}
      {teaching.visual && <FractionBars visual={teaching.visual} />}
      <div className="teaching-example"><strong>{teaching.example.prompt}</strong>
        <ol>{teaching.example.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
        <p>{teaching.example.conclusion}</p>
      </div><p className="teaching-note">看懂示例后，收起讲解，再试一道新题。是否掌握还要通过新题和间隔复测观察。</p>
    </details>
    {showObservation && <details><summary>家长怎样观察与验证</summary>
      <p className="teaching-note">以下是可核对的观察方法。孩子的具体原因仍需结合实际作答验证。</p>
      {teaching.commonErrors.map(error => <div className="teaching-observation" key={error.code}>
        <strong>若观察到：{error.observation}</strong><ul>{error.alternativeExplanations.map((explanation, i) => <li key={i}>{explanation}</li>)}</ul>
        <p>如何区分：{error.verification}</p>
      </div>)}
      <dl>{(['understanding', 'procedure', 'transfer', 'retention'] as const).map((dimension, i) => <div key={dimension}>
        <dt>{['理解', '执行', '迁移', '保持'][i]}</dt><dd>{teaching.verification[dimension]}</dd>
      </div>)}</dl><small className="teaching-note">本计划保留第 {snapshot.atomVersion} 版知识定义的教学资料。</small>
    </details>}
  </div>;
}
