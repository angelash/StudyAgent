'use client';
import * as React from 'react';
import type { PaperPracticeSelection } from '@study-agent/contracts';
import { useSessionUser } from '../lib/session-user';
import { downloadPaperRecovery, paperBasketKey, parsePaperSelection, storePaperRecovery } from '../lib/paper-practice-local';

export function PaperPracticeLauncher({ paper, questions }: { paper: { id: string; title: string }; questions: Array<{ position: number; missing: boolean }> }) {
  const user = useSessionUser(), [selected, setSelected] = React.useState<number[]>([]), [basket, setBasket] = React.useState<PaperPracticeSelection[]>([]), [notice, setNotice] = React.useState('');
  const [unprotected, setUnprotected] = React.useState<PaperPracticeSelection[] | null>(null);
  React.useEffect(() => {
    setSelected([]); setBasket([]); setNotice(''); setUnprotected(null); if (!user) return;
    try { const rows = parsePaperSelection(JSON.parse(window.localStorage.getItem(paperBasketKey(user.id)) ?? '[]')); setBasket(rows); setSelected(rows.find(row => row.paperId === paper.id)?.positions ?? []); }
    catch { setNotice('本机选题清单暂时无法读取，可以先练习本卷。'); }
  }, [user?.id, paper.id]);
  if (!user) return null;
  function add() {
    if (!user) return;
    const rows = [...basket.filter(row => row.paperId !== paper.id), { paperId: paper.id, ...(selected.length ? { positions: [...selected].sort((a, b) => a - b) } : {}) }];
    try { parsePaperSelection(rows); storePaperRecovery(paperBasketKey(user.id), rows); setBasket(rows); setUnprotected(null); setNotice('已放入选题清单，可以继续到其他试卷选题。'); }
    catch (error) { setUnprotected(rows); setNotice(error instanceof Error ? error.message : '本机暂不能保存清单，请下载保护后再继续。'); }
  }
  const own = '/library/practice?paper=' + encodeURIComponent(paper.id), chosen = own + '&positions=' + selected.join(',');
  return <section className="library-practice-launch library-no-print" aria-label="题卷练习入口"><h2>把这份原卷，真正做一遍。</h2><p>保留首次回答，再核对参考、记录判断和订正。原卷练习不自动计入能力评测。</p>
    <div><a className="studio-primary" href={own}>整卷练习 ↗</a><a className="studio-secondary" href="/library/practice">我的练习记录 ↗</a><a className="studio-secondary" href="/library/practice/review">待复习与反思 ↗</a></div>
    {!!questions.length && <details><summary>选择本卷题目 · 已选 {selected.length} 题</summary><div className="library-practice-positions">{questions.map(question => <label key={question.position}><input type="checkbox" disabled={question.missing} checked={selected.includes(question.position)} onChange={event => setSelected(rows => event.target.checked ? [...rows, question.position] : rows.filter(position => position !== question.position))} />第 {question.position} 题{question.missing ? '（缺题）' : ''}</label>)}</div>{selected.length > 0 && <a className="studio-secondary" href={chosen}>只练所选 {selected.length} 题 ↗</a>}</details>}
    <div><button className="studio-secondary" onClick={add}>{selected.length ? '把所选题加入跨卷清单' : '把整卷加入跨卷清单'}</button>{basket.length > 0 && <a className="studio-secondary" href="/library/practice?basket=1">预览跨卷清单 · {basket.length} 份 ↗</a>}</div>
    {notice && <p role="status">{notice}</p>}{unprotected && <button className="studio-secondary" onClick={() => downloadPaperRecovery({ format: 'paper-practice-selection-v1', ownerId: user.id, selection: unprotected }, '题卷选题清单.json')}>下载选题清单保护文件</button>}
  </section>;
}
