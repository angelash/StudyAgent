'use client';

import type { GuidanceAction } from '@study-agent/contracts';
import './teaching-guide.css';

export function TeachingGuide({ snapshot, showObservation = false }: {
  snapshot: GuidanceAction['teachingSnapshot']; showObservation?: boolean;
}) {
  if (!snapshot || snapshot.teaching.reviewStatus !== 'approved') return null;
  const { teaching } = snapshot;
  return <div className="teaching-guide">
    <details><summary>先看讲解和示例</summary>
      <p>{teaching.explanation}</p>
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
