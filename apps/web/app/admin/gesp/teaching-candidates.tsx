'use client';
import * as React from 'react';
import type { GespTeachingCandidateView } from '@study-agent/contracts';
import { apiRequest } from '../../../lib/api';

const labels = { example: '讲解例题', check: '独立检查候选', debug: '定位错误', transfer: '迁移活动候选', retention: '到期保持候选' } as const;
export function GespTeachingCandidates({ level }: { level: number }) {
  const [view, setView] = React.useState<GespTeachingCandidateView | null>(null), [selected, setSelected] = React.useState('');
  const [error, setError] = React.useState(''), [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    const controller = new AbortController(); setView(null); setSelected(''); setError('');
    if (level > 4) return () => controller.abort();
    void apiRequest<GespTeachingCandidateView>('/gesp/teaching-candidates?level=' + level, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { setView(value); setSelected(value.lessons[0]?.id ?? ''); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '暂时无法读取教学候选。'); });
    return () => controller.abort();
  }, [level, retry]);
  const lesson = view?.lessons.find(row => row.id === selected);
  return <section className="gesp-panel" aria-label="GESP逐目标教学候选"><h2>{level}级 · 逐目标教学候选</h2>
    {level > 4 ? <p>本次教学候选覆盖1～4级；当前等级仍保留研究框架。</p> : <>
      {error && <p className="studio-error" role="alert">{error} <button className="studio-secondary" onClick={() => setRetry(value => value + 1)}>重新读取教学候选</button></p>}
      {!view && !error && <p role="status">正在读取本级教学候选…</p>}
      {view && <><p className="studio-notice">{view.notice}</p><div className="gesp-columns"><div className="gesp-atom-list" aria-label="教学目标选择">
        {view.lessons.map(row => <button key={row.id} aria-pressed={row.id === selected} onClick={() => setSelected(row.id)}><strong>{row.title}</strong><small>{row.goal}</small></button>)}
      </div>{lesson && <article aria-label="当前教学候选"><span className="studio-eyebrow">原创候选 · 教师待审</span><h3>{lesson.title}</h3><p>{lesson.goal}</p>
        <h4>讲解</h4><p>{lesson.explanation}</p>{(Object.keys(labels) as Array<keyof typeof labels>).map(key => <section key={key} className="gesp-review-evidence">
          <h4>{labels[key]}</h4><p>{lesson[key].prompt}</p><details><summary>查看教研参考与评分边界</summary><p>{lesson[key].referenceAnswer}</p><p>人工量规复核；尚未认定为已审核独立题族。</p></details>
        </section>)}<h4>官方范围依据</h4>{lesson.sourceEvidence.map(source => <p key={source.clauseId}><a href={`${source.pdfUrl}#page=${source.pdfPages[0]}`} target="_blank" rel="noreferrer">{source.clauseId} · PDF物理第{source.pdfPages.join('、')}页</a></p>)}
        <p>关联试题的原审核与本教学候选分别核对。本页查看和展开参考不会写入学生作答、曝光或学习结果。</p>
      </article>}</div></>}
    </>}
  </section>;
}
