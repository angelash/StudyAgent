import Link from 'next/link';
import type { LearningMemory } from '../lib/learning';
import './learning-memory.css';

export function LearningMemoryCard({ memory, studentId, diagnosticsHref, todayHref }: { memory: LearningMemory;
  studentId: string; diagnosticsHref: string; todayHref: string }) {
  const targetHref = (item: LearningMemory['feed'][number]) => {
    if (item.target === 'plan') return `${diagnosticsHref}&view=plan${item.planId ? `&planId=${encodeURIComponent(item.planId)}` : ''}`;
    if (item.target === 'assessment') return `${diagnosticsHref}${item.sessionId ? `&session=${encodeURIComponent(item.sessionId)}` : ''}`;
    return item.target === 'today' ? todayHref : diagnosticsHref;
  };
  return <section className="learning-memory" aria-label="证据化学习记忆">
    <header><div><span className="studio-eyebrow">AI CONTEXT / 可核对记忆</span><h3>这次从哪里继续。</h3></div><span className="learning-memory-seal">MEMORY<br />{memory.revision.slice(0, 6)}</span></header>
    <p className="learning-memory-summary">{memory.summary}</p>
    <div className="learning-memory-grid">
      <div className="learning-memory-facts"><strong>已确认的事实</strong>{memory.facts.length ? <ul>{memory.facts.map(fact => <li key={fact.id}><span>{fact.text}</span><small>{fact.provenance}</small></li>)}</ul> : <p>还没有确认过的学习范围。</p>}</div>
      <div className="learning-memory-unknowns"><strong>仍保持未知</strong>{memory.unknowns.length ? <ul>{memory.unknowns.slice(0, 5).map(item => <li key={item.atomId}><span>{item.atomName}</span><small>{item.status === 'unknown' ? '尚无独立证据' : '证据量不足'}</small></li>)}</ul> : <p>当前已学点没有新的证据缺口。</p>}</div>
    </div>
    {memory.feed.length > 0 && <ol className="learning-memory-feed">{memory.feed.slice(0, 4).map((item, index) => <li key={item.id} data-primary={index === 0}><Link href={targetHref(item)}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{item.title}</strong><p>{item.reason}</p></div><b aria-hidden="true">↗</b></Link></li>)}</ol>}
    <details className="learning-memory-boundary"><summary>这份记忆引用了什么，不包含什么</summary><p>它由已确认的学习范围、评测证据、待验证原因、指导计划和复测队列实时生成。不会因一次答错写入能力标签，也不会把模型猜测当成事实。家长可随时从评测、计划与家庭资料页核对或删除原始记录。</p><p>记忆指纹 {memory.revision.slice(0, 16)} · 学生 {studentId.slice(0, 12)}</p></details>
  </section>;
}
